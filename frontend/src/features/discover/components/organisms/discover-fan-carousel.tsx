import { useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import { useNavigate } from '@tanstack/react-router'
import { Badge } from '@ui/atoms/badge'
import { Skeleton } from '@ui/atoms/skeleton'
import { MEDIA_TYPE_LABEL, MEDIA_TYPE_COLOR } from '@/constants/media'
import { useHeroCarousel } from '@discover/hooks/use-hero-carousel'
import { DiscoverEmptyFeed } from '@discover/components/organisms/discover-empty-feed'
import { HeroCard } from '@discover/components/molecules/discover-hero-card'
import { MediaLogo } from '@/lib/media/media-logo'
import { heroImage } from '@/lib/utils'

import {
  formatSeasonBadgeText,
  calculateCardTransform,
  CONTENT_FADE,
} from '@/features/discover/utils/hero'

interface DiscoverFanCarouselProps {
  className?: string
}

export const DiscoverFanCarousel = ({ className }: DiscoverFanCarouselProps) => {
  const {
    items,
    totalItems,
    activeIndex,
    activeItem,
    detailData: heroDetail,
    cardOffset,
    visibleSlides,
    setIsPaused,
    navigateTo,
    handleTouchStart,
    handleTouchEnd,
    isLoading,
    isError,
    refetch,
  } = useHeroCarousel()

  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)

  // Logo parallax (scroll-based vertical movement)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  })
  const logoParallax = useTransform(scrollYProgress, [0, 0.5, 1], [24, 0, -24])

  // Preload card images
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
    urls.forEach((url) => {
      const img = new Image()
      img.src = url
    })
  }, [activeIndex, items, totalItems])

  const isActuallyLoading = isLoading && items.length === 0

  const handleCardClick = useCallback(
    (itemIndex: number) => {
      const item = items[itemIndex]
      if (!item) return
      if (itemIndex === activeIndex) {
        navigate({
          to: '/media/$mediaType/$mediaId',
          params: { mediaType: item.mediaType, mediaId: item.id },
          state: ((prev: Record<string, unknown>) => ({
            ...prev,
            preview: {
              title: item.title,
              logoUrl: item.logoUrl,
              logoColorGuess: item.logoColorGuess,
              backdropUrl: item.backdropUrl,
              posterUrl: item.posterUrl,
            },
          })) as any,
        })
      } else {
        navigateTo(itemIndex)
      }
    },
    [items, activeIndex, navigate, navigateTo],
  )

  const handleMouseEnter = useCallback(() => setIsPaused(true), [setIsPaused])
  const handleMouseLeave = useCallback(() => setIsPaused(false), [setIsPaused])

  if (isError && items.length === 0) {
    return (
      <div className="relative w-full flex flex-col items-center justify-center py-8">
        <div className="flex flex-col items-center justify-center gap-3 h-[240px] text-muted-foreground">
          <p className="text-sm">Failed to load spotlight content.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-4 py-2 rounded-xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground transition-colors text-sm cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!isActuallyLoading && items.length === 0) {
    return <DiscoverEmptyFeed onRefresh={async () => { await refetch() }} />
  }

  return (
    <section
      id="discover-spotlight-carousel"
      ref={containerRef}
      className={`relative w-full flex flex-col items-center justify-center overflow-x-hidden ${className || ''}`}
    >
      {/* Card fan stack without bottom controls/balls/arrows */}
      <div
        id="discover-fan-slides"
        className="relative w-full h-[300px] sm:h-[400px] md:h-[480px] z-10 overflow-visible px-4 md:px-8 mt-2"
        style={{ perspective: '1400px', transformStyle: 'preserve-3d' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {isActuallyLoading && (
          <div
            className={
              'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ' +
              'z-30 flex flex-col justify-end p-6 ' +
              'rounded-[2rem] bg-[var(--dk-surface-raised)]/40 backdrop-blur-md shadow-xl ' +
              'w-[200px] sm:w-[270px] md:w-[330px] ' +
              'h-[300px] sm:h-[390px] md:h-[460px]'
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

        {visibleSlides.map(({ item, index, offset }) => {
          const isActive = offset === 0
          return (
            <HeroCard
              key={item.id}
              item={item}
              isActive={isActive}
              layerDistance={Math.abs(offset)}
              style={calculateCardTransform(offset, cardOffset, isActive)}
              className="w-[200px] h-[300px] sm:w-[270px] sm:h-[390px] md:w-[330px] md:h-[460px]"
              onClick={() => handleCardClick(index)}
            >
              {/* Logo with 3D Parallax */}
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
                    <div className="relative flex items-center justify-center">
                      <div
                        className="absolute inset-0 pointer-events-none opacity-80"
                        style={{
                          background:
                            'radial-gradient(ellipse at center, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.3) 55%, rgba(0, 0, 0, 0) 80%)',
                        }}
                      />
                      <MediaLogo
                        src={item.logoUrl}
                        alt={item.title}
                        className="relative z-10 h-20 sm:h-24 md:h-28 w-auto max-w-[280px] sm:max-w-[360px] md:max-w-[440px] object-contain"
                        colorGuess={item.logoColorGuess ?? null}
                        background="dark"
                        shadow="drop-shadow(0 3px 6px rgba(0,0,0,0.95)) drop-shadow(0 8px 32px rgba(0,0,0,0.85)) drop-shadow(0 0 1px rgba(0,0,0,0.9))"
                        style={{ transform: 'translateZ(15px)' }}
                      />
                    </div>
                  ) : (
                    <span
                      className="text-foreground font-black text-center px-4"
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

              {/* Detail overlay on active card */}
              {isActive && activeItem && (
                <AnimatePresence mode="wait">
                  {heroDetail ? (
                    <motion.div
                      key={activeItem.id}
                      {...CONTENT_FADE}
                      className="absolute inset-0 z-20 flex flex-col p-4 sm:p-5 md:p-6 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-auto"
                    >
                      <div className="mt-auto">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {heroDetail.mediaType && (
                            <Badge
                              size="sm"
                              className={`text-primary-foreground border-none ${MEDIA_TYPE_COLOR[heroDetail.mediaType as keyof typeof MEDIA_TYPE_COLOR] || ''}`}
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
                              className="font-bold text-[10px] uppercase tracking-wider px-2 py-0.5"
                            >
                              {formatSeasonBadgeText(heroDetail.newSeasonReleaseDate)}
                            </Badge>
                          )}

                          {heroDetail.releaseDate && (
                            <span className="text-[11px] font-semibold text-muted-foreground">
                              {heroDetail.releaseDate.slice(0, 4)}
                            </span>
                          )}

                          {heroDetail.avgRating != null && heroDetail.ratingCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--status-warning)]">
                              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                              {(heroDetail.avgRating * 10).toFixed(0)}%
                            </span>
                          )}
                        </div>

                        <h3 className="text-base sm:text-lg md:text-xl font-bold text-foreground mb-1 leading-tight line-clamp-1">
                          {heroDetail.title || activeItem.title}
                        </h3>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={`min-${activeItem.id}`}
                      {...CONTENT_FADE}
                      className="absolute inset-0 z-20 flex flex-col justify-end p-4 sm:p-5 md:p-6 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-auto"
                    >
                      <h3 className="text-base sm:text-lg md:text-xl font-bold text-foreground mb-1 line-clamp-1">
                        {activeItem.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2">
                        {activeItem.mediaType && (
                          <Badge
                            size="sm"
                            className={`text-primary-foreground border-none w-fit ${MEDIA_TYPE_COLOR[activeItem.mediaType as keyof typeof MEDIA_TYPE_COLOR] || ''}`}
                          >
                            {MEDIA_TYPE_LABEL[
                              activeItem.mediaType as keyof typeof MEDIA_TYPE_LABEL
                            ] ?? 'Media'}
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
    </section>
  )
};
