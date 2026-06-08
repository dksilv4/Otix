import { queryOptions, useMutation, useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import type { CatalogGame, CatalogGameDetail } from "./types"

// ── Raw API response shapes (snake_case from backend → camelCase by axios interceptor) ──

interface MediaItemSummaryResponse {
  id: string
  mediaType: string
  title: string
  slug: string
  posterUrl?: string | null
  textlessPosterUrl?: string | null
  logoUrl?: string | null
  iconUrl?: string | null
  backdropUrl?: string | null
  releaseDate?: string | null
  popularity: number
  avgRating?: number | null
  ratingCount: number
  isAdult: boolean
}

interface MediaItemListResponse {
  items: MediaItemSummaryResponse[]
  hasMore: boolean
  total?: number | null
  nextCursor?: string | null
}

interface MediaItemDetailResponse extends MediaItemSummaryResponse {
  overview?: string | null
  originalLanguage?: string | null
  genres: { id: string; name: string; slug: string }[]
  involvedCompanies: {
    id: string
    company: { id: string; name: string; slug: string; logoUrl?: string | null }
    developer: boolean
    publisher: boolean
  }[]
  platforms: { id: string; platform: { id: string; name: string; slug: string } }[]
  gameModes: { id: string; gameMode: { id: string; name: string; slug: string } }[]
  game?: {
    releaseStatus?: string | null
    website?: string | null
    steamAppId?: number | null
    isFree: boolean
    hasMultiplayer: boolean
  } | null
  steamPlaytimeForever?: number | null
  steamPlaytime2weeks?: number | null
  youtubeVideoId?: string | null
  youtubeChannelTitle?: string | null
}

// ── Map response to camelCase types ────────────────────────────────

function toCatalogGame(item: MediaItemSummaryResponse): CatalogGame {
  return {
    id: item.id,
    mediaType: item.mediaType,
    title: item.title,
    slug: item.slug,
    posterUrl: item.posterUrl,
    textlessPosterUrl: item.textlessPosterUrl,
    logoUrl: item.logoUrl,
    iconUrl: item.iconUrl,
    backdropUrl: item.backdropUrl,
    releaseDate: item.releaseDate,
    popularity: item.popularity,
    avgRating: item.avgRating,
    ratingCount: item.ratingCount,
    isAdult: item.isAdult,
  }
}

function toCatalogGameDetail(item: MediaItemDetailResponse): CatalogGameDetail {
  return {
    ...toCatalogGame(item),
    overview: item.overview,
    originalLanguage: item.originalLanguage,
    genres: item.genres ?? [],
    involvedCompanies: (item.involvedCompanies ?? []).map((c) => ({
      ...c,
      company: {
        ...c.company,
        logoUrl: c.company.logoUrl,
      },
    })),
    platforms: item.platforms ?? [],
    gameModes: (item.gameModes ?? []).map((gm) => ({
      id: gm.id,
      gameMode: {
        id: gm.gameMode.id,
        name: gm.gameMode.name,
        slug: gm.gameMode.slug,
      },
    })),
    releaseStatus: item.game?.releaseStatus ?? null,
    website: item.game?.website ?? null,
    steamAppId: item.game?.steamAppId ?? null,
    steamPlaytimeForever: item.steamPlaytimeForever ?? null,
    steamPlaytime2weeks: item.steamPlaytime2weeks ?? null,
    isFree: item.game?.isFree ?? false,
    hasMultiplayer: item.game?.hasMultiplayer ?? false,
    youtubeVideoId: item.youtubeVideoId,
    youtubeChannelTitle: item.youtubeChannelTitle,
  }
}

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
      const { data } = await apiClient.get<MediaItemListResponse>("/media/", {
        params: { media_type: "game", sort_by: "popularity", sort_dir: "desc", limit: 24 },
      })
      return (data.items ?? []).map(toCatalogGame)
    },
    staleTime: 1000 * 60 * 2,
  })

export const gameDetailOptions = (id: string) =>
  queryOptions({
    queryKey: gameKeys.detail(id),
    queryFn: async (): Promise<CatalogGameDetail | null> => {
      try {
        const { data } = await apiClient.get<MediaItemDetailResponse>(`/media/${id}`)
        return toCatalogGameDetail(data)
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
      const { data } = await apiClient.get<MediaItemSummaryResponse[]>("/media/suggestions", {
        params: { q: query, limit: 8 },
      })
      return (data ?? []).map(toCatalogGame)
    },
    enabled: query.length >= 1,
    staleTime: 1000 * 30,
  })

export const gameGenresOptions = () =>
  queryOptions({
    queryKey: gameKeys.genres(),
    queryFn: async (): Promise<{ id: string; name: string; slug: string }[]> => {
      const { data } = await apiClient.get<MediaItemSummaryResponse[]>("/media/genres", {
        params: { media_type: "game" },
      })
      return data as unknown as { id: string; name: string; slug: string }[]
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
      const { data } = await apiClient.get(`/saves/locations/${mediaItemId}`)
      return data as {
        gameId: string
        verified: { platform: string; pathPattern: string; isVerified: boolean }[]
        suggested: { platform: string; pathPattern: string; count: number }[]
      }
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
