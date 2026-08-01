import { queryOptions, useMutation, useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api/client"
import type { CamelCaseKeys } from "@/lib/api/camel-client"
import type { components } from "@/lib/api/openapi"
import type { CatalogGame, CatalogGameDetail } from "../types"

// ponytail: use generated API types — the axios interceptor converts snake_case → camelCase
type MediaItemSummary = CamelCaseKeys<components["schemas"]["MediaItemSummary"]>
type MediaItemDetail = CamelCaseKeys<components["schemas"]["MediaItemDetail"]>

// ── Query key factory ──────────────────────────────────────────────

export const gameKeys = {
  all: ["games"] as const,
  popular: () => [...gameKeys.all, "popular"] as const,
  detail: (id: string) => [...gameKeys.all, "detail", id] as const,
  suggestions: (query: string) => [...gameKeys.all, "suggestions", query] as const,
  genres: () => [...gameKeys.all, "genres"] as const,
}

// ── Query option factories ────────────────────────────────────────

export const popularGamesOptions = () =>
  queryOptions({
    queryKey: gameKeys.popular(),
    queryFn: async (): Promise<CatalogGame[]> => {
      const { data } = await apiClient.get<{ items: MediaItemSummary[] }>("/media/", {
        params: { media_type: "game", sort_by: "popularity", sort_dir: "desc", limit: 24 },
      })
      return (data.items ?? [])
    },
    staleTime: 1000 * 60 * 2,
  })

export const gameDetailOptions = (id: string) =>
  queryOptions({
    queryKey: gameKeys.detail(id),
    queryFn: async (): Promise<CatalogGameDetail | null> => {
      try {
        const { data } = await apiClient.get<MediaItemDetail>(`/media/game/${id}`)
        return {
          ...data,
          isFree: data.game?.isFree ?? false,
          hasMultiplayer: data.game?.hasMultiplayer ?? false,
        } as CatalogGameDetail
      } catch {
        return null
      }
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  })

export const gameSuggestionsOptions = (query: string) =>
  queryOptions({
    queryKey: gameKeys.suggestions(query),
    queryFn: async (): Promise<CatalogGame[]> => {
      if (!query || query.length < 1) return []
      const { data } = await apiClient.get<MediaItemSummary[]>("/media/suggestions", {
        params: { q: query, limit: 8, media_type: 'game' },
      })
      return (data ?? []).filter((item) => item.mediaType === 'game')
    },
    enabled: query.length >= 1,
    staleTime: 1000 * 30,
  })

export const gameGenresOptions = () =>
  queryOptions({
    queryKey: gameKeys.genres(),
    queryFn: async (): Promise<{ id: string; name: string; slug: string }[]> => {
      const { data } = await apiClient.get<{ id: string; name: string; slug: string }[]>("/media/genres", {
        params: { media_type: "game" },
      })
      return data as { id: string; name: string; slug: string }[]
    },
    staleTime: 1000 * 60 * 10,
  })

// ── React Query hooks ──────────────────────────────────────────────

export function usePopularGames() {
  return useQuery(popularGamesOptions())
}

export function useGameDetail(id: string | undefined | null) {
  return useGame(id)
}

export function useGame(id: string | undefined | null) {
  return useQuery({
    ...gameDetailOptions(id ?? ""),
    enabled: !!id,
  })
}

export function useGameSuggestions(query: string) {
  return useQuery(gameSuggestionsOptions(query))
}

export function useGameGenres() {
  return useQuery(gameGenresOptions())
}

export function useSaveLocations(mediaItemId: string | undefined | null) {
  return useQuery({
    queryKey: ["saves", "locations", mediaItemId],
    queryFn: async () => {
      if (!mediaItemId) return null
      const { data } = await apiClient.get<{
        gameId: string
        verified: { platform: string; pathPattern: string; isVerified: boolean }[]
        suggested: { platform: string; pathPattern: string; count: number }[]
      }>(`/saves/locations/${mediaItemId}`)
      return data
    },
    enabled: !!mediaItemId,
    staleTime: 1000 * 60 * 5,
  })
}

export function useSubmitSaveLocation() {
  return useMutation({
    mutationFn: async ({
      mediaItemId,
      platform,
      pathPattern,
    }: {
      mediaItemId: string
      platform: string
      pathPattern: string
    }) => {
      const { data } = await apiClient.post(`/saves/locations/${mediaItemId}/suggest`, {
        platform,
        pathPattern,
      })
      return data
    },
  })
}
