import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { discoverQueries } from '../queries/discover-queries'
import { mediaQueries } from '@/old-features/media/media-queries'

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
  const failedDetailIdsRef = useRef<Set<string>>(new Set())

  const { data: heroData, fetchNextPage, hasNextPage } = useInfiniteQuery(discoverQueries.hero())
  const items = useMemo(() => heroData?.pages.flatMap((p) => p.items) ?? [], [heroData])
  const totalItems = items.length

  // Fetch detail for active item
  const activeItem = items[activeIndex]
  const { data: detailData } = useQuery({
    ...mediaQueries.detail(activeItem?.mediaType ?? '', activeItem?.id ?? ''),
    enabled: !!activeItem && !failedDetailIdsRef.current.has(activeItem.id),
  })

  // Prefetch next slide
  useEffect(() => {
    if (totalItems === 0) return
    const nextIdx = (activeIndex + 1) % totalItems
    const nextItem = items[nextIdx]
    if (nextItem) {
      queryClient.prefetchQuery(mediaQueries.detail(nextItem.mediaType, nextItem.id))
    }
  }, [activeIndex, items, totalItems, queryClient])

  // Auto-skip items whose detail fetch failed
  useEffect(() => {
    if (detailData === undefined && activeItem && !failedDetailIdsRef.current.has(activeItem.id)) return
    if (detailData === undefined && activeItem) {
      failedDetailIdsRef.current.add(activeItem.id)
      const nextIdx = (activeIndex + 1) % totalItems
      navigateTo(nextIdx)
    }
  }, [detailData, activeItem, activeIndex, totalItems])

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
  }
}
