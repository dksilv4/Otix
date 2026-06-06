// TODO: Review this file
import { memo, useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react'
import './media-carousel.scss'
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

export const MediaCarousel = memo(function MediaCarousel({ items, isLoading, className }: MediaCarouselProps) {
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

      const elStyle = getComputedStyle(el)
      const gap =
        parseFloat(elStyle.getPropertyValue('--carousel-gap')) || BASE_GAP
      const scrollWidth = el.getBoundingClientRect().width
      const padLeft = parseFloat(elStyle.paddingLeft) || 0
      const padRight = parseFloat(elStyle.paddingRight) || 0
      const contentWidth = Math.max(0, scrollWidth - padLeft - padRight)

      let count = Math.floor((contentWidth + gap) / (BASE_ITEM_WIDTH + gap))
      count = Math.max(2, count)

      // Size cards to perfectly fill visible content area — no partials
      el.style.setProperty(
        '--card-width',
        `calc((100% - ${(count - 1) * gap}px) / ${count})`,
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
  const scroll = useCallback((dir: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    const firstChild = el.querySelector(':scope > *') as HTMLElement | null
    if (!firstChild) return
    const cardWidth = firstChild.getBoundingClientRect().width
    const gap = parseFloat(getComputedStyle(el).gap || '0')
    const step = (cardWidth + gap) * Math.max(1, visibleCount - 1)
    el.scrollBy({ left: dir === 'left' ? -step : step, behavior: 'smooth' })
  }, [visibleCount])

  if (isLoading) {
    return (
      <div ref={containerRef} className={cn('dk-discover-media-carousel', className)}>
        <div className="dk-discover-media-carousel__scroll"
          style={{
            gap: 'var(--carousel-gap, 1.25rem)',
            scrollSnapType: 'x mandatory',
            scrollPaddingInline: `var(--carousel-gap, 1.25rem)`,
          }}
        >
          {Array.from({ length: visibleCount }).map((_, i) => (
            <div
              key={i}
              className="dk-discover-media-carousel__item"
              style={{
                width: 'var(--card-width, 240px)',
                aspectRatio: '2 / 3',
                scrollSnapAlign: 'start',
              }}
            >
              <Skeleton className="h-full w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (items.length === 0) return null

  const arrowBase = 'dk-discover-media-carousel__arrow'

  return (
    <div ref={containerRef} className={cn('dk-discover-media-carousel', className)}>
      <button
        onClick={() => scroll('left')}
        className={cn(
          arrowBase,
          'dk-discover-media-carousel__arrow--left',
          !showLeft && 'dk-discover-media-carousel__arrow--hidden',
        )}
        aria-label="Scroll left"
      >
        <ChevronLeftIcon className="h-5 w-5" />
      </button>

      <div ref={scrollRef} className="dk-discover-media-carousel__scroll"
        style={{
          gap: 'var(--carousel-gap, 1.25rem)',
          scrollSnapType: 'x mandatory',
          scrollPaddingInline: `var(--carousel-gap, 1.25rem)`,
        }}
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="dk-discover-media-carousel__item"
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
          arrowBase,
          'dk-discover-media-carousel__arrow--right',
          !showRight && 'dk-discover-media-carousel__arrow--hidden',
        )}
        aria-label="Scroll right"
      >
        <ChevronRightIcon className="h-5 w-5" />
      </button>
    </div>
  )
})
