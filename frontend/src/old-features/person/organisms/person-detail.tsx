// TODO: Review this file
import { useState } from 'react'
import { useParams, useSearch, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { UserRoundPlus, UserRoundCheck, Star } from 'lucide-react'
import { Image } from '@ui/atoms/image'
import { Skeleton } from '@ui/atoms/skeleton'
import { useAuth } from '@/old-features/auth'
import { personQueries, useFollowPerson, useUnfollowPerson, useRatePerson, useUnratePerson } from '../person-queries'
import type { PersonDetail as PersonDetailData } from '../person-queries'
import { PersonTimeline } from './person-timeline'
import { PersonTimelineFilters } from './person-timeline-filters'
import { cn } from '@/lib/utils'
import './person-detail.scss'

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function getStats(credits: PersonDetailData['credits']) {
  // Safety: filter out credits with deleted media items
  const valid = credits.filter((c) => c.mediaItem != null)
  const total = valid.length
  const years = valid
    .map((c) => c.mediaItem!.releaseDate)
    .filter(Boolean)
    .map((d) => new Date(d!).getFullYear())
    .sort((a, b) => a - b)

  const yearsActive = years.length > 0
    ? `${years[0]} – ${years[years.length - 1]}`
    : null

  const byType: Record<string, number> = {}
  for (const c of valid) {
    const t = c.mediaItem!.mediaType || 'other'
    byType[t] = (byType[t] || 0) + 1
  }

  return { total, yearsActive, byType }
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="dk-person-detail__stat-box">
      <div className="dk-person-detail__stat-value">{value}</div>
      <div className="dk-person-detail__stat-label">{label}</div>
    </div>
  )
}

function StarRating({ value, onChange, readonly }: { value: number | null; onChange?: (score: number) => void; readonly?: boolean }) {
  const [hover, setHover] = useState(0)
  const active = hover || value || 0

  return (
    <div className="dk-person-detail__star-rating" onMouseLeave={() => setHover(0)}>
      {Array.from({ length: 5 }).map((_, i) => {
        const score = i + 1
        const filled = score <= active
        return (
          <button
            key={score}
            type="button"
            disabled={readonly}
            className={cn(
              'dk-person-detail__star-btn',
              readonly && 'dk-person-detail__star-btn--readonly',
              !readonly && 'dk-person-detail__star-btn--interactive',
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
      {value != null && <span className="dk-person-detail__star-text">{value}/5</span>}
    </div>
  )
}

export function PersonDetail() {
  const params = useParams({ from: '/person/$personId' })
  const search = useSearch({ from: '/person/$personId' })
  const navigate = useNavigate()
  const personId = params.personId || ''
  const { isAuthenticated } = useAuth()

  const { data: person, isLoading, isError } = useQuery(personQueries.detail(personId))
  const { data: relatedArtists } = useQuery(personQueries.related(personId))
  const follow = useFollowPerson(personId)
  const unfollow = useUnfollowPerson(personId)
  const rate = useRatePerson(personId)
  const unrate = useUnratePerson(personId)

  const [bioExpanded, setBioExpanded] = useState(false)

  const updateSearch = (updates: Partial<typeof search>) => {
    navigate({ to: '/person/$personId', params: { personId }, search: { ...search, ...updates }, replace: true })
  }

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
      <div className="dk-person-detail__loading">
        <div className="dk-person-detail__loading-inner">
          <Skeleton className="h-40 w-40 rounded-full" />
          <div className="dk-person-detail__loading-text">
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
      <div className="dk-person-detail__error">
        <div className="dk-person-detail__error-content">
          <h2 className="dk-person-detail__error-title">Person not found</h2>
          <a href="/" className="dk-person-detail__error-link">Go back home</a>
        </div>
      </div>
    )
  }

  const stats = getStats(person.credits)
  const bioTruncation = 400
  const showBioExpand = (person.biography?.length ?? 0) > bioTruncation

  return (
    <div className="dk-person-detail">
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
      <div className="dk-person-detail__header">
        <div className="dk-person-detail__avatar">
          <Image
            src={person.photoUrl ?? undefined}
            alt={person.name}
            className="dk-person-detail__avatar-img"
            fallback={person.name[0]}
          />
        </div>

        <div className="dk-person-detail__info">
          <div className="dk-person-detail__title-row">
            <h1 className="dk-person-detail__name">{person.name}</h1>
            {person.avgRating != null && (
              <span className="dk-person-detail__rating-badge">
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
                  'dk-person-detail__follow-btn',
                  person.isFollowed && 'dk-person-detail__follow-btn--followed',
                  !person.isFollowed && 'dk-person-detail__follow-btn--not-followed',
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
              <span className="dk-person-detail__follower-badge">
                <UserRoundPlus className="h-4 w-4" />
                <span>{person.followerCount} followers</span>
              </span>
            )}
            {isAuthenticated && person.followerCount > 0 && (
              <span className="dk-person-detail__follower-text">
                {person.followerCount} followers
              </span>
            )}
          </div>

          {/* Rating */}
          {isAuthenticated && (
            <div className="dk-person-detail__rating-row">
              <StarRating
                value={person.userRating ?? null}
                onChange={(score) => rate.mutate(score)}
              />
              {(person.userRating ?? null) != null && (
                <button
                  onClick={() => unrate.mutate()}
                  className="dk-person-detail__clear-rating"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          <div className="dk-person-detail__meta">
            {person.birthday && <span>{formatDate(person.birthday)}</span>}
            {person.deathday && <span>– {formatDate(person.deathday)}</span>}
            {person.placeOfBirth && <span>{person.placeOfBirth}</span>}
          </div>

          {person.biography && (
            <div className="dk-person-detail__bio">
              <p>
                {showBioExpand && !bioExpanded
                  ? person.biography.slice(0, bioTruncation) + '…'
                  : person.biography}
              </p>
              {showBioExpand && (
                <button
                  type="button"
                  onClick={() => setBioExpanded((prev) => !prev)}
                  className="dk-person-detail__bio-toggle"
                >
                  {bioExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="dk-person-detail__stats">
        <StatBox label="Total Credits" value={stats.total} />
        {person.avgRating != null && <StatBox label="Rating" value={`${person.avgRating}/5`} />}
        {stats.yearsActive && <StatBox label="Years Active" value={stats.yearsActive} />}
        {stats.byType.movie && <StatBox label="Movies" value={stats.byType.movie} />}
        {stats.byType.show && <StatBox label="Shows" value={stats.byType.show} />}
        {stats.byType.game && <StatBox label="Games" value={stats.byType.game} />}
        {stats.byType.music && <StatBox label="Music" value={stats.byType.music} />}
      </div>

      {/* ── Timeline ── */}
      <section>
        <h2 className="dk-person-detail__section-heading dk-person-detail__section-heading--credits">Credits</h2>
        <PersonTimelineFilters
          mediaTypeFilter={search.mediaType || 'all'}
          onMediaTypeChange={(value) => {
            updateSearch({ mediaType: value || 'all', role: 'all' })
          }}
          roleFilter={search.role || 'all'}
          onRoleChange={(value) => {
            updateSearch({ role: value || 'all', mediaType: 'all' })
          }}
        />
        <div className="dk-person-detail__timeline">
          <PersonTimeline
            credits={person.credits}
            mediaTypeFilter={search.mediaType || 'all'}
            roleFilter={search.role || 'all'}
          />
        </div>
      </section>

      {/* ── Related artists ── */}
      {relatedArtists && relatedArtists.length > 0 && (
        <section>
          <h2 className="dk-person-detail__section-heading dk-person-detail__section-heading--related">Fans Also Like</h2>
          <div className="dk-person-detail__related-list">
            {relatedArtists.map((artist) => (
              <div
                key={artist.spotify_artist_id || artist.name}
                className="dk-person-detail__related-card"
              >
                <div className="dk-person-detail__related-image">
                  {artist.image_url ? (
                    <img
                      src={artist.image_url}
                      alt={artist.name}
                      className="dk-person-detail__related-img"
                    />
                  ) : (
                    <div className="dk-person-detail__related-fallback">
                      {artist.name[0]}
                    </div>
                  )}
                </div>
                <p className="dk-person-detail__related-name">{artist.name}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
