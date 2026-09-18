import { lazy, Suspense, useRef } from 'react'
import { Badge } from '@ui/atoms/badge'
import { MEDIA_TYPE_LABEL } from '@/constants/media'
import {
  Calendar,
  Clock,
  Languages,
  Film,
  Tv,
  Gamepad2,
  Music,
  Sparkles,
  Heart,
  Play,
  Bookmark,
  CheckCircle2,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@auth/hooks/use-auth'
import { MediaLogo } from '@/lib/media/media-logo'
import { useModal } from '@/lib/modals'
import { MediaTrailerModal } from './media-trailer-modal'
import {
  backdropSrc,
  formatAlbumDuration,
  formatMusicCreditsLine,
  formatRuntime,
  formatYear,
  isMusic,
  languageName,
  mediaQueries,
  GLASS_PILL,
  primaryTrailer,
  useMediaParams,
} from '@media'
import { AdminActionsMenu } from '@/features/admin'
import { AddToListButton } from '@list'
import { useToggleInteraction, useUserInteractions } from '@/features/interaction/interaction-queries'
import { showXPToast } from '@ui/atoms/xp-toast'
import { cn } from '@/lib/utils'

const MediaHeroLibraryActions = lazy(() =>
  import('./media-hero-library-actions').then((m) => ({ default: m.MediaHeroLibraryActions })),
)

interface MediaHeroProps {
  className?: string
  onTrailerClick?: () => void
}

export function MediaHero({ className = '' }: MediaHeroProps) {
  const { mediaType, mediaId } = useMediaParams()
  const { user, isAuthenticated } = useAuth()
  const { openModal } = useModal()
  const closeTrailerRef = useRef<(() => void) | null>(null)

  const { data: detail } = useQuery(mediaQueries.detail(mediaType, mediaId))

  const { data: userInteractions } = useUserInteractions(mediaType, mediaId, {
    enabled: isAuthenticated,
  })
  const toggleInteraction = useToggleInteraction(mediaType, mediaId)

  if (!detail) return null

  const {
    title,
    backdropUrl,
    posterUrl,
    logoUrl,
    logoColorGuess,
    textlessPosterUrl,
    releaseDate,
    originalLanguage,
    isAdult,
  } = detail

  const isAnime = detail.movie?.isAnime || detail.show?.isAnime || false
  const isKdrama = mediaType === 'show' && originalLanguage === 'ko'
  const musicCreditsLine = isMusic(detail) ? formatMusicCreditsLine(detail.credits) : null
  const tagline = detail.movie?.tagline || detail.game?.reviewSummary || musicCreditsLine

  const status = detail.show?.status || detail.game?.releaseStatus
  const runtime = detail.movie?.runtime
  const albumDurationMs = detail.album?.durationMs

  const userCountry = (user?.country || 'us').toLowerCase()
  const releases = Array.isArray(detail.releases) ? detail.releases : []
  const certification =
    releases.find((r) => r.countryCode === userCountry && r.certification)?.certification ||
    (userCountry !== 'us'
      ? releases.find((r) => r.countryCode === 'us' && r.certification)?.certification
      : null) ||
    null

  const year = formatYear(releaseDate)
  const formattedRuntime = formatRuntime(runtime)
  const formattedAlbumLength = formatAlbumDuration(albumDurationMs)
  const languageDisplay = originalLanguage ? languageName(originalLanguage) : null

  // TV show season / episode count
  const showSeasons = Array.isArray(detail.show?.seasons) ? detail.show.seasons : []
  const seasonsCount = showSeasons.length
  const episodesCount =
    showSeasons.reduce((acc, s) => acc + (s.episodeCount || (Array.isArray(s.episodes) ? s.episodes.length : 0)), 0)

  const logo: string | undefined = logoUrl || textlessPosterUrl || undefined
  const hasLogo = Boolean(logo)
  const heroBackdrop = backdropUrl || (mediaType === 'music' && posterUrl ? posterUrl : null)

  const trailer = primaryTrailer(detail)
  const openTrailer = () => {
    if (!trailer) return
    closeTrailerRef.current?.()
    closeTrailerRef.current = openModal(
      <MediaTrailerModal
        embedSrc={`https://www.youtube-nocookie.com/embed/${trailer.youtubeId}?rel=0&autoplay=1`}
        title={title}
        onClose={() => closeTrailerRef.current?.()}
      />,
    )
  }

  // Active interaction states
  const interactions = userInteractions ?? detail.userInteractions ?? {}
  const isLiked = Boolean(interactions.liked)
  const isWatchlisted = Boolean(interactions.watchlisted)
  const isWatched = Boolean(
    interactions.watched || interactions.played || interactions.listened,
  )

  const handleToggle = (type: 'liked' | 'watchlisted' | 'watched' | 'played' | 'listened') => {
    if (!isAuthenticated) return
    const active =
      type === 'liked' ? !isLiked : type === 'watchlisted' ? !isWatchlisted : !isWatched

    toggleInteraction.mutate({ type, active })
    if (active) {
      showXPToast(type === 'liked' || type === 'watchlisted' ? 10 : 30)
    }
  }

  const watchedType =
    mediaType === 'game' ? 'played' : mediaType === 'music' ? 'listened' : 'watched'
  const watchlistLabel = mediaType === 'game' || mediaType === 'music' ? 'Wishlist' : 'Watchlist'
  const watchedLabel =
    mediaType === 'game' ? 'Played' : mediaType === 'music' ? 'Listened' : 'Watched'

  const trailerIsPrimary = !isAuthenticated

  return (
    <header id="media-hero" className={`relative min-h-[46vh] lg:min-h-[50vh] pb-6 ${className}`}>
      {/* ── Fixed Backdrop with cinematic depth ── */}
      {heroBackdrop && (
        <div className="fixed pointer-events-none inset-0 z-0 overflow-hidden">
          <img
            src={backdropSrc(heroBackdrop)}
            alt=""
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover brightness-[0.40] contrast-[1.08] saturate-[1.1]"
            style={{
              objectPosition: 'center 22%',
              animation: 'kenBurns 32s ease-out forwards',
            }}
          />
          {/* Multi-stop smooth atmospheric veil */}
          <div
            className="fixed inset-0"
            style={{
              background:
                'linear-gradient(to top, color-mix(in oklab, var(--background) 100%, transparent) 0%, color-mix(in oklab, var(--background) 88%, transparent) 25%, color-mix(in oklab, var(--background) 55%, transparent) 60%, color-mix(in oklab, var(--background) 25%, transparent) 100%)',
            }}
          />
        </div>
      )}

      {/* ── Hero Foreground Content ── */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 sm:pt-22 pb-2">
        <div className="flex flex-col items-center sm:flex-row sm:items-end gap-6 sm:gap-8 lg:gap-10">
          {/* Poster with subtle ambient glow */}
          <div className="w-36 shrink-0 sm:w-44 lg:w-56 xl:w-60 group">
            <div className="overflow-hidden rounded-2xl shadow-2xl shadow-black/80 ring-1 ring-white/20 bg-black/50 transition-all duration-300 group-hover:scale-[1.02]">
              <img
                src={posterUrl || undefined}
                alt={`${title} poster`}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className={`w-full object-cover ${mediaType === 'music' ? 'aspect-square' : 'aspect-[2/3]'}`}
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            </div>
          </div>

          {/* Title, Genres, Meta & CTAs */}
          <div className="flex min-w-0 flex-1 flex-col items-center sm:items-start text-center sm:text-left gap-3.5">
            {/* Logo or Title */}
            {hasLogo ? (
              <MediaLogo
                src={logo!}
                alt={title}
                className="max-h-20 sm:max-h-24 lg:max-h-28 max-w-[88%] sm:max-w-[70%] object-contain mb-0.5"
                colorGuess={logoUrl ? (logoColorGuess ?? null) : null}
                background={logoUrl ? 'theme' : 'none'}
              />
            ) : (
              <h1
                className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white"
                style={{ textShadow: '0 2px 24px rgba(0,0,0,0.7)' }}
              >
                {title}
              </h1>
            )}

            {/* Tagline */}
            {tagline && (
              <p
                className="max-w-[64ch] text-sm sm:text-base italic text-white/75 line-clamp-2"
                style={{ textShadow: '0 1px 12px rgba(0,0,0,0.6)' }}
              >
                &ldquo;{tagline}&rdquo;
              </p>
            )}

            {/* Core Metadata Badges Strip */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-0.5">
              {isAnime ? (
                <Badge
                  variant="secondary"
                  className="bg-pink-500/80 text-white gap-1 px-2.5 py-1 text-xs font-medium border-0"
                >
                  <Sparkles className="h-3 w-3" /> Anime
                </Badge>
              ) : isKdrama ? (
                <Badge
                  variant="secondary"
                  className="bg-rose-500/80 text-white gap-1 px-2.5 py-1 text-xs font-medium border-0"
                >
                  <Heart className="h-3 w-3" /> K-Drama
                </Badge>
              ) : (
                <Badge variant="secondary" className={`${GLASS_PILL} gap-1.5`}>
                  {mediaType === 'movie' && <Film className="h-3 w-3 text-primary" />}
                  {mediaType === 'show' && <Tv className="h-3 w-3 text-primary" />}
                  {mediaType === 'game' && <Gamepad2 className="h-3 w-3 text-primary" />}
                  {mediaType === 'music' && <Music className="h-3 w-3 text-primary" />}
                  {MEDIA_TYPE_LABEL[mediaType]}
                </Badge>
              )}

              {year && (
                <Badge variant="secondary" className={`${GLASS_PILL} gap-1`}>
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  {year}
                </Badge>
              )}

              {(formattedRuntime || formattedAlbumLength) && (
                <Badge variant="secondary" className={`${GLASS_PILL} gap-1`}>
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  {formattedRuntime || formattedAlbumLength}
                </Badge>
              )}

              {mediaType === 'show' && seasonsCount > 0 && (
                <Badge variant="secondary" className={`${GLASS_PILL}`}>
                  {seasonsCount} {seasonsCount === 1 ? 'Season' : 'Seasons'}
                  {episodesCount > 0 && ` · ${episodesCount} Ep`}
                </Badge>
              )}

              {languageDisplay && (
                <Badge variant="secondary" className={`${GLASS_PILL} gap-1`}>
                  <Languages className="h-3 w-3 text-muted-foreground" />
                  {languageDisplay}
                </Badge>
              )}

              {status && (
                <Badge variant="secondary" className={`${GLASS_PILL} capitalize`}>
                  {status.replace(/_/g, ' ')}
                </Badge>
              )}

              {certification && (
                <Badge variant="secondary" className={`${GLASS_PILL}`}>
                  {certification}
                </Badge>
              )}

              {isAdult && (
                <Badge
                  variant="destructive"
                  className="px-2 py-0.5 text-[11px] font-bold bg-red-600/90 text-white border-0"
                >
                  18+
                </Badge>
              )}
            </div>

            {/* ── Action Command Row with Icon-Based Action Cluster ── */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-2">
              {isAuthenticated && (
                <Suspense fallback={null}>
                  <MediaHeroLibraryActions />
                </Suspense>
              )}

              {/* TRAILER BUTTON (Icon-based) */}
              {trailer && (
                <button
                  type="button"
                  onClick={openTrailer}
                  className={cn(
                    'group relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95 shadow-lg',
                    trailerIsPrimary
                      ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/30 ring-1 ring-red-400/40'
                      : 'bg-white/[0.12] hover:bg-white/[0.18] text-white backdrop-blur-xl',
                  )}
                  title="Watch Trailer"
                  aria-label="Watch Trailer"
                >
                  <Play className="h-4 w-4 fill-current translate-x-[0.5px]" />
                </button>
              )}

              {/* ── Secondary Icon-Based Interaction Cluster ── */}
              <div className="flex items-center gap-1 rounded-full bg-black/45 p-1 backdrop-blur-xl shadow-lg">
                {/* Watchlist / Wishlist Button */}
                {isAuthenticated && (
                  <button
                    type="button"
                    onClick={() => handleToggle('watchlisted')}
                    className={cn(
                      'inline-flex h-8 w-8 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95',
                      isWatchlisted
                        ? 'bg-sky-500/25 text-sky-200 ring-1 ring-sky-500/50 shadow-sm'
                        : 'text-white/75 hover:text-white hover:bg-white/[0.12]',
                    )}
                    title={isWatchlisted ? `In ${watchlistLabel}` : `Add to ${watchlistLabel}`}
                    aria-label={isWatchlisted ? `In ${watchlistLabel}` : `Add to ${watchlistLabel}`}
                  >
                    <Bookmark
                      className={cn('h-4 w-4', isWatchlisted && 'fill-current text-sky-400')}
                    />
                  </button>
                )}

                {/* Watched / Played Button */}
                {isAuthenticated && (
                  <button
                    type="button"
                    onClick={() => handleToggle(watchedType)}
                    className={cn(
                      'inline-flex h-8 w-8 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95',
                      isWatched
                        ? 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-500/50 shadow-sm'
                        : 'text-white/75 hover:text-white hover:bg-white/[0.12]',
                    )}
                    title={isWatched ? `Marked as ${watchedLabel}` : `Mark ${watchedLabel}`}
                    aria-label={isWatched ? `Marked as ${watchedLabel}` : `Mark ${watchedLabel}`}
                  >
                    <CheckCircle2
                      className={cn('h-4 w-4', isWatched && 'text-emerald-400')}
                    />
                  </button>
                )}

                {/* Like Button */}
                {isAuthenticated && (
                  <button
                    type="button"
                    onClick={() => handleToggle('liked')}
                    className={cn(
                      'inline-flex h-8 w-8 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95',
                      isLiked
                        ? 'bg-rose-500/25 text-rose-200 ring-1 ring-rose-500/50 shadow-sm'
                        : 'text-white/75 hover:text-white hover:bg-white/[0.12]',
                    )}
                    title={isLiked ? 'Liked' : 'Like'}
                    aria-label="Like"
                  >
                    <Heart
                      className={cn('h-4 w-4', isLiked && 'fill-current text-rose-400')}
                    />
                  </button>
                )}

                {/* Add to List */}
                {isAuthenticated && (
                  <AddToListButton mediaItemId={detail.id} variant="icon" />
                )}

                {/* Admin Actions */}
                {isAuthenticated && (
                  <AdminActionsMenu mediaId={detail.id} media={detail} variant="icon" />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

export { MediaHero as MediaHeroV4 }
