import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchGames, fetchGameById, fetchGameCount, acceptSuggestionOnServer, rejectSuggestionOnServer } from './storage';
import { getDesktopAPI } from '@/lib/desktop/api';
import { apiClient } from "@/lib/api/client";
import { useEffect } from 'react';
import type { GamesFilter } from '../types';
import type { Game, LocalGame } from "../types";

type Listener = () => void;

const listeners = new Set<Listener>();
let unsub: (() => void) | null = null;

function subscribeToGameDbChanges(listener: Listener): () => void {
  listeners.add(listener);
  if (!unsub) {
    const api = getDesktopAPI();
    if (api?.onGamesDbChanged) {
      unsub = api.onGamesDbChanged(() => {
        listeners.forEach((fn) => fn());
      });
    }
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unsub) {
      unsub();
      unsub = null;
    }
  };
}

// ── Query key factory ─────────────────────────────────────────────

export const localGameKeys = {
  all: ['local-games'] as const,
  list: (filter?: GamesFilter) => ['local-games', 'list', filter] as const,
  detail: (id: string) => ['local-games', 'detail', id] as const,
  count: (filter?: GamesFilter) => ['local-games', 'count', filter] as const,
};

// ── Hooks ─────────────────────────────────────────────────────────

/**
 * Fetch local games from the desktop SQLite DB via IPC.
 * Auto-invalidates when the DB changes (scan complete, suggestion accepted, etc.).
 */
export function useLocalGames(filter?: GamesFilter) {
  const queryClient = useQueryClient();

  useEffect(() => {
    return subscribeToGameDbChanges(() => {
      queryClient.invalidateQueries({ queryKey: localGameKeys.all });
    });
  }, [queryClient]);

  return useQuery({
    queryKey: localGameKeys.list(filter),
    queryFn: () => fetchGames(filter),
    staleTime: 30_000,
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

// Types for POST /media/match/batch response
interface BatchMatchCandidate {
  media_item_id: string | null
  title: string
  poster_url: string | null
  backdrop_url: string | null
  release_year: number | null
  platforms: string[] | null
  confidence: number
  match_type: string
  needs_import: boolean
}

interface BatchMatchResult {
  query_id: string
  query_title: string
  candidates: BatchMatchCandidate[]
  auto_match: BatchMatchCandidate | null
}

interface BatchMatchResponse {
  matches: BatchMatchResult[]
}

function candidateToGame(c: BatchMatchCandidate, confidence: number): Game {
  return {
    id: c.media_item_id || '',
    title: c.title,
    slug: '',
    posterUrl: c.poster_url ?? undefined,
    textlessPosterUrl: null,
    backdropUrl: c.backdrop_url ?? undefined,
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
        { games: games.map((g, i) => ({ query_id: g.id || `game-${i}`, title: g.title, platform: g.platform })) },
      );

      // Build title → best match lookup (auto_match first, then top candidate)
      const matchMap = new Map<string, BatchMatchCandidate>();
      for (const m of data.matches) {
        const best = m.auto_match || m.candidates[0] || null;
        if (best?.media_item_id) matchMap.set(m.query_title, best);
      }

      return games.map((game) => {
        const match = matchMap.get(game.title);
        if (match?.media_item_id) {
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
