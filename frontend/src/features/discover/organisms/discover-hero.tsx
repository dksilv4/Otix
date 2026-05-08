import { useState, useEffect, useRef, useCallback } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { discoverQueries } from '@discover/discover-queries'
import { mediaQueries } from '@media/media-queries'
import { Badge } from '@ui/atoms/badge'
import { Skeleton } from '@ui/atoms/skeleton'
import { cn } from '@/lib/utils'

const AUTOPLAY_INTERVAL = 8000
const ZOOM_DURATION = 14

// Upscale TMDB images from w500 to w1280 for hero-sized rendering.
// Fanart and IGDB (t_1080p) URLs are already high quality — pass through.
function heroImage(url: string): string {
  return url.replace(/\/w500\//, '/w1280/')
}

export function DiscoverHero({ className }: { className?: string }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const heroQuery = useInfiniteQuery({
    ...discoverQueries.hero(),
  })

  const items = heroQuery.data?.pages.flatMap((page) => page.items) ?? []
  const activeItem = items[activeIndex]
  const activeId = activeItem?.id

  // Pre-fetch details for all hero items so autoplay transitions are instant
  const queryClient = useQueryClient()
  useEffect(() => {
    for (const item of items) {
      queryClient.prefetchQuery(mediaQueries.detail(item.id))
    }
  }, [items, queryClient])

  // Fetch detail only for the active item (not all 6)
  const detailQuery = useQuery({
    ...mediaQueries.detail(activeId ?? ''),
    enabled: !!activeId,
    placeholderData: keepPreviousData,
  })

  const detail = detailQuery.data
  const isLoading = heroQuery.isLoading || (!!activeId && detailQuery.isLoading && !detail)
  const hasError = (heroQuery.isError && !heroQuery.data) || detailQuery.isError

  // ── Autoplay ──
  const tick = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % Math.max(1, items.length))
  }, [items.length])

  useEffect(() => {
    if (items.length <= 1 || isPaused) return
    intervalRef.current = setInterval(tick, AUTOPLAY_INTERVAL)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [items.length, isPaused, tick])

  // ── Background image (backdrop > textless poster) ──
  const bgImageRaw = detail?.backdropUrl || detail?.textlessPosterUrl || null
  const bgImage = bgImageRaw ? heroImage(bgImageRaw) : null

  if (hasError) return null
  if (!isLoading && items.length === 0) return null

  return (
    <div
      className="relative w-full min-h-[55vh]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* ── Inner container ── */}
      <div className={cn('relative w-full min-h-[55vh] rounded-[2rem] overflow-hidden', className)}>
        {/* ── Loading skeleton ── */}
        {isLoading && (
          <div className="absolute inset-0 flex flex-col justify-end p-10 z-20">
          <Skeleton className="h-10 w-2/3 mb-4" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4 mb-6" />
          <div className="flex gap-2 mb-6">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-10 w-40 rounded-full" />
        </div>
      )}

      {/* ── Active slide ── */}
      {detail && (
        <AnimatePresence>
          <motion.div
            key={activeId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
            className="absolute inset-0"
          >
            {/* Backdrop with Ken Burns zoom */}
            {bgImage && (
              <motion.div
                key={`bg-${activeId}`}
                initial={{ scale: 1.02 }}
                animate={{ scale: 1.08 }}
                transition={{ duration: ZOOM_DURATION, ease: 'linear' }}
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${bgImage})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
            )}

            {/* Readability overlay — darkens image so white text pops in both themes */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
            {!bgImage && (
              <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 to-black" />
            )}

            {/* Content */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="relative z-10 flex flex-col items-center justify-end h-full p-10 pb-16"
            >
              {/* Logo or text title */}
              {detail.logoUrl ? (
                <img
                  src={detail.logoUrl}
                  alt={detail.title}
                  className="max-w-[60%] max-h-[30%] object-contain mb-4 drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)]"
                />
              ) : (
                <h1 className="text-4xl font-extrabold tracking-tight text-white mb-3 leading-tight max-w-2xl text-center">
                  {detail.title}
                </h1>
              )}

              {/* Meta row */}
              <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
                {/* Media type badge */}
                <Badge
                  className={cn(
                    'text-white border-none text-[11px]',
                    detail.mediaType === 'movie' && 'bg-rose-600',
                    detail.mediaType === 'show' && 'bg-violet-600',
                    detail.mediaType === 'game' && 'bg-emerald-600',
                  )}
                >
                  {detail.mediaType === 'movie' ? 'Movie' : detail.mediaType === 'show' ? 'TV' : 'Game'}
                </Badge>

                {/* Rating */}
                {detail.externalRatings?.some((r) => r.provider === 'tmdb') && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                    <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    {detail.externalRatings.find((r) => r.provider === 'tmdb')!.score.toFixed(1)}
                  </span>
                )}

                {/* Year */}
                {detail.releaseDate && (
                  <span className="text-[11px] font-medium text-white/60">
                    {detail.releaseDate.slice(0, 4)}
                  </span>
                )}

                {/* Genres */}
                {detail.genres?.slice(0, 3).map((genre) => (
                  <Badge key={genre.id} variant="outline" className="text-[11px] text-white/70 border-white/20">
                    {genre.name}
                  </Badge>
                ))}
              </div>

              {/* Overview */}
              {detail.overview && (
                <p className="text-sm text-white/70 max-w-xl text-center line-clamp-2 mb-6">
                  {detail.overview}
                </p>
              )}

              {/* Action button */}
              <Link
                to="/media/$mediaType/$mediaId"
                params={{
                  mediaType: detail.mediaType as 'movie' | 'show' | 'game',
                  mediaId: detail.id,
                }}
              >
                <button
                  className={cn(
                    'inline-flex items-center px-6 py-2.5 rounded-full text-sm font-semibold',
                    'bg-white/10 backdrop-blur-md',
                    'shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_8px_32px_rgba(0,0,0,0.5)]',
                    'text-white hover:scale-105 hover:bg-white/20',
                    'transition-all duration-200',
                  )}
                >
                  View Details
                </button>
              </Link>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}

      </div>{/* End clipped inner container */}

      {/* ── Slide indicators ── */}
      {items.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
          {items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => setActiveIndex(i)}
              className="relative h-[3px] w-12 rounded-full bg-white/20 overflow-hidden"
              aria-label={`Slide ${i + 1}`}
            >
              {i === activeIndex && (
                <motion.div
                  key={activeId}
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: AUTOPLAY_INTERVAL / 1000, ease: 'linear' }}
                  className="absolute inset-0 bg-white rounded-full"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
