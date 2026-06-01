import { useEffect, useRef, useCallback, useState } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'

import { useMediaDetail } from '../hooks/use-media-detail'
import { usePageMeta } from '@/lib/page-context'
import { useAuth } from '@/features/auth'


import { MediaHero } from './media-hero'
import { MovieSection } from './movie-section'
import { ShowSection } from './show-section'
import { GameSection } from './game-section'
import { MusicSection } from './music-section'
import { ArtistAlbumsSection } from './artist-albums-section'
import { SimilarSection } from './similar-section'
import { RecommendationsSection } from './recommendations-section'
import { usePlexAlbumTracks } from '@/features/library/library-queries'
import { CastCrewList } from './cast-crew-list'
import { CollectionSection } from './collection-section'
import { DeferredSection } from '@ui/molecules/deferred-section'
import { Skeleton } from '@ui/atoms/skeleton'
import { Badge } from '@ui/atoms/badge'
import { ReviewSection } from '@/features/review/organisms/review-section'
import { ReviewsListSection } from '@/features/review/organisms/reviews-list-section'
import { RatingsSection } from '@/features/review/organisms/ratings-section'
import { ReviewActionButton } from '@/features/review/molecules/review-action-button'
import { InteractionSection } from '@/features/interaction/molecules/interaction-buttons'
import { WhereToWatchSection } from './where-to-watch-section'

import { useEpisodeInteractions, useToggleEpisodeWatched, useMarkSeasonWatched, useMarkShowWatched } from '@/features/interaction/episode-interaction-queries'
import type { MediaItemDetail } from '../media-queries'


import { AdminActionsMenu } from '@/features/admin/molecules/admin-actions-menu'


// ── Skeleton ──

function SectionSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div
      aria-hidden="true"
      className="rounded-2xl border border-white/[0.06]"
      style={{
        minHeight: height,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
      }}
    />
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-12">
      {/* Hero skeleton — matches MediaHero layout */}
      <div className="relative flex min-h-[65vh] items-end overflow-hidden rounded-3xl border border-white/[0.06] lg:min-h-[75vh]">
        {/* Backdrop placeholder with subtle shimmer */}
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="h-full w-full animate-pulse bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-white/[0.06]" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 via-30% to-background/20" />
        </div>

        {/* Content */}
        <div className="relative z-10 mx-auto w-full lg:max-w-7xl px-4 pb-12 pt-24 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-end sm:justify-between sm:gap-8 lg:gap-12">
            {/* Poster */}
            <div className="w-40 shrink-0 sm:w-44 lg:w-56 xl:w-64">
              <Skeleton className="aspect-[2/3] w-full rounded-2xl" />
            </div>

            {/* Info */}
            <div className="flex min-w-0 flex-1 flex-col items-center gap-3 text-center sm:items-start sm:text-left">
              {/* Logo / title */}
              <Skeleton className="mb-2 h-12 w-56 sm:h-14 lg:h-16" />
              {/* Tagline */}
              <Skeleton className="h-4 w-72 sm:h-5 sm:w-80" />
              {/* Badges row */}
              <div className="flex gap-2">
                <Skeleton className="h-7 w-16 rounded-full" />
                <Skeleton className="h-7 w-14 rounded-full" />
                <Skeleton className="h-7 w-20 rounded-full" />
              </div>
              {/* Overview */}
              <div className="mt-1 w-full max-w-2xl space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-11/12" />
                <Skeleton className="h-3 w-5/6" />
              </div>
              {/* Genre badges */}
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-18 rounded-full" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons skeleton */}
      <div className="mx-auto lg:max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Cast/crew skeleton */}
      <div className="mx-auto lg:max-w-7xl px-4 sm:px-6 lg:px-8">
        <Skeleton className="mb-4 h-5 w-32" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-24 shrink-0 text-center">
              <Skeleton className="mx-auto h-20 w-20 rounded-full" />
              <Skeleton className="mx-auto mt-2 h-3 w-16" />
              <Skeleton className="mx-auto mt-1 h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Error ──

function ErrorState({ mediaType }: { mediaType: string }) {
  const typeLabel =
    mediaType === 'movie'
      ? 'Movie'
      : mediaType === 'show'
        ? 'Show'
        : mediaType === 'music'
          ? 'Album'
          : 'Game'

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="max-w-sm space-y-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M12 3l9.66 16.5H2.34L12 3z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold">{typeLabel} Not Found</h3>
        <p className="text-sm text-muted-foreground">
          Could not load details for this {typeLabel.toLowerCase()}. It may have been removed or the ID is incorrect.
        </p>
        <a href="/" className="inline-block text-sm text-primary hover:underline">
          Go back home
        </a>
      </div>
    </div>
  )
}

// ── Type guards ──

function isMovie(detail: MediaItemDetail): detail is MediaItemDetail & { movie: NonNullable<MediaItemDetail['movie']> } {
  return detail.mediaType === 'movie' && detail.movie != null
}

function isShow(detail: MediaItemDetail): detail is MediaItemDetail & { show: NonNullable<MediaItemDetail['show']> } {
  return detail.mediaType === 'show' && detail.show != null
}

function isGame(detail: MediaItemDetail): detail is MediaItemDetail & { game: NonNullable<MediaItemDetail['game']> } {
  return detail.mediaType === 'game' && detail.game != null
}

function isMusic(detail: MediaItemDetail): detail is MediaItemDetail & { album: NonNullable<MediaItemDetail['album']> } {
  return detail.mediaType === 'music' && detail.album != null
}

function mediaTypeFromParam(param: string): 'movie' | 'show' | 'game' | 'music' {
  if (param === 'movie' || param === 'show' || param === 'game' || param === 'music') return param
  return 'movie'
}

function formatMusicCreditsLine(credits: MediaItemDetail['credits']): string | null {
  const primary = credits.filter((c) => c.role === 'primary').map((c) => c.person.name)
  const featured = credits.filter((c) => c.role === 'featured').map((c) => c.person.name)
  if (primary.length === 0 && featured.length === 0) return null
  const head = primary.join(', ')
  const tail = featured.length ? `feat. ${featured.join(', ')}` : ''
  if (head && tail) return `${head} · ${tail}`
  return head || tail || null
}

// ── Helpers ──

function formatYear(dateStr?: string | null): string {
  if (!dateStr) return ''
  return dateStr.slice(0, 4)
}

function seoDescription(overview?: string | null, title?: string): string {
  if (overview) return overview.length > 200 ? overview.slice(0, 197) + '...' : overview
  return `Details for ${title || 'this title'} on Otix`
}

// ── Page ──

export function MediaDetail() {
  const params = useParams({ strict: false }) as { mediaType?: string; mediaId?: string }
  const mediaType = mediaTypeFromParam(params.mediaType || 'movie')
  const mediaId = params.mediaId || ''

  const { data, isLoading, isError } = useMediaDetail(mediaId)
  const isMusicType = data?.mediaType === 'music'
  const isShowDetail = data?.mediaType === 'show'
  const episodeInteractions = useEpisodeInteractions(mediaId, { enabled: isShowDetail })
  const toggleEpisodeWatched = useToggleEpisodeWatched(mediaId)
  const markSeasonWatched = useMarkSeasonWatched(mediaId)
  const markShowWatched = useMarkShowWatched(mediaId)
  const { setNavLogo } = usePageMeta()
  const heroRef = useRef<HTMLDivElement>(null)
  const logoUrl = data?.logoUrl
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading')

  const { user } = useAuth()
  const { data: plexData } = usePlexAlbumTracks(isMusicType ? mediaId : undefined)

  useEffect(() => {
    if (isLoading) {
      setPhase('loading')
      return
    }
    if (data) {
      const id = setTimeout(() => setPhase('ready'), 200)
      return () => clearTimeout(id)
    }
  }, [isLoading, data])

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const heroVisible = entries[0]?.isIntersecting ?? true
      if (!heroVisible && logoUrl) {
        setNavLogo(logoUrl)
      } else {
        setNavLogo(null)
      }
    },
    [logoUrl, setNavLogo],
  )

  useEffect(() => {
    const el = heroRef.current
    if (!el) return
    const observer = new IntersectionObserver(handleIntersection, {
      rootMargin: '-60px 0px 0px 0px',
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      setNavLogo(null)
    }
  }, [handleIntersection, setNavLogo])

  if (phase !== 'ready') {
    if (isError || (!isLoading && !data)) return <ErrorState mediaType={mediaType} />
    return <DetailSkeleton />
  }

  if (isError || !data) return <ErrorState mediaType={mediaType} />

  const detail = data
  const year = formatYear(detail.releaseDate)
  const titleWithYear = year ? `${detail.title} (${year})` : detail.title
  const displayType = detail.mediaType as 'movie' | 'show' | 'game' | 'music'
  const musicCreditsLine = detail.mediaType === 'music' ? formatMusicCreditsLine(detail.credits) : null

  const userCountry = (user?.country || 'us').toLowerCase()
  const certification =
    detail.releases?.find(
      (r) => r.countryCode === userCountry && r.certification,
    )?.certification ||
    (userCountry !== 'us'
      ? detail.releases?.find((r) => r.countryCode === 'us' && r.certification)?.certification
      : null) ||
    null

  return (
    <div className="animate-fade-in space-y-12 pb-16">
      {/* ── SEO ── */}
      <Helmet>
        <title>{`${titleWithYear} - Otix`}</title>
        <meta name="description" content={seoDescription(detail.overview, detail.title)} />
        <meta property="og:title" content={`${titleWithYear} - Otix`} />
        <meta property="og:description" content={seoDescription(detail.overview, detail.title)} />
        <meta property="og:type" content={
          detail.mediaType === 'show'
            ? 'video.tv_show'
            : detail.mediaType === 'music'
              ? 'music.album'
              : 'video.movie'
        } />
        {detail.posterUrl && <meta property="og:image" content={detail.posterUrl} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${titleWithYear} - Otix`} />
        <meta name="twitter:description" content={seoDescription(detail.overview, detail.title)} />
        {detail.posterUrl && <meta name="twitter:image" content={detail.posterUrl} />}
        <link rel="canonical" href={window.location.origin + `/media/${displayType}/${detail.slug || mediaId}`} />
        {detail.logoUrl && <link rel="preload" as="image" href={detail.logoUrl} fetchPriority="high" />}
      </Helmet>

      {/* ── Hero ── */}
      <div ref={heroRef}>
        <MediaHero
          mediaType={displayType}
          title={detail.title}
          backdropUrl={detail.backdropUrl}
          posterUrl={detail.posterUrl || plexData?.albumThumbUrl || null}
          logoUrl={detail.logoUrl}
          textlessPosterUrl={detail.textlessPosterUrl}
          releaseDate={detail.releaseDate}
          genres={detail.genres}
          avgRating={detail.avgRating}
          ratingCount={detail.ratingCount}
          overview={detail.overview}
          runtime={detail.movie?.runtime}
          albumDurationMs={detail.album?.durationMs}
          tagline={detail.movie?.tagline || detail.game?.reviewSummary || musicCreditsLine}
          status={detail.show?.status || detail.game?.releaseStatus}
          isAnime={detail.show?.isAnime}
          isAdult={detail.isAdult}
          certification={certification}
          originalLanguage={detail.originalLanguage}
          youtubeVideoId={detail.youtubeVideoId}
        />
      </div>

      {/* ── Content sections ── */}
      <div className="mx-auto lg:max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8">
        {/* Interactions — Like, Watchlist, Watched, Played */}
        <InteractionSection
          mediaId={detail.id}
          mediaType={displayType}
          userInteractions={detail.userInteractions}
          onShowWatchedToggle={
            isShowDetail
              ? (active) => markShowWatched.mutate(active)
              : undefined
          }
          showEpisodeInfo={
            isShowDetail && episodeInteractions.data
              ? (() => {
                  const eps = Object.values(episodeInteractions.data.episodes)
                  return {
                    watched: eps.filter((e) => e.watched).length,
                    total: eps.length,
                  }
                })()
              : undefined
          }
        >
          <ReviewActionButton mediaId={detail.id} />
          <AdminActionsMenu mediaId={detail.id} media={detail} />
        </InteractionSection>

        {/* Ratings — Otix community + external */}
        <RatingsSection
          avgRating={detail.avgRating}
          ratingCount={detail.ratingCount}
          externalRatings={detail.externalRatings}
        />

        {/* Type-specific details */}
        {isMovie(detail) && <MovieSection movie={detail.movie} />}
        {isShow(detail) && (
  <ShowSection
    show={detail.show}
    episodeInteractions={episodeInteractions.data?.episodes}
    onToggleEpisodeWatched={(episodeId, active) =>
      toggleEpisodeWatched.mutate({ episodeId, active })
    }
    onMarkSeasonWatched={(seasonNumber, active) =>
      markSeasonWatched.mutate({ seasonNumber, active })
    }
  />
)}
        {isGame(detail) && (
          <GameSection
            game={detail.game}
            platforms={detail.platforms}
            gameModes={detail.gameModes}
            steamPlaytimeForever={detail.steamPlaytimeForever}
            steamPlaytime2weeks={detail.steamPlaytime2weeks}
            steamRtimeLastPlayed={detail.steamRtimeLastPlayed}
          />
        )}

        {isMusic(detail) && <MusicSection album={detail.album} mediaItemId={detail.id} />}
        {detail.mediaType === 'music' && !detail.album && (
          <p className="text-center text-sm text-muted-foreground">
            Album details are still syncing for this release.
          </p>
        )}

        {/* Other albums by same artist */}
        {detail.mediaType === 'music' && (() => {
          const primaryArtist = detail.credits.find((c) => c.role === 'primary')
          if (primaryArtist) {
            return (
              <ArtistAlbumsSection
                artistPersonId={primaryArtist.person.id}
                artistName={primaryArtist.person.name}
                currentMediaId={detail.id}
              />
            )
          }
          return null
        })()}

        {/* Collection (movies only) */}
        {detail.collection && (
          <CollectionSection collection={detail.collection} currentMediaId={detail.id} />
        )}

        {/* Similar items (content-based, always shown) */}
        <SimilarSection mediaId={detail.id} mediaType={displayType} />

        {/* Recommendations (personalized via embedding centroid) */}
        <RecommendationsSection mediaId={detail.id} />

        {/* Companies */}
        {detail.involvedCompanies && detail.involvedCompanies.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Companies</h2>
            <div className="flex flex-wrap gap-1.5">
              {detail.involvedCompanies.map((ic) => {
                const roles: string[] = []
                if (ic.production) roles.push('Production')
                if (ic.developer) roles.push('Dev')
                if (ic.publisher) roles.push('Pub')
                if (ic.porting) roles.push('Port')
                if (ic.supporting) roles.push('Support')
                return (
                  <Link
                    key={ic.id}
                    to="/company/$companyId"
                    params={{ companyId: ic.company.id }}
                  >
                    <Badge variant="secondary" className="gap-1.5 border-white/10 bg-white/5 hover:bg-white/10 transition-colors">
                      {ic.company.name}
                      {roles.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {roles.join('/')}
                        </span>
                      )}
                    </Badge>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* Cast & Crew (deferred) */}
        {detail.credits && detail.credits.length > 0 && (
          <DeferredSection
            fallback={<SectionSkeleton height={260} />}
            rootMargin="400px 0px"
          >
            <CastCrewList credits={detail.credits} />
          </DeferredSection>
        )}

        {/* Where to Watch */}
        <WhereToWatchSection
          watchProviders={detail.watchProviders}
          mediaType={displayType}
        />

        {/* User reviews — Your Rating */}
        <DeferredSection
          fallback={<SectionSkeleton height={120} />}
          rootMargin="200px 0px"
        >
          <ReviewSection mediaId={detail.id} />
        </DeferredSection>

        {/* User reviews — Community Reviews */}
        <DeferredSection
          fallback={<SectionSkeleton height={260} />}
          rootMargin="400px 0px"
        >
          <ReviewsListSection mediaId={detail.id} />
        </DeferredSection>

        {/* Metadata footer */}
        <footer className="border-t border-border pt-6 text-xs text-muted-foreground">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>Completeness: {Math.round(detail.completenessScore * 100)}%</span>
            <span aria-hidden="true">·</span>
            <span>Updated {new Date(detail.updatedAt).toLocaleDateString()}</span>
            <span aria-hidden="true">·</span>
            <span>ID: {detail.id}</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
