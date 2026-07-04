import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { discoverKeys } from './discover-keys'
import type { MediaItemSummary } from '@media/queries/media-queries'
import type { PersonalizedSection, TrendingTrailerItem } from '../types'

const ONE_DAY = 1000 * 60 * 60 * 24

export interface DiscoverListResponse {
  items: MediaItemSummary[]
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
      staleTime: ONE_DAY,
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
      staleTime: ONE_DAY,
      gcTime: ONE_DAY,
    }),

  sections: () =>
    queryOptions({
      queryKey: discoverKeys.sections(),
      queryFn: async () => {
        const { data } = await apiClient.get<{ sections: PersonalizedSection[] }>('/discover/sections')
        return data.sections
      },
      staleTime: ONE_DAY,
      gcTime: ONE_DAY,
    }),

  trailers: () =>
    queryOptions({
      queryKey: discoverKeys.trailers(),
      queryFn: async () => {
        const { data } = await apiClient.get<{ items: TrendingTrailerItem[] }>(
          '/discover/trailers/trending',
        )
        return data.items
      },
      staleTime: ONE_DAY,
      gcTime: ONE_DAY,
    }),
}
