import { useState } from 'react'
import { useParams, useSearch, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { UserRoundPlus, UserRoundCheck, Star } from 'lucide-react'
import { Image } from '@ui/atoms/image'
import { Skeleton } from '@ui/atoms/skeleton'
<<<<<<<< HEAD:frontend/src/old-features/person/organisms/person-detail.tsx
import { useAuth } from '@/old-features/auth'
import { personQueries, useFollowPerson, useUnfollowPerson, useRatePerson, useUnratePerson } from '../person-queries'
import type { PersonDetail as PersonDetailData } from '../person-queries'
import { PersonTimeline } from './person-timeline'
import { PersonTimelineFilters } from './person-timeline-filters'
========
import { useAuth } from '@auth/hooks/use-auth'
import { peopleQueries, useFollowPerson, useUnfollowPerson, useRatePerson, useUnratePerson } from '@people/queries/people-queries'
import type { PersonDetail } from '@people/types'
import { formatDate, getCreditsStats } from '@people/utils'
import { PeopleTimeline } from '@people/components/organisms/people-timeline'
import { PeopleTimelineFilters } from '@people/components/organisms/people-timeline-filters'
>>>>>>>> d607927de356d7641bc4391ed7e97bc43aae7dc2:frontend/src/features/people/pages/people-detail-page.tsx
import { cn } from '@/lib/utils'

// ── Sub-components ────────────────────────────────

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-muted/50 px-4 py-3 text-center">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}

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

// ── Page ──────────────────────────────────────────

export function PeopleDetailPage() {
  const params = useParams({ from: '/person/$personId' })
  const search = useSearch({ from: '/person/$personId' })
  const navigate = useNavigate()
  const personId = params.personId || ''
  const { isAuthenticated } = useAuth()

  const { data: person, isLoading, isError } = useQuery(peopleQueries.detail(personId))
  const { data: relatedArtists } = useQuery(peopleQueries.related(personId))
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
      <div className="mx-auto max-w-4xl px-4 pt-24 sm:px-6 lg:px-8 space-y-8">
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
      <div className="flex min-h-[50vh] items-center justify-center px-4 pt-24">
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
  const bioTruncation = 400
  const showBioExpand = (person.biography?.length ?? 0) > bioTruncation

  return (
    <div className="mx-auto max-w-4xl px-4 pt-24 pb-16 sm:px-6 lg:px-8 space-y-10">
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

      {/* ── Header ── */}
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <div className="h-36 w-36 shrink-0 overflow-hidden rounded-full ring-2 ring-border sm:h-44 sm:w-44">
          <Image
            src={person.photoUrl ?? undefined}
            alt={person.name}
            className="h-full w-full"
            fallback={person.name[0]}
          />
        </div>

        <div className="min-w-0 text-center sm:text-left">
          <div className="flex items-center justify-center gap-3 sm:justify-start">
            <h1 className="text-2xl font-bold sm:text-3xl">{person.name}</h1>
            {person.avgRating != null && (
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                {person.avgRating}
              </span>
            )}
            {isAuthenticated && (
              <button
                type="button"
                onClick={handleFollowToggle}
                disabled={follow.isPending || unfollow.isPending}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-[color,background-color,opacity] duration-150',
                  'disabled:opacity-50',
                  person.isFollowed
                    ? 'bg-primary/10 text-primary hover:bg-primary/20'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90',
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
            {!isAuthenticated && person.followerCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm text-muted-foreground">
                <UserRoundPlus className="h-4 w-4" />
                <span>{person.followerCount} followers</span>
              </span>
            )}
            {isAuthenticated && person.followerCount > 0 && (
              <span className="text-sm text-muted-foreground">{person.followerCount} followers</span>
            )}
          </div>

          {/* Rating */}
          {isAuthenticated && (
            <div className="mt-2 flex items-center gap-2">
              <StarRating
                value={person.userRating ?? null}
                onChange={(score) => rate.mutate(score)}
              />
              {(person.userRating ?? null) != null && (
                <button
                  onClick={() => unrate.mutate()}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-150"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground sm:justify-start">
            {person.birthday && <span>{formatDate(person.birthday)}</span>}
            {person.deathday && <span>– {formatDate(person.deathday)}</span>}
            {person.placeOfBirth && <span>{person.placeOfBirth}</span>}
          </div>

          {person.biography && (
            <div className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              <p>
                {showBioExpand && !bioExpanded
                  ? person.biography.slice(0, bioTruncation) + '…'
                  : person.biography}
              </p>
              {showBioExpand && (
                <button
                  type="button"
                  onClick={() => setBioExpanded((prev) => !prev)}
                  className="mt-1 text-xs font-medium text-primary hover:underline"
                >
                  {bioExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
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
        <h2 className="mb-4 text-lg font-semibold">Credits</h2>
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

      {/* ── Related artists ── */}
      {relatedArtists && relatedArtists.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Fans Also Like</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {relatedArtists.map((artist) => (
              <div key={artist.spotify_artist_id || artist.name} className="w-36 shrink-0 text-center">
                <div className="aspect-square w-full overflow-hidden rounded-full ring-1 ring-border">
                  {artist.image_url ? (
                    <img
                      src={artist.image_url}
                      alt={artist.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl font-bold bg-[var(--dk-surface-glass)] text-muted-foreground">
                      {artist.name[0]}
                    </div>
                  )}
                </div>
                <p className="mt-2 truncate text-xs font-medium">{artist.name}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
