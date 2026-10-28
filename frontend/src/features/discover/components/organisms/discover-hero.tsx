import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import {
  Film,
  Tv,
  Gamepad2,
  Sparkles,
  ArrowRight,
  Play,
  Loader2,
  Info,
  Download,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@ui/atoms/badge'
import { Skeleton } from '@ui/atoms/skeleton'
import { MediaLogo } from '@/lib/media/media-logo'
import { isDesktop } from '@/lib/desktop'
import { useModal } from '@/lib/modals/modal-context'
import { useStreamAvailability } from '@/features/media/hooks/use-stream-availability'
import { useQuickStream } from '@/features/media/hooks/use-quick-stream'
import { useMediaActivity } from '@/features/media/hooks/use-media-activity'
import { MediaActivityModal } from '@/features/media/components/organisms/media-activity-modal'
import { discoverQueries } from '@discover/queries/discover-queries'
import { mediaQueries, type MediaItemSummary } from '@media/queries/media-queries'
import { TrailerVideoModal } from '@discover/components/molecules/trailer-video-modal'
import {
  HERO_STAGE_FADE,
  formatRatingPercent,
  formatReleaseYear,
  formatSeasonBadgeText,
  resolvePlatformIcon,
  formatMediaFormatLabel,
  formatAudienceMetric,
  extractTrailerYoutubeId,
} from '@/features/discover/utils/hero'

const AUTO_ROTATE_MS = 8000

interface DiscoverHeroProps {
  className?: string
}

export const DiscoverHero = ({ className }: DiscoverHeroProps) => {
  const [selectedMediaType, setSelectedMediaType] = useState<'all' | 'movie' | 'show' | 'game'>('all')
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [isTrailerOpen, setIsTrailerOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch priority items across categories so we always have top-tier Movie, Show, and Game representations
  const { data: heroData, isLoading: heroLoading } = useInfiniteQuery(discoverQueries.hero())
  const { data: moviesData, isLoading: moviesLoading } = useInfiniteQuery(
    discoverQueries.list('movie', 'trending'),
  )
  const { data: showsData, isLoading: showsLoading } = useInfiniteQuery(
    discoverQueries.list('show', 'trending'),
  )
  const { data: gamesData, isLoading: gamesLoading } = useInfiniteQuery(
    discoverQueries.list('game', 'now_playing'),
  )

  const topMovie = useMemo<MediaItemSummary | null>(() => {
    const page = moviesData?.pages?.[0]
    return (page?.items?.[0] as MediaItemSummary) ?? null
  }, [moviesData])

  const topShow = useMemo<MediaItemSummary | null>(() => {
    const page = showsData?.pages?.[0]
    return (page?.items?.[0] as MediaItemSummary) ?? null
  }, [showsData])

  const topGame = useMemo<MediaItemSummary | null>(() => {
    const page = gamesData?.pages?.[0]
    return (page?.items?.[0] as MediaItemSummary) ?? null
  }, [gamesData])

  // General catalog hero items
  const catalogHeroItems = useMemo<MediaItemSummary[]>(() => {
    const pages = heroData?.pages ?? []
    return pages.flatMap((p) => (Array.isArray(p?.items) ? p.items : []))
  }, [heroData])

  // Active items pool based on tab selection
  const candidateItems = useMemo<MediaItemSummary[]>(() => {
    if (selectedMediaType === 'movie') {
      const page = moviesData?.pages?.[0]
      return (page?.items as MediaItemSummary[]) ?? []
    }
    if (selectedMediaType === 'show') {
      const page = showsData?.pages?.[0]
      return (page?.items as MediaItemSummary[]) ?? []
    }
    if (selectedMediaType === 'game') {
      const page = gamesData?.pages?.[0]
      return (page?.items as MediaItemSummary[]) ?? []
    }
    // 'all': lead with the top movie, top show, and top game to make all media types obvious
    const primaryPicks = [topMovie, topShow, topGame].filter(
      (item): item is MediaItemSummary => item !== null,
    )
    const combined = [...primaryPicks]
    for (const item of catalogHeroItems) {
      if (!combined.some((c) => c.id === item.id)) {
        combined.push(item)
      }
    }
    return combined
  }, [selectedMediaType, moviesData, showsData, gamesData, topMovie, topShow, topGame, catalogHeroItems])

  // Currently active featured item
  const activeItem = useMemo<MediaItemSummary | null>(() => {
    if (candidateItems.length === 0) return null
    if (activeMediaId) {
      const found = candidateItems.find((i) => i.id === activeMediaId)
      if (found) return found
    }
    return candidateItems[0] ?? null
  }, [candidateItems, activeMediaId])

  // Fetch detail for active item (for platforms, overview, etc.)
  const { data: activeDetail } = useQuery({
    ...mediaQueries.detail(activeItem?.mediaType ?? '', activeItem?.id ?? ''),
    enabled: !!activeItem,
  })

  const { openModal } = useModal()
  const { isStreamable, providerLabel } = useStreamAvailability({
    mediaId: activeItem?.id ?? '',
    tmdbId: activeItem?.tmdbId,
    mediaType: activeItem?.mediaType ?? 'movie',
  })
  const nodeActivity = useMediaActivity(
    activeItem?.mediaType,
    activeItem?.tmdbId,
    activeItem?.id,
  )
  const effectiveActivityStatus = nodeActivity?.status || (isStreamable ? 'available' : undefined)
  const { quickStream, isStartingStream } = useQuickStream()

  // Auto rotation
  const advanceSlide = useCallback(() => {
    if (candidateItems.length <= 1) return
    const currentIndex = activeItem
      ? candidateItems.findIndex((i) => i.id === activeItem.id)
      : -1
    const nextIndex = (currentIndex + 1) % candidateItems.length
    const next = candidateItems[nextIndex]
    if (next) setActiveMediaId(next.id)
  }, [candidateItems, activeItem])

  useEffect(() => {
    if (isPaused || candidateItems.length <= 1) return
    timerRef.current = setInterval(advanceSlide, AUTO_ROTATE_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isPaused, candidateItems.length, advanceSlide])

  const isLoading =
    (heroLoading || moviesLoading || showsLoading || gamesLoading) && candidateItems.length === 0

  if (isLoading) {
    return (
      <div
        className={`w-full max-w-none sm:max-w-7xl mx-auto px-0 sm:px-6 lg:px-8 -mt-16 sm:mt-2 ${
          className || ''
        }`}
      >
        <div className="relative w-full lg:h-[720px] xl:h-[760px] rounded-3xl bg-[var(--dk-surface-raised)] p-6 sm:p-8 lg:p-10 xl:p-12 flex flex-col lg:flex-row gap-8">
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

  if (!activeItem) return null

  const backdropSource =
    activeDetail?.backdropUrl ||
    activeItem.backdropUrl ||
    activeItem.textlessPosterUrl ||
    activeItem.posterUrl
  const releaseYear = formatReleaseYear(activeDetail?.releaseDate || activeItem.releaseDate)
  const ratingScore = formatRatingPercent(activeDetail?.avgRating ?? activeItem.avgRating)
  const isGame = activeItem.mediaType === 'game'
  const isShow = activeItem.mediaType === 'show'
  const trailerId = extractTrailerYoutubeId(activeDetail?.youtubeVideoId, activeDetail?.videos)
  const formatLabel = formatMediaFormatLabel(activeItem.mediaType)
  const audienceMetric = formatAudienceMetric(
    activeDetail?.popularity ?? activeItem.popularity,
    activeDetail?.ratingCount ?? activeItem.ratingCount,
    activeDetail?.watchedCount ?? activeItem.watchedCount,
  )

  const activeIndex = candidateItems.findIndex((i) => i.id === activeItem.id)

  return (
    <section
      id="discover-master-hero"
      aria-label="Spotlight Hero"
      className={`relative w-full max-w-none sm:max-w-7xl mx-auto px-0 sm:px-6 lg:px-8 -mt-16 sm:mt-2 select-none ${
        className || ''
      }`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* ── Main Container: Uniform Fixed Height on Desktop (720px / 760px), Stable Min-Height on Mobile ── */}
      <div className="relative w-full lg:h-[720px] xl:h-[760px] flex flex-col lg:flex-row items-stretch gap-6 lg:gap-0">
        {/* ── Left Column: Upper Sculpted Card + Left-Aligned Notched Stats ── */}
        <div className="w-full lg:w-[48%] xl:w-[46%] lg:h-full flex flex-col justify-between relative z-10">
          {/* Upper Left Card Panel */}
          <div className="relative bg-[var(--dk-surface-raised)] rounded-3xl lg:rounded-tl-[2.5rem] lg:rounded-bl-[2.5rem] lg:rounded-tr-none lg:rounded-br-none p-6 sm:p-8 lg:p-10 xl:p-12 lg:h-[590px] xl:h-[630px] flex flex-col justify-between z-10">
            {/* Top Row: Clean Single Capsule Switcher with Shows and No Text Wrap */}
            <div className="flex items-center justify-between gap-3 h-10">
              <div className="inline-flex items-center gap-1 p-1 rounded-full bg-[var(--dk-surface-ghost)] backdrop-blur-md flex-nowrap">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMediaType('all')
                    setActiveMediaId(null)
                  }}
                  className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    selectedMediaType === 'all'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  <span>All</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedMediaType('movie')
                    if (topMovie) setActiveMediaId(topMovie.id)
                  }}
                  className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    selectedMediaType === 'movie'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]'
                  }`}
                >
                  <Film className="h-3.5 w-3.5 shrink-0" />
                  <span>Movies</span>
                </button>

                <button
                  type="button"
                  aria-label="TV Shows"
                  onClick={() => {
                    setSelectedMediaType('show')
                    if (topShow) setActiveMediaId(topShow.id)
                  }}
                  className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    selectedMediaType === 'show'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]'
                  }`}
                >
                  <Tv className="h-3.5 w-3.5 shrink-0" />
                  <span>Shows</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedMediaType('game')
                    if (topGame) setActiveMediaId(topGame.id)
                  }}
                  className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    selectedMediaType === 'game'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]'
                  }`}
                >
                  <Gamepad2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Games</span>
                </button>
              </div>

              {/* Activity Status Indicator */}
              {effectiveActivityStatus && (
                <button
                  type="button"
                  onClick={() => {
                    if (nodeActivity) {
                      openModal(
                        <MediaActivityModal
                          activity={nodeActivity}
                          mediaId={activeItem.id}
                          initialPosterUrl={activeItem.posterUrl}
                        />,
                      )
                    } else if (isStreamable) {
                      openModal(
                        <MediaActivityModal
                          activity={{
                            status: 'available',
                            mediaType: (activeItem.mediaType as 'movie' | 'show') || 'movie',
                            tmdbId: activeItem.tmdbId,
                            title: activeItem.title,
                            nodeName: providerLabel || 'Stream',
                            isOwned: true,
                            canManage: false,
                            owner: { id: 0, username: 'Local' },
                          }}
                          mediaId={activeItem.id}
                          initialPosterUrl={activeItem.posterUrl}
                        />,
                      )
                    }
                  }}
                  className={cn(
                    'hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold backdrop-blur-md whitespace-nowrap transition-transform hover:scale-105 active:scale-95 cursor-pointer border border-white/[0.04]',
                    effectiveActivityStatus === 'available' && 'bg-primary/10 text-primary',
                    effectiveActivityStatus === 'processing' && 'bg-sky-500/10 text-sky-400',
                    effectiveActivityStatus === 'requested' && 'bg-amber-500/10 text-amber-400',
                  )}
                >
                  {effectiveActivityStatus === 'available' && (
                    <Play className="h-2.5 w-2.5 fill-current shrink-0" />
                  )}
                  {effectiveActivityStatus === 'processing' && (
                    <Loader2 className="h-2.5 w-2.5 animate-spin shrink-0" />
                  )}
                  {effectiveActivityStatus === 'requested' && (
                    <Clock className="h-2.5 w-2.5 shrink-0" />
                  )}
                  <span>
                    {effectiveActivityStatus === 'processing'
                      ? `Downloading${nodeActivity?.progress != null ? ` (${nodeActivity.progress.toFixed(0)}%)` : ''}${nodeActivity?.nodeName ? ` · ${nodeActivity.nodeName}` : ''}`
                      : effectiveActivityStatus === 'requested'
                        ? `Requested${nodeActivity?.nodeName ? ` · ${nodeActivity.nodeName}` : ''}`
                        : `Ready to Stream${nodeActivity?.nodeName ? ` · ${nodeActivity.nodeName}` : providerLabel ? ` · ${providerLabel}` : ''}`}
                  </span>
                </button>
              )}
            </div>

            {/* Content Body: Auxiliary Row, Massive Headline / Logo, Clean Synopsis */}
            <div className="flex flex-col justify-center gap-3.5 my-auto">
              {/* Auxiliary Row for Shows */}
              {isShow && (activeDetail?.newSeasonReleased || activeItem.newSeasonReleased) && (
                <div className="min-h-[20px] flex items-center gap-2">
                  <Badge
                    size="sm"
                    variant="success"
                    className="font-bold text-[10px] uppercase tracking-wider px-2 py-0.5"
                  >
                    {formatSeasonBadgeText(
                      activeDetail?.newSeasonReleaseDate || activeItem.newSeasonReleaseDate,
                    )}
                  </Badge>
                </div>
              )}

              {/* Massive Title / Logo Display */}
              <div className="w-full max-w-full min-h-[100px] sm:min-h-[130px] lg:min-h-[160px] xl:min-h-[180px] flex items-center overflow-hidden">
                {activeItem.logoUrl ? (
                  <div className="flex flex-col gap-1 w-full max-w-full overflow-hidden">
                    <span className="sr-only">{activeItem.title}</span>
                    <MediaLogo
                      src={activeItem.logoUrl}
                      alt={activeItem.title}
                      className="h-20 sm:h-28 md:h-36 lg:h-40 xl:h-44 w-auto max-w-full object-contain object-left drop-shadow-[0_12px_28px_rgba(0,0,0,0.75)]"
                      colorGuess={activeItem.logoColorGuess ?? null}
                      background="theme"
                    />
                  </div>
                ) : (
                  <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-6xl xl:text-7xl font-black text-foreground tracking-tight leading-[1.02] drop-shadow-md line-clamp-2">
                    {activeItem.title}
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

              {/* Perfectly Balanced Pill Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {effectiveActivityStatus === 'available' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        quickStream({
                          mediaId: activeItem.id,
                          tmdbId: activeItem.tmdbId,
                          mediaType: activeItem.mediaType,
                          title: activeItem.title,
                        })
                      }}
                      disabled={isStartingStream}
                      className="flex items-center gap-2 px-7 sm:px-8 py-3.5 rounded-full font-bold text-xs sm:text-sm md:text-base bg-primary text-primary-foreground shadow-lg hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-75"
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
                      params={{ mediaType: activeItem.mediaType, mediaId: activeItem.id }}
                      className="flex items-center gap-2 px-7 sm:px-8 py-3.5 rounded-full font-semibold text-xs sm:text-sm md:text-base bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground transition-all active:scale-[0.98] cursor-pointer"
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
                      params={{ mediaType: activeItem.mediaType, mediaId: activeItem.id }}
                      className="flex items-center gap-2 px-7 sm:px-8 py-3.5 rounded-full font-bold text-xs sm:text-sm md:text-base bg-primary text-primary-foreground shadow-lg hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
                      title="View full media details and cast"
                      aria-label="View Details"
                    >
                      <span>View Details</span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>

                    {trailerId ? (
                      <button
                        type="button"
                        onClick={() => setIsTrailerOpen(true)}
                        className="flex items-center gap-2 px-7 sm:px-8 py-3.5 rounded-full font-semibold text-xs sm:text-sm md:text-base bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground transition-all active:scale-[0.98] cursor-pointer"
                        title="Watch official trailer"
                      >
                        <Play className="h-4 w-4 fill-current text-primary" />
                        <span>Watch Trailer</span>
                      </button>
                    ) : !isDesktop() ? (
                      <Link
                        to="/download"
                        className="flex items-center gap-2 px-7 sm:px-8 py-3.5 rounded-full font-semibold text-xs sm:text-sm md:text-base bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground transition-all active:scale-[0.98] cursor-pointer"
                        title="Download the native Otix app"
                      >
                        <Download className="h-4 w-4 text-primary shrink-0" />
                        <span>Get App</span>
                      </Link>
                    ) : null}
                  </>
                )}
              </div>

              {/* For Games: Platform compatibility icons placed under the action buttons with NO background */}
              {isGame && activeDetail?.platforms && activeDetail.platforms.length > 0 && (
                <div className="flex items-center gap-2.5 pt-2" aria-label="Supported Platforms">
                  <span className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider">
                    Available on
                  </span>
                  <div className="flex items-center gap-2">
                    {activeDetail.platforms
                      .filter((p) => Boolean(p?.platform))
                      .slice(0, 5)
                      .map((p) => {
                        const Icon = resolvePlatformIcon(p.platform.slug, p.platform.name)
                        return (
                          <span
                            key={p.id}
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

            {/* ── Desktop Inverted Fillet Curve: Seamlessly connects upper card to right panel ── */}
            <div className="absolute right-0 top-full w-10 h-10 pointer-events-none hidden lg:block z-20">
              <svg width="40" height="40" viewBox="0 0 40 40" className="fill-[var(--dk-surface-raised)]">
                <path d="M 0 0 A 40 40 0 0 1 40 40 L 40 0 Z" />
              </svg>
            </div>
          </div>

          {/* ── Bottom Notched Area: Compact, Left-Aligned Stats Row (No Text Wrap) ── */}
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

        {/* ── Right Column: Container Framing the Elevated Backdrop Showcase ── */}
        <div className="w-full lg:w-[52%] xl:w-[54%] bg-[var(--dk-surface-raised)] rounded-3xl lg:rounded-tl-none lg:rounded-tr-[2.5rem] lg:rounded-br-[2.5rem] lg:rounded-bl-[2.5rem] lg:h-full relative overflow-hidden flex flex-col justify-between p-4 sm:p-6 lg:p-8 xl:p-10 min-h-[380px] sm:min-h-[480px]">
          {/* Ambient Lighting Glow */}
          <div className="absolute inset-0 bg-radial from-primary/10 via-transparent to-transparent pointer-events-none opacity-50" />

          {/* Elevated Floating Backdrop Showcase Container */}
          <div className="relative w-full h-full rounded-2xl lg:rounded-3xl overflow-hidden shadow-2xl group flex flex-col justify-end p-5 sm:p-6 border border-white/[0.06] bg-[var(--dk-surface-base)]">
            {/* Backdrop Artwork */}
            <div className="absolute inset-0 z-0 overflow-hidden">
              <AnimatePresence mode="wait">
                {backdropSource && (
                  <motion.img
                    key={backdropSource}
                    src={backdropSource}
                    alt={activeItem.title}
                    {...HERO_STAGE_FADE}
                    className="w-full h-full object-cover object-center filter brightness-[0.95] dark:brightness-[0.85] scale-100 group-hover:scale-[1.03] transition-transform duration-700 ease-out"
                  />
                )}
              </AnimatePresence>
              {/* Soft cinematic vignette overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--dk-surface-root)]/60 via-transparent to-transparent z-10" />
            </div>

            {/* Bottom Bar: Minimal Slide Indicator Dots */}
            <div className="relative z-20 flex items-center justify-end">
              {candidateItems.length > 1 && (
                <div className="flex items-center gap-1.5 p-1 rounded-full bg-[var(--dk-surface-glass)] backdrop-blur-xl">
                  {candidateItems.slice(0, 7).map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveMediaId(item.id)}
                      className={`h-1.5 rounded-full transition-all cursor-pointer ${
                        idx === activeIndex
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
      {isTrailerOpen && trailerId && (
        <TrailerVideoModal
          youtubeId={trailerId}
          title={activeItem.title}
          onClose={() => setIsTrailerOpen(false)}
        />
      )}
    </section>
  )
}

export default DiscoverHero
