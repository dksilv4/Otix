import { useEffect, useRef, useCallback, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import { useQueryClient } from '@tanstack/react-query'
import { useMediaDetail } from '../hooks/use-media-detail'
import { usePageMeta } from '@/lib/page-context'
import { apiClient, API_BASE_URL } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { mediaKeys } from '../media-keys'
import { MediaHero } from './media-hero'
import { MovieSection } from './movie-section'
import { ShowSection } from './show-section'
import { GameSection } from './game-section'
import { MusicSection } from './music-section'
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
import type { MediaItemDetail } from '../media-queries'
import { useAuth } from '@/features/auth/auth-provider'
import { useToast } from '@/features/dk-ui/molecules/toast'
import { AdminActionsMenu } from '@/features/admin/molecules/admin-actions-menu'
import { RefreshCw, ShieldCheck } from 'lucide-react'

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
    <div className="space-y-8">
      <div className="relative">
        <Skeleton className="h-72 w-full sm:h-96" />
        <div className="relative z-10 mx-auto lg:max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-8 sm:flex-row">
            <Skeleton className="mx-auto h-72 w-48 shrink-0 rounded-lg sm:mx-0 sm:h-80 sm:w-56" />
            <div className="flex flex-col justify-center gap-3">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-14" />
                <Skeleton className="h-5 w-14" />
                <Skeleton className="h-5 w-14" />
              </div>
              <Skeleton className="h-20 w-full max-w-md" />
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto lg:max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="mx-auto lg:max-w-7xl px-4 sm:px-6 lg:px-8">
        <Skeleton className="mb-3 h-6 w-24" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="w-28 shrink-0 text-center">
              <Skeleton className="mx-auto h-20 w-20 rounded-full" />
              <Skeleton className="mx-auto mt-1.5 h-3 w-16" />
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

type MediaRehydrateEvent =
  | { type: 'rehydrate_started'; title?: string; media_type?: string }
  | { type: 'provider_started'; provider: string; label: string }
  | { type: 'provider_complete'; provider: string; label: string }
  | { type: 'rehydrate_complete'; title?: string }
  | { type: 'error'; message?: string; error?: string }

async function* parseMediaRehydrateEvents(response: Response): AsyncGenerator<MediaRehydrateEvent> {
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() || ''

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (line.startsWith('data: ')) {
          yield JSON.parse(line.slice(6)) as MediaRehydrateEvent
        }
      }
    }
  }
}

function AdminRehydrateAction({ mediaId }: { mediaId: string }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const abortRef = useRef<AbortController | null>(null)
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<string | null>(null)
  const [lastProvider, setLastProvider] = useState<string | null>(null)

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  if (!user?.isAdmin) return null

  const refreshMedia = () => {
    queryClient.invalidateQueries({ queryKey: mediaKeys.detail(mediaId) })
  }

  const startRehydrate = async () => {
    abortRef.current?.abort()
    const abortController = new AbortController()
    abortRef.current = abortController
    setRunning(true)
    setPhase('Queueing high-priority hydration...')
    setLastProvider(null)

    try {
      const { data } = await apiClient.post<{ taskId: string }>(`/media/${mediaId}/rehydrate`)
      const token = localStorage.getItem('otix-access-token')
      const response = await fetch(`${API_BASE_URL}/media/${mediaId}/rehydrate/${data.taskId}/stream`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: abortController.signal,
      })

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status}`)
      }

      for await (const event of parseMediaRehydrateEvents(response)) {
        switch (event.type) {
          case 'rehydrate_started':
            setPhase('Hydration started')
            break
          case 'provider_started':
            setPhase(`Running ${event.label}`)
            setLastProvider(event.label)
            break
          case 'provider_complete':
            setPhase(`Updated ${event.label}`)
            setLastProvider(event.label)
            refreshMedia()
            break
          case 'rehydrate_complete':
            setPhase('Hydration complete')
            refreshMedia()
            toast({ title: 'Media rehydrated', variant: 'success' })
            break
          case 'error':
            throw new Error(event.message || event.error || 'Hydration failed')
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : 'Hydration failed'
      setPhase(message)
      toast({ title: 'Could not rehydrate media', description: message, variant: 'error' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--dk-surface-glass)] px-4 py-3 shadow-[var(--dk-shadow-sm)]">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">Admin hydration</p>
          <p className="truncate text-xs text-muted-foreground">
            {phase ?? 'Force a full provider refresh for this item.'}
            {lastProvider && running ? ` · ${lastProvider}` : ''}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={startRehydrate}
        disabled={running}
        className={cn(
          'inline-flex items-center gap-2 rounded-xl bg-[var(--dk-surface-base)] px-3 py-2 text-xs font-medium text-foreground shadow-[var(--dk-shadow-sm)] transition-colors',
          'hover:bg-[var(--dk-surface-glass-hover)] disabled:pointer-events-none disabled:opacity-60',
        )}
      >
        <RefreshCw className={cn('h-3.5 w-3.5', running && 'animate-spin')} />
        {running ? 'Hydrating' : 'Force rehydrate'}
      </button>
    </div>
  )
}

// ── Page ──

export function MediaDetail() {
  const params = useParams({ strict: false }) as { mediaType?: string; mediaId?: string }
  const mediaType = mediaTypeFromParam(params.mediaType || 'movie')
  const mediaId = params.mediaId || ''

  const { data, isLoading, isError } = useMediaDetail(mediaId)
  const { setNavLogo } = usePageMeta()
  const heroRef = useRef<HTMLDivElement>(null)
  const logoUrl = data?.logoUrl

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

  if (isLoading) return <DetailSkeleton />
  if (isError || !data) return <ErrorState mediaType={mediaType} />

  const detail = data
  const year = formatYear(detail.releaseDate)
  const titleWithYear = year ? `${detail.title} (${year})` : detail.title
  const displayType = detail.mediaType as 'movie' | 'show' | 'game' | 'music'
  const musicCreditsLine = detail.mediaType === 'music' ? formatMusicCreditsLine(detail.credits) : null

  return (
    <div className="space-y-12 pb-16">
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
        {isShow(detail) && <ShowSection show={detail.show} />}
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

        {isMusic(detail) && <MusicSection album={detail.album} />}
        {detail.mediaType === 'music' && !detail.album && (
          <p className="text-center text-sm text-muted-foreground">
            Album details are still syncing for this release.
          </p>
        )}

        {/* Collection (movies only) */}
        {detail.collection && (
          <CollectionSection collection={detail.collection} currentMediaId={detail.id} />
        )}

        {/* Companies */}
        {detail.involvedCompanies && detail.involvedCompanies.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Companies</h2>
            <div className="flex flex-wrap gap-1.5">
              {detail.involvedCompanies.map((ic) => {
                const roles: string[] = []
                if (ic.developer) roles.push('Dev')
                if (ic.publisher) roles.push('Pub')
                if (ic.porting) roles.push('Port')
                if (ic.supporting) roles.push('Support')
                return (
                  <Badge key={ic.id} variant="secondary" className="gap-1.5">
                    {ic.company.name}
                    {roles.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {roles.join('/')}
                      </span>
                    )}
                  </Badge>
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
