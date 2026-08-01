import { useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import { useNavigate, Link } from '@tanstack/react-router'
import { Badge } from '@ui/atoms/badge'
import { Skeleton } from '@ui/atoms/skeleton'
import { MEDIA_TYPE_LABEL, MEDIA_TYPE_COLOR } from '@/constants/media'
import { useHeroCarousel } from '@discover/hooks/use-hero-carousel'
import { HeroCard } from '@discover/components/molecules/discover-hero-card'
import { HeroIndicator } from '@discover/components/molecules/discover-hero-indicator'

function formatSeasonBadgeText(releaseDate?: string | null): string {
  if (!releaseDate) return 'New Season'
  const date = new Date(releaseDate)
  const now = new Date()
  const days = Math.floor((date.getTime() - now.getTime()) / 86400000)
  const month = date.toLocaleString('en-US', { month: 'short' })
  const year = date.getFullYear()
  if (days > 0) return `New Season · ${month} ${year}`
  if (days >= -14) return 'New Season · Just Landed'
  return `New Season · ${month} ${year}`
}

const CONTENT_FADE = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.5, ease: [0.25, 1, 0.5, 1] },
} as const

import { heroImage } from '@/lib/utils'

/**
 * Compute the CSS transform and positioning for a card at a given slide offset.
 *
 * slideOffset -3:  far left,   scale 0.7,  translateX strongly negative
 * slideOffset -2:  left,       scale 0.8,  translateX moderately negative
 * slideOffset -1:  adjacent,   scale 0.9,  translateX slightly negative
 * slideOffset  0:  active,     scale 1,    translateX 0,     highest z-index
 * slideOffset  1:  right peek, scale 0.9,  translateX slightly positive
 *
 * Cards fan from the left-center area with diminishing spacing per layer.
 */
export function calculateCardTransform(
  slideOffset: number,
  cardOffset: number,
  isActive: boolean,
): React.CSSProperties {
  const abs = Math.abs(slideOffset)
  const scale = Math.max(0.7, 1 - abs * 0.10)
  const translateY = abs * 14
  const layerGap = cardOffset * (1 - abs * 0.06)

  let transform: string
  if (isActive) {
    transform = 'translateX(-50%) translateY(-50%) scale(1)'
  } else {
    transform = [
      'translateX(-50%)',
      `translateX(${slideOffset * layerGap}px)`,
      `translateY(calc(-50% + ${translateY}px))`,
      `scale(${scale})`,
    ].join(' ')
  }

  return {
    left: '50%',
    top: '50%',
    transform,
    zIndex: Math.max(0, 10 - abs * 2),
    transition:
      'transform 600ms cubic-bezier(0.34, 1.3, 0.64, 1), opacity 500ms ease-out',
    pointerEvents: abs >= 3 ? 'none' : 'auto',
    perspective: '1200px',
    touchAction: 'manipulation',
  }
}

// ── Component ──────────────────────────────────────────────────────────

export function DiscoverHero({ className }: { className?: string }) {
  const {
    items,
    totalItems,
    activeIndex,
    activeItem,
    detailData: heroDetail,
    cardOffset,
    visibleSlides,
    setIsPaused,
    tick,
    tickBack,
    navigateTo,
    handleTouchStart,
    handleTouchEnd,
    isLoading,
    isError,
    refetch,
  } = useHeroCarousel()

  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Logo parallax (scroll-based vertical movement) ───────────

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  })
  const logoParallax = useTransform(scrollYProgress, [0, 0.5, 1], [30, 0, -30])

  // ── Preload all card images (textlessPoster, logo) ──────────

  useEffect(() => {
    if (totalItems === 0) return
    const urls = new Set<string>()
    for (let i = -5; i <= 5; i++) {
      const idx = (activeIndex + i + totalItems) % totalItems
      const item = items[idx]
      if (!item) continue
      if (item.textlessPosterUrl) urls.add(heroImage(item.textlessPosterUrl))
      if (item.logoUrl) urls.add(item.logoUrl)
    }
    urls.forEach((url) => { const img = new Image(); img.src = url })
  }, [activeIndex, items, totalItems])

  // ── Loading / error / empty states ───────────────────────────

  const isActuallyLoading = isLoading && items.length === 0

  // ── Card click handler ───────────────────────────────────────

  const handleCardClick = useCallback(
    (itemIndex: number) => {
      const item = items[itemIndex]
      if (!item) return
      if (itemIndex === activeIndex) {
        navigate({
          to: '/media/$mediaType/$mediaId',
          params: { mediaType: item.mediaType, mediaId: item.id },
        })
      } else {
        navigateTo(itemIndex)
      }
    },
    [items, activeIndex, navigate, navigateTo],
  )

  // ── Pause on hover ───────────────────────────────────────────

  const handleMouseEnter = useCallback(
    () => setIsPaused(true),
    [setIsPaused],
  )
  const handleMouseLeave = useCallback(
    () => setIsPaused(false),
    [setIsPaused],
  )

  // ── Empty state ──────────────────────────────────────────────

  if (isError && items.length === 0) {
    return (
      <div className="relative w-full flex flex-col items-center justify-center pb-12">
        <div className="flex flex-col items-center justify-center gap-4 h-[300px] sm:h-[425px] md:h-[515px] text-white/70">
          <p className="text-sm">Failed to load hero content.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!isActuallyLoading && items.length === 0) return null

  // ── Render ───────────────────────────────────────────────────

  return (
    <div
      id="discover-hero"
      ref={containerRef}
      className={`relative w-full flex flex-col items-center justify-center pb-12 overflow-x-hidden ${className || ''}`}
    >
      {/* ═══ Slide stack ═══ */}
      <div
        id="discover-hero-slides"
        className="relative w-full h-[300px] sm:h-[425px] md:h-[515px] z-10 overflow-visible px-4 md:px-8 mt-16 sm:mt-20 md:mt-24"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* ── Loading skeleton ── */}
        {isActuallyLoading && (
          <div
            className={
              'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ' +
              'z-30 flex flex-col justify-end p-6 ' +
              'rounded-[2rem] bg-black/40 backdrop-blur-sm shadow-xl ' +
              'w-[200px] sm:w-[270px] md:w-[330px] ' +
              'h-[300px] sm:h-[405px] md:h-[495px]'
            }
          >
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

        {/* ── Card fan stack ── */}
        {visibleSlides.map(({ item, index, offset }) => {
          const isActive = offset === 0
          return (
            <HeroCard
              key={item.id}
              item={item}
              isActive={isActive}
              layerDistance={Math.abs(offset)}
              style={calculateCardTransform(offset, cardOffset, isActive)}
              className={'w-[200px] h-[300px] sm:w-[270px] sm:h-[405px] md:w-[330px] md:h-[495px]'}
              onClick={() => handleCardClick(index)}
            >
              {/* Logo - always visible, scales up when active */}
              <motion.div
                className="absolute inset-0 z-30 pointer-events-none"
                style={({ z: 60, transformStyle: 'preserve-3d', y: isActive ? (logoParallax as unknown as number) : 0 } as React.CSSProperties)}
              >
                <motion.div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[400%] max-w-none flex items-center justify-center"
                  initial={false}
                  animate={{
                    opacity: isActive ? 1 : 0.7,
                    scale: isActive ? 1.15 : 0.5,
                  }}
                  transition={{ duration: 0.45, delay: 0.15, ease: [0.34, 1.3, 0.64, 1] }}
                >
                  {item.logoUrl ? (
                    <img
                      src={item.logoUrl}
                      alt={item.title}
                      className="h-20 sm:h-24 md:h-28 w-auto object-contain"
                      style={{ transform: 'translateZ(15px)' }}
                      draggable={false}
                    />
                  ) : (
                    <span
                      className="text-white font-bold text-center px-4"
                      style={{
                        fontSize: 'clamp(1rem, 4vw, 2rem)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        transform: 'translateZ(15px)',
                      }}
                    >
                      {item.title}
                    </span>
                  )}
                </motion.div>
              </motion.div>

              {/* Detail overlay on the active card */}
              {isActive && activeItem && (
                <AnimatePresence mode="wait">
                  {heroDetail ? (
                    <motion.div
                      key={activeItem.id}
                      {...CONTENT_FADE}
                      className={
                        'absolute inset-0 z-20 ' +
                        'flex flex-col p-4 sm:p-5 md:p-6 ' +
                        'bg-gradient-to-t from-black/90 via-black/30 to-transparent ' +
                        'pointer-events-auto'
                      }
                    >
                      {/* Bottom content: meta, overview, CTA */}
                      <div className="mt-auto">
                      {/* Meta row: badge, year, rating */}
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {heroDetail.mediaType && (
                          <Badge
                            size="sm"
                            className={`text-white border-none ${MEDIA_TYPE_COLOR[heroDetail.mediaType as keyof typeof MEDIA_TYPE_COLOR] || ''}`}
                          >
                            {MEDIA_TYPE_LABEL[
                              heroDetail.mediaType as keyof typeof MEDIA_TYPE_LABEL
                            ] ?? 'Media'}
                          </Badge>
                        )}

                        {heroDetail.mediaType === 'show' && heroDetail.newSeasonReleased && (
                          <Badge
                            size="sm"
                            variant="success"
                            className="font-bold text-[10px] border border-green-500/20 shadow-md uppercase tracking-wider px-2 py-0.5"
                          >
                            {formatSeasonBadgeText(heroDetail.newSeasonReleaseDate)}
                          </Badge>
                        )}

                        {heroDetail.releaseDate && (
                          <span className="text-[11px] font-semibold text-white/70">
                            {heroDetail.releaseDate.slice(0, 4)}
                          </span>
                        )}

                        {heroDetail.avgRating != null &&
                          heroDetail.ratingCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                              <svg
                                className="h-3 w-3"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                              {(heroDetail.avgRating * 10).toFixed(0)}%
                            </span>
                          )}
                      </div>

                      {/* Title */}
                      <h3 className="text-base sm:text-lg md:text-xl font-bold text-white mb-1 leading-tight line-clamp-1">
                        {heroDetail.title || activeItem.title}
                      </h3>
                      </div>
                    </motion.div>
                  ) : (
                    /* Minimal fallback while detail data loads */
                    <motion.div
                      key={`min-${activeItem.id}`}
                      {...CONTENT_FADE}
                      className={
                        'absolute inset-0 z-20 ' +
                        'flex flex-col justify-end p-4 sm:p-5 md:p-6 ' +
                        'bg-gradient-to-t from-black/90 via-black/30 to-transparent ' +
                        'pointer-events-auto'
                      }
                    >
                      <h3 className="text-base sm:text-lg md:text-xl font-bold text-white mb-1 line-clamp-1">
                        {activeItem.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2">
                        {activeItem.mediaType && (
                          <Badge
                            size="sm"
                            className={`text-white border-none w-fit ${MEDIA_TYPE_COLOR[activeItem.mediaType as keyof typeof MEDIA_TYPE_COLOR] || ''}`}
                          >
                            {MEDIA_TYPE_LABEL[
                              activeItem.mediaType as keyof typeof MEDIA_TYPE_LABEL
                            ] ?? 'Media'}
                          </Badge>
                        )}

                        {activeItem.mediaType === 'show' && activeItem.newSeasonReleased && (
                          <Badge
                            size="sm"
                            variant="success"
                            className="font-bold text-[10px] border border-green-500/20 shadow-md uppercase tracking-wider px-2 py-0.5"
                          >
                            {formatSeasonBadgeText(activeItem.newSeasonReleaseDate)}
                          </Badge>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </HeroCard>
          )
        })}
      </div>

      {/* ═══ Bottom navigation bar ═══ */}
      <div
        id="discover-hero-controls"
        className={
          'relative z-10 mt-4 ' +
          'flex items-center gap-4 px-5 py-2.5 ' +
          'rounded-full bg-black/35 backdrop-blur-md ' +
          'shadow-[0_8px_32px_rgba(0,0,0,0.35)] ' +
          'hover:bg-black/45 transition-all'
        }
      >
        {/* Left arrow */}
        <button
          type="button"
          onClick={tickBack}
          className={
            'flex items-center justify-center w-7 h-7 rounded-full ' +
            'text-white/70 hover:text-white hover:bg-white/10 ' +
            'transition-all'
          }
          aria-label="Previous slide"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* Dot indicators */}
        <HeroIndicator
          total={totalItems}
          activeIndex={activeIndex}
          onSelect={navigateTo}
        />

        {/* Right arrow */}
        <button
          type="button"
          onClick={tick}
          className={
            'flex items-center justify-center w-7 h-7 rounded-full ' +
            'text-white/70 hover:text-white hover:bg-white/10 ' +
            'transition-all'
          }
          aria-label="Next slide"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* Separator */}
        <div className="h-3.5 w-px bg-white/20" />

        {/* View Details link in bottom bar */}
        {activeItem && (
          <Link
            to="/media/$mediaType/$mediaId"
            params={{ mediaType: (heroDetail?.mediaType || activeItem.mediaType) as string, mediaId: activeItem.id }}
            className={
              'text-[11px] font-bold text-white/80 hover:text-white ' +
              'flex items-center gap-1 transition-colors'
            }
          >
            View Details
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
        )}
      </div>
    </div>
  )
}

export default DiscoverHero
