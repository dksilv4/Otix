import { type ReactNode, type Ref, Children, forwardRef, useRef, useState, useLayoutEffect, useCallback } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Skeleton } from '@ui/atoms/skeleton'
import { cn } from '@/lib/utils'
import {
  calculateCarouselItemWidth,
  calculateCarouselPageWidth,
  calculateCarouselSnapTarget,
  getTrackHorizontalPadding,
} from '@/lib/utils/carousel'

interface CarouselProps {
  children: ReactNode
  className?: string
  minItemWidth?: number
  gap?: number
  showArrows?: boolean
  header?: ReactNode
  title?: string
  subtitle?: ReactNode
  viewAllLink?: string
  viewAllSearch?: Record<string, unknown>
  isLoading?: boolean
  skeleton?: ReactNode
  trackPaddingInline?: string
  snap?: boolean
}

export const Carousel = forwardRef((
  {
    children,
    className,
    minItemWidth = 250,
    gap = 20,
    showArrows = true,
    header,
    title,
    subtitle,
    viewAllLink,
    viewAllSearch,
    isLoading,
    skeleton,
    trackPaddingInline,
    snap = true,
  }: CarouselProps,
  ref: Ref<HTMLDivElement>,
) => {
  const trackRef = useRef<HTMLDivElement>(null)
  const [itemWidth, setItemWidth] = useState(minItemWidth)
  const [isDragging, setIsDragging] = useState(false)
  const dragState = useRef({
    startX: 0,
    startScrollLeft: 0,
    lastX: 0,
    lastTime: 0,
    velocity: 0,
    active: false,
    moved: false,
  })
  const showSkeleton = isLoading && Children.count(children) === 0

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return

    const measure = () => {
      const padding = getTrackHorizontalPadding(track)
      const available = Math.max(0, track.clientWidth - padding)
      setItemWidth(calculateCarouselItemWidth(available, minItemWidth, gap))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    return () => observer.disconnect()
  }, [minItemWidth, gap])

  const scrollByPage = useCallback((direction: -1 | 1) => {
    const track = trackRef.current
    if (!track) return
    const padding = getTrackHorizontalPadding(track)
    const available = Math.max(0, track.clientWidth - padding)
    const pageWidth = calculateCarouselPageWidth(available, itemWidth, gap)
    track.scrollBy({ left: direction * pageWidth, behavior: 'smooth' })
  }, [itemWidth, gap])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    dragState.current = {
      startX: e.clientX,
      startScrollLeft: trackRef.current?.scrollLeft ?? 0,
      lastX: e.clientX,
      lastTime: Date.now(),
      velocity: 0,
      active: true,
      moved: false,
    }
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.active || e.pointerType === 'touch') return
    const track = trackRef.current
    if (!track) return

    const dx = e.clientX - dragState.current.startX
    if (!dragState.current.moved && Math.abs(dx) > 5) {
      dragState.current.moved = true
      setIsDragging(true)
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } catch {
        // ignore in test / virtual environments
      }
    }

    if (dragState.current.moved) {
      const now = Date.now()
      const dt = now - dragState.current.lastTime
      if (dt > 0) {
        dragState.current.velocity = (e.clientX - dragState.current.lastX) / dt
      }
      dragState.current.lastX = e.clientX
      dragState.current.lastTime = now
      track.scrollLeft = dragState.current.startScrollLeft - dx
    }
  }, [])

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'touch') return
      const track = trackRef.current
      try {
        if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
        }
      } catch {
        // ignore
      }

      if (dragState.current.moved && track) {
        if (snap) {
          const dx = e.clientX - dragState.current.startX
          const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth)
          const targetScrollLeft = calculateCarouselSnapTarget({
            currentScrollLeft: track.scrollLeft,
            dragDistance: dx,
            velocity: dragState.current.velocity,
            itemWidth,
            gap,
            maxScroll,
          })
          track.scrollTo({ left: targetScrollLeft, behavior: 'smooth' })
        }
      }

      setIsDragging(false)
      dragState.current.active = false
      setTimeout(() => {
        dragState.current.moved = false
      }, 50)
    },
    [gap, itemWidth, snap],
  )

  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (dragState.current.moved) {
      e.preventDefault()
      e.stopPropagation()
    }
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const track = trackRef.current
      if (!track) return
      const stride = itemWidth + gap
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        track.scrollBy({ left: stride, behavior: 'smooth' })
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        track.scrollBy({ left: -stride, behavior: 'smooth' })
      }
    },
    [itemWidth, gap],
  )

  return (
    <div ref={ref} className={cn('relative', className)}>
      {(title || header) && (
        <div className="relative z-[2] pb-3 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {title ? (
              <>
                <h2 className="text-xl font-bold text-foreground">{title}</h2>
                {subtitle && (
                  <span className="text-sm text-muted-foreground/60 mt-1">
                    {subtitle}
                  </span>
                )}
              </>
            ) : (
              header
            )}
          </div>
          {viewAllLink && (
            <Link
              to={viewAllLink as never}
              search={viewAllSearch as never}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-active)] transition-colors"
              style={{ background: 'var(--dk-surface-ghost-hover)' }}
            >
              View All
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          )}
        </div>
      )}
      <div className="relative group/carousel">
        {showArrows && (
          <button
            type="button"
            onClick={() => scrollByPage(-1)}
            className="absolute left-6 top-1/2 -translate-y-1/2 z-[3] opacity-0 group-hover/carousel:opacity-100 transition-opacity duration-200 cursor-pointer"
            aria-label="Previous items"
          >
            <div className="bg-[var(--dk-surface-overlay)] text-foreground backdrop-blur-xl rounded-full p-2 shadow-xl border border-[var(--dk-separator)] hover:bg-[var(--dk-surface-raised)] transition-colors">
              <ChevronLeftIcon className="h-5 w-5" />
            </div>
          </button>
        )}
        <div
          ref={trackRef}
          data-carousel-track="true"
          className={cn(
            'flex overflow-x-auto overflow-y-hidden scrollbar-none pb-2 select-none focus:outline-hidden',
            snap && 'snap-x snap-mandatory',
            !isDragging && 'scroll-smooth cursor-grab',
            isDragging && 'cursor-grabbing',
          )}
          style={{
            gap: `${gap}px`,
            paddingInline: trackPaddingInline ?? 'clamp(1rem, 2vw, 2rem)',
            scrollPaddingInline: trackPaddingInline ?? 'clamp(1rem, 2vw, 2rem)',
            scrollSnapType: snap ? (isDragging ? 'none' : 'x mandatory') : undefined,
            touchAction: 'pan-x pan-y pinch-zoom',
          }}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onClickCapture={handleClickCapture}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {showSkeleton
            ? Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={cn('shrink-0', snap && 'snap-start snap-always')}
                  style={{ width: `${itemWidth}px` }}
                >
                  {skeleton ?? <Skeleton className="w-full aspect-[2/3] rounded-xl" />}
                </div>
              ))
            : Children.toArray(children).map((child, i) => (
                <div
                  key={i}
                  className={cn('shrink-0', snap && 'snap-start snap-always')}
                  style={{ width: `${itemWidth}px` }}
                >
                  {child}
                </div>
              ))}
        </div>
        {showArrows && (
          <button
            type="button"
            onClick={() => scrollByPage(1)}
            className="absolute right-6 top-1/2 -translate-y-1/2 z-[3] opacity-0 group-hover/carousel:opacity-100 transition-opacity duration-200 cursor-pointer"
            aria-label="Next items"
          >
            <div className="bg-[var(--dk-surface-overlay)] text-foreground backdrop-blur-xl rounded-full p-2 shadow-xl border border-[var(--dk-separator)] hover:bg-[var(--dk-surface-raised)] transition-colors">
              <ChevronRightIcon className="h-5 w-5" />
            </div>
          </button>
        )}
      </div>
    </div>
  )
})
