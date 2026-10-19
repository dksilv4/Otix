import { useState } from 'react'
import { useParams, useSearch, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { UserRoundPlus, UserRoundCheck, Star } from 'lucide-react'
import { Image } from '@ui/atoms/image'
import { Skeleton } from '@ui/atoms/skeleton'
import { useAuth } from '@auth/hooks/use-auth'
import { peopleQueries, useFollowPerson, useUnfollowPerson, useRatePerson, useUnratePerson } from '@people/queries/people-queries'
import { formatDate, getCreditsStats } from '@people/utils'
import { PeopleTimeline } from '@people/components/organisms/people-timeline'
import { PeopleTimelineFilters } from '@people/components/organisms/people-timeline-filters'
import { cn } from '@/lib/utils'
import { RatingsSection } from '@/features/review/organisms/ratings-section'

// ── Sub-components ────────────────────────────────

const StatBox = ({ label, value }: { label: string; value: string | number }) => {
  return (
    <div className="rounded-2xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] px-4 py-3.5 text-center shadow-sm hover:bg-[var(--dk-surface-ghost-hover)] hover:-translate-y-0.5 transition-all duration-300 min-w-[110px] shrink-0">
      <div className="text-2xl font-black text-foreground tracking-tight whitespace-nowrap truncate">{value}</div>
      <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mt-1 whitespace-nowrap truncate">{label}</div>
    </div>
  )
};

const StarRating = ({
  value,
  onChange,
  readonly,
}: {
  value: number | null
  onChange?: (score: number) => void
  readonly?: boolean
}) => {
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
                filled ? 'fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400' : 'text-muted-foreground/30',
              )}
            />
          </button>
        )
      })}
      {value != null && <span className="ml-1.5 text-xs text-muted-foreground">{value}/5</span>}
    </div>
  )
};

// ── Page ──────────────────────────────────────────

export const PeopleDetailPage = () => {
  const params = useParams({ from: '/person/$personId' })
  const search = useSearch({ from: '/person/$personId' })
  const navigate = useNavigate()
  const personId = params.personId || ''
  const { isAuthenticated } = useAuth()

  const ptClass = 'pt-4 sm:pt-6'

  const { data: person, isLoading, isError } = useQuery(peopleQueries.detail(personId))
  const follow = useFollowPerson(personId)
  const unfollow = useUnfollowPerson(personId)
  const rate = useRatePerson(personId)
  const unrate = useUnratePerson(personId)

  const [bioExpanded, setBioExpanded] = useState(false)

  const updateSearch = (updates: Partial<typeof search>) => {
    navigate({
      to: '/person/$personId',
      params: { personId },
      search: { ...search, ...updates },
      replace: true,
    })
  }

  const handleFollowToggle = () => {
    if (!person) return
    if (person.isFollowed) {
      unfollow.mutate()
    } else {
      follow.mutate()
    }
  }

  // ── Loading state ──
  if (isLoading) {
    return (
      <div id="people-detail-page" className={`mx-auto max-w-4xl px-4 ${ptClass} sm:px-6 lg:px-8 space-y-8`}>
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <Skeleton className="h-36 w-36 rounded-full sm:h-44 sm:w-44" />
          <div className="space-y-3 text-center sm:text-left">
            <Skeleton className="mx-auto h-8 w-48 sm:mx-0" />
            <Skeleton className="mx-auto h-4 w-32 sm:mx-0" />
            <Skeleton className="mx-auto h-20 w-96 sm:mx-0" />
          </div>
        </div>
      </div>
    )
  }

  // ── Error state ──
  if (isError || !person) {
    return (
      <div className={`flex min-h-[50vh] items-center justify-center px-4 ${ptClass}`}>
        <div className="text-center">
          <h2 className="text-lg font-semibold">Person not found</h2>
          <a href="/" className="text-sm text-primary hover:underline">
            Go back home
          </a>
        </div>
      </div>
    )
  }

  const stats = getCreditsStats(person.credits)
  const showBioExpand = (person.biography?.length ?? 0) > 300

  return (
    <div id="people-detail-page" className={`mx-auto max-w-4xl px-4 ${ptClass} pb-16 sm:px-6 lg:px-8 space-y-10`}>
      <Helmet>
        <title>{`${person.name} - Otix`}</title>
        <meta
          name="description"
          content={person.biography?.slice(0, 200) || `Credits for ${person.name}`}
        />
        <meta property="og:title" content={`${person.name} - Otix`} />
        <meta
          property="og:description"
          content={person.biography?.slice(0, 200) || `Credits for ${person.name}`}
        />
        <meta property="og:type" content="profile" />
        {person.photoUrl && <meta property="og:image" content={person.photoUrl} />}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={`${person.name} - Otix`} />
        <meta
          name="twitter:description"
          content={person.biography?.slice(0, 200) || `Credits for ${person.name}`}
        />
        {person.photoUrl && <meta name="twitter:image" content={person.photoUrl} />}
      </Helmet>

      {/* ── Glassmorphic Hero Banner ── */}
      <div className="relative overflow-hidden rounded-3xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] p-6 sm:p-8 md:p-10 shadow-lg backdrop-blur-md">
        {/* Soft Blurred Background Image */}
        {person.photoUrl && (
          <>
            <div 
              className="absolute inset-0 -z-10 bg-cover bg-center opacity-20 blur-[40px] scale-110 select-none pointer-events-none transition-all duration-700"
              style={{ backgroundImage: `url(${person.photoUrl})` }}
            />
            {/* Vignette overlay for depth */}
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background/90 via-background/60 to-transparent pointer-events-none" />
          </>
        )}
        {/* Ambient Glow */}
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-primary/10 blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-[100px] pointer-events-none" />

        <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-start relative z-10">
          {/* Avatar Photo */}
          <div className="w-36 sm:w-44 aspect-[2/3] shrink-0 overflow-hidden rounded-2xl ring-2 ring-[var(--dk-separator)] shadow-xl scale-[1.02] hover:scale-[1.04] transition-all duration-500 bg-muted">
            <Image
              src={person.photoUrl ?? undefined}
              alt={person.name}
              className="h-full w-full object-cover"
              fallback={person.name[0]}
            />
          </div>

          <div className="min-w-0 text-center sm:text-left flex-1">
            <div className="flex flex-wrap items-center justify-center gap-3.5 sm:justify-start">
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl md:text-5xl text-foreground drop-shadow-sm">
                {person.name}
              </h1>
              {person.avgRating != null && (
                <span className="inline-flex items-center gap-1 text-sm font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 backdrop-blur-sm shadow-sm">
                  <Star className="h-4 w-4 fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400" />
                  {person.avgRating}
                </span>
              )}
            </div>

            {/* Sub-header with Follower stats and actions */}
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
              {isAuthenticated && (
                <button
                  type="button"
                  onClick={handleFollowToggle}
                  disabled={follow.isPending || unfollow.isPending}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95 cursor-pointer',
                    person.isFollowed
                      ? 'bg-[var(--dk-surface-glass-hover)] text-foreground hover:bg-[var(--dk-surface-ghost-active)] border border-[var(--dk-separator)]'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-primary/20',
                  )}
                >
                  {person.isFollowed ? (
                    <UserRoundCheck className="h-4 w-4" />
                  ) : (
                    <UserRoundPlus className="h-4 w-4" />
                  )}
                  <span>{person.isFollowed ? 'Following' : 'Follow'}</span>
                </button>
              )}
              
              {person.followerCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-[var(--dk-surface-glass)] border border-[var(--dk-separator)] backdrop-blur-sm">
                  <UserRoundPlus className="h-3.5 w-3.5" />
                  <span>{person.followerCount} followers</span>
                </span>
              )}
            </div>

            {/* Rating */}
            {isAuthenticated && (
              <div className="mt-4 flex items-center justify-center sm:justify-start gap-2.5 bg-[var(--dk-surface-glass)] border border-[var(--dk-separator)] backdrop-blur-sm px-3 py-2 rounded-xl w-fit mx-auto sm:mx-0">
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Your Rating</span>
                <div className="h-3 w-px bg-[var(--dk-separator)]" />
                <StarRating
                  value={person.userRating ?? null}
                  onChange={(score) => rate.mutate(score)}
                />
                {(person.userRating ?? null) != null && (
                  <>
                    <div className="h-3 w-px bg-[var(--dk-separator)]" />
                    <button
                      onClick={() => unrate.mutate()}
                      className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors duration-150 cursor-pointer"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap justify-center gap-2.5 text-xs font-medium text-muted-foreground sm:justify-start">
              {person.birthday && (
                <span className="flex items-center gap-1.5 bg-[var(--dk-surface-glass)] border border-[var(--dk-separator)] backdrop-blur-sm px-3 py-1.5 rounded-lg">
                  <svg className="h-3.5 w-3.5 opacity-60" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1-1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2h-1V1a1 1 0 10-2 0v1H7V1a1 1 0 00-1-1zM4 5h12v2H4V5zm0 4h12v6H4V9z" clipRule="evenodd" />
                  </svg>
                  <span>Born: {formatDate(person.birthday)}</span>
                </span>
              )}
              {person.deathday && (
                <span className="flex items-center gap-1.5 bg-[var(--dk-surface-glass)] border border-[var(--dk-separator)] backdrop-blur-sm px-3 py-1.5 rounded-lg text-rose-500 dark:text-rose-400">
                  <svg className="h-3.5 w-3.5 opacity-60" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                  </svg>
                  <span>Died: {formatDate(person.deathday)}</span>
                </span>
              )}
              {person.placeOfBirth && (
                <span className="flex items-center gap-1.5 bg-[var(--dk-surface-glass)] border border-[var(--dk-separator)] backdrop-blur-sm px-3 py-1.5 rounded-lg">
                  <svg className="h-3.5 w-3.5 opacity-60" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                  <span>{person.placeOfBirth}</span>
                </span>
              )}
            </div>

            {/* Biography with Fade-out Gradient Collapse */}
            {person.biography && (
              <div className="mt-4 max-w-2xl text-sm leading-relaxed text-foreground/80 relative">
                <div className={cn(
                  "transition-all duration-500 overflow-hidden relative",
                  showBioExpand && !bioExpanded ? "max-h-24" : "max-h-[1000px]"
                )}>
                  <p className="whitespace-pre-line">{person.biography}</p>
                  {showBioExpand && !bioExpanded && (
                    <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background/90 to-transparent pointer-events-none" />
                  )}
                </div>
                {showBioExpand && (
                  <button
                    type="button"
                    onClick={() => setBioExpanded((prev) => !prev)}
                    className="mt-2 text-xs font-semibold text-primary hover:text-primary/80 uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>{bioExpanded ? 'Show less' : 'Read biography'}</span>
                    <svg className={cn("h-3.5 w-3.5 transition-transform duration-300", bioExpanded ? "rotate-180" : "")} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Ratings Section ── */}
      <RatingsSection
        overallRating={person.avgRating != null ? person.avgRating * 20 : null}
        overallRatingSource="community"
        avgRating={person.avgRating}
        ratingCount={person.ratingCount}
      />

      {/* ── Stats bar ── */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none md:overflow-x-visible md:pb-0 md:mx-0 md:px-0">
        <StatBox label="Total Credits" value={stats.total} />
        {person.avgRating != null && <StatBox label="Rating" value={`${person.avgRating}/5`} />}
        {stats.yearsActive && <StatBox label="Years Active" value={stats.yearsActive} />}
        {stats.byType.movie && <StatBox label="Movies" value={stats.byType.movie} />}
        {stats.byType.show && <StatBox label="Shows" value={stats.byType.show} />}
        {stats.byType.game && <StatBox label="Games" value={stats.byType.game} />}
        {stats.byType.music && <StatBox label="Music" value={stats.byType.music} />}
      </div>

      {/* ── Credits ── */}
      <section>
        <h2 className="mb-4 text-xl font-extrabold text-foreground tracking-tight">Credits</h2>
        <PeopleTimelineFilters
          mediaTypeFilter={search.mediaType || 'all'}
          onMediaTypeChange={(value) => {
            updateSearch({ mediaType: value || 'all', role: 'all' })
          }}
          roleFilter={search.role || 'all'}
          onRoleChange={(value) => {
            updateSearch({ role: value || 'all', mediaType: 'all' })
          }}
        />
        <div className="mt-6">
          <PeopleTimeline
            credits={person.credits}
            mediaTypeFilter={search.mediaType || 'all'}
            roleFilter={search.role || 'all'}
          />
        </div>
      </section>

    </div>
  )
};
