import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchGames, fetchGameById, fetchGameCount, acceptSuggestionOnServer, rejectSuggestionOnServer } from './storage';
import { getDesktopAPI } from '@/lib/desktop/api';
import { useEffect } from 'react';
import type { GamesFilter } from './types';

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
    queryFn: () => fetchGames(filter as Record<string, unknown>),
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
    queryFn: () => fetchGameCount(filter as Record<string, unknown>),
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

// ── Match/sync mutations (previously in game-scanner/queries.ts) ──

import { apiClient } from "@/lib/api/client";
import type { LocalGame } from "./types";

interface MatchResult {
  queryTitle: string;
  matchedMedia: {
    id: string;
    title: string;
    slug: string;
    posterUrl?: string | null;
    textlessPosterUrl?: string | null;
    backdropUrl?: string | null;
    logoUrl?: string | null;
    iconUrl?: string | null;
  } | null;
  confidence: number;
}

interface MatchResponse {
  matches: MatchResult[];
}

export function useSyncLocalGames() {
  return useMutation({
    mutationFn: async (games: LocalGame[]): Promise<void> => {
      const matched = games.filter((g) => g.data?.id);
      if (matched.length === 0) return;
      await apiClient.post("/media/sync-local-games", {
        games: matched.map((g) => ({
          id: g.id,
          mediaId: g.data?.id,
          title: g.title,
          platform: g.platform,
          exePath: g.exePath,
          installDir: g.installDir,
        })),
      });
    },
  });
}

export function useMatchLocalGames() {
  return useMutation({
    mutationFn: async (games: LocalGame[]): Promise<LocalGame[]> => {
      // Always send all game to refresh catalog data for every title
      const gameEntries = games.map((g) => ({
        title: g.title,
        platform: g.platform,
      }));
      const { data } = await apiClient.post<MatchResponse>(
        "/media/match-local-games",
        { games: gameEntries },
      );

      const matchMap = new Map(
        data.matches.map((m) => [m.queryTitle, m]),
      );

      return games.map((game) => {
        const match = matchMap.get(game.title);
        if (match && match.matchedMedia) {
          const media = match.matchedMedia;
          const autoAcceptNew = match.confidence >= 0.9;

          // Always refresh data for already-matched game, only auto-match new ones at high confidence
          if (game.data?.id || autoAcceptNew) {
            return {
              ...game,
              otixMediaId: media.id,
              otixMediaTitle: media.title,
              otixMediaSlug: media.slug,
              otixConfidence: match.confidence,
              otixPosterUrl: media.posterUrl,
              otixTextlessPosterUrl: media.textlessPosterUrl,
              otixBackdropUrl: media.backdropUrl,
              otixIconUrl: media.iconUrl,
              otixLogoUrl: media.logoUrl,
            };
          }
          // Medium confidence — show as recommendation for new matches
          return {
            ...game,
            otixConfidence: match.confidence,
            otixPosterUrl: media.posterUrl,
            otixTextlessPosterUrl: media.textlessPosterUrl,
            otixBackdropUrl: media.backdropUrl,
            otixIconUrl: media.iconUrl,
            otixLogoUrl: media.logoUrl,
            otixMatchSuggestion: {
              id: media.id,
              mediaId: media.id,
              title: media.title,
              slug: media.slug,
            },
          } as LocalGame;
        }
        return game;
      });
    },
  });
}
