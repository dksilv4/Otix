import { queryOptions, useMutation, useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api/client"
import type { CamelCaseKeys } from "@/lib/api/client"
import type { components } from "@/lib/api/openapi"
import type { CatalogGame, CatalogGameDetail } from "../types"

const IGDB_ID_PREFIX = "igdb:"

// ponytail: use generated API types — the axios interceptor converts snake_case → camelCase
type MediaItemSummary = CamelCaseKeys<components["schemas"]["MediaItemSummary"]>
type MediaItemDetail = CamelCaseKeys<components["schemas"]["MediaItemDetail"]>
type MediaListResponse = CamelCaseKeys<components["schemas"]["MediaItemListResponse"]>

// ── Query key factory ──────────────────────────────────────────────

export const gameKeys = {
  all: ["games"] as const,
  popular: () => [...gameKeys.all, "popular"] as const,
  detail: (id: string) => [...gameKeys.all, "detail", id] as const,
  search: (query: string) => [...gameKeys.all, "search", query] as const,
  genres: () => [...gameKeys.all, "genres"] as const,
}

// ── Query option factories ────────────────────────────────────────

export const popularGamesOptions = () =>
  queryOptions({
    queryKey: gameKeys.popular(),
    queryFn: async (): Promise<CatalogGame[]> => {
      try {
        const { data } = await apiClient.get<{ items: MediaItemSummary[] }>("/media/", {
          params: { media_type: "game", sort_by: "popularity", sort_dir: "desc", limit: 24 },
        })
        return (data.items ?? []) as unknown as CatalogGame[]
      } catch {
        return []
      }
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

export const gameSearchOptions = (query: string) =>
  queryOptions({
    queryKey: gameKeys.search(query),
    queryFn: async (): Promise<{ items: CatalogGame[]; backfillPending: boolean }> => {
      if (!query || query.length < 1) return { items: [], backfillPending: false }
      const { data } = await apiClient.get<MediaListResponse>("/search", {
        params: { q: query, page_size: 12, media_type: "game", include_external: true },
      })
      const items = (Array.isArray(data.items) ? data.items : []).filter(
        (item) => !item.mediaType || item.mediaType === "game",
      ) as unknown as CatalogGame[]
      return { items, backfillPending: Boolean(data.backfillPending) }
    },
    enabled: query.length >= 1,
    staleTime: 1000 * 15,
    refetchInterval: (result) => {
      const data = result.state.data
      if (!data) return false
      if (data.backfillPending) return 2000
      if (data.items.some((item) => String(item.id).startsWith(IGDB_ID_PREFIX))) return 2000
      return false
    },
  })

export async function resolveCatalogGame(result: CatalogGame): Promise<CatalogGame> {
  const id = String(result.id)
  if (!id.startsWith(IGDB_ID_PREFIX)) return result
  const igdbId = id.slice(IGDB_ID_PREFIX.length)
  const { data } = await apiClient.post<{ mediaId: number | string; title?: string; slug?: string }>(
    "/media/import/igdb",
    {},
    { params: { igdb_id: igdbId } },
  )
  return {
    ...result,
    id: String(data.mediaId),
    title: data.title || result.title,
    slug: data.slug || result.slug,
  }
}

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

export function usePopularGames(opts?: { enabled?: boolean }) {
  return useQuery({ ...popularGamesOptions(), enabled: opts?.enabled ?? true })
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

export function useGameSearch(query: string) {
  return useQuery(gameSearchOptions(query))
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
