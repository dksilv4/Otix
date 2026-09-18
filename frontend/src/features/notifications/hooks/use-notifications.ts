import { useCallback, useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useHasSession } from '@/lib/providers/auth'
import { notificationQueries } from '../queries'

export function useNotifications() {
  const hasSession = useHasSession()
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    return () => {
      if (observerRef.current) observerRef.current.disconnect()
    }
  }, [])

  const query = useInfiniteQuery({
    ...notificationQueries.infiniteList(),
    enabled: hasSession,
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
