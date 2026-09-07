import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { discoverKeys } from './discover-keys'
import type { MediaItemSummary, SeasonSummary } from '@media/queries/media-queries'
import type { PersonalizedSection } from '../types'

const TWO_HOURS = 1000 * 60 * 60 * 2
const ONE_DAY = 1000 * 60 * 60 * 24

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
  list: (mediaType: string, listType: string, genre?: string, language?: string, isAnime?: boolean) =>
    infiniteQueryOptions({
      queryKey: discoverKeys.list(mediaType, listType, genre, language, isAnime),
      queryFn: async ({ pageParam }) => {
        const params: Record<string, string | boolean> = { limit: '20' }
        if (pageParam) params.cursor = pageParam as string
        if (genre) params.genre = genre
        if (language) params.language = language
        if (isAnime != null) params.is_anime = isAnime
        const { data } = await apiClient.get<DiscoverListResponse>(
          `/discover/${mediaType}/${listType}`,
          { params },
        )
        return data
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialPageParam: '',
      staleTime: TWO_HOURS,
      gcTime: ONE_DAY,
    }),

  // New Seasons surfaces each show's latest Season as the rail item, so the
  // payload is SeasonSummary not MediaItemSummary. /discover/show/trending is
  // the plain shows feed; the season feed lives at /discover/season/trending.
  trendingSeasons: () =>
    infiniteQueryOptions({
      queryKey: discoverKeys.trendingSeasons(),
      queryFn: async ({ pageParam }) => {
        const params: Record<string, string | boolean> = { limit: '20' }
        if (pageParam) params.cursor = pageParam as string
        const { data } = await apiClient.get<SeasonListResponse>(
          '/discover/season/trending',
          { params },
        )
        return data
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialPageParam: '',
      staleTime: TWO_HOURS,
      gcTime: ONE_DAY,
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
      staleTime: TWO_HOURS,
      gcTime: ONE_DAY,
    }),

  sections: () =>
    queryOptions({
      queryKey: discoverKeys.sections(),
      queryFn: async () => {
        const { data } = await apiClient.get<{ sections: PersonalizedSection[] }>('/discover/sections')
        return data.sections
      },
      staleTime: TWO_HOURS,
      gcTime: ONE_DAY,
    }),

}
