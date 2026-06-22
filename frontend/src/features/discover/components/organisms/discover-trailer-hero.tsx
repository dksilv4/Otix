import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { Badge } from '@ui/atoms/badge'
import { Skeleton } from '@ui/atoms/skeleton'
import { discoverQueries } from '@discover/queries/discover-queries'
import { MEDIA_TYPE_LABEL, MEDIA_TYPE_COLOR } from '@/constants/media'
import type { TrendingTrailerItem } from '@discover/types'

const AUTO_ROTATE_MS = 8000

export function DiscoverTrailerHero({ className }: { className?: string }) {
  const { data: items = [], isLoading } = useQuery(discoverQueries.trailers())
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const total = items.length
  const activeItem: TrendingTrailerItem | null = items[activeIndex] ?? null

  // Auto-rotate
  useEffect(() => {
    if (isPaused || total <= 1) return
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % total)
    }, AUTO_ROTATE_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isPaused, total])

  const goTo = useCallback((index: number) => {
    setActiveIndex(index)
  }, [])

  const goNext = useCallback(() => {
    if (total === 0) return
    setActiveIndex((prev) => (prev + 1) % total)
  }, [total])

  const goPrev = useCallback(() => {
    if (total === 0) return
    setActiveIndex((prev) => (prev - 1 + total) % total)
  }, [total])

  // Empty state
  if (!isLoading && total === 0) return null

  return (
    <section
      className={`relative w-full overflow-hidden rounded-2xl ${className || ''}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Loading skeleton */}
      {isLoading && (
        <div className="relative w-full aspect-[21/9] bg-zinc-900 rounded-2xl flex items-end p-8">
          <div className="space-y-3 w-full max-w-lg">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-4 w-96" />
            <div className="flex gap-2 mt-2">
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        </div>
      )}

      {/* Active trailer */}
      {activeItem && (
        <div className="relative w-full aspect-[21/9] bg-zinc-900 rounded-2xl overflow-hidden">
          {/* YouTube background player */}
          <iframe
            ref={iframeRef}
            src={`https://www.youtube.com/embed/${activeItem.trailerYoutubeId}?autoplay=1&mute=1&loop=1&playlist=${activeItem.trailerYoutubeId}&controls=0&showinfo=0&modestbranding=1&iv_load_policy=3&disablekb=1&playsinline=1`}
            title={activeItem.title}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ filter: 'brightness(0.6)' }}
            allow="autoplay; encrypted-media"
          />

          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />

          {/* Content overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 z-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeItem.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.4 }}
                className="max-w-2xl"
              >
                {/* Badge row */}
                <div className="flex items-center gap-2 mb-2">
                  <Badge
                    size="sm"
                    className={`text-white border-none ${MEDIA_TYPE_COLOR[activeItem.mediaType as keyof typeof MEDIA_TYPE_COLOR] || ''}`}
                  >
                    {MEDIA_TYPE_LABEL[activeItem.mediaType as keyof typeof MEDIA_TYPE_LABEL] ?? 'Media'}
                  </Badge>
                  {activeItem.releaseDate && (
                    <span className="text-xs font-semibold text-white/70">
                      {activeItem.releaseDate.slice(0, 4)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400">
                    <Play className="h-3 w-3 fill-current" />
                    Trailer
                  </span>
                </div>

                {/* Title */}
                <h2 className="text-2xl md:text-4xl font-bold text-white mb-2 line-clamp-1">
                  {activeItem.title}
                </h2>

                {/* Overview */}
                {activeItem.overview && (
                  <p className="text-sm md:text-base text-white/80 line-clamp-2 mb-4 max-w-xl">
                    {activeItem.overview}
                  </p>
                )}

                {/* CTA */}
                <Link
                  to="/media/$mediaType/$mediaId"
                  params={{ mediaType: activeItem.mediaType, mediaId: activeItem.id }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white font-semibold text-sm backdrop-blur-sm transition-all"
                >
                  <Play className="h-4 w-4 fill-current" />
                  View Details
                </Link>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation arrows */}
          {total > 1 && (
            <>
              <button
                type="button"
                onClick={goPrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 text-white transition-all"
                aria-label="Previous trailer"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 text-white transition-all"
                aria-label="Next trailer"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          {/* Dot indicators */}
          {total > 1 && (
            <div className="absolute bottom-4 right-6 z-20 flex items-center gap-1.5">
              {items.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goTo(idx)}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === activeIndex
                      ? 'w-6 bg-white'
                      : 'w-1.5 bg-white/40 hover:bg-white/60'
                  }`}
                  aria-label={`Go to trailer ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
