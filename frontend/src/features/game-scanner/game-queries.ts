import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchGames, fetchGameById, fetchGameCount, acceptSuggestionOnServer, rejectSuggestionOnServer } from './storage';
import { subscribeToGameDbChanges } from './db-sync';
import { useEffect } from 'react';
import type { LocalGame } from './types';

// ── Filter type (mirrors GameFilter in desktop game-storage-service) ──

export interface GamesFilter {
  platform?: string[];
  matched?: boolean;
  hasSuggestion?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'title' | 'platform' | 'updated_at';
  sortDir?: 'asc' | 'desc';
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
    mutationFn: ({ gameId, suggestion }: { gameId: string; suggestion: unknown }) =>
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
export function useMatchedGames() {
  return useLocalGames({ matched: true } satisfies GamesFilter);
}

/**
 * Convenience: fetch only unmatched games (no otixMediaId, no suggestion).
 * Equivalent to useLocalGames({ matched: false }).
 */
export function useUnmatchedGames() {
  return useLocalGames({ matched: false } satisfies GamesFilter);
}
