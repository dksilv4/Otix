// TODO: Review this file
import './browse-page.scss'
import { useMemo, useRef, useEffect } from 'react'
import { useParams, useSearch, useNavigate, Link } from '@tanstack/react-router'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { Film, Tv, Gamepad2, Music } from 'lucide-react'
import { useInView, motion } from 'framer-motion'
import { mediaQueries, type MediaItemSummary } from '@/features/media/media-queries'
import { SORT_OPTIONS } from '@/features/discover/molecules/search-sort-bar'
import { DkDropdown } from '@/features/dk-ui/atoms/dropdown'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'
import { useAuth } from '@/features/auth'
import { MediaCard } from '@ui/molecules/media-card'
import { MediaGrid } from '@ui/molecules/media-grid'
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
        <Skeleton key={i} className="dk-browse-page__skeleton-item" />
      ))}
    </MediaGrid>
  )
}

export function BrowsePage() {
  const params = useParams({ from: '/browse/$type' })
  const search = useSearch({ from: '/browse/$type' })
  const navigate = useNavigate()
  const mediaType = params.type || 'movie'
  const { user } = useAuth()
  const countryCode = (user?.country || 'us').toLowerCase()

  const initialCompany = search.company || ''
  const initialLanguage = search.language || undefined
  const initialIsAnime = search.isAnime === 'true' ? true : search.isAnime === 'false' ? false : undefined

  const updateSearch = (updates: Partial<typeof search>) => {
    navigate({ to: '/browse/$type', params: { type: mediaType }, search: { ...search, ...updates }, replace: true })
  }

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

  // Fetch company info when filtering by company
  const { data: companyInfo } = useQuery({
    queryKey: ['company', initialCompany],
    queryFn: async () => {
      const { data } = await apiClient.get<{ id: string; name: string; slug: string; logoUrl: string | null }>(`/company/${initialCompany}`)
      return data
    },
    enabled: !!initialCompany,
    staleTime: 1000 * 60 * 30,
  })

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
      genre: search.genre || undefined,
      company: initialCompany || undefined,
      certification: search.certification || undefined,
      language: initialLanguage,
      isAnime: initialIsAnime,
      hasArtwork: !initialLanguage && initialIsAnime == null && !search.certification,
      sortBy: search.sort,
      sortDir: search.dir,
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
    updateSearch({ sort: value })
  }

  const handleGenreChange = (value: string) => {
    updateSearch({ genre: value })
  }

  const handleCertificationChange = (value: string) => {
    updateSearch({ certification: value })
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
    <div className="dk-browse-page">
      <Helmet>
        <title>{companyInfo ? `${companyInfo.name} ${typeLabel} - Otix` : `Browse ${typeLabel} - Otix`}</title>
        <meta name="description" content={companyInfo ? `Browse ${companyInfo.name} ${typeLabel} on Otix.` : `Browse ${typeLabel} on Otix — discover new movies, shows, games, and music.`} />
        <meta property="og:title" content={companyInfo ? `${companyInfo.name} ${typeLabel} - Otix` : `Browse ${typeLabel} - Otix`} />
        <meta property="og:description" content={companyInfo ? `Browse ${companyInfo.name} ${typeLabel} on Otix.` : `Browse ${typeLabel} on Otix.`} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
      </Helmet>

      {/* Header */}
      <div className="dk-browse-page__header">
        {/* Company logo header */}
        {companyInfo && (
          <div className="dk-browse-page__company-header">
            {companyInfo.logoUrl && (
              <img
                src={companyInfo.logoUrl}
                alt={companyInfo.name}
                className="dk-browse-page__company-logo"
              />
            )}
            <h1 className="dk-browse-page__company-name">{companyInfo.name}</h1>
          </div>
        )}

        {/* Type tabs */}
        <div className="dk-browse-page__tabs">
          {BROWSE_TYPES.map(({ value, label, Icon }) => (
            <Link
              key={value}
              to={`/browse/$type`}
              params={{ type: value }}
              className={cn(
                'dk-browse-page__tab',
                mediaType === value ? 'dk-browse-page__tab--active' : 'dk-browse-page__tab--inactive',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </div>

        {/* Filters bar */}
        <div className="dk-browse-page__filters-bar">
          <div className="dk-browse-page__filters-group">
            <DkDropdown
              variant="filter"
              label="Sort"
              options={browseSortOptions}
              value={search.sort}
              onChange={handleSortChange}
            />
            {certifications && certifications.length > 0 && (
              <DkDropdown
                variant="filter"
                label="Rating"
                options={certificationOptions}
                value={search.certification}
                onChange={handleCertificationChange}
              />
            )}
          </div>
          <span className="dk-browse-page__total-count">
            {total.toLocaleString()} {typeLabel.toLowerCase()}
          </span>
        </div>

        {/* Genre Pill Bar */}
        {genres && genres.length > 0 && (
          <div className="dk-browse-page__genres">
            {/* Fade overlays for smooth horizontal scroll edges */}
            <div className="dk-browse-page__genres-fade--left" />
            <div className="dk-browse-page__genres-fade--right" />

            <div className="dk-browse-page__genres-scroll">
              {genreOptions.map((g) => {
                const isActive = (search.genre || '') === g.value
                return (
                  <button
                    key={g.value}
                    onClick={() => handleGenreChange(g.value)}
                    className={cn(
                      "dk-browse-page__genre-pill",
                      isActive ? "dk-browse-page__genre-pill--active" : "dk-browse-page__genre-pill--inactive",
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeGenrePill"
                        className="dk-browse-page__genre-pill-bg"
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                    {g.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <BrowseSkeleton />
      ) : items.length === 0 ? (
        <div className="dk-browse-page__empty">
          <p className="dk-browse-page__empty-text">
            No {typeLabel.toLowerCase()} found{search.genre ? ' for this genre' : ''}{initialCompany ? ' for this company' : ''}.
          </p>
        </div>
      ) : (
        <>
          <MediaGrid>
            {items.map((item: MediaItemSummary) => {
              const finSub = getFinancialSubtitle(item, search.sort || '')
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
                  artistName={item.albumArtistName}
                />
              )
            })}

            {/* Pre-fetch skeletons — 12 items = ~2–3 rows, trigger next page when visible */}
            {(hasNextPage || isFetchingNextPage) &&
              Array.from({ length: 12 }).map((_, i) => (
                <div key={`prefetch-${i}`} ref={i === 0 ? sentinelRef : undefined}>
                  <Skeleton className="dk-browse-page__skeleton-card" />
                </div>
              ))}
          </MediaGrid>

          {/* End-of-list marker */}
          {!hasNextPage && items.length > 0 && (
            <div className="dk-browse-page__end-marker">
              <p className="dk-browse-page__end-text">
                All {total.toLocaleString()} {typeLabel.toLowerCase()} loaded
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
