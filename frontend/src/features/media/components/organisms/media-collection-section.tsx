import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Layers, Sparkles } from 'lucide-react'
import { MediaCard } from '@ui/molecules/media-card'
import { useQuery } from '@tanstack/react-query'
import { mediaQueries, formatYear, useMediaParams } from '@media'
import { Image } from '@ui/atoms/image'
import { cn } from '@/lib/utils'

export function CollectionSection({ className }: { className?: string } = {}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const { mediaType, mediaId } = useMediaParams()
  const { data } = useQuery(mediaQueries.detail(mediaType, mediaId))

  const collection = data?.collection
  const currentMediaId = data?.id ? String(data.id) : null
  const movies = useMemo(() => collection?.movies ?? [], [collection?.movies])

  // Release year range calculation (e.g., "2017 – 2026")
  const years = useMemo(() => {
    if (!movies.length) return null
    const list = movies
      .map((m) => formatYear(m.releaseDate))
      .filter((y): y is string => Boolean(y))
      .sort()
    if (list.length === 0) return null
    if (list.length === 1 || list[0] === list[list.length - 1]) return list[0]
    return `${list[0]} – ${list[list.length - 1]}`
  }, [movies])

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 6)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    checkScroll()
    el.addEventListener('scroll', checkScroll, { passive: true })
    window.addEventListener('resize', checkScroll)
    return () => {
      el.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
    }
  }, [checkScroll, movies.length])

  // Scroll to active movie on mount if needed
  useEffect(() => {
    if (!scrollRef.current || !currentMediaId) return
    const activeEl = scrollRef.current.querySelector<HTMLElement>('[data-active="true"]')
    if (activeEl) {
      const parent = scrollRef.current
      const left = activeEl.offsetLeft - parent.offsetLeft - 24
      if (typeof parent.scrollTo === 'function') {
        parent.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
      } else {
        parent.scrollLeft = Math.max(0, left)
      }
    }
  }, [currentMediaId])

  const scrollBy = (offset: number) => {
    if (!scrollRef.current) return
    if (typeof scrollRef.current.scrollBy === 'function') {
      scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' })
    } else {
      scrollRef.current.scrollLeft += offset
    }
  }

  if (!collection || movies.length === 0) return null

  return (
    <section className={cn('glass-card relative overflow-hidden py-6 sm:py-7 space-y-4', className)}>
      {/* ── Cinematic Franchise Backdrop Banner ── */}
      {collection.backdropUrl && (
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.08] dark:opacity-[0.14] bg-cover bg-center transition-opacity duration-700"
          style={{
            backgroundImage: `url(${collection.backdropUrl})`,
            maskImage: 'linear-gradient(to bottom, black 30%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 30%, transparent 100%)',
          }}
        />
      )}

      {/* ── Header ── */}
      <div className="relative z-10 px-6 sm:px-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          {collection.posterUrl ? (
            <div className="shrink-0 w-11 h-15 sm:w-13 sm:h-18 rounded-lg overflow-hidden shadow-lg shadow-black/40">
              <Image
                src={collection.posterUrl}
                alt={collection.name}
                className="h-full w-full object-cover"
                fallback={collection.name[0]}
              />
            </div>
          ) : (
            <div className="shrink-0 w-11 h-15 sm:w-13 sm:h-18 rounded-lg bg-white/5 flex items-center justify-center text-white/50">
              <Layers className="h-5 w-5" />
            </div>
          )}

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10">
                <Sparkles className="h-2.5 w-2.5" />
                Franchise
              </span>
              {years && (
                <span className="text-xs font-medium text-muted-foreground/80 tabular-nums">
                  {years}
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white/95">
              {collection.name}
            </h2>

            <p className="text-xs font-medium text-muted-foreground/70">
              {movies.length} {movies.length === 1 ? 'film' : 'films'} in this collection
            </p>
          </div>
        </div>

        {/* Carousel Navigation Buttons */}
        {movies.length > 2 && (
          <div className="hidden sm:flex items-center gap-1.5 self-end sm:self-center">
            <button
              type="button"
              onClick={() => scrollBy(-360)}
              disabled={!canScrollLeft}
              className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white/70 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-all shadow-sm active:scale-95"
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(360)}
              disabled={!canScrollRight}
              className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white/70 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-all shadow-sm active:scale-95"
              aria-label="Scroll right"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── Overview Description ── */}
      {collection.overview && (
        <div className="relative z-10 px-6 sm:px-7">
          <p
            className={cn(
              'text-sm leading-relaxed text-muted-foreground/80 transition-all duration-200',
              !isExpanded && 'line-clamp-2'
            )}
          >
            {collection.overview}
          </p>
          {collection.overview.length > 140 && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              {isExpanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      )}

      {/* ── Carousel Slider ── */}
      <div className="relative">
        {/* Edge Gradient Shadows */}
        {canScrollLeft && (
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 sm:w-12 bg-linear-to-r from-card/90 to-transparent z-20 transition-opacity duration-300" />
        )}
        {canScrollRight && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 sm:w-12 bg-linear-to-l from-card/90 to-transparent z-20 transition-opacity duration-300" />
        )}

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto px-6 sm:px-7 py-2 scroll-smooth scrollbar-none snap-x snap-mandatory"
          style={{ scrollPaddingInline: '1.5rem' }}
        >
          {movies.map((movie, index) => {
            const isCurrent = String(movie.id) === currentMediaId

            return (
              <div
                key={movie.id}
                data-active={isCurrent ? 'true' : 'false'}
                className="shrink-0 w-36 sm:w-44 lg:w-48 snap-start"
              >
                <MediaCard
                  id={String(movie.id)}
                  mediaType="movie"
                  title={movie.title}
                  posterUrl={movie.posterUrl}
                  releaseDate={movie.releaseDate}
                  showTypeBadge={false}
                  zoomed={true}
                  isAdult={movie.isAdult}
                  priority={index < 4}
                  className={cn(
                    isCurrent
                      ? 'ring-2 ring-primary shadow-xl shadow-primary/25'
                      : 'ring-1 ring-white/10 hover:ring-white/20'
                  )}
                />
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
