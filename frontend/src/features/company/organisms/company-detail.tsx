// TODO: Review this file
import { useState, useMemo, useRef, useEffect } from 'react'
import { useParams } from '@tanstack/react-router'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { Film, Tv, Gamepad2, Music, Building2, Star } from 'lucide-react'
import { useInView } from 'framer-motion'
import { companyQueries, useFollowCompany, useUnfollowCompany, useRateCompany, useUnrateCompany } from '../company-queries'
import { mediaQueries, type MediaItemSummary } from '@/features/media/media-queries'
import { DkDropdown } from '@/features/dk-ui/atoms/dropdown'
import { SORT_OPTIONS } from '@/features/discover/molecules/search-sort-bar'
import { MediaCard } from '@ui/molecules/media-card'
import { MediaGrid } from '@ui/molecules/media-grid'
import { Skeleton } from '@ui/atoms/skeleton'
import { useAuth } from '@/features/auth'
import { cn } from '@/lib/utils'
import './company-detail.scss'

const BROWSE_TYPES = [
  { value: 'all', label: 'All', Icon: Building2 },
  { value: 'movie', label: 'Movies', Icon: Film },
  { value: 'show', label: 'Shows', Icon: Tv },
  { value: 'game', label: 'Games', Icon: Gamepad2 },
  { value: 'music', label: 'Music', Icon: Music },
] as const

function StarRating({ value, onChange, readonly }: { value: number | null; onChange?: (score: number) => void; readonly?: boolean }) {
  const [hover, setHover] = useState(0)
  const active = hover || value || 0

  return (
    <div className="dk-company-detail__star-rating" onMouseLeave={() => setHover(0)}>
      {Array.from({ length: 5 }).map((_, i) => {
        const score = i + 1
        const filled = score <= active
        return (
          <button
            key={score}
            type="button"
            disabled={readonly}
            className={cn(
              'dk-company-detail__star-btn',
              readonly && 'dk-company-detail__star-btn--readonly',
            )}
            onClick={() => onChange?.(score)}
            onMouseEnter={() => !readonly && setHover(score)}
          >
            <Star
              className={cn(
                'h-4 w-4',
                filled ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30',
              )}
            />
          </button>
        )
      })}
      {value != null && <span className="dk-company-detail__star-value">{value}/5</span>}
    </div>
  )
}

export function CompanyDetail() {
  const params = useParams({ strict: false }) as { companyId?: string }
  const id = params.companyId || ''
  const { user } = useAuth()

  const { data: company, isLoading: companyLoading, isError } = useQuery({
    ...companyQueries.detail(id),
    enabled: !!id,
  })
  const follow = useFollowCompany(id)
  const unfollow = useUnfollowCompany(id)
  const rate = useRateCompany(id)
  const unrate = useUnrateCompany(id)

  const [mediaType, setMediaType] = useState<string>('all')
  const [sortBy, setSortBy] = useState('popularity')

  const queryType = mediaType === 'all' ? undefined : mediaType

  const {
    data,
    isLoading: mediaLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    ...mediaQueries.infiniteList({
      type: queryType,
      company: id,
      sortBy,
      sortDir: 'desc',
      limit: 48,
    }),
    enabled: !!id,
  })

  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data])
  const total = data?.pages[0]?.total ?? 0

  const sentinelRef = useRef<HTMLDivElement>(null)
  const isSentinelInView = useInView(sentinelRef, { margin: '0px 0px 400px 0px' })

  useEffect(() => {
    if (isSentinelInView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [isSentinelInView, hasNextPage, isFetchingNextPage, fetchNextPage])

  const sortOptions = useMemo(
    () => SORT_OPTIONS.filter((o) => o.value !== ''),
    [],
  )

  if (isError || (!companyLoading && !company)) {
    return (
      <div className="dk-company-detail__error-state">
        <div className="dk-company-detail__error-content">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="dk-company-detail__error-text">Company not found</p>
        </div>
      </div>
    )
  }

  const typeLabel = mediaType === 'all' ? 'items' : (BROWSE_TYPES.find((t) => t.value === mediaType)?.label ?? 'movies').toLowerCase()

  return (
    <div className="dk-company-detail">
      <Helmet>
        <title>{company ? `${company.name} - Otix` : `Company - Otix`}</title>
        {company?.description && (
          <meta name="description" content={company.description.slice(0, 200)} />
        )}
        <meta property="og:title" content={company ? `${company.name} - Otix` : `Company - Otix`} />
        {company?.description && (
          <meta property="og:description" content={company.description.slice(0, 200)} />
        )}
        <meta property="og:type" content="website" />
        {company?.logoUrl && <meta property="og:image" content={company.logoUrl} />}
        <meta name="twitter:card" content="summary" />
      </Helmet>

      {/* Header */}
      <div className="dk-company-detail__header">
        <div className="dk-company-detail__header-row">
          {companyLoading ? (
            <>
              <Skeleton className="h-16 w-48 rounded-xl shrink-0" />
              <div className="dk-company-detail__skeleton-info">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-24" />
              </div>
            </>
          ) : company ? (
            <>
              {company.logoUrl ? (
                <img
                  src={company.logoUrl}
                  alt={company.name}
                  className="dk-company-detail__logo"
                />
              ) : (
                <div className="dk-company-detail__logo-placeholder">
                  <Building2 className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="dk-company-detail__info">
                <h1 className="dk-company-detail__title">{company.name}</h1>
                {company.originCountry && (
                  <p className="dk-company-detail__meta">{company.originCountry.toUpperCase()}</p>
                )}

                {/* Stats */}
                <div className="dk-company-detail__stats">
                  {company.avgRating != null && (
                    <>
                      <span className="dk-company-detail__stat">
                        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                        {company.avgRating}
                      </span>
                      <span className="dk-company-detail__divider">|</span>
                    </>
                  )}
                  <span>{company.followerCount.toLocaleString()} followers</span>
                </div>

                {/* Follow button + Rating */}
                {user && (
                  <div className="dk-company-detail__actions">
                    {company.isFollowed ? (
                      <button
                        onClick={() => unfollow.mutate()}
                        disabled={unfollow.isPending}
                        className="dk-company-detail__follow-btn dk-company-detail__follow-btn--following"
                      >
                        Following
                      </button>
                    ) : (
                      <button
                        onClick={() => follow.mutate()}
                        disabled={follow.isPending}
                        className="dk-company-detail__follow-btn"
                      >
                        Follow
                      </button>
                    )}
                    <div className="dk-company-detail__rating-row">
                      <StarRating
                        value={company.userRating}
                        onChange={(score) => rate.mutate(score)}
                      />
                      {company.userRating != null && (
                        <button
                          onClick={() => unrate.mutate()}
                          className="dk-company-detail__clear-btn"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Type tabs */}
        <div className="dk-company-detail__tabs">
          {BROWSE_TYPES.map(({ value, label, Icon }) => (
            <button
              key={value}
              onClick={() => { setMediaType(value); setSortBy('popularity') }}
              className={cn(
                'dk-company-detail__tab',
                mediaType === value && 'dk-company-detail__tab--active',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Filters bar */}
        <div className="dk-company-detail__filters">
          <DkDropdown
            variant="filter"
            label="Sort"
            options={sortOptions}
            value={sortBy}
            onChange={setSortBy}
          />
          <span className="dk-company-detail__count">
            {total.toLocaleString()} {typeLabel.toLowerCase()}
          </span>
        </div>
      </div>

      {/* Grid */}
      {mediaLoading ? (
        <MediaGrid>
          {Array.from({ length: 24 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] rounded-2xl" />
          ))}
        </MediaGrid>
      ) : items.length === 0 ? (
        <div className="dk-company-detail__empty-state">
          <p className="dk-company-detail__empty-text">
            No {typeLabel.toLowerCase()} found for this company.
          </p>
        </div>
      ) : (
        <>
          <MediaGrid>
            {items.map((item: MediaItemSummary) => (
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
                artistName={item.albumArtistName}
              />
            ))}

            {(hasNextPage || isFetchingNextPage) && (
              <div ref={sentinelRef} className="dk-company-detail__sentinel">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[2/3] rounded-2xl w-full" />
                ))}
              </div>
            )}
          </MediaGrid>
        </>
      )}
    </div>
  )
}
