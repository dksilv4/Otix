import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { discoverKeys } from './discover-keys'
import type { MediaItemSummary } from '@media/media-queries'

export interface DiscoverListResponse {
  items: MediaItemSummary[]
  nextCursor: string | null
  hasMore: boolean
  total: number | null
}

export interface PersonalizedSection {
  id: string
  title: string
  mediaType: string | null
  listType: string
  genre: string | null
  language: string | null
  isAnime: boolean | null
  isPersonalized: boolean
  reason: string | null
}

export const discoverQueries = {
  list: (mediaType: string, listType: string, genre?: string, language?: string, isAnime?: boolean) =>
    infiniteQueryOptions({
      queryKey: discoverKeys.list(mediaType, listType, genre, language, isAnime),
      queryFn: async ({ pageParam }) => {
        const params: Record<string, string | boolean> = { limit: '20' }
        if (pageParam) params.cursor = pageParam
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
      initialPageParam: '' as string,
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 5,
    }),

  hero: () =>
    infiniteQueryOptions({
      queryKey: discoverKeys.hero(),
      queryFn: async ({ pageParam }) => {
        const params: Record<string, string> = { limit: '6' }
        if (pageParam) params.cursor = pageParam
        const { data } = await apiClient.get<DiscoverListResponse>('/discover/hero', { params })
        return data
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialPageParam: '' as string,
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
    }),

  sections: () =>
    queryOptions({
      queryKey: discoverKeys.sections(),
      queryFn: async () => {
        const { data } = await apiClient.get<{ sections: PersonalizedSection[] }>('/discover/sections')
        return data.sections
      },
      staleTime: 1000 * 60 * 10,
      gcTime: 1000 * 60 * 30,
    }),
}
