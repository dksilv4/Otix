import { infiniteQueryOptions } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { discoverKeys } from './discover-keys'
import type { MediaItemSummary } from '@media/media-queries'

export interface DiscoverListResponse {
  items: MediaItemSummary[]
  nextCursor: string | null
  hasMore: boolean
  total: number | null
}

export const discoverQueries = {
  section: (mediaType: string) =>
    infiniteQueryOptions({
      queryKey: discoverKeys.section(mediaType),
      queryFn: async ({ pageParam }) => {
        const params: Record<string, string> = { limit: '20', mediaType, has_artwork: 'true' }
        if (pageParam) params.cursor = pageParam
        const { data } = await apiClient.get<DiscoverListResponse>('/media', { params })
        return data
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialPageParam: '' as string,
      staleTime: 1000 * 60 * 5,
    }),

  hero: () =>
    infiniteQueryOptions({
      queryKey: discoverKeys.hero(),
      queryFn: async ({ pageParam }) => {
        const params: Record<string, string> = { limit: '6', has_artwork: 'true' }
        if (pageParam) params.cursor = pageParam
        const { data } = await apiClient.get<DiscoverListResponse>('/media', { params })
        return data
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialPageParam: '' as string,
      staleTime: 1000 * 60 * 5,
    }),
}
