import { type ReactNode, type Ref, Children, forwardRef, useRef, useState, useLayoutEffect, useCallback } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Skeleton } from '@ui/atoms/skeleton'
import { cn } from '@/lib/utils'

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
  viewAllSearch?: Record<string, any>
  isLoading?: boolean
  skeleton?: ReactNode
}

export const Carousel = forwardRef(function Carousel(
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
  }: CarouselProps,
  ref: Ref<HTMLDivElement>,
) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [itemWidth, setItemWidth] = useState(minItemWidth)
  const [isDragging, setIsDragging] = useState(false)
  const dragState = useRef({ x: 0, scrollLeft: 0, active: false, moved: false })
  const showSkeleton = isLoading && Children.count(children) === 0

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return

    const measure = () => {
      const available = track.clientWidth - 2 * gap
      const n = Math.max(1, Math.floor((available + gap) / (minItemWidth + gap)))
      setItemWidth(Math.max(minItemWidth, (available - (n - 1) * gap) / n))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    return () => observer.disconnect()
  }, [minItemWidth, gap])

  const scrollByPage = useCallback((direction: -1 | 1) => {
    const track = trackRef.current
    if (!track) return
    const w = track.clientWidth - 2 * gap
    const n = Math.max(1, Math.floor((w + gap) / (itemWidth + gap)))
    const pageWidth = n * (itemWidth + gap)
    track.scrollBy({ left: direction * pageWidth, behavior: 'smooth' })
  }, [itemWidth, gap])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    dragState.current = { x: e.clientX, scrollLeft: trackRef.current?.scrollLeft ?? 0, active: true, moved: false }
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.active || e.pointerType === 'touch') return
    const track = trackRef.current
    if (!track) return

    const dx = e.clientX - dragState.current.x
    if (!dragState.current.moved && Math.abs(dx) > 5) {
      dragState.current.moved = true
      setIsDragging(true)
    }

    if (dragState.current.moved) {
      track.scrollLeft = dragState.current.scrollLeft - dx
    }
  }, [])

  const handlePointerUp = useCallback(() => {
    setIsDragging(false)
    dragState.current.active = false
    dragState.current.moved = false
  }, [])

  return (
    <div ref={ref} className={cn('relative', className)}>
      {(title || header) && (
        <div className="relative z-[2] pb-3 px-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {title ? (
              <>
                <h2 className="text-xl font-bold text-white/90">{title}</h2>
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
              to={viewAllLink as any}
              search={viewAllSearch}
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
            <div className="bg-background/15 backdrop-blur-xl rounded-full p-2 shadow-xl ring-1 ring-white/20 hover:bg-background/30 transition-all">
              <ChevronLeftIcon className="h-5 w-5" />
            </div>
          </button>
        )}
        <div
          ref={trackRef}
          className={cn(
            'flex overflow-x-auto scrollbar-none pb-2 select-none',
            isDragging && 'cursor-grabbing',
            !isDragging && 'cursor-grab',
          )}
          style={{
            gap: `${gap}px`,
            paddingInline: '16px',
            scrollPaddingInline: '16px',
            scrollSnapType: 'x mandatory',
            touchAction: 'pan-y pinch-zoom',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {showSkeleton
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="snap-start shrink-0" style={{ width: `${itemWidth}px` }}>
                  {skeleton ?? <Skeleton className="w-full aspect-[2/3] rounded-xl" />}
                </div>
              ))
            : Children.toArray(children).map((child, i) => (
                <div key={i} className="snap-start shrink-0" style={{ width: `${itemWidth}px` }}>
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
            <div className="bg-background/15 backdrop-blur-xl rounded-full p-2 shadow-xl ring-1 ring-white/20 hover:bg-background/30 transition-all">
              <ChevronRightIcon className="h-5 w-5" />
            </div>
          </button>
        )}
      </div>
    </div>
  )
})
