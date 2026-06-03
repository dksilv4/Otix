import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { motion, AnimatePresence, useScroll, useTransform, useMotionValue, useSpring } from 'framer-motion'
import { discoverQueries } from '@discover/discover-queries'
import { mediaQueries } from '@media/media-queries'
import { Badge } from '@ui/atoms/badge'
import { Skeleton } from '@ui/atoms/skeleton'
import { cn } from '@/lib/utils'
import { MEDIA_TYPE_COLOR, MEDIA_TYPE_LABEL } from '@/constants/media'

const AUTOPLAY_INTERVAL = 8000
const ZOOM_DURATION = 14

const SLIDE_FADE = {
  initial: { opacity: 0, scale: 1.02 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
  transition: { duration: 0.8, ease: [0.25, 1, 0.5, 1] },
} as const

const KEN_BURNS = {
  initial: { scale: 1.02 },
  animate: { scale: 1.08 },
  transition: { duration: ZOOM_DURATION, ease: 'linear' as const },
} as const

const CONTENT_FADE = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.5, ease: [0.25, 1, 0.5, 1] },
} as const

// Upscale TMDB images from w500 to w1280 for hero-sized rendering.
// Fanart and IGDB (t_1080p) URLs are already high quality — pass through.
function heroImage(url: string): string {
  return url.replace(/\/w500\//, '/w1280/')
}

function getSlideAnimation(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  const r1 = Math.abs(hash % 100) / 100
  const r2 = Math.abs((hash >> 2) % 100) / 100
  const r3 = Math.abs((hash >> 5) % 100) / 100
  const r4 = Math.abs((hash >> 8) % 100) / 100
  const r5 = Math.abs((hash >> 11) % 100) / 100
  
  const isZoomIn = r1 > 0.5
  const startScale = isZoomIn ? 1.03 + r2 * 0.05 : 1.10 + r2 * 0.06
  const endScale = isZoomIn ? 1.10 + r3 * 0.06 : 1.03 + r3 * 0.05
  
  const startX = -16 + r4 * 32
  const endX = -16 + ((r4 + 0.3 + r1) % 1) * 32
  
  const startY = -10 + r5 * 20
  const endY = -10 + ((r5 + 0.4 + r2) % 1) * 20
  
  return {
    initial: { scale: startScale, x: startX, y: startY },
    animate: { scale: endScale, x: endX, y: endY },
  }
}

export function DiscoverHero({ className }: { className?: string }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  
  const { scrollY } = useScroll()
  const yScroll = useTransform(scrollY, [0, 500], [0, 75])

  const failedDetailIdsRef = useRef(new Set<string>())

  const heroQuery = useInfiniteQuery({
    ...discoverQueries.hero(),
  })

  const items = useMemo(
    () => heroQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [heroQuery.data],
  )
  const activeItem = items[activeIndex]
  const activeId = activeItem?.id

  // Pre-fetch detail for current and next hero item so transitions are instant
  const queryClient = useQueryClient()
  useEffect(() => {
    if (items.length === 0) return
    const nextIndex = (activeIndex + 1) % items.length
    const toFetch = [items[activeIndex], items[nextIndex]]
    for (const item of toFetch) {
      if (item) queryClient.prefetchQuery(mediaQueries.detail(item.id))
    }
  }, [items, activeIndex, queryClient])

  // Fetch detail only for the active item (not all 6)
  const detailQuery = useQuery({
    ...mediaQueries.detail(activeId ?? ''),
    enabled: !!activeId,
    placeholderData: keepPreviousData,
  })

  const detail = detailQuery.data
  const detailError = detailQuery.isError
  const isLoading = heroQuery.isLoading || (!!activeId && detailQuery.isLoading && !detail)
  // Only error if the hero list itself failed — not when a single item's detail fails
  const hasError = heroQuery.isError && !heroQuery.data

  // ── Graceful skip: when a hero item's detail can't be loaded, advance ──
  useEffect(() => {
    if (!detailError || !activeId || items.length <= 1) return
    failedDetailIdsRef.current.add(activeId)

    // Find the next item whose detail hasn't failed yet
    const nextIdx = items.findIndex((item, i) =>
      i !== activeIndex && !failedDetailIdsRef.current.has(item.id),
    )
    if (nextIdx !== -1) {
      setActiveIndex(nextIdx)
    }
    // If all items have failed, fall through — the fallback render handles it
  }, [detailError, activeId, activeIndex, items.length])

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

  // ── Background image (backdrop > textless poster > summary poster fallback) ──
  const summaryFallbackPoster = activeItem?.textlessPosterUrl || activeItem?.posterUrl || null
  const bgImageRaw = detail?.backdropUrl || detail?.textlessPosterUrl || summaryFallbackPoster
  const bgImage = bgImageRaw ? heroImage(bgImageRaw) : null

  const handleMouseEnter = useCallback(() => setIsPaused(true), [])
  const handleMouseLeave = useCallback(() => setIsPaused(false), [])

  if (hasError) return null
  if (!isLoading && items.length === 0) return null

  return (
    <div
      className="relative w-full min-h-[55vh]"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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
      {activeItem && (
        <AnimatePresence>
          <motion.div
            key={activeId}
            {...SLIDE_FADE}
            className="absolute inset-0"
          >
            {/* Backdrop with automated slowly panning Ken Burns and scroll parallax */}
            {bgImage && (() => {
              const anim = getSlideAnimation(activeId)
              return (
                <motion.div
                  className="absolute"
                  style={{
                    top: -80,
                    bottom: -80,
                    left: -20,
                    right: -20,
                    y: yScroll,
                  }}
                >
                  <motion.div
                    key={`bg-${activeId}`}
                    initial={{ ...anim.initial, opacity: 0 }}
                    animate={{ ...anim.animate, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      scale: { duration: AUTOPLAY_INTERVAL / 1000, ease: 'linear' },
                      x: { duration: AUTOPLAY_INTERVAL / 1000, ease: 'linear' },
                      y: { duration: AUTOPLAY_INTERVAL / 1000, ease: 'linear' },
                      opacity: { duration: 0.6 },
                    }}
                    className="absolute inset-0"
                    style={{
                      backgroundImage: `url(${bgImage})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  />
                </motion.div>
              )
            })()}

            {/* Readability overlay — darkens image so white text pops in both themes */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
            {/* Extra darken for text readability */}
            <div className="pointer-events-none absolute inset-0 bg-background/25" />
            {!bgImage && (
              <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 to-black" />
            )}

            {/* Content */}
            <motion.div
              {...CONTENT_FADE}
              className="relative z-10 flex flex-col items-center justify-end h-full p-10 pb-16"
            >
              {/* Logo or text title */}
              {detail?.logoUrl ? (
                <img
                  src={detail.logoUrl}
                  alt={detail.title}
                  className="max-w-[60%] max-h-[30%] object-contain mb-4 drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)]"
                />
              ) : (
                <h1 className="text-4xl font-extrabold tracking-tight text-white mb-3 leading-tight max-w-2xl text-center">
                  {detail?.title || activeItem.title}
                </h1>
              )}

              {/* Meta row — only from full detail */}
              {detail && (
              <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
                {/* Media type badge */}
                <Badge
                  className={cn(
                    'text-white border-none text-[11px]',
                    MEDIA_TYPE_COLOR[detail.mediaType],
                  )}
                >
                  {MEDIA_TYPE_LABEL[detail.mediaType] ?? 'Media'}
                </Badge>

                 {/* Otix Rating */}
                 {detail.avgRating != null && detail.ratingCount > 0 && (
                   <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400" title={`Based on ${detail.ratingCount} community ratings`}>
                     <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                       <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                     </svg>
                     {(detail.avgRating * 10).toFixed(0)}%
                   </span>
                 )}

                {/* Year */}
                {detail.releaseDate && (
                  <Badge variant="outline" className="text-[11px] text-white/70 border-white/20">
                    {detail.releaseDate.slice(0, 4)}
                  </Badge>
                )}

                {/* Genres */}
                {detail.genres?.slice(0, 3).map((genre) => (
                  <Badge key={genre.id} variant="outline" className="text-[11px] text-white/70 border-white/20">
                    {genre.name}
                  </Badge>
                ))}
              </div>
              )}

              {/* Overview — only from full detail */}
              {detail?.overview && (
                <p
                  className="text-sm text-white/85 max-w-xl text-center line-clamp-2 mb-6"
                  style={{ textShadow: '0 2px 16px rgba(0,0,0,0.7)' }}
                >
                  {detail.overview}
                </p>
              )}

              {/* View details action integrated inside indicators dock below */}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}

      </div>{/* End clipped inner container */}

       {/* ── Slide indicators and integrated View Details ── */}
       {items.length > 1 && (
         <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-4 px-5 py-2.5 rounded-full bg-black/35 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.35)] transition-all duration-300 hover:bg-black/45">
           <div className="flex items-center gap-2.5">
             {items.map((item, i) => {
               const isActive = i === activeIndex
               return (
                 <button
                   key={item.id}
                   onClick={() => setActiveIndex(i)}
                   className={cn(
                     "relative h-1.5 rounded-full bg-white/20 overflow-hidden cursor-pointer transition-all duration-300",
                     isActive ? "w-8" : "w-1.5 hover:w-3 hover:bg-white/40"
                   )}
                   aria-label={`Slide ${i + 1}`}
                 >
                   {isActive && (
                     <motion.div
                       key={activeId}
                       initial={{ scaleX: 0 }}
                       animate={{ scaleX: 1 }}
                       transition={{ duration: AUTOPLAY_INTERVAL / 1000, ease: 'linear' }}
                       style={{ originX: 0 }}
                       className="absolute inset-0 bg-white rounded-full shadow-[0_0_8px_#ffffff]"
                     />
                   )}
                 </button>
               )
             })}
           </div>
           
           <div className="h-3.5 w-[1px] bg-white/20" />
           
           <Link
             to="/media/$mediaType/$mediaId"
             params={{
               mediaType: (detail?.mediaType || activeItem.mediaType) as 'movie' | 'show' | 'game' | 'music',
               mediaId: activeItem.id,
             }}
           >
             <button className="text-[11px] font-bold text-white/80 hover:text-white transition-colors duration-150 flex items-center gap-1">
               View Details
               <svg className="h-3 w-3 opacity-80" viewBox="0 0 20 20" fill="currentColor">
                 <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
               </svg>
             </button>
           </Link>
         </div>
       )}
    </div>
  )
}
