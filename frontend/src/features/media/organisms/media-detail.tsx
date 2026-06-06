// TODO: Review this file
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
import { Play, Download, Loader2, CheckCircle2, Clock, XCircle, FolderOpen, Disc } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDownloads, useDownloadConfig } from '@/features/downloads/use-downloads'
import type { HypervisorConfirmResponse } from '@/features/downloads/types'
import { DkDialog } from '@/features/dk-ui/molecules/dialog'
import { useExperiment } from '@/features/experiments/experiments-provider'
import { getScannedGames, setLocalGamesMapEntry, getLocalGamesMap } from '@/features/game-scanner/storage'
import { IsoInstallerModal } from '@/features/game-scanner/organisms/iso-installer-modal'

import './media-detail.scss'


// ── Skeleton ──

function SectionSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div
      aria-hidden="true"
      className="dk-media-detail__section-skeleton"
      style={{
        minHeight: height,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
      }}
    />
  )
}

function DetailSkeleton() {
  return (
    <div className="dk-media-detail__skeleton">
      {/* Hero skeleton — matches MediaHero layout */}
      <div className="dk-media-detail__skeleton-hero">
        {/* Backdrop placeholder with subtle shimmer */}
        <div className="dk-media-detail__skeleton-hero-bg">
          <div className="dk-media-detail__skeleton-hero-shimmer" />
          <div className="dk-media-detail__skeleton-hero-overlay" />
        </div>

        {/* Content */}
        <div className="dk-media-detail__skeleton-hero-content">
          <div className="dk-media-detail__skeleton-hero-flex">
            {/* Poster */}
            <div className="dk-media-detail__skeleton-hero-poster">
              <Skeleton className="aspect-[2/3] w-full rounded-2xl" />
            </div>

            {/* Info */}
            <div className="dk-media-detail__skeleton-hero-info">
              {/* Logo / title */}
              <Skeleton className="mb-2 h-12 w-56 sm:h-14 lg:h-16" />
              {/* Tagline */}
              <Skeleton className="h-4 w-72 sm:h-5 sm:w-80" />
              {/* Badges row */}
              <div className="dk-media-detail__skeleton-hero-badges">
                <Skeleton className="h-7 w-16 rounded-full" />
                <Skeleton className="h-7 w-14 rounded-full" />
                <Skeleton className="h-7 w-20 rounded-full" />
              </div>
              {/* Overview */}
              <div className="dk-media-detail__skeleton-hero-overview">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-11/12" />
                <Skeleton className="h-3 w-5/6" />
              </div>
              {/* Genre badges */}
              <div className="dk-media-detail__skeleton-hero-genres">
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
      <div className="dk-media-detail__skeleton-actions">
        <div className="dk-media-detail__skeleton-actions-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Cast/crew skeleton */}
      <div className="dk-media-detail__skeleton-cast">
        <Skeleton className="mb-4 h-5 w-32" />
        <div className="dk-media-detail__skeleton-cast-scroll">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="dk-media-detail__skeleton-cast-item">
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
    <div className="dk-media-detail__error">
      <div className="dk-media-detail__error-card">
        <div className="dk-media-detail__error-icon">
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
        <h3 className="dk-media-detail__error-title">{typeLabel} Not Found</h3>
        <p className="dk-media-detail__error-desc">
          Could not load details for this {typeLabel.toLowerCase()}. It may have been removed or the ID is incorrect.
        </p>
        <a href="/" className="dk-media-detail__error-link">
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

function isTitleMatch(gameTitle: string, mediaTitle: string): boolean {
  if (!gameTitle || !mediaTitle) return false;
  const norm = (str: string) => {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // strip punctuation
      .replace(/\bii\b/g, '2')
      .replace(/\biii\b/g, '3')
      .replace(/\biv\b/g, '4')
      .replace(/\bv\b/g, '5')
      .replace(/\bvi\b/g, '6')
      .replace(/\bvii\b/g, '7')
      .replace(/\bviii\b/g, '8')
      .replace(/\bix\b/g, '9')
      .replace(/\bx\b/g, '10')
      .replace(/\s+/g, '') // remove all spaces
      .trim();
  };
  return norm(gameTitle) === norm(mediaTitle);
}

// ── Page ──

function DownloadGameButton({ mediaId, mediaTitle }: { mediaId: string; mediaTitle: string }) {
  const { user } = useAuth();
  const { enabled: downloadsEnabled } = useExperiment('download_integration');
  const { downloads, searchAndDownload, cancelDownload, pollQueue } = useDownloads(user?.id);
  const { config: dlConfig } = useDownloadConfig(user?.id);
  const [searching, setSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [postProcessing, setPostProcessing] = useState(false);
  const [isInstallerOpen, setIsInstallerOpen] = useState(false);
  const [localGame, setLocalGame] = useState<DetectedGame | null>(null);
  const [scannedGames, setScannedGames] = useState<DetectedGame[]>([]);
  const [hvDialogOpen, setHvDialogOpen] = useState(false);
  const [hvCountdown, setHvCountdown] = useState(10);
  const [hvPending, setHvPending] = useState<HypervisorConfirmResponse | null>(null);

  // Load scanned games and local game map entry
  useEffect(() => {
    let currentLocal: DetectedGame | null = null;
    try {
      const map = getLocalGamesMap();
      currentLocal = map[mediaId] || null;
      setLocalGame(currentLocal);
    } catch {
      setLocalGame(null);
    }
    
    const scanned = getScannedGames();
    setScannedGames(scanned);

    // Auto-link if not in localGames map but matched by title
    if (!currentLocal && mediaTitle) {
      const match = scanned.find(g => g.otixMediaId === mediaId) ||
                    scanned.find(g => isTitleMatch(g.title, mediaTitle));
      if (match) {
        setLocalGamesMapEntry(mediaId, match);
        setLocalGame(match);
      }
    }
  }, [mediaId, mediaTitle]);

  // Hypervisor confirmation countdown — auto-dismiss after 10s
  useEffect(() => {
    if (!hvDialogOpen) {
      setHvCountdown(10);
      return;
    }
    if (hvCountdown <= 0) {
      setHvDialogOpen(false);
      setErrorMsg('Hypervisor download cancelled (timeout).');
      return;
    }
    const timer = setTimeout(() => setHvCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [hvDialogOpen, hvCountdown]);

  if (!window.desktopAPI || !user?.isAdmin) return null;

  const matchingScannedGame = scannedGames.find(g => g.otixMediaId === mediaId) || localGame;
  const isInstalled = matchingScannedGame && matchingScannedGame.platform !== 'iso';
  
  if (!downloadsEnabled && !matchingScannedGame) return null;

  // Find existing download for this media item (most recent first)
  const existingDownload = downloads.find(d => d.mediaItemId === mediaId);
  const isDownloading = existingDownload && existingDownload.status !== 'completed' && existingDownload.status !== 'failed';
  const isCompleted = existingDownload?.status === 'completed';
  const isIsoAvailable = (matchingScannedGame && matchingScannedGame.platform === 'iso') || !!(existingDownload?.isoPath) || (isCompleted && existingDownload?.isoPath);
  const isoPath = existingDownload?.isoPath || (matchingScannedGame?.platform === 'iso' ? matchingScannedGame.exePath : null);

  const handleDownload = async () => {
    setSearching(true);
    setErrorMsg('');
    const result = await searchAndDownload(user!.id, mediaId, mediaTitle);
    if ('hypervisorAvailable' in result) {
      setHvPending(result);
      setHvCountdown(10);
      setHvDialogOpen(true);
    } else if ('error' in result) {
      setErrorMsg(result.error);
    }
    setSearching(false);
  };

  const handleHvConfirm = async () => {
    setHvDialogOpen(false);
    setHvPending(null);
    setSearching(true);
    setErrorMsg('');
    const result = await searchAndDownload(user!.id, mediaId, mediaTitle, true);
    if ('hypervisorAvailable' in result || 'error' in result) {
      setErrorMsg(result.error ?? '');
    }
    setSearching(false);
  };

  const handleHvDismiss = () => {
    setHvDialogOpen(false);
    setHvPending(null);
    setErrorMsg('Hypervisor download cancelled.');
  };

  // Status display helpers
  const statusConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
    queued: { icon: Clock, label: 'Queued in SABnzbd', color: 'text-amber-400' },
    downloading: { icon: Loader2, label: 'Downloading...', color: 'text-blue-400' },
    processing: { icon: Loader2, label: 'Unpacking/Verifying...', color: 'text-purple-400' },
    completed: { icon: CheckCircle2, label: 'Download complete', color: 'text-green-400' },
    failed: { icon: XCircle, label: 'Download failed', color: 'text-red-400' },
  };

  // 1. Installed: matchingScannedGame exists and is not 'iso'
  if (isInstalled && matchingScannedGame) {
    const handlePlay = async () => {
      try {
        await window.desktopAPI!.launchGame(matchingScannedGame);
      } catch (err) {
        console.error('Failed to launch game:', err);
      }
    };

    return (
      <div className="dk-media-detail__dl-row">
        <button
          onClick={handlePlay}
          className="dk-media-detail__dl-btn-play"
        >
          <Play className="h-4 w-4 fill-current" />
          Play
        </button>
        <p className="dk-media-detail__dl-meta">
          {matchingScannedGame.platform === 'steam' ? 'Launch via Steam' : 'Installed locally'}
        </p>
      </div>
    );
  }

  // 2. Downloading: active download in progress
  if (downloadsEnabled && isDownloading && existingDownload) {
    const cfg = statusConfig[existingDownload.status] || statusConfig.processing;
    const Icon = cfg.icon;
    const pct = existingDownload.percentage ?? 0;

    return (
      <div className="dk-media-detail__dl-status-group">
        <div className={cn('dk-media-detail__dl-status-text', cfg.color)}>
          <Icon className={cn('dk-media-detail__dl-status-icon', (existingDownload.status === 'downloading' || existingDownload.status === 'processing') && 'animate-spin')} />
          <span>{cfg.label}</span>
          {existingDownload.nzbName && (
            <span className="dk-media-detail__dl-status-label">
              — {existingDownload.nzbName}
            </span>
          )}
          <span className="dk-media-detail__dl-status-pct">{pct}%</span>
        </div>
        <div className="dk-media-detail__dl-progress">
          <div
            className="dk-media-detail__dl-progress-bar"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="dk-media-detail__dl-actions">
          <button
            onClick={pollQueue}
            className="dk-media-detail__dl-btn-refresh"
          >
            Refresh status
          </button>
          <button
            onClick={() => cancelDownload(existingDownload.id)}
            className="dk-media-detail__dl-btn-cancel"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // 3. ISO Available / Ready to Install
  if (isIsoAvailable) {
    return (
      <>
        <div className="dk-media-detail__dl-iso-group">
          <div className="dk-media-detail__dl-iso-status">
            <CheckCircle2 className="h-4 w-4" />
            <span>ISO Available</span>
            {isoPath && (
              <span className="dk-media-detail__dl-iso-path">
                {isoPath}
              </span>
            )}
          </div>
          <div className="dk-media-detail__dl-iso-actions">
            <button
              onClick={() => setIsInstallerOpen(true)}
              className="dk-media-detail__dl-btn-install"
            >
              <Disc className="h-4 w-4" />
              Install
            </button>
            {downloadsEnabled && dlConfig && existingDownload?.status === 'completed' && (
              <button
                onClick={async () => {
                  setPostProcessing(true);
                  try {
                    await window.desktopAPI!.downloadsPostProcess(
                      existingDownload.id,
                      dlConfig.id,
                      dlConfig.sabnzbdCompletePath ?? undefined,
                      dlConfig.downloadPath ?? undefined,
                    );
                    await pollQueue();
                  } finally {
                    setPostProcessing(false);
                  }
                }}
                disabled={postProcessing}
                className="dk-media-detail__dl-btn-move"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                {postProcessing ? 'Moving...' : 'Move to library'}
              </button>
            )}
          </div>
          {downloadsEnabled && (
            <button
              onClick={handleDownload}
              className="dk-media-detail__dl-btn-redownload"
            >
              Re-download
            </button>
          )}
        </div>

        <IsoInstallerModal
          open={isInstallerOpen}
          onClose={() => setIsInstallerOpen(false)}
          games={scannedGames}
          initialIsoPath={isoPath || undefined}
        />
      </>
    );
  }

  // 4. Failed download
  if (downloadsEnabled && existingDownload?.status === 'failed') {
    return (
      <div className="dk-media-detail__dl-failed-group">
        <div className="dk-media-detail__dl-failed-status">
          <XCircle className="h-4 w-4" />
          <span>Download failed</span>
        </div>
        {existingDownload.errorMessage && (
          <p className="dk-media-detail__dl-failed-msg">{existingDownload.errorMessage}</p>
        )}
        <button
          onClick={handleDownload}
          className="dk-media-detail__dl-btn-retry"
        >
          Try again
        </button>
      </div>
    );
  }

  // 5. Download Available
  if (downloadsEnabled) {
    return (
      <div className="dk-media-detail__dl-dl-row">
        <button
          onClick={handleDownload}
          disabled={searching}
          className="dk-media-detail__dl-btn-download"
        >
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {searching ? 'Searching...' : 'Download ISO'}
        </button>
        {errorMsg && (
          <p className="dk-media-detail__dl-error">{errorMsg}</p>
        )}
      </div>
    );
  }

  // ── Hypervisor confirmation dialog ──
  return (
    <>
      {null}
      <DkDialog
        open={hvDialogOpen}
        onOpenChange={(open) => { if (!open) handleHvDismiss(); }}
      >
        <div className="dk-media-detail__dl-hv-dialog">
          <p className="dk-media-detail__dl-hv-text">
            Only hypervisor-tagged releases found for <strong>{hvPending?.gameName ?? 'this game'}</strong>.
            These often require VM setup and may not run natively.
          </p>
          <p className="dk-media-detail__dl-hv-countdown">
            Auto-dismissing in <span className="dk-media-detail__dl-hv-countdown-num">{hvCountdown}</span>s
          </p>
          <div className="dk-media-detail__dl-hv-actions">
            <button
              onClick={handleHvConfirm}
              className="dk-media-detail__dl-hv-btn-confirm"
            >
              Download HV version
            </button>
            <button
              onClick={handleHvDismiss}
              className="dk-media-detail__dl-hv-btn-skip"
            >
              Skip
            </button>
          </div>
        </div>
      </DkDialog>
    </>
  );
}

type DetectedGame = import('@/features/game-scanner/types').DetectedGame;

export function MediaDetail() {
  const params = useParams({ strict: false }) as { mediaType?: string; mediaId?: string }
  const mediaType = mediaTypeFromParam(params.mediaType || 'movie')
  const mediaId = params.mediaId || ''

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
    <div className="dk-media-detail">
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
          isAdult={detail.isAdult}
          certification={certification}
          originalLanguage={detail.originalLanguage}
          youtubeVideoId={detail.youtubeVideoId}
        />
      </div>

      {/* ── Content sections ── */}
      <div className="dk-media-detail__content">
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
          <div className="dk-media-detail__game-actions">
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
          <p className="dk-media-detail__sync-msg">
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
          <section className="dk-media-detail__companies">
            <h2 className="dk-media-detail__companies-title">Companies</h2>
            <div className="dk-media-detail__companies-list">
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
                    <Badge variant="secondary" className="dk-media-detail__badge-company">
                      {ic.company.name}
                      {roles.length > 0 && (
                        <span className="dk-media-detail__badge-company-roles">
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
        <footer className="dk-media-detail__footer">
          <div className="dk-media-detail__footer-meta">
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
