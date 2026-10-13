import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { discoverKeys } from './discover-keys'
import { freshUnlessEmpty, retainUnlessEmpty } from '@/lib/query/empty-cache'
import type { MediaItemSummary, SeasonSummary } from '@media/queries/media-queries'
import type { PersonalizedSection, DiscoverContinueWatchingResponse } from '../types'
import type { GenreOption } from '@/features/genre/types'

const TWO_HOURS = 1000 * 60 * 60 * 2
const ONE_DAY = 1000 * 60 * 60 * 24

export const discoverStaleTime = freshUnlessEmpty(TWO_HOURS)
const discoverGcTime = retainUnlessEmpty(ONE_DAY)

export interface DiscoverListResponse {
  items: MediaItemSummary[]
  nextCursor: string | null
  hasMore: boolean
  total: number | null
}

export interface SeasonListResponse {
  items: SeasonSummary[]
  nextCursor: string | null
  hasMore: boolean
  total: number | null
}

export const discoverQueries = {
  list: (mediaType: string, listType: string, genre?: string, language?: string, isAnime?: boolean, platform?: string) =>
    infiniteQueryOptions({
      queryKey: discoverKeys.list(mediaType, listType, genre, language, isAnime, platform),
      queryFn: async ({ pageParam }) => {
        const params: Record<string, string | boolean> = { limit: '20' }
        if (pageParam) {
          params.page = pageParam as string
          params.cursor = pageParam as string
        }
        if (genre) params.genre = genre
        if (language) params.language = language
        if (isAnime != null) params.is_anime = isAnime
        if (platform) params.platform = platform
        const { data } = await apiClient.get<DiscoverListResponse>(
          `/discover/${mediaType}/${listType}`,
          { params },
        )
        return data
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialPageParam: '',
      staleTime: discoverStaleTime,
      gcTime: discoverGcTime,
    }),

  // New Seasons surfaces each show's latest Season as the rail item, so the
  // payload is SeasonSummary not MediaItemSummary. /discover/show/trending is
  // the plain shows feed; the season feed lives at /discover/season/trending.
  trendingSeasons: () =>
    infiniteQueryOptions({
      queryKey: discoverKeys.trendingSeasons(),
      queryFn: async ({ pageParam }) => {
        const params: Record<string, string | boolean> = { limit: '20' }
        if (pageParam) {
          params.page = pageParam as string
          params.cursor = pageParam as string
        }
        const { data } = await apiClient.get<SeasonListResponse>(
          '/discover/season/trending',
          { params },
        )
        return data
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialPageParam: '',
      staleTime: discoverStaleTime,
      gcTime: discoverGcTime,
    }),

  hero: () =>
    infiniteQueryOptions({
      queryKey: discoverKeys.hero(),
      queryFn: async ({ pageParam }) => {
        const params: Record<string, string> = { limit: '9' }
        if (pageParam) params.cursor = pageParam as string
        const { data } = await apiClient.get<DiscoverListResponse>('/discover/hero', { params })
        return data
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialPageParam: '',
      staleTime: discoverStaleTime,
      gcTime: discoverGcTime,
    }),

  sections: () =>
    queryOptions({
      queryKey: discoverKeys.sections(),
      queryFn: async () => {
        const { data } = await apiClient.get<{ sections: PersonalizedSection[] }>('/discover/sections')
        return data.sections
      },
      staleTime: discoverStaleTime,
      gcTime: discoverGcTime,
    }),

  genres: (mediaType?: string) =>
    queryOptions({
      queryKey: discoverKeys.genres(mediaType),
      queryFn: async () => {
        const params = mediaType ? { media_type: mediaType } : undefined
        const { data } = await apiClient.get<GenreOption[]>('/media/genres', { params })
        return data
      },
      staleTime: discoverStaleTime,
      gcTime: discoverGcTime,
    }),

  freeGames: () =>
    queryOptions({
      queryKey: discoverKeys.freeGames(),
      queryFn: async () => {
        const { data } = await apiClient.get<FreeGamesResponse>('/free-games')
        return data
      },
      // Promos rotate often; keep in sync with backend CACHE_TTL (15m).
      // Empty `{current,upcoming}` must not sit fresh for the discover default
      // (2h) — those keys aren't covered by `freshUnlessEmpty`.
      staleTime: (query) => {
        const data = query.state.data as FreeGamesResponse | undefined
        if (!data) return 0
        const count =
          (Array.isArray(data.current) ? data.current.length : 0) +
          (Array.isArray(data.upcoming) ? data.upcoming.length : 0)
        return count === 0 ? 0 : 1000 * 60 * 15
      },
      gcTime: discoverGcTime,
      refetchOnMount: 'always',
    }),

  continueWatching: () =>
    queryOptions({
      queryKey: discoverKeys.continueWatching(),
      queryFn: async () => {
        const { data } = await apiClient.get<DiscoverContinueWatchingResponse>(
          '/integrations/plex/continue-watching',
        )
        return Array.isArray(data?.items) ? data.items : []
      },
      staleTime: 15000,
      refetchInterval: (q) => (q.state.status === 'error' ? false : 30000),
    }),
}

export interface FreeGameItem {
  id: string
  store: string
  storeName: string
  title: string
  description?: string | null
  originalPrice?: string | null
  discountPercentage?: number
  isFreeNow: boolean
  startDate?: string | null
  endDate?: string | null
  claimUrl?: string | null
  posterUrl?: string | null
  backdropUrl?: string | null
  logoUrl?: string | null
  externalId?: string | null
  matched?: boolean
  mediaItem?: MediaItemSummary | null
  itemType?: string | null
  baseGameTitle?: string | null
  baseGameId?: string | null
}

export interface FreeGamesResponse {
  current: FreeGameItem[]
  upcoming: FreeGameItem[]
  total: number
}
