// TODO: Review this file
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Link, useNavigate as useNavigateRouter } from '@tanstack/react-router'
import { motion, AnimatePresence, useScroll, useTransform, useMotionValue, useSpring } from 'framer-motion'
import { discoverQueries } from '@discover/discover-queries'
import { mediaQueries } from '@media/media-queries'
import { Badge } from '@ui/atoms/badge'
import { Skeleton } from '@ui/atoms/skeleton'
import { cn } from '@/lib/utils'
import { MEDIA_TYPE_COLOR, MEDIA_TYPE_LABEL } from '@/constants/media'

const AUTOPLAY_INTERVAL = 8000
const TRANSITION_MS = 700

const CONTENT_FADE = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.5, ease: [0.25, 1, 0.5, 1] },
} as const

// Upscale TMDB images from w500 to w1280 for hero-sized rendering.
function heroImage(url: string): string {
  return url.replace(/\/w500\//, '/w1280/')
}

function circularDist(index: number, target: number, total: number): number {
  const diff = (index - target + total) % total
  const shortest = diff <= total / 2 ? diff : diff - total
  return shortest
}

function cardTransform(dist: number, cardOffset: number): string {
  const scale = 1 - Math.abs(dist) * 0.12  // fanning scale down
  const rotate = dist * 6.5                // fanning rotation
  const translateY = Math.abs(dist) * 16   // downward curve offset
  
  if (dist === 0) {
    return 'translateX(-50%) translateY(-50%) scale(1) rotate(0deg)'
  }
  
  return `translateX(-50%) translateX(${dist * cardOffset}px) translateY(calc(-50% + ${translateY}px)) scale(${scale}) rotate(${rotate}deg)`
}

const CARD_TRANSITION = 'transform 600ms cubic-bezier(0.34, 1.3, 0.64, 1), opacity 500ms ease-out'

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

interface DiscoverHeroCardProps {
  item: any
  dist: number
  slideIndex: number
  isActive: boolean
  cardOffset: number
  detail: any
  activeId: string | undefined
  bgImage: string | null
  yScroll: any
  yScrollLogo: any
  handleCardClick: (item: any, index: number, isActive: boolean) => void
}

function DiscoverHeroCard({
  item,
  dist,
  slideIndex,
  isActive,
  cardOffset,
  detail,
  activeId,
  bgImage,
  yScroll,
  yScrollLogo,
  handleCardClick,
}: DiscoverHeroCardProps) {
  const absDist = Math.abs(dist)
  const isFar = absDist >= 3

  // Tilt motion values (based on cursor, touch, or gyroscope)
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  // Subtle max tilt (12 degrees)
  const rotateX = useTransform(y, [-0.5, 0.5], [12, -12])
  const rotateY = useTransform(x, [-0.5, 0.5], [-12, 12])

  // Spring configuration for smooth premium lag/damping
  const springConfig = { damping: 25, stiffness: 200, mass: 0.5 }
  const springRotateX = useSpring(rotateX, springConfig)
  const springRotateY = useSpring(rotateY, springConfig)

  // Smooth spring for translateZ depth (scale up elements slightly on hover)
  const tiltZ = useMotionValue(0)
  const springTiltZ = useSpring(tiltZ, springConfig)

  // Track whether a finger is currently on the card (disables gyro during touch)
  const isTouchingRef = useRef(false)

  const setTiltFromPos = (clientX: number, clientY: number, rect: DOMRect) => {
    const relX = (clientX - rect.left) / rect.width - 0.5
    const relY = (clientY - rect.top) / rect.height - 0.5
    x.set(relX)
    y.set(relY)
  }

  // ── Mouse tilt ──
  const handleMouseMove = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isFar) return
    setTiltFromPos(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
  }

  const handleMouseEnter = () => {
    if (isFar) return
    tiltZ.set(24)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
    tiltZ.set(0)
  }

  // ── Touch tilt (finger follows card surface) ──
  const handleTouchStart = (event: React.TouchEvent<HTMLButtonElement>) => {
    if (isFar) return
    isTouchingRef.current = true
    tiltZ.set(24)
    setTiltFromPos(event.touches[0].clientX, event.touches[0].clientY, event.currentTarget.getBoundingClientRect())
  }

  const handleTouchMove = (event: React.TouchEvent<HTMLButtonElement>) => {
    if (isFar || !isTouchingRef.current) return
    setTiltFromPos(event.touches[0].clientX, event.touches[0].clientY, event.currentTarget.getBoundingClientRect())
  }

  const handleTouchEnd = () => {
    isTouchingRef.current = false
    x.set(0)
    y.set(0)
    tiltZ.set(0)
  }

  // ── Gyroscope tilt (phone orientation, when not touching) ──
  useEffect(() => {
    const isMobile = typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator as any).maxTouchPoints > 0)
    if (!isMobile || isFar) return

    let active = true
    const handler = (event: DeviceOrientationEvent) => {
      if (!active || isTouchingRef.current || event.gamma == null || event.beta == null) return
      // gamma = left-right tilt (-90 to 90), beta = front-back tilt (-180 to 180)
      // Map to a subtle -0.3 to 0.3 range
      const gx = Math.max(-0.3, Math.min(0.3, (event.gamma / 90) * 0.25))
      const gy = Math.max(-0.3, Math.min(0.3, (event.beta / 90) * 0.18))
      x.set(gx)
      y.set(gy)
    }

    window.addEventListener('deviceorientation', handler)
    return () => {
      active = false
      window.removeEventListener('deviceorientation', handler)
    }
  }, [isFar])

  // Card image source (prefer textlessPosterUrl, fallback to poster)
  const itemFallback = item.posterUrl || null
  const coverSrc = item.textlessPosterUrl || itemFallback

  return (
    <button
      onClick={() => handleCardClick(item, slideIndex, isActive)}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={cn(
        'absolute left-1/2 top-1/2 outline-none will-change-transform cursor-pointer',
        'w-[200px] h-[300px] sm:w-[270px] sm:h-[405px] md:w-[330px] md:h-[495px]',
      )}
      style={{
        left: '50%',
        top: '50%',
        transform: cardTransform(dist, cardOffset),
        opacity: 1,
        zIndex: Math.max(0, 10 - absDist * 2),
        transition: CARD_TRANSITION,
        pointerEvents: isFar ? 'none' : 'auto',
        perspective: '1200px', // perspective for 3D card tilt effect
        touchAction: 'manipulation',
      }}
      aria-label={isActive ? `View details for ${item.title}` : `Go to slide ${item.title}`}
    >
      {/* 3D Tilt Wrapper */}
      <motion.div
        className="relative w-full h-full"
        style={{
          rotateX: springRotateX,
          rotateY: springRotateY,
          z: springTiltZ,
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Card Content (rounded with overflow-hidden to crop background) */}
        <div
          className={cn(
            'relative h-full w-full overflow-hidden rounded-[2rem] transition-all duration-300',
            'ring-1 ring-white/[0.08]',
            isActive ? 'shadow-[0_24px_60px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.15)]' : 'shadow-[0_12px_32px_rgba(0,0,0,0.55)]',
            !isActive && 'hover:ring-white/[0.2]',
          )}
          style={{
            transform: 'translateZ(0px)', // hardware acceleration
          }}
        >
          {/* If active, render the panning backdrop with Ken Burns */}
          {isActive && bgImage ? (() => {
            const anim = getSlideAnimation(activeId)
            return (
              <motion.div
                className="absolute inset-0"
                style={{ y: yScroll }}
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
                  className="absolute inset-0 bg-cover bg-center"
                  style={{
                    backgroundImage: `url(${bgImage})`,
                    top: -80,
                    bottom: -80,
                    left: -20,
                    right: -20,
                  }}
                />
              </motion.div>
            )
          })() : (
            /* If inactive, render the static backdrop image */
            coverSrc ? (
              <img
                src={heroImage(coverSrc)}
                alt=""
                className="absolute inset-0 h-full w-full object-cover select-none pointer-events-none"
                loading="lazy"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
                <span className="text-3xl font-bold text-white/20">{item.title[0]}</span>
              </div>
            )
          )}

          {/* Fallback gradient if no cover image is loaded */}
          {!coverSrc && !bgImage && (
            <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 to-black" />
          )}

          {/* Darkening/lightening overlay for non-focused cards — uses page
              background color so it darkens in dark mode and lightens in
              light mode. Opacity increases per layer to reduce distraction. */}
          {!isActive && (
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: 'var(--background)',
                opacity: Math.min(0.30 + absDist * 0.25, 0.90),
                transition: 'opacity 500ms ease-out',
              }}
            />
          )}

        </div>

        {/* Inside active card — show media logo or title text zoomed larger from the center, overflowing the card width */}
        {/* We place it in preserve-3d context with Z-translation to float in front of the card */}
        {isActive && (
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-[115%] flex justify-center pointer-events-none"
            style={{
              transformStyle: 'preserve-3d',
            }}
          >
            <motion.div
              style={{
                y: yScrollLogo,
                z: 60, // translateZ lift in 3D space
                transformStyle: 'preserve-3d',
              }}
              className="w-full flex justify-center"
            >
              <AnimatePresence mode="wait">
                {detail?.logoUrl ? (
                  <motion.img
                    key={`logo-${activeId}`}
                    initial={{ opacity: 0, scale: 0.8, y: 15 }}
                    animate={{ opacity: 1, scale: 1.15, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8, y: -15 }}
                    transition={{ duration: 0.45, ease: [0.34, 1.3, 0.64, 1] }}
                    src={detail.logoUrl}
                    alt={detail.title}
                    className="w-full max-h-[120px] object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.95)]"
                    style={{ transform: 'translateZ(15px)' }}
                  />
                ) : (
                  <motion.h2
                    key={`title-${activeId}`}
                    initial={{ opacity: 0, scale: 0.8, y: 15 }}
                    animate={{ opacity: 1, scale: 1.15, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8, y: -15 }}
                    transition={{ duration: 0.45, ease: [0.34, 1.3, 0.64, 1] }}
                    className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white text-center leading-tight drop-shadow-[0_6px_20px_rgba(0,0,0,0.9)] w-full px-4"
                    style={{
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      transform: 'translateZ(15px)',
                    }}
                  >
                    {detail?.title || item.title}
                  </motion.h2>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        )}
      </motion.div>
    </button>
  )
}

export function DiscoverHero({ className }: { className?: string }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [prevActiveIndex, setPrevActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [isTransitioning, setIsTransitioning] = useState(false)
  
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024)
  const navigateRouter = useNavigateRouter()

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handleResize, { passive: true })
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const cardOffset = useMemo(() => {
    const effectiveWidth = Math.min(windowWidth, 1400)
    if (effectiveWidth < 640) return 130
    if (effectiveWidth < 768) return 180
    return 220
  }, [windowWidth])

  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  })
  const yScroll = useTransform(scrollYProgress, [0, 0.5, 1], [-60, 0, 60])
  const yScrollLogo = useTransform(scrollYProgress, [0, 0.5, 1], [30, 0, -30])

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

  // Fetch detail only for the active item
  const detailQuery = useQuery({
    ...mediaQueries.detail(activeId ?? ''),
    enabled: !!activeId,
    placeholderData: keepPreviousData,
  })

  const detail = detailQuery.data
  const detailError = detailQuery.isError
  const isLoading = heroQuery.isLoading || (!!activeId && detailQuery.isLoading && !detail)
  const hasError = heroQuery.isError && !heroQuery.data

  // Graceful skip
  useEffect(() => {
    if (!detailError || !activeId || items.length <= 1) return
    failedDetailIdsRef.current.add(activeId)

    const nextIdx = items.findIndex((item, i) =>
      i !== activeIndex && !failedDetailIdsRef.current.has(item.id),
    )
    if (nextIdx !== -1) {
      setActiveIndex(nextIdx)
      setPrevActiveIndex(nextIdx)
    }
  }, [detailError, activeId, activeIndex, items])

  // Centralized transition management
  const navigateTo = useCallback((targetIndex: number) => {
    if (isTransitioning || targetIndex === activeIndex) return
    setIsTransitioning(true)
    setPrevActiveIndex(activeIndex)
    setActiveIndex(targetIndex)
    setTimeout(() => {
      setIsTransitioning(false)
      setPrevActiveIndex(targetIndex)
    }, TRANSITION_MS)
  }, [isTransitioning, activeIndex])

  const navigate = useCallback((index: number) => {
    navigateTo(index)
  }, [navigateTo])

  const tick = useCallback(() => {
    navigateTo((activeIndex + 1) % Math.max(1, items.length))
  }, [activeIndex, items.length, navigateTo])

  const tickBack = useCallback(() => {
    navigateTo((activeIndex - 1 + Math.max(1, items.length)) % items.length)
  }, [activeIndex, items.length, navigateTo])

  // ── Touch swipe support ──
  const touchStartXRef = useRef(0)
  const touchStartYRef = useRef(0)
  const SWIPE_THRESHOLD = 50

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX
    touchStartYRef.current = e.touches[0].clientY
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current

    // Horizontal swipe (ignore vertical scrolling)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD) {
      if (deltaX < 0) {
        tick()
      } else {
        tickBack()
      }
    }
  }, [tick, tickBack])

  useEffect(() => {
    if (items.length <= 1 || isPaused) return
    intervalRef.current = setInterval(tick, AUTOPLAY_INTERVAL)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [items.length, isPaused, tick])

  // Click handler to route to detail or step slides
  const handleCardClick = useCallback((item: typeof items[0], index: number, isActive: boolean) => {
    if (isTransitioning) return
    if (isActive) {
      const mediaType = (detail?.mediaType || item.mediaType) as 'movie' | 'show' | 'game' | 'music'
      navigateRouter({
        to: '/media/$mediaType/$mediaId',
        params: { mediaType, mediaId: item.id }
      })
    } else {
      navigate(index)
    }
  }, [isTransitioning, navigate, detail?.mediaType, navigateRouter])

  // Active poster source (prefer textlessPosterUrl, fallback to poster)
  const fallback = activeItem?.posterUrl || null
  const bgImageRaw = activeItem?.textlessPosterUrl || fallback
  const bgImage = bgImageRaw ? heroImage(bgImageRaw) : null

  // Build visible stacked card previews with wrapping path calculation
  const visibleSlides = useMemo(() => {
    if (items.length === 0) return []
    const total = items.length

    return items
      .map((item, i) => {
        const d_prev = circularDist(i, prevActiveIndex, total)
        const d_new = circularDist(i, activeIndex, total)
        
        let dist = d_new

        if (isTransitioning) {
          const step = circularDist(activeIndex, prevActiveIndex, total)
          const linear_diff = d_new - d_prev

          // Wrap condition: index crosses the circular boundary
          if (step > 0 && linear_diff > 0) {
            dist = d_prev - step  // slide off-screen left
          } else if (step < 0 && linear_diff < 0) {
            dist = d_prev - step  // slide off-screen right
          }
        }

        return {
          item,
          dist,
        }
      })
      .sort((a, b) => a.item.id.localeCompare(b.item.id))
  }, [items, activeIndex, prevActiveIndex, isTransitioning])

  const handleMouseEnter = useCallback(() => setIsPaused(true), [])
  const handleMouseLeave = useCallback(() => setIsPaused(false), [])

  if (hasError) return null
  if (!isLoading && items.length === 0) return null

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full flex flex-col items-center justify-center pb-12', className)}
      style={{ overflow: 'visible' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* ── Slide stack container ── */}
      <div
        className="relative w-full h-[300px] sm:h-[425px] md:h-[515px] z-10 overflow-visible"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        
        {/* Loading skeleton */}
        {isLoading && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[300px] sm:w-[270px] sm:h-[405px] md:w-[330px] md:h-[495px] z-30 flex flex-col justify-end p-6 rounded-[2rem] bg-black/40 backdrop-blur-sm shadow-xl">
            <Skeleton className="h-6 w-2/3 mb-2" />
            <Skeleton className="h-4 w-full mb-1" />
            <Skeleton className="h-4 w-3/4 mb-3" />
            <div className="flex gap-2 mb-3">
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
            <Skeleton className="h-8 w-28 rounded-full" />
          </div>
        )}

        {visibleSlides.map(({ item, dist }) => {
          const isActive = dist === 0
          const slideIndex = items.findIndex((it) => it.id === item.id)

          return (
            <DiscoverHeroCard
              key={item.id}
              item={item}
              dist={dist}
              slideIndex={slideIndex}
              isActive={isActive}
              cardOffset={cardOffset}
              detail={isActive ? detail : null}
              activeId={activeId}
              bgImage={bgImage}
              yScroll={yScroll}
              yScrollLogo={yScrollLogo}
              handleCardClick={handleCardClick}
            />
          )
        })}
      </div>

      {/* ── Active slide details below the card stack ── */}
      <div className="relative w-full z-15 flex flex-col items-center mt-6 min-h-[110px] px-6 text-center">
        <AnimatePresence mode="wait">
          {activeItem && (
            <motion.div
              key={activeItem.id}
              {...CONTENT_FADE}
              className="flex flex-col items-center max-w-2xl"
            >


              {/* Meta row */}
              {detail && (
                <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
                  <Badge
                    className={cn(
                      'text-white border-none text-[11px]',
                      MEDIA_TYPE_COLOR[detail.mediaType],
                    )}
                  >
                    {MEDIA_TYPE_LABEL[detail.mediaType] ?? 'Media'}
                  </Badge>

                  {detail.avgRating != null && detail.ratingCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400" title={`Based on ${detail.ratingCount} community ratings`}>
                      <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      {(detail.avgRating * 10).toFixed(0)}%
                    </span>
                  )}

                  {detail.releaseDate && (
                    <Badge variant="outline" className="text-[11px] text-white/70 border-white/20">
                      {detail.releaseDate.slice(0, 4)}
                    </Badge>
                  )}

                  {detail.genres?.slice(0, 3).map((genre) => (
                    <Badge key={genre.id} variant="outline" className="text-[11px] text-white/70 border-white/20">
                      {genre.name}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Overview */}
              {detail?.overview && (
                <p
                  className="text-sm text-white/85 max-w-xl text-center line-clamp-2 mb-0"
                  style={{ textShadow: '0 2px 16px rgba(0,0,0,0.7)' }}
                >
                  {detail.overview}
                </p>
              )}

              {/* View details removed from here since it is now integrated inside the bottom pill indicators container */}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Slide indicators and integrated View Details ── */}
      {items.length > 1 && (
        <div className="mt-4 flex items-center gap-4 px-5 py-2.5 rounded-full bg-black/35 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.35)] transition-all duration-300 hover:bg-black/45">
          <div className="flex items-center gap-2.5">
            {items.map((item, i) => {
              const isActive = i === activeIndex
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(i)}
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

          {activeItem && (
            <Link
              to="/media/$mediaType/$mediaId"
              params={{
                mediaType: (detail?.mediaType || activeItem.mediaType) as 'movie' | 'show' | 'game' | 'music',
                mediaId: activeItem.id,
              }}
            >
              <button className="text-[11px] font-bold text-white/80 hover:text-white transition-colors duration-150 flex items-center gap-1 cursor-pointer bg-transparent border-none outline-none">
                View Details
                <svg className="h-3 w-3 opacity-85" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
              </button>
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
