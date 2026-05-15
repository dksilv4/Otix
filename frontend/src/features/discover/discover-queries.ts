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
  list: (mediaType: string, listType: string) =>
    infiniteQueryOptions({
      queryKey: discoverKeys.list(mediaType, listType),
      queryFn: async ({ pageParam }) => {
        const params: Record<string, string> = { limit: '20' }
        if (pageParam) params.cursor = pageParam
        const { data } = await apiClient.get<DiscoverListResponse>(
          `/discover/${mediaType}/${listType}`,
          { params },
        )
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
        const params: Record<string, string> = { limit: '6' }
        if (pageParam) params.cursor = pageParam
        const { data } = await apiClient.get<DiscoverListResponse>('/discover/hero', { params })
        return data
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialPageParam: '' as string,
      staleTime: 1000 * 60 * 5,
    }),
}
