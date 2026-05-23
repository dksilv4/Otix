import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { UserRoundPlus, UserRoundCheck } from 'lucide-react'
import { Image } from '@ui/atoms/image'
import { Skeleton } from '@ui/atoms/skeleton'
import { useAuth } from '@/features/auth'
import { personQueries, useFollowPerson, useUnfollowPerson } from '../person-queries'
import type { PersonDetail as PersonDetailData } from '../person-queries'
import { PersonTimeline } from './person-timeline'
import { PersonTimelineFilters } from './person-timeline-filters'

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function getStats(credits: PersonDetailData['credits']) {
  const total = credits.length
  const years = credits
    .map((c) => c.mediaItem.releaseDate)
    .filter(Boolean)
    .map((d) => new Date(d!).getFullYear())
    .sort((a, b) => a - b)

  const yearsActive = years.length > 0
    ? `${years[0]} – ${years[years.length - 1]}`
    : null

  const byType: Record<string, number> = {}
  for (const c of credits) {
    const t = c.mediaItem.mediaType || 'other'
    byType[t] = (byType[t] || 0) + 1
  }

  return { total, yearsActive, byType }
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-muted/50 px-4 py-3 text-center">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}

export function PersonDetail() {
  const params = useParams({ strict: false }) as { personId?: string }
  const personId = params.personId || ''
  const { isAuthenticated } = useAuth()

  const { data: person, isLoading, isError } = useQuery(personQueries.detail(personId))
  const { data: relatedArtists } = useQuery(personQueries.related(personId))
  const follow = useFollowPerson(personId)
  const unfollow = useUnfollowPerson(personId)

  const [bioExpanded, setBioExpanded] = useState(false)
  const [mediaTypeFilter, setMediaTypeFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')

  const handleFollowToggle = () => {
    if (!person) return
    if (person.isFollowed) {
      unfollow.mutate()
    } else {
      follow.mutate()
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto lg:max-w-5xl space-y-8 px-4 pt-24 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <Skeleton className="h-40 w-40 rounded-full" />
          <div className="space-y-3 text-center sm:text-left">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-20 w-96" />
          </div>
        </div>
      </div>
    )
  }

  if (isError || !person) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 pt-24">
        <div className="text-center">
          <h2 className="text-lg font-semibold">Person not found</h2>
          <a href="/" className="text-sm text-primary hover:underline">Go back home</a>
        </div>
      </div>
    )
  }

  const stats = getStats(person.credits)
  const bioTruncation = 400
  const showBioExpand = (person.biography?.length ?? 0) > bioTruncation

  return (
    <div className="mx-auto lg:max-w-5xl space-y-10 px-4 pt-24 pb-16 sm:px-6 lg:px-8">
      <Helmet>
        <title>{`${person.name} - Otix`}</title>
        <meta
          name="description"
          content={person.biography?.slice(0, 200) || `Credits for ${person.name}`}
        />
        {person.photoUrl && <meta property="og:image" content={person.photoUrl} />}
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
            {isAuthenticated && (
              <button
                type="button"
                onClick={handleFollowToggle}
                disabled={follow.isPending || unfollow.isPending}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                  person.isFollowed
                    ? 'bg-primary/10 text-primary hover:bg-primary/20'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
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
              <span className="text-sm text-muted-foreground">
                {person.followerCount} followers
              </span>
            )}
          </div>

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
        {stats.yearsActive && <StatBox label="Years Active" value={stats.yearsActive} />}
        {stats.byType.movie && <StatBox label="Movies" value={stats.byType.movie} />}
        {stats.byType.show && <StatBox label="Shows" value={stats.byType.show} />}
        {stats.byType.game && <StatBox label="Games" value={stats.byType.game} />}
        {stats.byType.music && <StatBox label="Music" value={stats.byType.music} />}
      </div>

      {/* ── Timeline ── */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Credits</h2>
        <PersonTimelineFilters
          mediaTypeFilter={mediaTypeFilter}
          onMediaTypeChange={(value) => {
            setMediaTypeFilter(value)
            setRoleFilter('all')
          }}
          roleFilter={roleFilter}
          onRoleChange={(value) => {
            setRoleFilter(value)
            setMediaTypeFilter('all')
          }}
        />
        <div className="mt-6">
          <PersonTimeline
            credits={person.credits}
            mediaTypeFilter={mediaTypeFilter}
            roleFilter={roleFilter}
          />
        </div>
      </section>

      {/* ── Related artists ── */}
      {relatedArtists && relatedArtists.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Fans Also Like</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {relatedArtists.map((artist) => (
              <div
                key={artist.spotify_artist_id || artist.name}
                className="w-36 shrink-0 text-center"
              >
                <div className="aspect-square w-full overflow-hidden rounded-full ring-1 ring-border">
                  {artist.image_url ? (
                    <img
                      src={artist.image_url}
                      alt={artist.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[var(--dk-surface-glass)] text-2xl font-bold text-muted-foreground">
                      {artist.name[0]}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs font-medium truncate">{artist.name}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
