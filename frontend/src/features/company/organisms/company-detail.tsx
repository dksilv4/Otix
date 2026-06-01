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
import { MediaCard } from '@/features/ui/molecules/media-card'
import { MediaGrid } from '@/features/ui/molecules/media-grid'
import { Skeleton } from '@ui/atoms/skeleton'
import { useAuth } from '@/features/auth'
import { cn } from '@/lib/utils'

const BROWSE_TYPES = [
  { value: 'movie', label: 'Movies', Icon: Film },
  { value: 'show', label: 'Shows', Icon: Tv },
  { value: 'game', label: 'Games', Icon: Gamepad2 },
  { value: 'music', label: 'Music', Icon: Music },
] as const

function StarRating({ value, onChange, readonly }: { value: number | null; onChange?: (score: number) => void; readonly?: boolean }) {
  const [hover, setHover] = useState(0)
  const active = hover || value || 0

  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
      {Array.from({ length: 5 }).map((_, i) => {
        const score = i + 1
        const filled = score <= active
        return (
          <button
            key={score}
            type="button"
            disabled={readonly}
            className={cn(
              'p-0.5 transition-colors',
              readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110',
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
      {value != null && <span className="ml-1.5 text-xs text-muted-foreground">{value}/5</span>}
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

  const [mediaType, setMediaType] = useState<string>('movie')
  const [sortBy, setSortBy] = useState('popularity')

  const {
    data,
    isLoading: mediaLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    ...mediaQueries.infiniteList({
      type: mediaType,
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
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-3">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="text-lg font-semibold">Company not found</p>
        </div>
      </div>
    )
  }

  const typeLabel = BROWSE_TYPES.find((t) => t.value === mediaType)?.label ?? 'Movies'

  return (
    <div className="pb-16">
      <Helmet>
        <title>{company ? `${company.name} - Otix` : `Company - Otix`}</title>
      </Helmet>

      {/* Header */}
      <div className="mb-8 space-y-6">
        <div className="flex items-start gap-4">
          {companyLoading ? (
            <>
              <Skeleton className="h-16 w-48 rounded-xl shrink-0" />
              <div className="min-w-0 space-y-2">
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
                  className="h-16 max-w-[240px] object-contain shrink-0"
                />
              ) : (
                <div className="flex items-center justify-center h-16 w-48 rounded-xl bg-white/5 border border-white/10 shrink-0">
                  <Building2 className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 space-y-1.5">
                <h1 className="text-2xl font-bold">{company.name}</h1>
                {company.originCountry && (
                  <p className="text-sm text-muted-foreground">{company.originCountry.toUpperCase()}</p>
                )}

                {/* Stats */}
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  {company.avgRating != null && (
                    <>
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                        {company.avgRating}
                      </span>
                      <span className="text-border">|</span>
                    </>
                  )}
                  <span>{company.followerCount.toLocaleString()} followers</span>
                </div>

                {/* Follow button + Rating */}
                {user && (
                  <div className="flex items-center gap-4 pt-1">
                    {company.isFollowed ? (
                      <button
                        onClick={() => unfollow.mutate()}
                        disabled={unfollow.isPending}
                        className="px-4 py-1.5 text-sm font-medium rounded-full bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
                      >
                        Following
                      </button>
                    ) : (
                      <button
                        onClick={() => follow.mutate()}
                        disabled={follow.isPending}
                        className="px-4 py-1.5 text-sm font-medium rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        Follow
                      </button>
                    )}
                    <div className="flex items-center gap-2">
                      <StarRating
                        value={company.userRating}
                        onChange={(score) => rate.mutate(score)}
                      />
                      {company.userRating != null && (
                        <button
                          onClick={() => unrate.mutate()}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
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
        <div className="flex items-center gap-2">
          {BROWSE_TYPES.map(({ value, label, Icon }) => (
            <button
              key={value}
              onClick={() => { setMediaType(value); setSortBy('popularity') }}
              className={cn(
                'inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all duration-200',
                mediaType === value
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                  : 'bg-[var(--dk-surface-glass)] text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass-hover)]',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Filters bar */}
        <div className="flex items-center justify-between">
          <DkDropdown
            variant="filter"
            label="Sort"
            options={sortOptions}
            value={sortBy}
            onChange={setSortBy}
          />
          <span className="text-xs text-muted-foreground shrink-0">
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
        <div className="flex min-h-[30vh] items-center justify-center">
          <p className="text-sm text-muted-foreground">
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
              <div ref={sentinelRef} className="col-span-full flex justify-center py-8">
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
