// TODO: Review this file
import { useState, useMemo, useRef, useEffect } from 'react'
import { useParams } from '@tanstack/react-router'
import { queryOptions, useMutation, useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { Film, Tv, Gamepad2, Music, Building2, Star } from 'lucide-react'
import { useInView } from 'framer-motion'
import { apiClient } from '@/lib/api-client'
import { mediaQueries, type MediaItemSummary } from '@/old-features/media/media-queries'

interface CompanyDetail {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  originCountry: string | null
  followerCount: number
  isFollowed: boolean | null
  avgRating: number | null
  userRating: number | null
}

const companyQueries = {
  detail: (id: string) =>
    queryOptions({
      queryKey: ['company', id],
      queryFn: async () => {
        const { data } = await apiClient.get<CompanyDetail>(`/company/${id}`)
        return data
      },
      staleTime: 1000 * 60 * 10,
    }),
}

function useFollowCompany(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      await apiClient.post(`/company/${id}/follow`)
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['company', id] })
      const prev = queryClient.getQueryData<CompanyDetail>(['company', id])
      if (prev) {
        queryClient.setQueryData<CompanyDetail>(['company', id], {
          ...prev,
          isFollowed: true,
          followerCount: prev.followerCount + 1,
        })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['company', id], ctx.prev)
      }
    },
  })
}

function useUnfollowCompany(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/company/${id}/follow`)
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['company', id] })
      const prev = queryClient.getQueryData<CompanyDetail>(['company', id])
      if (prev) {
        queryClient.setQueryData<CompanyDetail>(['company', id], {
          ...prev,
          isFollowed: false,
          followerCount: Math.max(0, prev.followerCount - 1),
        })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['company', id], ctx.prev)
      }
    },
  })
}

function useRateCompany(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (score: number) => {
      await apiClient.put(`/company/${id}/rating`, { score })
    },
    onMutate: async (score) => {
      await queryClient.cancelQueries({ queryKey: ['company', id] })
      const prev = queryClient.getQueryData<CompanyDetail>(['company', id])
      if (prev) {
        queryClient.setQueryData<CompanyDetail>(['company', id], {
          ...prev,
          userRating: score,
        })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['company', id], ctx.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['company', id] })
    },
  })
}

function useUnrateCompany(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/company/${id}/rating`)
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['company', id] })
      const prev = queryClient.getQueryData<CompanyDetail>(['company', id])
      if (prev) {
        queryClient.setQueryData<CompanyDetail>(['company', id], {
          ...prev,
          userRating: null,
        })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['company', id], ctx.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['company', id] })
    },
  })
}
import { DkDropdown } from '@/old-features/dk-ui/atoms/dropdown'
import { SORT_OPTIONS } from '@/old-features/discover/molecules/search-sort-bar'
import { MediaCard } from '@ui/molecules/media-card'
import { MediaGrid } from '@ui/molecules/media-grid'
import { Skeleton } from '@ui/atoms/skeleton'
import { useAuth } from '@/old-features/auth'
import { cn } from '@/lib/utils'

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
              'p-0.5 transition-transform',
              readonly ? 'cursor-default hover:scale-100' : 'cursor-pointer hover:scale-110',
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

export function CompanyDetailPage() {
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
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="space-y-3 text-center">
          <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="text-lg font-semibold">Company not found</p>
        </div>
      </div>
    )
  }

  const typeLabel = mediaType === 'all' ? 'items' : (BROWSE_TYPES.find((t) => t.value === mediaType)?.label ?? 'movies').toLowerCase()

  return (
    <div className="pb-16">
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
      <div className="mb-8 space-y-6">
        <div className="flex items-start gap-4">
          {companyLoading ? (
            <>
              <Skeleton className="h-16 w-48 shrink-0 rounded-xl" />
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
                  className="h-16 max-w-[240px] shrink-0 object-contain"
                />
              ) : (
                <div
                  className="flex h-16 w-48 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "rgb(255 255 255 / 0.05)", border: "1px solid rgb(255 255 255 / 0.1)" }}
                >
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
                        className="rounded-full bg-primary/20 px-4 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/30"
                      >
                        Following
                      </button>
                    ) : (
                      <button
                        onClick={() => follow.mutate()}
                        disabled={follow.isPending}
                        className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
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
                          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
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
                "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all",
                mediaType === value
                  ? "bg-primary text-primary-foreground shadow-[0_4px_12px_hsl(var(--primary)/0.2)] hover:bg-primary hover:text-primary-foreground"
                  : "hover:text-foreground",
              )}
              style={mediaType !== value ? { background: "var(--dk-surface-glass)", color: "hsl(var(--muted-foreground))" } : undefined}
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
          <span className="shrink-0 text-xs text-muted-foreground">
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
                  <Skeleton key={i} className="aspect-[2/3] w-full rounded-2xl" />
                ))}
              </div>
            )}
          </MediaGrid>
        </>
      )}
    </div>
  )
}
