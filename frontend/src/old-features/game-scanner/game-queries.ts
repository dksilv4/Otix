import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchGames, fetchGameById, fetchGameCount, acceptSuggestionOnServer, rejectSuggestionOnServer } from './storage';
import { getDesktopAPI } from '@/lib/desktop/api';
import { useEffect } from 'react';

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

// ── Filter type (mirrors GameFilter in desktop game-storage-service) ──

export interface GamesFilter {
  platform?: string[];
  matched?: boolean;
  hasSuggestion?: boolean;
  search?: string;
  installed?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'title' | 'platform' | 'updated_at' | 'last_played_at';
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
