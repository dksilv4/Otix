import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Film, Tv, Gamepad2, Sparkles, ChevronRight, Star } from 'lucide-react'
import { Badge } from '@ui/atoms/badge'
import { Skeleton } from '@ui/atoms/skeleton'
import { MediaLogo } from '@/lib/media/media-logo'
import { discoverQueries } from '@discover/queries/discover-queries'
import { mediaQueries, type MediaItemSummary } from '@media/queries/media-queries'
import {
  HERO_STAGE_FADE,
  formatRatingPercent,
  formatReleaseYear,
  formatSeasonBadgeText,
  resolvePlatformIcon,
} from '@/features/discover/utils/hero'

const AUTO_ROTATE_MS = 8000

interface DiscoverHeroProps {
  className?: string
}

export const DiscoverHero = ({ className }: DiscoverHeroProps) => {
  const [selectedMediaType, setSelectedMediaType] = useState<'all' | 'movie' | 'show' | 'game'>('all')
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
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
    // 'all': lead with the top game, top movie, and top show to make all media types obvious
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

  const isLoading = (heroLoading || moviesLoading || showsLoading || gamesLoading) && candidateItems.length === 0

  if (isLoading) {
    return (
      <div className={`w-full max-w-none sm:max-w-7xl mx-auto px-0 sm:px-6 lg:px-8 -mt-16 sm:mt-2 ${className || ''}`}>
        <div className="relative w-full h-[100dvh] sm:h-auto min-h-[100dvh] sm:min-h-[560px] md:min-h-[680px] lg:min-h-[760px] rounded-none sm:rounded-3xl bg-[var(--dk-surface-raised)]/30 backdrop-blur-md p-6 sm:p-10 md:p-14 flex flex-col justify-end">
          <Skeleton className="h-6 w-32 rounded-full mb-3" />
          <Skeleton className="h-10 sm:h-14 w-2/3 max-w-lg mb-3" />
          <Skeleton className="h-4 w-full max-w-xl mb-2" />
          <Skeleton className="h-4 w-3/4 max-w-md mb-6" />
          <div className="flex gap-3">
            <Skeleton className="h-10 sm:h-12 w-32 sm:w-36 rounded-2xl" />
            <Skeleton className="h-10 sm:h-12 w-36 sm:w-40 rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  if (!activeItem) return null

  const backdropSource = activeDetail?.backdropUrl || activeItem.backdropUrl || activeItem.textlessPosterUrl || activeItem.posterUrl
  const releaseYear = formatReleaseYear(activeDetail?.releaseDate || activeItem.releaseDate)
  const ratingScore = formatRatingPercent(activeDetail?.avgRating ?? activeItem.avgRating)
  const isGame = activeItem.mediaType === 'game'
  const isShow = activeItem.mediaType === 'show'

  return (
    <section
      id="discover-master-hero"
      aria-label="Spotlight Hero"
      className={`relative w-full max-w-none sm:max-w-7xl mx-auto px-0 sm:px-6 lg:px-8 -mt-16 sm:mt-2 ${className || ''}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="relative w-full h-[100dvh] sm:h-auto min-h-[100dvh] sm:min-h-[560px] md:min-h-[680px] lg:min-h-[760px] xl:min-h-[820px] rounded-none sm:rounded-3xl overflow-hidden bg-[var(--dk-surface-base)] border-0 sm:border sm:border-[var(--dk-separator)] shadow-none sm:shadow-[var(--dk-shadow-dialog)] flex flex-col justify-between">
        {/* Ambient Backdrop Canvas */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <AnimatePresence mode="wait">
            {backdropSource && (
              <motion.img
                key={backdropSource}
                src={backdropSource}
                alt={activeItem.title}
                {...HERO_STAGE_FADE}
                className="w-full h-full object-cover object-center filter brightness-[0.85] dark:brightness-[0.45] scale-105"
              />
            )}
          </AnimatePresence>
          {/* Multi-layer gradient overlays for pristine readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--dk-surface-base)] via-[var(--dk-surface-base)]/55 to-transparent z-10" />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--dk-surface-base)]/90 via-[var(--dk-surface-base)]/35 to-transparent z-10" />
        </div>

        {/* Hero Interactive Surface */}
        <div className="relative z-20 flex flex-col justify-between flex-1 p-5 pt-20 pb-8 sm:p-8 sm:pt-8 sm:pb-10 md:p-12 lg:p-16">
          {/* Top Row: Clean Media Switcher */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-sm">
              <button
                type="button"
                onClick={() => {
                  setSelectedMediaType('all')
                  setActiveMediaId(null)
                }}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  selectedMediaType === 'all'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                All
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedMediaType('movie')
                  if (topMovie) setActiveMediaId(topMovie.id)
                }}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  selectedMediaType === 'movie'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]'
                }`}
              >
                <Film className="h-3.5 w-3.5" />
                Movies
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedMediaType('show')
                  if (topShow) setActiveMediaId(topShow.id)
                }}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  selectedMediaType === 'show'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]'
                }`}
              >
                <Tv className="h-3.5 w-3.5" />
                TV Shows
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedMediaType('game')
                  if (topGame) setActiveMediaId(topGame.id)
                }}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  selectedMediaType === 'game'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]'
                }`}
              >
                <Gamepad2 className="h-3.5 w-3.5" />
                Games
              </button>
            </div>
          </div>

          {/* Focused Content Area */}
          <div className="flex flex-col gap-3.5 sm:gap-4 max-w-2xl mt-auto pt-6">
            {/* Metadata Badges Row */}
            {((isShow && (activeDetail?.newSeasonReleased || activeItem.newSeasonReleased)) ||
              (isGame && activeDetail?.platforms && activeDetail.platforms.length > 0)) && (
              <div className="flex flex-wrap items-center gap-2">
                {isShow && (activeDetail?.newSeasonReleased || activeItem.newSeasonReleased) && (
                  <Badge
                    size="sm"
                    variant="success"
                    className="font-bold text-[10px] uppercase tracking-wider px-2 py-0.5"
                  >
                    {formatSeasonBadgeText(activeDetail?.newSeasonReleaseDate || activeItem.newSeasonReleaseDate)}
                  </Badge>
                )}

                {/* For Games: Platform compatibility icons only */}
                {isGame && activeDetail?.platforms && activeDetail.platforms.length > 0 && (
                  <div className="flex items-center gap-1.5" aria-label="Supported Platforms">
                    {activeDetail.platforms
                      .filter((p) => Boolean(p?.platform))
                      .slice(0, 4)
                      .map((p) => {
                        const Icon = resolvePlatformIcon(p.platform.slug, p.platform.name)
                        return (
                          <span
                            key={p.id}
                            title={p.platform.name}
                            aria-label={p.platform.name}
                            className="inline-flex items-center justify-center h-6 w-6 rounded-lg bg-[var(--dk-surface-ghost)] text-muted-foreground border border-[var(--dk-separator)]"
                          >
                            {Icon ? (
                              <Icon className="h-3.5 w-3.5 fill-current" />
                            ) : (
                              <Gamepad2 className="h-3.5 w-3.5" />
                            )}
                          </span>
                        )
                      })}
                  </div>
                )}
              </div>
            )}

            {/* Title / Logo */}
            <div className="min-h-[48px] sm:min-h-[64px] flex items-center">
              {activeItem.logoUrl ? (
                <MediaLogo
                  src={activeItem.logoUrl}
                  alt={activeItem.title}
                  className="h-14 sm:h-20 md:h-24 lg:h-28 w-auto max-w-[280px] sm:max-w-[400px] md:max-w-[500px] object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.85)]"
                  colorGuess={activeItem.logoColorGuess ?? null}
                  background="theme"
                />
              ) : (
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-foreground tracking-tight leading-tight drop-shadow-md">
                  {activeItem.title}
                </h1>
              )}
            </div>

            {/* Overview Synopsis */}
            <p className="text-xs sm:text-sm md:text-base text-muted-foreground line-clamp-3 leading-relaxed max-w-2xl">
              {activeDetail?.overview || 'Experience thrilling entertainment with detailed community statistics, guides, and seamless tracking on Otix.'}
            </p>

            {/* Action Buttons & Quick Meta */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                to="/media/$mediaType/$mediaId"
                params={{ mediaType: activeItem.mediaType, mediaId: activeItem.id }}
                className="flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-2xl font-bold text-xs sm:text-sm md:text-base bg-primary text-primary-foreground shadow-lg hover:opacity-95 transition-all cursor-pointer"
              >
                View Details
                <ChevronRight className="h-4 w-4" />
              </Link>

              {(ratingScore || releaseYear) && (
                <div className="flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-xl border border-[var(--dk-separator)] text-xs sm:text-sm text-foreground shadow-sm select-none">
                  {ratingScore && (
                    <span className="inline-flex items-center gap-1 font-bold text-primary">
                      <Star className="h-3.5 w-3.5 fill-primary" />
                      {ratingScore}
                    </span>
                  )}
                  {ratingScore && releaseYear && (
                    <span className="text-muted-foreground/30 font-light">·</span>
                  )}
                  {releaseYear && (
                    <span className="font-semibold text-muted-foreground">
                      {releaseYear}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default DiscoverHero
