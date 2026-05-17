import { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid'
import { DiscoverMediaCard } from './discover-media-card'
import { Skeleton } from '@ui/atoms/skeleton'
import { cn } from '@/lib/utils'
import type { MediaItemSummary } from '@media/media-queries'

interface MediaCarouselProps {
  items: MediaItemSummary[]
  isLoading: boolean
  className?: string
}

const BASE_ITEM_WIDTH = 240
const BASE_GAP = 20
const BUTTON_INSET = 40 // button overlap on each side

export function MediaCarousel({ items, isLoading, className }: MediaCarouselProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLeft, setShowLeft] = useState(false)
  const [showRight, setShowRight] = useState(false)
  const [visibleCount, setVisibleCount] = useState(4)

  // ── Smart auto-sizing (layout effect to avoid flash of small cards) ──
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateMeasurements = () => {
      const el = scrollRef.current
      if (!el) return

      const style = getComputedStyle(container)
      const gap =
        parseFloat(style.getPropertyValue('--carousel-gap')) || BASE_GAP
      const containerWidth = container.getBoundingClientRect().width
      const availableWidth = Math.max(0, containerWidth - BUTTON_INSET * 2)

      let count = Math.floor((availableWidth + gap) / (BASE_ITEM_WIDTH + gap))
      count = Math.max(2, count)

      // Size cards to perfectly fill visible area — no partials
      el.style.setProperty(
        '--card-width',
        `calc((100% - ${BUTTON_INSET * 2}px - ${(count - 1) * gap}px) / ${count})`,
      )
      setVisibleCount(count)
    }

    const observer = new ResizeObserver(updateMeasurements)
    observer.observe(container)
    updateMeasurements()
    return () => observer.disconnect()
  }, [])

  // ── Arrow state ──
  const updateArrows = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setShowLeft(el.scrollLeft > 8)
    setShowRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateArrows()
    el.addEventListener('scroll', updateArrows, { passive: true })
    const ro = new ResizeObserver(updateArrows)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', updateArrows)
      ro.disconnect()
    }
  }, [items, updateArrows])

  // ── Scroll by visible cards ──
  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    const firstChild = el.querySelector(':scope > *') as HTMLElement | null
    if (!firstChild) return
    const cardWidth = firstChild.getBoundingClientRect().width
    const gap = parseFloat(getComputedStyle(el).gap || '0')
    const step = (cardWidth + gap) * Math.max(1, visibleCount - 1)
    el.scrollBy({ left: dir === 'left' ? -step : step, behavior: 'smooth' })
  }

  if (isLoading) {
    return (
      <div ref={containerRef} className={cn('relative', className)}>
        <div className="flex overflow-hidden" style={{ gap: 'var(--carousel-gap, 1.25rem)' }}>
          {Array.from({ length: visibleCount }).map((_, i) => (
            <div
              key={i}
              className="shrink-0 space-y-2"
              style={{ width: 'var(--card-width, 240px)' }}
            >
              <Skeleton className="aspect-[2/3] w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (items.length === 0) return null

  const arrowButton = cn(
    'absolute top-1/2 -translate-y-1/2 z-10',
    'flex items-center justify-center w-10 h-10 rounded-full',
    'bg-[var(--dk-surface-glass)] backdrop-blur-md',
    'shadow-[var(--dk-shadow-glass)]',
    'text-foreground/70 hover:text-foreground',
    'transition-opacity duration-[var(--dk-duration-fast)]',
  )

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        onClick={() => scroll('left')}
        className={cn(
          arrowButton,
          'left-0 -translate-x-2',
          showLeft ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        aria-label="Scroll left"
      >
        <ChevronLeftIcon className="h-5 w-5" />
      </button>

      <div
        ref={scrollRef}
        className="flex overflow-x-auto scroll-smooth scrollbar-none"
        style={{
          gap: 'var(--carousel-gap, 1.25rem)',
          scrollSnapType: 'x mandatory',
          scrollPaddingInline: `${BUTTON_INSET}px`,
        }}
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="shrink-0"
            style={{
              width: 'var(--card-width, 240px)',
              aspectRatio: item.mediaType === 'music' ? '1 / 1' : '2 / 3',
              scrollSnapAlign: 'start',
            }}
          >
            <DiscoverMediaCard item={item} />
          </div>
        ))}
      </div>

      <button
        onClick={() => scroll('right')}
        className={cn(
          arrowButton,
          'right-0 translate-x-2',
          showRight ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        aria-label="Scroll right"
      >
        <ChevronRightIcon className="h-5 w-5" />
      </button>
    </div>
  )
}
