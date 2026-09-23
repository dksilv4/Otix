import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { discoverQueries } from '../queries/discover-queries'
import { mediaQueries } from '@media/queries/media-queries'

const AUTOPLAY_INTERVAL = 8000
const SWIPE_THRESHOLD = 50
const TRANSITION_TIMEOUT = 700

export function useHeroCarousel() {
  const queryClient = useQueryClient()
  const [activeIndex, setActiveIndex] = useState(0)
  const [prevActiveIndex, setPrevActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const touchStartXRef = useRef(0)
  const touchStartYRef = useRef(0)
  const [failedDetailIds, setFailedDetailIds] = useState<ReadonlySet<string>>(() => new Set())

  const { data: heroData, fetchNextPage, hasNextPage, isLoading, isError, refetch } = useInfiniteQuery(discoverQueries.hero())
  const items = useMemo(() => {
    const pages = heroData?.pages ?? []
    // Guard against a page payload lacking an array `items` (e.g. a DRF
    // `results` envelope) which would otherwise inject an [undefined] item.
    return pages.flatMap((p) => (Array.isArray(p?.items) ? p.items : []))
  }, [heroData])
  const totalItems = items.length

  // Fetch detail for active item. Skip ids that already failed so a disabled
  // query (still fetched, still empty) cannot keep advancing the carousel.
  const activeItem = items[activeIndex]
  const detailEnabled = !!activeItem && !failedDetailIds.has(activeItem.id)
  const { data: detailData, isError: detailFailed, isSuccess: detailReady } = useQuery({
    ...mediaQueries.detail(activeItem?.mediaType ?? '', activeItem?.id ?? ''),
    enabled: detailEnabled,
  })

  // Prefetch next slide
  useEffect(() => {
    if (totalItems === 0) return
    const nextIdx = (activeIndex + 1) % totalItems
    const nextItem = items[nextIdx]
    if (nextItem && !failedDetailIds.has(nextItem.id)) {
      queryClient.prefetchQuery(mediaQueries.detail(nextItem.mediaType, nextItem.id))
    }
  }, [activeIndex, items, totalItems, queryClient, failedDetailIds])

  // Auto-skip items whose detail fetch failed. Stop once every slide has failed
  // so the carousel does not cycle forever on a dead catalog.
  useEffect(() => {
    if (!detailEnabled || !activeItem || totalItems === 0) return
    const missing = detailFailed || (detailReady && !detailData)
    if (!missing || failedDetailIds.has(activeItem.id)) return

    setFailedDetailIds((prev) => {
      if (prev.has(activeItem.id)) return prev
      const next = new Set(prev)
      next.add(activeItem.id)
      return next
    })

    if (failedDetailIds.size + 1 >= totalItems) return
    const nextIdx = (activeIndex + 1) % totalItems
    if (nextIdx === activeIndex) return
    setPrevActiveIndex(activeIndex)
    setActiveIndex(nextIdx)
  }, [detailEnabled, detailFailed, detailReady, detailData, activeItem, activeIndex, totalItems, failedDetailIds])

  // Autoplay
  useEffect(() => {
    if (isPaused || totalItems <= 1) return
    intervalRef.current = setInterval(() => {
      tick()
    }, AUTOPLAY_INTERVAL)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isPaused, totalItems, activeIndex])

  const cardOffset = useMemo(() => {
    if (windowWidth >= 1024) return 240
    if (windowWidth >= 640) return 190
    return 135
  }, [windowWidth])

  const visibleSlides = useMemo(() => {
    if (totalItems === 0) return []
    const result = []
    for (let i = -2; i <= 2; i++) {
      const idx = (activeIndex + i + totalItems) % totalItems
      result.push({ item: items[idx], index: idx, offset: i })
    }
    return result
  }, [activeIndex, items, totalItems])

  // Window resize
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const navigateTo = useCallback((index: number) => {
    if (isTransitioning) return
    setIsTransitioning(true)
    setPrevActiveIndex(activeIndex)
    setActiveIndex(index)
    setTimeout(() => setIsTransitioning(false), TRANSITION_TIMEOUT)
  }, [activeIndex, isTransitioning])

  const tick = useCallback(() => {
    if (totalItems === 0 || isTransitioning) return
    const next = (activeIndex + 1) % totalItems
    setPrevActiveIndex(activeIndex)
    setActiveIndex(next)
    setIsTransitioning(true)
    setTimeout(() => setIsTransitioning(false), TRANSITION_TIMEOUT)
    if (next >= totalItems - 3 && hasNextPage) fetchNextPage()
  }, [activeIndex, totalItems, isTransitioning, hasNextPage, fetchNextPage])

  const tickBack = useCallback(() => {
    if (totalItems === 0 || isTransitioning) return
    const prev = (activeIndex - 1 + totalItems) % totalItems
    setPrevActiveIndex(activeIndex)
    setActiveIndex(prev)
    setIsTransitioning(true)
    setTimeout(() => setIsTransitioning(false), TRANSITION_TIMEOUT)
  }, [activeIndex, totalItems, isTransitioning])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX
    touchStartYRef.current = e.touches[0].clientY
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartXRef.current
    const dy = e.changedTouches[0].clientY - touchStartYRef.current
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
      if (dx > 0) tickBack()
      else tick()
    }
  }, [tick, tickBack])

  const handleCardClick = useCallback((itemIndex: number) => {
    const item = items[itemIndex]
    if (!item) return
    if (itemIndex === activeIndex) {
      return `/media/${item.mediaType}/${item.id}`
    }
    navigateTo(itemIndex)
    return null
  }, [items, activeIndex, navigateTo])

  return {
    items, totalItems, activeIndex, prevActiveIndex, activeItem,
    detailData, cardOffset, visibleSlides, isPaused, isTransitioning,
    setIsPaused, tick, tickBack, navigateTo,
    handleTouchStart, handleTouchEnd, handleCardClick,
    isLoading, isError, refetch,
  }
}
