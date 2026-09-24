import { useMemo, useRef, useEffect } from 'react'
import { useParams, useSearch, useNavigate, Link } from '@tanstack/react-router'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { ArrowLeft, Film, Tv, Gamepad2, Music, Loader2, RotateCcw } from 'lucide-react'
import { motion, useInView } from 'framer-motion'
import { mediaQueries, type MediaItemSummary } from '@media/queries/media-queries'
import { DkDropdown, type DkDropdownOption } from '@ui/atoms/dropdown'
import { MediaGrid } from '@ui/molecules/media-grid'
import { Skeleton } from '@ui/atoms/skeleton'
import { DiscoverMediaCard } from '@discover/components/molecules/discover-media-card'
import { apiClient } from '@/lib/api/client'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { cn } from '@/lib/utils'
import type { GenreOption, GenreSearchParams } from '../types'

const MEDIA_TYPES = [
  { value: 'movie', label: 'Movies', icon: Film },
  { value: 'show', label: 'Shows', icon: Tv },
  { value: 'game', label: 'Games', icon: Gamepad2 },
  { value: 'music', label: 'Music', icon: Music },
] as const

const SORT_OPTIONS: readonly DkDropdownOption[] = [
  { value: 'popularity', label: 'Most Popular' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'release_date', label: 'Release Date' },
  { value: 'title', label: 'Title (A–Z)' },
]

function formatTitleCase(str: string): string {
  return str
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function GenrePage() {
  const params = useParams({ strict: false }) as { genreId?: string }
  const search = useSearch({ strict: false }) as GenreSearchParams
  const navigate = useNavigate()
  const { user } = useAuth()
  const countryCode = ((user as { country?: string })?.country || 'us').toLowerCase()

  const rawGenreId = params.genreId || 'action'
  const mediaType = search.type || 'movie'
  const activeSort = search.sort || 'popularity'
  const activeDir = search.dir || (activeSort === 'title' ? 'asc' : 'desc')

  // Fetch genres for this media type
  const { data: genres = [], isLoading: isLoadingGenres } = useQuery<GenreOption[]>({
    queryKey: ['genres', mediaType],
    queryFn: async () => {
      const { data } = await apiClient.get<GenreOption[]>('/media/genres', {
        params: { media_type: mediaType },
      })
      return data
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  })

  // Match the active genre from the list or format fallback
  const matchedGenre = useMemo(() => {
    const target = rawGenreId.toLowerCase().trim()
    return genres.find(
      (g) => g.slug.toLowerCase() === target || String(g.id) === target,
    )
  }, [genres, rawGenreId])

  const genreName = matchedGenre?.name || formatTitleCase(rawGenreId)
  const currentGenreSlug = matchedGenre?.slug || rawGenreId

  // Fetch certifications for this media type + user's country
  const { data: certifications = [] } = useQuery<string[]>({
    queryKey: ['certifications', mediaType, countryCode],
    queryFn: async () => {
      const { data } = await apiClient.get<string[]>('/media/certifications', {
        params: { media_type: mediaType, country_code: countryCode },
      })
      return data
    },
    staleTime: 1000 * 60 * 60,
  })

  const certificationOptions: readonly DkDropdownOption[] = useMemo(() => [
    { value: '', label: 'All Ratings' },
    ...certifications.map((c) => ({ value: c, label: c })),
  ], [certifications])

  // Fetch media items with infinite scroll
  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    ...mediaQueries.infiniteList({
      type: mediaType,
      genre: currentGenreSlug,
      sortBy: activeSort,
      sortDir: activeDir,
      certification: search.certification || undefined,
      language: search.language,
      isAnime: search.isAnime,
      limit: 48,
    }),
  })

  const items = useMemo(() => {
    const pages = data?.pages ?? []
    return pages.flatMap((p) => {
      const pageItems = (p as { items?: unknown } | undefined)?.items
      return Array.isArray(pageItems) ? (pageItems as MediaItemSummary[]) : []
    })
  }, [data])

  const total = data?.pages?.[0]?.total ?? items.length

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null)
  const isSentinelInView = useInView(sentinelRef, { margin: '600px 0px 600px 0px' })

  useEffect(() => {
    if (isSentinelInView && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage()
    }
  }, [isSentinelInView, hasNextPage, isFetchingNextPage, fetchNextPage])

  const typeConfig = MEDIA_TYPES.find((t) => t.value === mediaType) ?? MEDIA_TYPES[0]
  const pageTitle = `${genreName} ${typeConfig.label}`

  const updateSearch = (updates: Partial<GenreSearchParams>) => {
    navigate({
      to: '/genre/$genreId',
      params: { genreId: rawGenreId },
      search: { ...search, ...updates },
      replace: true,
    })
  }

  const handleMediaTypeChange = (newType: 'movie' | 'show' | 'game' | 'music') => {
    navigate({
      to: '/genre/$genreId',
      params: { genreId: rawGenreId },
      search: { ...search, type: newType, certification: undefined },
      replace: true,
    })
  }

  const handleGenreSelect = (newGenreSlug: string) => {
    navigate({
      to: '/genre/$genreId',
      params: { genreId: newGenreSlug },
      search,
    })
  }

  const handleSortChange = (value: string) => {
    const dir = value === 'title' ? 'asc' : 'desc'
    updateSearch({ sort: value, dir })
  }

  const handleCertificationChange = (value: string) => {
    updateSearch({ certification: value || undefined })
  }

  const hasActiveFilters = Boolean(search.certification || search.language || search.sort)

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <Helmet>
        <title>{pageTitle} — Otix</title>
        <meta
          name="description"
          content={`Browse ${genreName} ${typeConfig.label.toLowerCase()} on Otix.`}
        />
      </Helmet>

      {/* ── Breadcrumb & Page Header ── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-full"
            style={{ background: 'var(--dk-surface-ghost-hover)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Discover
          </Link>
          <span className="text-white/20">/</span>
          <Link
            to="/genres"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-full"
            style={{ background: 'var(--dk-surface-ghost-hover)' }}
          >
            All Genres
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/[0.08] pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                Genre
              </span>
              <span className="text-white/30">•</span>
              <span className="text-xs text-muted-foreground capitalize">
                {typeConfig.label}
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              {pageTitle}
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Explore the continuous feed of {genreName.toLowerCase()}{' '}
              {typeConfig.label.toLowerCase()} in your catalog.
            </p>
          </div>

          {items.length > 0 && (
            <div className="shrink-0 text-left sm:text-right">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-muted-foreground bg-white/[0.04] border border-white/[0.06]">
                {total.toLocaleString()} {typeConfig.label.toLowerCase()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Media Type Switcher Tabs ── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {MEDIA_TYPES.map(({ value, label, icon: Icon }) => {
          const isActive = mediaType === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => handleMediaTypeChange(value)}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all shrink-0',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'glass-card text-muted-foreground hover:text-white hover:bg-white/[0.08]',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          )
        })}
      </div>

      {/* ── Horizontal Genre Pill Bar ── */}
      <div className="relative">
        <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none">
          <Link
            to="/genres"
            className="glass-inset px-3.5 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-white hover:bg-white/[0.08] transition-all shrink-0 inline-flex items-center gap-1.5 border border-white/[0.06]"
          >
            All Categories →
          </Link>
          {isLoadingGenres
            ? Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-24 rounded-full shrink-0" />
              ))
            : genres.map((g) => {
                const isSelected =
                  g.slug.toLowerCase() === rawGenreId.toLowerCase() ||
                  String(g.id) === rawGenreId
                return (
                  <button
                    key={g.slug}
                    type="button"
                    onClick={() => handleGenreSelect(g.slug)}
                    className={cn(
                      'relative inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer',
                      isSelected
                        ? 'bg-white/20 text-white font-semibold shadow-inner border border-white/25'
                        : 'glass-inset text-muted-foreground hover:text-white hover:bg-white/[0.08]',
                    )}
                  >
                    {isSelected && (
                      <motion.div
                        layoutId="activeGenrePill"
                        className="absolute inset-0 rounded-full bg-white/10"
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      />
                    )}
                    <span className="relative z-10">{g.name}</span>
                  </button>
                )
              })}
        </div>
      </div>

      {/* ── Filters and Sort Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
        <div className="flex flex-wrap items-center gap-3">
          <DkDropdown
            variant="filter"
            label="Sort"
            options={SORT_OPTIONS}
            value={activeSort}
            onChange={handleSortChange}
          />

          {certifications.length > 0 && (
            <DkDropdown
              variant="filter"
              label="Rating"
              options={certificationOptions}
              value={search.certification || ''}
              onChange={handleCertificationChange}
            />
          )}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => updateSearch({ sort: undefined, dir: undefined, certification: undefined })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors border border-white/[0.08] hover:bg-white/[0.06]"
            >
              <RotateCcw className="h-3 w-3" />
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* ── Media Grid / States ── */}
      {isLoading ? (
        <MediaGrid>
          {Array.from({ length: 18 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] rounded-xl" />
          ))}
        </MediaGrid>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-20 text-center glass-card rounded-2xl border border-white/[0.06]">
          <p className="text-base font-semibold text-white">Failed to load {genreName} titles</p>
          <p className="mt-1 text-xs text-muted-foreground">
            There was an error communicating with the catalog service.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 px-4 py-2 rounded-full text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Try Again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center glass-card rounded-2xl border border-white/[0.06]">
          <p className="text-base font-semibold text-white">
            No {typeConfig.label.toLowerCase()} found in {genreName}
          </p>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm">
            We couldn't find any {typeConfig.label.toLowerCase()} matching your current filters.
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => updateSearch({ certification: undefined, sort: undefined })}
              className="mt-4 px-4 py-2 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/15 text-white transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          <MediaGrid>
            {items.map((item) => (
              <DiscoverMediaCard key={item.id} item={item} />
            ))}
          </MediaGrid>

          {/* Infinite Scroll Sentinel / Loading More */}
          <div ref={sentinelRef} className="h-16 flex items-center justify-center">
            {isFetchingNextPage ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Loading more titles...</span>
              </div>
            ) : hasNextPage ? (
              <button
                type="button"
                onClick={() => void fetchNextPage()}
                className="px-5 py-2.5 rounded-full text-xs font-semibold text-muted-foreground hover:text-foreground transition-all hover:bg-white/[0.08]"
                style={{ background: 'var(--dk-surface-ghost-hover)' }}
              >
                Load More
              </button>
            ) : items.length > 0 ? (
              <p className="text-xs text-muted-foreground/60 py-4 font-medium">
                All {total.toLocaleString()} {typeConfig.label.toLowerCase()} loaded
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
