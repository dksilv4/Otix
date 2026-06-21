import { useCallback, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/providers/auth'
import { notificationQueries } from '../queries'

export function useNotifications() {
  const { isAuthenticated } = useAuth()
  const observerRef = useRef<IntersectionObserver | null>(null)

  const query = useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    queryFn: async ({ pageParam }) => {
      const params = pageParam as string | undefined
      const result = await notificationQueries.list(params).queryFn()
      return result
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    staleTime: 30_000,
    enabled: isAuthenticated,
  })

  const allItems = query.data?.pages.flatMap((p) => p.items) ?? []

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
