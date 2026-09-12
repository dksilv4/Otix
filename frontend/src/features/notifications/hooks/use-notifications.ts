import { useCallback, useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import type { NotificationListResponse } from '../types'
import { useAuth } from '@/lib/providers/auth'

export function useNotifications() {
  const { isAuthenticated } = useAuth()
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    return () => {
      if (observerRef.current) observerRef.current.disconnect()
    }
  }, [])

  const query = useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    queryFn: async ({ pageParam }) => {
      const params = pageParam as string | undefined
      const { data } = await apiClient.get<any>('/notifications', {
        params: { limit: 20, ...(params ? { cursor: params } : {}) },
      })
      const items = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.results)
          ? data.results
          : Array.isArray(data)
            ? data
            : []
      return {
        ...data,
        items,
        nextCursor: data?.nextCursor ?? data?.next_cursor ?? null,
        hasMore: data?.hasMore ?? !!(data?.nextCursor || data?.next_cursor || data?.next),
      } as NotificationListResponse
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.hasMore ? lastPage.nextCursor : undefined,
    staleTime: 30_000,
    enabled: isAuthenticated,
  })

  const allItems = query.data?.pages?.flatMap((p) => (Array.isArray(p?.items) ? p.items.filter(Boolean) : [])) ?? []

  const lastItemRef = useCallback(
    (node: HTMLElement | null) => {
      if (!node || !query.hasNextPage || query.isFetchingNextPage) return
      if (observerRef.current) observerRef.current.disconnect()
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            query.fetchNextPage()
          }
        },
        { rootMargin: '200px' },
      )
      observerRef.current.observe(node)
    },
    [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage],
  )

  return { ...query, allItems, lastItemRef }
}
