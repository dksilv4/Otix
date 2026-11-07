import { useState, useEffect, useRef, useCallback } from 'react'

export interface UseProgressiveRenderOptions<T> {
  items: T[]
  initialCount?: number
  step?: number
  resetDeps?: unknown[]
}

/**
 * Hook to render large lists progressively in batches to optimize DOM size,
 * memory consumption, and scroll performance.
 */
export const useProgressiveRender = <T,>({
  items,
  initialCount = 80,
  step = 60,
  resetDeps = [],
}: UseProgressiveRenderOptions<T>) => {
  const [visibleCount, setVisibleCount] = useState(initialCount)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // Reset count whenever items length or reset dependencies change
  useEffect(() => {
    setVisibleCount(initialCount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, ...resetDeps])

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + step, items.length))
  }, [items.length, step])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    // Fallback if IntersectionObserver is not available in environment
    if (typeof IntersectionObserver === 'undefined') {
      setVisibleCount(items.length)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore()
        }
      },
      {
        rootMargin: '400px',
      },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore, items.length])

  const visibleItems = items.slice(0, visibleCount)
  const hasMore = visibleCount < items.length

  return {
    visibleItems,
    visibleCount,
    hasMore,
    sentinelRef,
    loadMore,
  }
}
