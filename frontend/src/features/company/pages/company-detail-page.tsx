import { useEffect, useRef, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { Building2, UserRoundPlus, UserRoundCheck, Star, ExternalLink } from 'lucide-react'
import { Image } from '@ui/atoms/image'
import { Skeleton } from '@ui/atoms/skeleton'
import { MediaGrid } from '@ui/molecules/media-grid'
import { useAuth } from '@auth/hooks/use-auth'
import { DiscoverMediaCard } from '@discover/components/molecules/discover-media-card'
import {
  companyQueries,
  useFollowCompany,
  useUnfollowCompany,
  useRateCompany,
  useUnrateCompany,
} from '@company/queries/company-queries'
import { cn } from '@/lib/utils'

function StarRating({
  value,
  onChange,
  readonly,
}: {
  value: number | null
  onChange?: (score: number) => void
  readonly?: boolean
}) {
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
              'p-0.5 transition-[color,transform] duration-150',
              readonly && 'cursor-default',
              !readonly && 'cursor-pointer hover:scale-110',
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
  const params = useParams({ from: '/company/$companyId' })
  const companyId = params.companyId || ''
  const { isAuthenticated } = useAuth()
  const [descExpanded, setDescExpanded] = useState(false)

  const ptClass = 'pt-4 sm:pt-6'

  const { data: company, isLoading, isError } = useQuery(companyQueries.detail(companyId))
  const follow = useFollowCompany(companyId)
  const unfollow = useUnfollowCompany(companyId)
  const rate = useRateCompany(companyId)
  const unrate = useUnrateCompany(companyId)

  const titlesQuery = useInfiniteQuery(companyQueries.titles(companyId, 24))

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = titlesQuery

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasNextPage) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) {
          void fetchNextPage()
        }
      },
      { rootMargin: '600px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const handleFollowToggle = () => {
    if (!company) return
    if (company.isFollowed) {
      unfollow.mutate()
    } else {
      follow.mutate()
    }
  }

  if (isLoading) {
    return (
      <div id="company-detail-page" className={`mx-auto max-w-5xl px-4 ${ptClass} sm:px-6 lg:px-8 space-y-8`}>
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <Skeleton className="h-36 w-36 rounded-2xl sm:h-44 sm:w-44" />
          <div className="space-y-3 text-center sm:text-left">
            <Skeleton className="mx-auto h-8 w-48 sm:mx-0" />
            <Skeleton className="mx-auto h-4 w-32 sm:mx-0" />
          </div>
        </div>
      </div>
    )
  }

  if (isError || !company) {
    return (
      <div className={`flex min-h-[50vh] items-center justify-center px-4 ${ptClass}`}>
        <div className="text-center">
          <h2 className="text-lg font-semibold">Company not found</h2>
          <a href="/" className="text-sm text-primary hover:underline">
            Go back home
          </a>
        </div>
      </div>
    )
  }

  const titles = titlesQuery.data?.pages.flatMap((page) => page.results) ?? []
  const showDescExpand = (company.description?.length ?? 0) > 300

  return (
    <div
      id="company-detail-page"
      className={`mx-auto max-w-5xl px-4 ${ptClass} pb-16 sm:px-6 lg:px-8 space-y-10`}
    >
      <Helmet>
        <title>{`${company.name} - Otix`}</title>
        <meta name="description" content={`Titles from ${company.name}`} />
        <meta property="og:title" content={`${company.name} - Otix`} />
        <meta property="og:description" content={`Titles from ${company.name}`} />
        <meta property="og:type" content="website" />
        {company.logoUrl && <meta property="og:image" content={company.logoUrl} />}
        <meta name="twitter:card" content="summary" />
      </Helmet>

      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-3xl bg-zinc-950/40 p-6 sm:p-8 md:p-10 shadow-[0_32px_80px_rgba(0,0,0,0.5)] backdrop-blur-md">
        {company.logoUrl && (
          <>
            <div
              className="absolute inset-0 -z-10 bg-cover bg-center opacity-15 blur-[40px] scale-110 select-none pointer-events-none"
              style={{ backgroundImage: `url(${company.logoUrl})` }}
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-zinc-950/40 pointer-events-none" />
          </>
        )}
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-primary/10 blur-[100px] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center gap-8 sm:flex-row sm:items-start">
          <div className="flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-zinc-800 ring-4 ring-white/10 shadow-[0_24px_50px_rgba(0,0,0,0.6)] sm:h-44 sm:w-44">
            {company.logoUrl ? (
              <Image
                src={company.logoUrl}
                alt={company.name}
                className="h-full w-full object-contain p-3"
                fallback={company.name[0]}
              />
            ) : (
              <Building2 className="h-16 w-16 text-white/30" />
            )}
          </div>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-3.5 sm:justify-start">
              <h1 className="bg-gradient-to-r from-white via-white to-zinc-400 bg-clip-text text-3xl font-black tracking-tight text-transparent drop-shadow-sm sm:text-4xl md:text-5xl">
                {company.name}
              </h1>
              {company.avgRating != null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-sm font-semibold text-amber-400 backdrop-blur-sm shadow-sm">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  {company.avgRating}
                </span>
              )}
            </div>

            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
              {isAuthenticated && (
                <button
                  type="button"
                  onClick={handleFollowToggle}
                  disabled={follow.isPending || unfollow.isPending}
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider shadow-md transition-all duration-200 active:scale-95',
                    company.isFollowed
                      ? 'bg-white/10 text-white hover:bg-white/15'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-primary/20',
                  )}
                >
                  {company.isFollowed ? (
                    <UserRoundCheck className="h-4 w-4" />
                  ) : (
                    <UserRoundPlus className="h-4 w-4" />
                  )}
                  <span>{company.isFollowed ? 'Following' : 'Follow'}</span>
                </button>
              )}

              {company.followerCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/70 backdrop-blur-sm">
                  <UserRoundPlus className="h-3.5 w-3.5" />
                  <span>{company.followerCount} followers</span>
                </span>
              )}

              {company.originCountry && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60 backdrop-blur-sm">
                  {company.originCountry}
                </span>
              )}
            </div>

            {isAuthenticated && (
              <div className="mx-auto mt-4 flex w-fit items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2 backdrop-blur-sm sm:mx-0">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">
                  Your Rating
                </span>
                <div className="h-3 w-px bg-white/10" />
                <StarRating
                  value={company.userRating ?? null}
                  onChange={(score) => rate.mutate(score)}
                />
                {(company.userRating ?? null) != null && (
                  <>
                    <div className="h-3 w-px bg-white/10" />
                    <button
                      type="button"
                      onClick={() => unrate.mutate()}
                      className="cursor-pointer text-xs font-semibold text-white/40 transition-colors duration-150 hover:text-white"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            )}

            {company.description && (
              <div className="mt-4 max-w-2xl text-sm leading-relaxed text-white/80 relative">
                <div
                  className={cn(
                    'relative overflow-hidden transition-all duration-500',
                    showDescExpand && !descExpanded ? 'max-h-24' : 'max-h-[1000px]',
                  )}
                >
                  <p className="whitespace-pre-line">{company.description}</p>
                  {showDescExpand && !descExpanded && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-zinc-950/80 to-transparent" />
                  )}
                </div>
                {showDescExpand && (
                  <button
                    type="button"
                    onClick={() => setDescExpanded((prev) => !prev)}
                    className="mt-2 cursor-pointer text-xs font-semibold uppercase tracking-wider text-primary transition-colors hover:text-primary/80"
                  >
                    {descExpanded ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            )}

            {company.homepage && (
              <a
                href={company.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>{company.homepage.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── Titles ── */}
      <section>
        <h2 className="mb-4 text-xl font-extrabold tracking-tight text-white">
          Titles
        </h2>
        {titlesQuery.isLoading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-5">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[2/3] w-full rounded-xl" />
            ))}
          </div>
        ) : titles.length === 0 ? (
          <p className="text-sm text-white/50">No titles found for this studio.</p>
        ) : (
          <MediaGrid>
            {titles.map((item) => (
              <DiscoverMediaCard key={`${item.mediaType}-${item.id}`} item={item} />
            ))}
          </MediaGrid>
        )}
        {titlesQuery.isFetchingNextPage && (
          <div className="mt-6 flex justify-center">
            <Skeleton className="h-8 w-32" />
          </div>
        )}
        <div ref={sentinelRef} />
      </section>
    </div>
  )
}
