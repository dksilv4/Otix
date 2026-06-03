import { queryOptions, useMutation, useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import type { CatalogGame, CatalogGameDetail } from "./types"

// ── Raw API response shapes (snake_case from backend) ──────────────

interface MediaItemSummaryResponse {
  id: string
  media_type: string
  title: string
  slug: string
  poster_url?: string | null
  textless_poster_url?: string | null
  logo_url?: string | null
  backdrop_url?: string | null
  release_date?: string | null
  popularity: number
  avg_rating?: number | null
  rating_count: number
  is_adult: boolean
}

interface MediaItemListResponse {
  items: MediaItemSummaryResponse[]
  has_more: boolean
  total?: number | null
  next_cursor?: string | null
}

interface MediaItemDetailResponse extends MediaItemSummaryResponse {
  overview?: string | null
  original_language?: string | null
  genres: { id: string; name: string; slug: string }[]
  involved_companies: {
    id: string
    company: { id: string; name: string; slug: string; logo_url?: string | null }
    developer: boolean
    publisher: boolean
  }[]
  platforms: { id: string; platform: { id: string; name: string; slug: string } }[]
  game_modes: { id: string; game_mode: { id: string; name: string; slug: string } }[]
  game?: {
    release_status?: string | null
    website?: string | null
    steam_app_id?: number | null
    is_free: boolean
    has_multiplayer: boolean
  } | null
  youtube_video_id?: string | null
  youtube_channel_title?: string | null
}

// ── Map response to camelCase types ────────────────────────────────

function toCatalogGame(item: MediaItemSummaryResponse): CatalogGame {
  return {
    id: item.id,
    mediaType: item.media_type,
    title: item.title,
    slug: item.slug,
    posterUrl: item.poster_url,
    textlessPosterUrl: item.textless_poster_url,
    logoUrl: item.logo_url,
    backdropUrl: item.backdrop_url,
    releaseDate: item.release_date,
    popularity: item.popularity,
    avgRating: item.avg_rating,
    ratingCount: item.rating_count,
    isAdult: item.is_adult,
  }
}

function toCatalogGameDetail(item: MediaItemDetailResponse): CatalogGameDetail {
  return {
    ...toCatalogGame(item),
    overview: item.overview,
    originalLanguage: item.original_language,
    genres: item.genres ?? [],
    involvedCompanies: (item.involved_companies ?? []).map((c) => ({
      ...c,
      company: {
        ...c.company,
        logoUrl: c.company.logo_url,
      },
    })),
    platforms: item.platforms ?? [],
    gameModes: (item.game_modes ?? []).map((gm) => ({
      id: gm.id,
      gameMode: {
        id: gm.game_mode.id,
        name: gm.game_mode.name,
        slug: gm.game_mode.slug,
      },
    })),
    releaseStatus: item.game?.release_status ?? null,
    website: item.game?.website ?? null,
    steamAppId: item.game?.steam_app_id ?? null,
    isFree: item.game?.is_free ?? false,
    hasMultiplayer: item.game?.has_multiplayer ?? false,
    youtubeVideoId: item.youtube_video_id,
    youtubeChannelTitle: item.youtube_channel_title,
  }
}

// ── Query keys ─────────────────────────────────────────────────────

export const gameKeys = {
  all: () => ["games"] as const,
  detail: (id: string) => [...gameKeys.all(), "detail", id] as const,
  genres: () => [...gameKeys.all(), "genres"] as const,
  suggestions: (query: string) => [...gameKeys.all(), "suggestions", query] as const,
}

// ── Catalog queries ────────────────────────────────────────────────

export const popularGamesOptions = () =>
  queryOptions({
    queryKey: [...gameKeys.all(), "popular"],
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

// ── Seed game titles from desktop scan ──────────────────────────────

interface SeedFromTitlesResponse {
  accepted: boolean
  total_titles: number
  task_id: string | null
}

export function useSeedFromTitles() {
  return useMutation({
    mutationFn: async (titles: string[]): Promise<SeedFromTitlesResponse> => {
      const { data } = await apiClient.post<SeedFromTitlesResponse>(
        "/media/seed-from-titles",
        { titles },
      )
      return data
    },
    retry: 1,
  })
}

