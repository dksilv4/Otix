import { useState, useMemo, useRef, useEffect } from 'react'
import { useParams, useSearch, Link } from '@tanstack/react-router'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { Film, Tv, Gamepad2, Music } from 'lucide-react'
import { useInView } from 'framer-motion'
import { mediaQueries, type MediaItemSummary } from '@/features/media/media-queries'
import { SORT_OPTIONS } from '@/features/discover/molecules/search-sort-bar'
import { DkDropdown } from '@/features/dk-ui/atoms/dropdown'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'
import { useAuth } from '@/features/auth'
import { MediaCard } from '@/features/ui/molecules/media-card'
import { MediaGrid } from '@/features/ui/molecules/media-grid'
import { Skeleton } from '@ui/atoms/skeleton'

const BROWSE_TYPES = [
  { value: 'movie', label: 'Movies', Icon: Film },
  { value: 'show', label: 'Shows', Icon: Tv },
  { value: 'game', label: 'Games', Icon: Gamepad2 },
  { value: 'music', label: 'Music', Icon: Music },
] as const

const FINANCIAL_SORTS = new Set(['revenue', 'budget', 'profit'])

function formatFinancial(value: number | null | undefined): string {
  if (value == null) return ''
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${value < 0 ? '-' : ''}$${(abs / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `${value < 0 ? '-' : ''}$${Math.round(abs / 1_000_000)}M`
  if (abs >= 1_000) return `${value < 0 ? '-' : ''}$${Math.round(abs / 1_000)}K`
  return `${value < 0 ? '-' : ''}$${abs}`
}

function getFinancialSubtitle(item: MediaItemSummary, sortBy: string): { label: string; color: string } | null {
  if (!FINANCIAL_SORTS.has(sortBy)) return null

  if (sortBy === 'profit') {
    if (item.revenue != null && item.budget != null && item.budget > 0) {
      const profit = item.revenue - item.budget
      const sign = profit >= 0 ? '+' : '-'
      return {
        label: `${sign}${formatFinancial(Math.abs(profit))}`,
        color: profit >= 0 ? '#34d399' : '#f87171',
      }
    }
    return null
  }

  const value = sortBy === 'revenue' ? item.revenue : item.budget
  if (value == null) return null
  return { label: formatFinancial(value), color: '#e2e8f0' }
}

interface GenreOption {
  id: string
  name: string
  slug: string
}

function BrowseSkeleton() {
  return (
    <MediaGrid>
      {Array.from({ length: 24 }).map((_, i) => (
        <Skeleton key={i} className="aspect-[2/3] rounded-2xl" />
      ))}
    </MediaGrid>
  )
}

export function BrowsePage() {
  const params = useParams({ strict: false }) as { type?: string }
  const search = useSearch({ strict: false }) as { genre?: string; language?: string; isAnime?: string; sort?: string; dir?: string; certification?: string }
  const mediaType = params.type || 'movie'
  const { user } = useAuth()
  const countryCode = (user?.country || 'us').toLowerCase()

  const initialGenre = search.genre || ''
  const initialLanguage = search.language || undefined
  const initialIsAnime = search.isAnime === 'true' ? true : search.isAnime === 'false' ? false : undefined
  const initialSort = search.sort || 'popularity'
  const initialSortDir = search.dir || 'desc'
  const initialCertification = search.certification || ''

  const [sortBy, setSortBy] = useState(initialSort)
  const [selectedGenre, setSelectedGenre] = useState(initialGenre)
  const [selectedCertification, setSelectedCertification] = useState(initialCertification)

  // Fetch genres for this media type
  const { data: genres } = useQuery({
    queryKey: ['genres', mediaType],
    queryFn: async () => {
      const { data } = await apiClient.get<GenreOption[]>('/media/genres', {
        params: { media_type: mediaType },
      })
      return data
    },
    staleTime: 1000 * 60 * 30,
  })

  const genreOptions = [
    { value: '', label: 'All Genres' },
    ...(genres ?? []).map((g) => ({ value: g.slug, label: g.name })),
  ]

  // Fetch certifications for this media type + user's country
  const { data: certifications } = useQuery({
    queryKey: ['certifications', mediaType, countryCode],
    queryFn: async () => {
      const { data } = await apiClient.get<string[]>('/media/certifications', {
        params: { media_type: mediaType, country_code: countryCode },
      })
      return data
    },
    staleTime: 1000 * 60 * 30,
  })

  const certificationOptions = [
    { value: '', label: 'All Ratings' },
    ...(certifications ?? []).map((c) => ({ value: c, label: c })),
  ]

  // Fetch media — infinite scroll
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    ...mediaQueries.infiniteList({
      type: mediaType,
      genre: selectedGenre || undefined,
      certification: selectedCertification || undefined,
      language: initialLanguage,
      isAnime: initialIsAnime,
      hasArtwork: !initialLanguage && initialIsAnime == null && !selectedCertification,
      sortBy,
      sortDir: initialSortDir,
      limit: 48,
    }),
  })

  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data])
  const total = data?.pages[0]?.total ?? 0

  // Sentinel for infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null)
  const isSentinelInView = useInView(sentinelRef, { margin: '0px 0px 400px 0px' })

  useEffect(() => {
    if (isSentinelInView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [isSentinelInView, hasNextPage, isFetchingNextPage, fetchNextPage])

  const handleSortChange = (value: string) => {
    setSortBy(value)
  }

  const handleGenreChange = (value: string) => {
    setSelectedGenre(value)
  }

  const handleCertificationChange = (value: string) => {
    setSelectedCertification(value)
  }

  const typeLabel = BROWSE_TYPES.find((t) => t.value === mediaType)?.label ?? 'Movies'

  const browseSortOptions = useMemo(
    () =>
      SORT_OPTIONS.filter((o) => {
        if (o.value === '') return false
        // Financial sorts only apply to movies
        if (FINANCIAL_SORTS.has(o.value) && mediaType !== 'movie') return false
        return true
      }),
    [mediaType],
  )

  return (
    <div className="pb-16">
      <Helmet>
        <title>{`Browse ${typeLabel} - Otix`}</title>
      </Helmet>

      {/* Header */}
      <div className="mb-8 space-y-6">
        {/* Type tabs */}
        <div className="flex items-center gap-2">
          {BROWSE_TYPES.map(({ value, label, Icon }) => (
            <Link
              key={value}
              to={`/browse/$type`}
              params={{ type: value }}
              className={cn(
                'inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all duration-200',
                mediaType === value
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                  : 'bg-[var(--dk-surface-glass)] text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass-hover)]',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </div>

        {/* Filters bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DkDropdown
              variant="filter"
              label="Sort"
              options={browseSortOptions}
              value={sortBy}
              onChange={handleSortChange}
            />
            {genres && genres.length > 0 && (
              <DkDropdown
                variant="filter"
                label="Genre"
                options={genreOptions}
                value={selectedGenre}
                onChange={handleGenreChange}
              />
            )}
            {certifications && certifications.length > 0 && (
              <DkDropdown
                variant="filter"
                label="Rating"
                options={certificationOptions}
                value={selectedCertification}
                onChange={handleCertificationChange}
              />
            )}
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {total.toLocaleString()} {typeLabel.toLowerCase()}
          </span>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <BrowseSkeleton />
      ) : items.length === 0 ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-sm text-muted-foreground">
            No {typeLabel.toLowerCase()} found{selectedGenre ? ' for this genre' : ''}.
          </p>
        </div>
      ) : (
        <>
          <MediaGrid>
            {items.map((item: MediaItemSummary) => {
              const finSub = getFinancialSubtitle(item, sortBy)
              return (
                <MediaCard
                  key={item.id}
                  id={item.id}
                  mediaType={item.mediaType as 'movie' | 'show' | 'game' | 'music'}
                  title={item.title}
                  posterUrl={item.posterUrl}
                  textlessPosterUrl={item.textlessPosterUrl}
                  logoUrl={item.logoUrl}
                  releaseDate={item.releaseDate}
                  avgRating={item.avgRating}
                  isAdult={item.isAdult}
                  subtitle={finSub?.label}
                  subtitleColor={finSub?.color}
                />
              )
            })}

            {/* Pre-fetch skeletons — 12 items = ~2–3 rows, trigger next page when visible */}
            {(hasNextPage || isFetchingNextPage) &&
              Array.from({ length: 12 }).map((_, i) => (
                <div key={`prefetch-${i}`} ref={i === 0 ? sentinelRef : undefined}>
                  <Skeleton className="aspect-[2/3] rounded-2xl w-full h-full" />
                </div>
              ))}
          </MediaGrid>

          {/* End-of-list marker */}
          {!hasNextPage && items.length > 0 && (
            <div className="flex items-center justify-center py-10">
              <p className="text-xs text-muted-foreground">
                All {total.toLocaleString()} {typeLabel.toLowerCase()} loaded
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
