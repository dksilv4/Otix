import { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import {
  Film,
  Tv,
  Gamepad2,
  ArrowRight,
  Play,
  Loader2,
  Info,
} from 'lucide-react'
import { Badge } from '@ui/atoms/badge'
import { Skeleton } from '@ui/atoms/skeleton'
import { MediaLogo } from '@/lib/media/media-logo'
import { useStreamAvailability } from '@/features/media/hooks/use-stream-availability'
import { useQuickStream } from '@/features/media/hooks/use-quick-stream'
import { useMediaActivity } from '@/features/media/hooks/use-media-activity'
import { discoverQueries } from '@discover/queries/discover-queries'
import { mediaQueries, type MediaItemSummary } from '@media/queries/media-queries'
import { safeLazy } from '@/lib/utils/chunk-reload'
import {
  HERO_STAGE_FADE,
  formatRatingPercent,
  formatReleaseYear,
  formatSeasonBadgeText,
  resolvePlatformIcon,
  formatMediaFormatLabel,
  formatAudienceMetric,
  extractTrailerYoutubeId,
  resolveHeroBackdropSource,
} from '@/features/discover/utils/hero'
import {
  type HeroTab,
  HERO_TAB_ITEMS,
  getNextHeroTab,
  filterRecentTrendingMedia,
} from '@/features/discover/utils/overview-features'

const TrailerVideoModal = safeLazy(() =>
  import('@discover/components/molecules/trailer-video-modal').then((m) => ({
    default: m.TrailerVideoModal,
  })),
)

const AUTO_ROTATE_MS = 10000

interface DiscoverHeroProps {
  className?: string
}

export const DiscoverHero = ({ className }: DiscoverHeroProps) => {
  const prefersReducedMotion = useReducedMotion()
  const [selectedTab, setSelectedTab] = useState<HeroTab>('movie')
  const [activeSlideIndex, setActiveSlideIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [isTrailerOpen, setIsTrailerOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch trending and recent/viral media
  const { data: moviesData, isLoading: moviesLoading } = useInfiniteQuery(
    discoverQueries.list('movie', 'trending'),
  )

  const [hasDeferredLoaded, setHasDeferredLoaded] = useState(false)
  useEffect(() => {
    const timeout = setTimeout(() => setHasDeferredLoaded(true), 2500)
    return () => clearTimeout(timeout)
  }, [])

  const { data: showsData, isLoading: showsLoading } = useInfiniteQuery({
    ...discoverQueries.list('show', 'trending'),
    enabled: selectedTab === 'show' || hasDeferredLoaded,
  })
  const { data: gamesData, isLoading: gamesLoading } = useInfiniteQuery({
    ...discoverQueries.list('game', 'now_playing'),
    enabled: selectedTab === 'game' || hasDeferredLoaded,
  })

  // Filter so hero only surfaces trending and recent/viral media, strictly filtering out older catalog
  const movieItems = useMemo<MediaItemSummary[]>(() => {
    const raw = moviesData?.pages?.[0]?.items ?? []
    return filterRecentTrendingMedia(raw as MediaItemSummary[])
  }, [moviesData])

  const showItems = useMemo<MediaItemSummary[]>(() => {
    const raw = showsData?.pages?.[0]?.items ?? []
    return filterRecentTrendingMedia(raw as MediaItemSummary[])
  }, [showsData])

  const gameItems = useMemo<MediaItemSummary[]>(() => {
    const raw = gamesData?.pages?.[0]?.items ?? []
    return filterRecentTrendingMedia(raw as MediaItemSummary[])
  }, [gamesData])

  // Current slides for the active tab (up to 7 items)
  const currentTabSlides = useMemo(() => {
    if (selectedTab === 'movie') return movieItems.slice(0, 7)
    if (selectedTab === 'show') return showItems.slice(0, 7)
    return gameItems.slice(0, 7)
  }, [selectedTab, movieItems, showItems, gameItems])

  const safeSlideIndex = activeSlideIndex >= currentTabSlides.length ? 0 : activeSlideIndex

  // Active media item
  const activeMediaItem =
    (currentTabSlides[safeSlideIndex] as MediaItemSummary | undefined) ??
    (currentTabSlides[0] as MediaItemSummary | undefined) ??
    null

  // Fetch detail for active media item
  const { data: activeDetail } = useQuery({
    ...mediaQueries.detail(activeMediaItem?.mediaType ?? '', activeMediaItem?.id ?? ''),
    enabled: !!activeMediaItem,
  })

  const { isStreamable } = useStreamAvailability({
    mediaId: activeMediaItem?.id ?? '',
    tmdbId: activeMediaItem?.tmdbId,
    mediaType: activeMediaItem?.mediaType ?? 'movie',
  })
  const nodeActivity = useMediaActivity(
    activeMediaItem?.mediaType,
    activeMediaItem?.tmdbId,
    activeMediaItem?.id,
  )
  const effectiveActivityStatus = nodeActivity?.status || (isStreamable ? 'available' : undefined)
  const { quickStream, isStartingStream } = useQuickStream()

  // Auto rotation: advance within tab, and when finished all slides in tab, move to next tab and reset to slide 0
  const advanceSlide = useCallback(() => {
    const totalSlides = currentTabSlides.length
    if (totalSlides === 0) return

    if (activeSlideIndex < totalSlides - 1) {
      setActiveSlideIndex((prev) => prev + 1)
    } else {
      const nextTab = getNextHeroTab(selectedTab)
      setSelectedTab(nextTab)
      setActiveSlideIndex(0)
    }
  }, [currentTabSlides.length, activeSlideIndex, selectedTab])

  useEffect(() => {
    if (isPaused || prefersReducedMotion || currentTabSlides.length <= 1) return

    const handleVisibility = () => {
      if (document.hidden && timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      } else if (!document.hidden && !timerRef.current) {
        timerRef.current = setInterval(advanceSlide, AUTO_ROTATE_MS)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    timerRef.current = setInterval(advanceSlide, AUTO_ROTATE_MS)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isPaused, prefersReducedMotion, currentTabSlides.length, advanceSlide])

  const handleTabClick = useCallback((tab: HeroTab) => {
    setSelectedTab(tab)
    setActiveSlideIndex(0)
    setHasDeferredLoaded(true)
  }, [])

  const isLoading =
    (selectedTab === 'movie' && moviesLoading && movieItems.length === 0) ||
    (selectedTab === 'show' && showsLoading && showItems.length === 0) ||
    (selectedTab === 'game' && gamesLoading && gameItems.length === 0)

  if (isLoading) {
    return (
      <div
        className={`w-full px-0 sm:px-6 lg:px-8 -mt-16 sm:mt-2 ${
          className || ''
        }`}
      >
        <div className="relative w-full min-h-[560px] lg:h-[720px] xl:h-[760px] rounded-3xl bg-[var(--dk-surface-raised)] p-6 sm:p-8 lg:p-10 xl:p-12 flex flex-col lg:flex-row gap-8">
          <div className="w-full lg:w-[48%] flex flex-col justify-between">
            <div>
              <Skeleton className="h-9 w-44 rounded-full mb-8" />
              <Skeleton className="h-20 w-3/4 max-w-md mb-6" />
              <Skeleton className="h-4 w-full max-w-lg mb-2" />
              <Skeleton className="h-4 w-2/3 max-w-md mb-8" />
              <div className="flex gap-4">
                <Skeleton className="h-12 w-36 rounded-full" />
                <Skeleton className="h-12 w-36 rounded-full" />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-6 pt-10">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          </div>
          <div className="w-full lg:w-[52%] h-[360px] sm:h-[460px] lg:h-full rounded-3xl">
            <Skeleton className="w-full h-full rounded-3xl" />
          </div>
        </div>
      </div>
    )
  }

  // Media calculations
  const backdropSource = resolveHeroBackdropSource(activeDetail, activeMediaItem)
  const releaseYear = formatReleaseYear(activeDetail?.releaseDate || activeMediaItem?.releaseDate)
  const ratingScore = formatRatingPercent(activeDetail?.avgRating ?? activeMediaItem?.avgRating)
  const isGame = activeMediaItem?.mediaType === 'game'
  const isShow = activeMediaItem?.mediaType === 'show'
  const trailerId = extractTrailerYoutubeId(activeDetail?.youtubeVideoId, activeDetail?.videos)
  const formatLabel = formatMediaFormatLabel(activeMediaItem?.mediaType)
  const audienceMetric = formatAudienceMetric(
    activeDetail?.popularity ?? activeMediaItem?.popularity,
    activeDetail?.ratingCount ?? activeMediaItem?.ratingCount,
    activeDetail?.watchedCount ?? activeMediaItem?.watchedCount,
  )

  return (
    <section
      id="discover-master-hero"
      aria-label="Spotlight Hero"
      className={`relative w-full px-0 sm:px-6 lg:px-8 -mt-16 sm:mt-2 select-none ${
        className || ''
      }`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* ── Main Container: Uniform Fixed Height on Desktop (720px / 760px), Stable Min-Height on Mobile ── */}
      <div className="relative w-full min-h-[560px] lg:h-[720px] xl:h-[760px] flex flex-col lg:flex-row items-stretch gap-6 lg:gap-0">
        {/* ── Left Column: Upper Sculpted Card + Left-Aligned Notched Stats ── */}
        <div className="w-full lg:w-[48%] xl:w-[46%] lg:h-full flex flex-col justify-between relative z-10">
          {/* Upper Left Card Panel */}
          <div className="relative bg-[var(--dk-surface-raised)] rounded-3xl lg:rounded-tl-[2.5rem] lg:rounded-bl-[2.5rem] lg:rounded-tr-none lg:rounded-br-none p-6 sm:p-8 lg:p-10 xl:p-12 lg:h-[590px] xl:h-[630px] flex flex-col justify-between z-10">
            {/* Top Row: Clean Single Capsule Switcher with smoothly gliding active tab pill */}
            <div className="flex items-center justify-between gap-3 h-10">
              <div className="relative inline-flex items-center gap-1 p-1 rounded-full bg-[var(--dk-surface-ghost)] backdrop-blur-md flex-nowrap">
                {HERO_TAB_ITEMS.map((tab) => {
                  const isSelected = selectedTab === tab.id
                  const Icon = tab.id === 'movie' ? Film : tab.id === 'show' ? Tv : Gamepad2

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      aria-label={tab.ariaLabel}
                      onClick={() => handleTabClick(tab.id)}
                      className={`relative flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-colors duration-200 cursor-pointer ${
                        isSelected
                          ? 'text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {isSelected && (
                        <motion.div
                          layoutId="hero-selected-tab-indicator"
                          className="absolute inset-0 rounded-full bg-primary shadow-sm"
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10 flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span>{tab.label}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Content Body: Media Headline */}
            {activeMediaItem ? (
              <div className="flex flex-col justify-center gap-3.5 my-auto">
                {/* Auxiliary Row for Shows */}
                {isShow && (activeDetail?.newSeasonReleased || activeMediaItem.newSeasonReleased) && (
                  <div className="min-h-[20px] flex items-center gap-2">
                    <Badge
                      size="sm"
                      variant="success"
                      className="font-bold text-[10px] uppercase tracking-wider px-2 py-0.5"
                    >
                      {formatSeasonBadgeText(
                        activeDetail?.newSeasonReleaseDate || activeMediaItem.newSeasonReleaseDate,
                      )}
                    </Badge>
                  </div>
                )}

                {/* Massive Title / Logo Display */}
                <div className="w-full max-w-full min-h-[100px] sm:min-h-[130px] lg:min-h-[160px] xl:min-h-[180px] flex items-center overflow-hidden">
                  {activeMediaItem.logoUrl ? (
                    <div className="flex flex-col gap-1 w-full max-w-full overflow-hidden">
                      <span className="sr-only">{activeMediaItem.title}</span>
                      <MediaLogo
                        src={activeMediaItem.logoUrl}
                        alt={activeMediaItem.title}
                        className="h-20 sm:h-28 md:h-36 lg:h-40 xl:h-44 w-auto max-w-full object-contain object-left drop-shadow-2xl"
                        colorGuess={activeMediaItem.logoColorGuess ?? null}
                        background="theme"
                      />
                    </div>
                  ) : (
                    <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-6xl xl:text-7xl font-black text-foreground tracking-tight leading-[1.02] drop-shadow-md line-clamp-2">
                      {activeMediaItem.title}
                    </h1>
                  )}
                </div>

                {/* Overview Synopsis: Clean 2-3 lines */}
                <div className="min-h-[3.6rem] sm:min-h-[4rem] flex items-center">
                  <p className="text-xs sm:text-sm md:text-base text-muted-foreground line-clamp-2 sm:line-clamp-3 leading-relaxed max-w-xl">
                    {activeDetail?.overview ||
                      'Experience thrilling entertainment with detailed community statistics, guides, and seamless tracking on Otix.'}
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {effectiveActivityStatus === 'available' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          quickStream({
                            mediaId: activeMediaItem.id,
                            tmdbId: activeMediaItem.tmdbId,
                            mediaType: activeMediaItem.mediaType,
                            title: activeMediaItem.title,
                          })
                        }}
                        disabled={isStartingStream}
                        className="flex items-center gap-2 px-7 sm:px-8 py-3.5 rounded-full font-bold text-xs sm:text-sm md:text-base bg-primary text-primary-foreground shadow-lg hover:opacity-95 active:scale-[0.98] transition cursor-pointer disabled:opacity-75"
                      >
                        {isStartingStream ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4 fill-current" />
                        )}
                        <span>Stream Now</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>

                      <Link
                        to="/media/$mediaType/$mediaId"
                        params={{ mediaType: activeMediaItem.mediaType, mediaId: activeMediaItem.id }}
                        className="flex items-center gap-2 px-7 sm:px-8 py-3.5 rounded-full font-semibold text-xs sm:text-sm md:text-base bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground transition-colors active:scale-[0.98] cursor-pointer"
                        title="View full media details and cast"
                        aria-label="View Details"
                      >
                        <Info className="h-4 w-4 text-primary" />
                        <span>View Details</span>
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link
                        to="/media/$mediaType/$mediaId"
                        params={{ mediaType: activeMediaItem.mediaType, mediaId: activeMediaItem.id }}
                        className="flex items-center gap-2 px-7 sm:px-8 py-3.5 rounded-full font-bold text-xs sm:text-sm md:text-base bg-primary text-primary-foreground shadow-lg hover:opacity-95 active:scale-[0.98] transition cursor-pointer"
                        title="View full media details and cast"
                        aria-label="View Details"
                      >
                        <span>View Details</span>
                        <ArrowRight className="h-4 w-4" />
                      </Link>

                      {trailerId && (
                        <button
                          type="button"
                          onClick={() => setIsTrailerOpen(true)}
                          className="flex items-center gap-2 px-6 sm:px-7 py-3.5 rounded-full font-semibold text-xs sm:text-sm md:text-base bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground transition-colors active:scale-[0.98] cursor-pointer"
                        >
                          <Play className="h-4 w-4" />
                          <span>Watch Trailer</span>
                        </button>
                      )}
                    </>
                  )}

                  {/* Clean SVG Platform Icons for Games */}
                  {isGame && activeDetail?.platforms && activeDetail.platforms.length > 0 && (
                    <div className="flex items-center gap-2 pl-2">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-[var(--dk-surface-ghost)] backdrop-blur-md">
                        {activeDetail.platforms.slice(0, 4).map((p) => {
                          const Icon = resolvePlatformIcon(p.platform.slug, p.platform.name)
                          return (
                            <span
                              key={p.platform.id}
                              title={p.platform.name}
                              aria-label={p.platform.name}
                              className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {Icon ? (
                                <Icon className="h-4 w-4 fill-current" />
                              ) : (
                                <Gamepad2 className="h-4 w-4" />
                              )}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* ── Desktop Inverted Fillet Curve: Seamlessly connects upper card to right panel ── */}
            <div className="absolute right-0 top-full w-10 h-10 pointer-events-none hidden lg:block z-20">
              <svg width="40" height="40" viewBox="0 0 40 40" className="fill-[var(--dk-surface-raised)]">
                <path d="M 0 0 A 40 40 0 0 1 40 40 L 40 0 Z" />
              </svg>
            </div>
          </div>

          {/* ── Bottom Notched Area: Compact, Left-Aligned Stats Row ── */}
          <div className="mt-auto lg:h-[130px] xl:h-[130px] flex items-center px-6 sm:px-8 lg:px-10 xl:px-12 py-3 overflow-hidden">
            <div className="w-full flex items-center justify-between gap-4 sm:gap-6 lg:gap-8 flex-nowrap overflow-hidden">
              <div className="flex flex-col whitespace-nowrap shrink-0">
                <span className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground tracking-tight whitespace-nowrap">
                  {ratingScore || '88%'}
                </span>
                <span className="text-xs sm:text-sm text-muted-foreground font-medium mt-0.5 whitespace-nowrap">
                  User Rating
                </span>
              </div>

              <div className="flex flex-col whitespace-nowrap shrink-0">
                <span className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground tracking-tight whitespace-nowrap">
                  {releaseYear || '2024'}
                </span>
                <span className="text-xs sm:text-sm text-muted-foreground font-medium mt-0.5 whitespace-nowrap">
                  Release Year
                </span>
              </div>

              <div className="flex flex-col whitespace-nowrap shrink-0">
                <span className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground tracking-tight whitespace-nowrap">
                  {formatLabel}
                </span>
                <span className="text-xs sm:text-sm text-muted-foreground font-medium mt-0.5 whitespace-nowrap">
                  Category
                </span>
              </div>

              <div className="flex flex-col whitespace-nowrap shrink-0">
                <span className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground tracking-tight whitespace-nowrap">
                  {audienceMetric}
                </span>
                <span className="text-xs sm:text-sm text-muted-foreground font-medium mt-0.5 whitespace-nowrap">
                  Community
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right Column: Container Framing the Elevated Feature Showcase or Backdrop ── */}
        <div className="w-full lg:w-[52%] xl:w-[54%] bg-[var(--dk-surface-raised)] rounded-3xl lg:rounded-tl-none lg:rounded-tr-[2.5rem] lg:rounded-br-[2.5rem] lg:rounded-bl-[2.5rem] lg:h-full relative overflow-hidden flex flex-col justify-between p-4 sm:p-6 lg:p-8 xl:p-10 min-h-[380px] sm:min-h-[480px]">
          {/* Elevated Floating Container */}
          <div className="relative w-full h-full rounded-2xl lg:rounded-3xl overflow-hidden shadow-2xl group flex flex-col justify-end p-5 sm:p-6 border border-white/[0.06] bg-[var(--dk-surface-base)]">
            {/* Visual Media Backdrop Artwork */}
            <div className="absolute inset-0 z-0 overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                {backdropSource ? (
                  <motion.img
                    key={backdropSource}
                    src={backdropSource}
                    alt={activeMediaItem?.title}
                    fetchPriority="high"
                    decoding="async"
                    initial={false}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.02 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full h-full object-cover object-center filter brightness-[0.95] dark:brightness-[0.85] scale-100 group-hover:scale-[1.03] transition-transform duration-700 ease-out"
                  />
                ) : null}
              </AnimatePresence>
              {/* Soft cinematic vignette overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--dk-surface-root)]/60 via-transparent to-transparent z-10 pointer-events-none" />
            </div>

            {/* Bottom Bar: Minimal Slide Indicator Dots */}
            <div className="relative z-20 flex items-center justify-end">
              {currentTabSlides.length > 1 && (
                <div className="flex items-center gap-1.5 p-1 rounded-full bg-[var(--dk-surface-glass)] backdrop-blur-xl">
                  {currentTabSlides.map((item, idx) => (
                    <button
                      key={'id' in item ? item.id : `slide-${idx}`}
                      type="button"
                      onClick={() => setActiveSlideIndex(idx)}
                      className={`h-1.5 rounded-full transition-colors cursor-pointer ${
                        idx === safeSlideIndex
                          ? 'w-5 bg-primary'
                          : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60'
                      }`}
                      aria-label={`Go to slide ${idx + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Trailer Video Modal ── */}
      {isTrailerOpen && trailerId && activeMediaItem && (
        <Suspense fallback={null}>
          <TrailerVideoModal
            youtubeId={trailerId}
            title={activeMediaItem.title}
            onClose={() => setIsTrailerOpen(false)}
          />
        </Suspense>
      )}
    </section>
  )
}

export default DiscoverHero
