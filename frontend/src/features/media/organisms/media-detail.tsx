// TODO: Review this file
import { useEffect, useRef, useCallback, useState } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'

import { usePageMeta } from '@/lib/page-context'
import { useAuth } from '@/features/auth'


import { MediaHero } from './media-hero'
import { MovieSection } from './media-movie-section'
import { ShowSection } from './media-show-section'
import { GameSection } from './media-game-section'
import { MusicSection } from './media-music-section'
import { ArtistAlbumsSection } from './media-artist-albums-section'
import { SimilarSection } from './media-similar-section'
import { RecommendationsSection } from './media-recommendations-section'
import { CastCrewList } from './media-cast-crew-list'
import { CollectionSection } from './media-collection-section'
import { DeferredSection } from '@ui/molecules/deferred-section'
import { Badge } from '@ui/atoms/badge'
import { ReviewSection } from '@/features/review/organisms/review-section'
import { ReviewsListSection } from '@/features/review/organisms/reviews-list-section'
import { RatingsSection } from '@/features/review/organisms/ratings-section'
import { ReviewActionButton } from '@/features/review/molecules/review-action-button'
import { InteractionSection } from '@/features/interaction/molecules/interaction-buttons'
import { WhereToWatchSection } from './media-where-to-watch-section'
import { SectionSkeleton } from './media-detail-section-skeleton'
import { DetailSkeleton } from './media-detail-skeleton'
import { ErrorState } from './media-detail-error-state'
import { DownloadGameButton } from './media-download-game-button'

import { useEpisodeInteractions, useToggleEpisodeWatched, useMarkSeasonWatched, useMarkShowWatched } from '@/features/interaction/episode-interaction-queries'
import { useQuery } from '@tanstack/react-query'
import { mediaQueries, type MediaItemDetail } from '../media-queries'

function useMediaDetail(id: string) {
  return useQuery(mediaQueries.detail(id))
}


import { AdminActionsMenu } from '@/features/admin/molecules/admin-actions-menu'
import { cn } from '@/lib/utils'
import { useDesktopPlatform } from '@/lib/desktop-platform'




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




export function MediaDetail() {
  const params = useParams({ strict: false }) as { mediaType?: string; mediaId?: string }
  const mediaType = mediaTypeFromParam(params.mediaType || 'movie')
  const mediaId = params.mediaId || ''

  // Route param not available yet during hard refresh — show skeleton, not error
  if (!mediaId) return <DetailSkeleton />

  const { isDesktop } = useDesktopPlatform()

  const { data, isLoading, isError } = useMediaDetail(mediaId)
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
    <div className={cn('animate-fade-in space-y-12 pb-16', isDesktop && 'pt-[var(--title-bar-height,38px)]')}>
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
      <div ref={heroRef} className="">
        <MediaHero
          mediaType={displayType}
          title={detail.title}
          backdropUrl={detail.backdropUrl}
          posterUrl={detail.posterUrl}
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
      <div className="max-w-[calc(100vw)]">
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

        {/* Unified game action button (Play / Install / Download) */}
        {detail.mediaType === 'game' && (
          <div className="flex flex-wrap items-center gap-4">
            <DownloadGameButton mediaId={detail.id} mediaTitle={detail.title} />
          </div>
        )}

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

        {isMusic(detail) && (
          <MusicSection
            album={detail.album}
            mediaItemId={detail.id}
            title={detail.title}
            posterUrl={detail.posterUrl}
            artistName={detail.credits.find((c) => c.role === 'primary')?.person.name || null}
          />
        )}
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
                    <Badge variant="secondary" className="gap-1.5 border-white/10 bg-white/5 transition-colors hover:bg-white/10">
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
