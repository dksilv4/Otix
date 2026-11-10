import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchGames, fetchGameById, fetchGameCount, acceptSuggestionOnServer, rejectSuggestionOnServer } from './storage';
import { getDesktopAPI } from '@/lib/desktop/api';
import { apiClient } from "@/lib/api/client";
import { useEffect, useMemo } from 'react';
import { useServerGames } from '@/features/downloads/use-server-downloads';
import { listFoundServerGames, mergeLocalAndServerGames, persistableServerGames } from './visible-games';
import type { GamesFilter } from '../types';
import type { Game, LocalGame } from "../types";

type Listener = () => void;

const listeners = new Set<Listener>();
let unsub: (() => void) | null = null;
let dbChangeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const DB_CHANGE_DEBOUNCE_MS = 200;

function notifyDbChangeListeners(): void {
  if (dbChangeDebounceTimer) {
    clearTimeout(dbChangeDebounceTimer);
  }
  dbChangeDebounceTimer = setTimeout(() => {
    dbChangeDebounceTimer = null;
    listeners.forEach((fn) => fn());
  }, DB_CHANGE_DEBOUNCE_MS);
}

export function flushGameDbChangeNotifications(): void {
  if (dbChangeDebounceTimer) {
    clearTimeout(dbChangeDebounceTimer);
    dbChangeDebounceTimer = null;
    listeners.forEach((fn) => fn());
  }
}

function subscribeToGameDbChanges(listener: Listener): () => void {
  listeners.add(listener);
  if (!unsub) {
    const api = getDesktopAPI();
    if (api?.onGamesDbChanged) {
      unsub = api.onGamesDbChanged(() => {
        notifyDbChangeListeners();
      });
    }
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (dbChangeDebounceTimer) {
        clearTimeout(dbChangeDebounceTimer);
        dbChangeDebounceTimer = null;
      }
      if (unsub) {
        unsub();
        unsub = null;
      }
    }
  };
}

// ── Query key factory ─────────────────────────────────────────────

export const localGameKeys = {
  all: ['local-games'] as const,
  list: (_filter?: GamesFilter) => ['local-games', 'list'] as const,
  detail: (id: string) => ['local-games', 'detail', id] as const,
  count: (filter?: GamesFilter) => ['local-games', 'count', filter] as const,
};

// ── In-memory client projection ───────────────────────────────────

export function applyClientGameFilter(games: LocalGame[], filter?: GamesFilter): LocalGame[] {
  if (!filter || Object.keys(filter).length === 0) return games;
  let result = [...games];

  if (filter.platform && filter.platform.length > 0) {
    const set = new Set(filter.platform.map((p) => p.toLowerCase()));
    result = result.filter((g) => g.platform && set.has(g.platform.toLowerCase()));
  }

  if (filter.matched === true) {
    result = result.filter((g) => Boolean(g.otixMediaId || (g.data?.id && g.data.id !== g.id)));
  } else if (filter.matched === false) {
    result = result.filter((g) => !g.otixMediaId && !g.matchSuggestion && !g.otixMatchSuggestion);
  }

  if (filter.hasSuggestion === true) {
    result = result.filter((g) => Boolean(g.matchSuggestion || g.otixMatchSuggestion));
  } else if (filter.hasSuggestion === false) {
    result = result.filter((g) => !g.matchSuggestion && !g.otixMatchSuggestion);
  }

  if (filter.search) {
    const q = filter.search.toLowerCase();
    result = result.filter((g) =>
      g.title?.toLowerCase().includes(q) ||
      g.installDir?.toLowerCase().includes(q) ||
      g.exePath?.toLowerCase().includes(q)
    );
  }

  if (filter.installed === true) {
    result = result.filter((g) => g.platform !== 'iso' && Boolean(g.exePath));
  }

  if (filter.sortBy) {
    const sortBy = filter.sortBy;
    const sortDir = filter.sortDir || 'asc';
    const multiplier = sortDir === 'desc' ? -1 : 1;

    result.sort((a, b) => {
      if (sortBy === 'last_played_at') {
        const aTime = (a.lastPlayedAt || (a as any).last_played_at) ? new Date(a.lastPlayedAt || (a as any).last_played_at).getTime() : 0;
        const bTime = (b.lastPlayedAt || (b as any).last_played_at) ? new Date(b.lastPlayedAt || (b as any).last_played_at).getTime() : 0;
        if (aTime !== bTime) {
          return (aTime - bTime) * multiplier;
        }
        return a.title.localeCompare(b.title);
      }
      if (sortBy === 'platform') {
        const cmp = (a.platform || '').localeCompare(b.platform || '');
        if (cmp !== 0) return cmp * multiplier;
        return a.title.localeCompare(b.title);
      }
      if (sortBy === 'updated_at') {
        const aTime = (a as any).updatedAt ? new Date((a as any).updatedAt).getTime() : 0;
        const bTime = (b as any).updatedAt ? new Date((b as any).updatedAt).getTime() : 0;
        if (aTime !== bTime) return (aTime - bTime) * multiplier;
        return a.title.localeCompare(b.title);
      }
      return a.title.localeCompare(b.title) * multiplier;
    });
  }

  if (filter.offset != null && filter.offset > 0) {
    result = result.slice(filter.offset);
  }

  if (filter.limit != null && filter.limit > 0) {
    result = result.slice(0, filter.limit);
  }

  return result;
}

// ── Hooks ─────────────────────────────────────────────────────────

/**
 * Fetch local games from the desktop SQLite DB via IPC.
 * Canonical query key ['local-games', 'list'] shares cached dataset across components.
 * Client-side sorting/filtering is applied in memory via select projection.
 * Auto-invalidates when the DB changes with a 200ms debounce to prevent notification storms.
 */
export function useLocalGames(filter?: GamesFilter) {
  const queryClient = useQueryClient();

  useEffect(() => {
    return subscribeToGameDbChanges(() => {
      queryClient.invalidateQueries({ queryKey: localGameKeys.all });
    });
  }, [queryClient]);

  const filterKey = filter ? JSON.stringify(filter) : undefined;
  const select = useMemo(() => {
    if (!filter || Object.keys(filter).length === 0) return undefined;
    return (games: LocalGame[]) => applyClientGameFilter(games, filter);
  }, [filterKey]);

  return useQuery({
    queryKey: localGameKeys.list(),
    queryFn: () => fetchGames(),
    staleTime: 30_000,
    select,
  });
}

/** Fetch a single game by its local DB id. */
export function useLocalGame(id: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    return subscribeToGameDbChanges(() => {
      queryClient.invalidateQueries({ queryKey: localGameKeys.all });
    });
  }, [queryClient]);

  return useQuery({
    queryKey: localGameKeys.detail(id!),
    queryFn: () => fetchGameById(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

/** Fetch total game count, optionally filtered. */
export function useLocalGameCount(filter?: GamesFilter) {
  return useQuery({
    queryKey: localGameKeys.count(filter),
    queryFn: () => fetchGameCount(filter),
    staleTime: 30_000,
  });
}

/**
 * Local library plus scanned server releases, for launcher lists.
 * Does not change matching/hydration — those still use useLocalGames.
 */
export function useLauncherVisibleGames(filter?: GamesFilter) {
  const local = useLocalGames(filter)
  const server = useServerGames()
  const data = useMemo(
    () => mergeLocalAndServerGames(local.data, server.data?.files),
    [local.data, server.data?.files],
  )

  return {
    ...local,
    data,
    isLoading: local.isLoading || server.isLoading,
  }
}

/** Scanned server titles, including ones that did not auto-match the catalog. */
export function useLauncherFoundGames(filter?: GamesFilter) {
  const local = useLocalGames(filter)
  const server = useServerGames()
  const data = useMemo(
    () => listFoundServerGames(local.data, server.data?.files),
    [local.data, server.data?.files],
  )
  const persistable = useMemo(
    () => persistableServerGames(local.data, server.data?.files),
    [local.data, server.data?.files],
  )

  return {
    ...local,
    data,
    persistable,
    isLoading: local.isLoading || server.isLoading,
  }
}

// ── Mutations ─────────────────────────────────────────────────────

export function useAcceptSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ gameId, suggestion }: { gameId: string; suggestion: Record<string, unknown> }) =>
      acceptSuggestionOnServer(gameId, suggestion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: localGameKeys.all });
    },
  });
}

export function useRejectSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ gameId, suggestionMediaId }: { gameId: string; suggestionMediaId: string }) =>
      rejectSuggestionOnServer(gameId, suggestionMediaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: localGameKeys.all });
    },
  });
}

// ── Query helpers for derived data ────────────────────────────────

/**
 * Convenience: fetch only matched games (those with otixMediaId).
 * Equivalent to useLocalGames({ matched: true }).
 */
export function useLocalMatchedGames() {
  return useLocalGames({ matched: true } satisfies GamesFilter);
}

/**
 * Convenience: fetch only unmatched games (no otixMediaId, no suggestion).
 * Equivalent to useLocalGames({ matched: false }).
 */
export function useUnmatchedGames() {
  return useLocalGames({ matched: false } satisfies GamesFilter);
}

// ── Match/sync mutations ──────────────────────────────────────────

// Types for POST /media/match/batch response (camelCase after apiClient)
interface BatchMatchCandidate {
  mediaItemId: string | null
  title: string
  posterUrl: string | null
  backdropUrl: string | null
  releaseYear: number | null
  platforms: string[] | null
  confidence: number
  matchType: string
  needsImport: boolean
}

interface BatchMatchResult {
  queryId: string
  queryTitle: string
  candidates: BatchMatchCandidate[]
  autoMatch: BatchMatchCandidate | null
}

interface BatchMatchResponse {
  matches: BatchMatchResult[]
}

function candidateToGame(c: BatchMatchCandidate, confidence: number): Game {
  return {
    id: c.mediaItemId || '',
    title: c.title,
    slug: '',
    posterUrl: c.posterUrl ?? undefined,
    textlessPosterUrl: null,
    backdropUrl: c.backdropUrl ?? undefined,
    logoUrl: undefined,
    iconUrl: undefined,
    confidence,
  }
}

export function useSyncLocalGames() {
  return useMutation({
    mutationFn: async (games: LocalGame[]): Promise<void> => {
      const matched = games.filter((g) => g.data?.id);
      if (matched.length === 0) return;
      await apiClient.post("/media/sync-local-games", {
        games: matched.map((g) => ({
          title: g.title,
          platform: g.platform,
          otixMediaId: g.data?.id,
          matchSuggestionMediaId: g.matchSuggestion?.id ?? null,
        })),
      });
    },
  });
}

export function useMatchLocalGames() {
  return useMutation({
    mutationFn: async (games: LocalGame[]): Promise<LocalGame[]> => {
      const { data } = await apiClient.post<BatchMatchResponse>(
        "/media/match/batch",
        { games: games.map((g, i) => ({ queryId: g.id || `game-${i}`, title: g.title, platform: g.platform })) },
      );

      const matchById = new Map<string, BatchMatchCandidate>();
      const matchByTitle = new Map<string, BatchMatchCandidate>();
      for (const m of data.matches) {
        const best = m.autoMatch || (m.candidates[0]?.confidence >= 0.95 ? m.candidates[0] : null);
        if (!best?.mediaItemId) continue;
        if (m.queryId) matchById.set(m.queryId, best);
        if (m.queryTitle) matchByTitle.set(m.queryTitle, best);
      }

      return games.map((game) => {
        const match = (game.id && matchById.get(game.id)) || matchByTitle.get(game.title);
        if (match?.mediaItemId) {
          const catalogGame = candidateToGame(match, match.confidence);
          if (game.data?.id || match.confidence >= 0.9) {
            return { ...game, data: catalogGame, matchSuggestion: undefined };
          }
          return { ...game, matchSuggestion: catalogGame };
        }
        return game;
      });
    },
  });
}
