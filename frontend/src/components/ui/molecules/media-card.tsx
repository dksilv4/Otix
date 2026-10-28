import { memo, useMemo, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Star, Play, Loader2, Sparkles } from 'lucide-react'
import { DkImage } from '@ui/atoms/image'
import { mediaQueries } from '@media/queries/media-queries'
import { cn } from '@/lib/utils'
import { MediaLogo } from '@/lib/media/media-logo'
import { MEDIA_TYPE_ICON, MEDIA_TYPE_COLOR } from '@/constants/media'
import { parsePositionFromUrl, stripPositionFromUrl } from '@/lib/utils/image-position'
import { formatSeasonBadgeText, resolveMediaCardRatingPosition } from '@/lib/utils/media-badge'
import { useStreamAvailability } from '@/features/media/hooks/use-stream-availability'
import { useQuickStream } from '@/features/media/hooks/use-quick-stream'
import { useModal } from '@/lib/modals/modal-context'
import { AiQuickGlanceModal } from '@/features/media/components/organisms/ai-quick-glance-modal'
import { useMediaActivity } from '@/features/media/hooks/use-media-activity'
import { MediaActivityTag } from '@/features/media/components/molecules/media-activity-tag'
import { MediaActivityModal } from '@/features/media/components/organisms/media-activity-modal'

interface DkMediaCardProps {
  id: string
  mediaType: 'movie' | 'show' | 'game' | 'music'
  title: string
  posterUrl?: string | null
  textlessPosterUrl?: string | null
  backdropUrl?: string | null
  logoUrl?: string | null
  logoColorGuess?: string | null
  releaseDate?: string | null
  avgRating?: number | null
  ratingCount?: number
  showTypeBadge?: boolean
  isAdult?: boolean
  newSeasonReleased?: boolean
  newSeasonReleaseDate?: string | null
  /** TMDB external id (movie/show) — passed to the plugin card-badge slot. */
  tmdbId?: string | null
  zoomed?: boolean
  className?: string
  subtitle?: string | null
  subtitleColor?: string
  artistName?: string | null
  /** Whether to show a direct quick-stream play button on card hover. Defaults to true. */
  enableQuickStream?: boolean
  /** Render as a plain card (no detail link / prefetch) — for items without a backend detail page. */
  interactive?: boolean
  /** Prioritize image loading for above-the-fold cards. */
  priority?: boolean
  /** Suppress the streamable badge on the card (e.g., when the entire view is already filtered to streamable items). */
  hideStreamBadge?: boolean
}

const DkMediaCard = memo(({
  id,
  mediaType,
  title,
  posterUrl,
  textlessPosterUrl,
  backdropUrl,
  logoUrl,
  logoColorGuess,
  releaseDate,
  avgRating,
  ratingCount: _ratingCount,
  showTypeBadge = true,
  isAdult,
  newSeasonReleased,
  newSeasonReleaseDate,
  tmdbId,
  zoomed = true,
  className,
  subtitle,
  subtitleColor,
  artistName,
  enableQuickStream = true,
  interactive = true,
  priority = false,
  hideStreamBadge = false,
}: DkMediaCardProps) => {
  const year = releaseDate?.slice(0, 4)
  const params = useMemo(() => ({ mediaType, mediaId: id }), [mediaType, id])
  const queryClient = useQueryClient()
  const handlePrefetch = useCallback(() => {
    queryClient.prefetchQuery(mediaQueries.detail(mediaType, id))
  }, [queryClient, mediaType, id])

  const { isStreamable, providerLabel } = useStreamAvailability({
    mediaId: id,
    tmdbId,
    mediaType,
  })
  const nodeActivity = useMediaActivity(mediaType, tmdbId, id)
  const effectiveActivityStatus = nodeActivity?.status || (isStreamable ? 'available' : undefined)
  const isAvailableToStream = effectiveActivityStatus === 'available'
  const hasActivityTag = Boolean(effectiveActivityStatus && !hideStreamBadge)
  const ratingPositionClass = useMemo(
    () => resolveMediaCardRatingPosition({ hasActivityTag, isAdult, newSeasonReleased }),
    [hasActivityTag, isAdult, newSeasonReleased],
  )
  const { quickStream, isStartingStream } = useQuickStream()
  const { openModal } = useModal()

  // Card art resolution:
  // 1. Textless poster (preferred clean art)
  // 2. Backdrop (clean scenic art)
  // 3. Poster / cover art (primary art for games and music; fallback for movies/shows without clean art)
  const hasCleanArt = Boolean(textlessPosterUrl || backdropUrl)
  const imageUrl =
    textlessPosterUrl ||
    backdropUrl ||
    (mediaType === 'game' || mediaType === 'music' ? posterUrl : undefined) ||
    posterUrl ||
    undefined
  const [logoFailed, setLogoFailed] = useState(false)
  const showLogo = Boolean(logoUrl && hasCleanArt && !logoFailed)
  const position = imageUrl ? parsePositionFromUrl(imageUrl) : null
  const cleanSrc = imageUrl ? stripPositionFromUrl(imageUrl) : undefined
  const TypeIcon = MEDIA_TYPE_ICON[mediaType]

  const linkProps = useMemo(() => ({
    to: '/media/$mediaType/$mediaId' as const,
    params,
    state: {
      preview: {
        title,
        logoUrl,
        logoColorGuess,
        backdropUrl,
        posterUrl,
        releaseDate,
      },
    },
  }), [params, title, logoUrl, logoColorGuess, backdropUrl, posterUrl, releaseDate])

  const Root = (interactive ? Link : 'div') as React.ElementType

  return (
    <Root
      data-context-type="media"
      data-media-id={id}
      data-media-type={mediaType}
      data-media-title={title}
      data-media-poster={cleanSrc || posterUrl || undefined}
      data-media-year={year || undefined}
      data-media-tmdb-id={tmdbId || undefined}
      {...(interactive ? { ...(linkProps as Record<string, unknown>), onMouseEnter: handlePrefetch } : {})}
      className={cn(
        'group relative block overflow-hidden rounded-lg transition-shadow duration-300',
        mediaType === 'music' ? 'aspect-square' : 'aspect-[2/3]',
        isAvailableToStream && 'group-hover:shadow-[0_0_24px_rgba(var(--primary-rgb),0.18)]',
        className,
      )}
    >
      {/* Image with zoom effect wrapper */}
      <div
        className={cn(
          'absolute inset-0',
          zoomed && '[--dk-img-scale:1.1] group-hover:[--dk-img-scale:1]',
        )}
        style={{
          transform: zoomed ? 'scale(var(--dk-img-scale))' : undefined,
          transition: zoomed ? 'transform 700ms var(--dk-ease-out)' : undefined,
        }}
      >
        <DkImage
          src={cleanSrc}
          alt={title}
          className="h-full w-full"
          style={position ? { objectPosition: `${position.x}% ${position.y}%` } : undefined}
          fallback={title[0]}
          priority={priority}
        />
      </div>

      {/* Gradient Overlay — light scrim, poster stays visible */}
      <div
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100"
        style={{
          background: [
            'linear-gradient(to top,',
            'rgba(0,0,0,0.55) 0%,',
            'rgba(0,0,0,0.35) 20%,',
            'rgba(0,0,0,0.15) 45%,',
            'rgba(0,0,0,0.04) 70%,',
            'rgba(0,0,0,0) 100%)',
          ].join(' '),
          transition: 'opacity 600ms var(--dk-ease-out)',
        }}
      />

      {/* Type Badge */}
      {showTypeBadge && (
        <div className="absolute top-3 left-3">
          <span
            className={cn(
              'inline-flex items-center p-2 rounded-full text-white',
              MEDIA_TYPE_COLOR[mediaType] ?? 'bg-muted-foreground',
            )}
          >
            {TypeIcon && <TypeIcon className="h-3.5 w-3.5" />}
          </span>
        </div>
      )}

      {/* New Season Badge */}
      {mediaType === 'show' && newSeasonReleased && (
        <div className="absolute top-3 right-3 z-10">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[9px] font-bold text-emerald-400 bg-emerald-950/75 border border-emerald-500/30 backdrop-blur-md shadow-lg uppercase tracking-wider">
            {formatSeasonBadgeText(newSeasonReleaseDate)}
          </span>
        </div>
      )}

      {/* Adult Badge */}
      {isAdult && (
        <div className="absolute top-2 right-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold text-white bg-red-600">
            18+
          </span>
        </div>
      )}

      {/* Media Activity Tag (Requested, Processing, Available) */}
      {hasActivityTag && (
        <div
          className={cn(
            'absolute z-10',
            newSeasonReleased ? 'top-10 right-3' : isAdult ? 'top-8 right-2.5' : 'top-3 right-3',
          )}
        >
          <MediaActivityTag
            status={effectiveActivityStatus}
            progress={nodeActivity?.progress}
            nodeName={nodeActivity?.nodeName || (isStreamable ? providerLabel || 'Stream' : undefined)}
            ownerName={nodeActivity?.owner?.displayName || nodeActivity?.owner?.username}
            isOwned={nodeActivity?.isOwned ?? true}
            onClick={() => {
              if (nodeActivity) {
                openModal(
                  <MediaActivityModal
                    activity={nodeActivity}
                    mediaId={id}
                    initialPosterUrl={cleanSrc || posterUrl}
                  />,
                )
              } else if (isStreamable) {
                openModal(
                  <MediaActivityModal
                    activity={{
                      status: 'available',
                      mediaType: mediaType as 'movie' | 'show',
                      tmdbId,
                      title,
                      year: year ? Number(year) : undefined,
                      nodeName: providerLabel || 'Stream',
                      isOwned: true,
                      canManage: false,
                      owner: { id: 0, username: 'Local' },
                    }}
                    mediaId={id}
                    initialPosterUrl={cleanSrc || posterUrl}
                  />,
                )
              }
            }}
          />
        </div>
      )}

      {/* AI Quick Glance Trigger Button on Hover */}
      {interactive && (
        <div className="absolute top-2.5 left-2.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <button
            type="button"
            aria-label={`AI Quick Glance for ${title}`}
            title="AI Quick Glance"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              openModal(
                <AiQuickGlanceModal
                  mediaType={mediaType}
                  mediaId={id}
                  initialTitle={title}
                  initialPosterUrl={posterUrl}
                  initialBackdropUrl={backdropUrl}
                  initialTmdbId={tmdbId}
                />,
              )
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--dk-surface-glass)] hover:bg-white/20 text-primary backdrop-blur-xl shadow-lg transition-transform hover:scale-110 active:scale-95 border-0"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Centered Quick-Stream Play Button on Hover */}
      {isAvailableToStream && enableQuickStream && interactive && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <button
            type="button"
            aria-label={`Stream ${title} now`}
            title={`Stream ${title} now`}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              quickStream({
                mediaId: id,
                tmdbId,
                mediaType,
                title,
              })
            }}
            disabled={isStartingStream}
            className={cn(
              'pointer-events-auto flex items-center justify-center rounded-full shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer disabled:opacity-75 bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/30',
              mediaType === 'music' ? 'w-10 h-10' : 'w-12 h-12',
            )}
          >
            {isStartingStream ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Play className="h-5 w-5 fill-current ml-0.5" />
            )}
          </button>
        </div>
      )}

      {/* Rating */}
      {avgRating != null && avgRating > 0 && (
        <div
          className={cn(
            'absolute z-20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300',
            ratingPositionClass,
          )}
        >
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-primary-foreground bg-primary/80 backdrop-blur-sm shadow-sm">
            <Star className="h-3 w-3 fill-current" />
            {avgRating.toFixed(1)}
          </span>
        </div>
      )}

      {/* Background dark scrim layer for cards with logos to improve contrast */}
      {showLogo && (
        <div className="absolute inset-0 pointer-events-none bg-black/30 group-hover:bg-black/20 transition-colors duration-500" />
      )}

      {/* Logo */}
      {showLogo && (
        <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
          {/* Dedicated radial dark scrim behind logo */}
          <div
            className="absolute inset-0 opacity-80 group-hover:opacity-95 transition-opacity duration-500"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(0, 0, 0, 0.65) 0%, rgba(0, 0, 0, 0.3) 50%, rgba(0, 0, 0, 0) 80%)',
            }}
          />
          <MediaLogo
            src={logoUrl!}
            alt={title}
            className="relative z-10 max-w-[80%] max-h-[55%] object-contain [--dk-logo-scale:0.85] group-hover:[--dk-logo-scale:1.15]"
            colorGuess={logoColorGuess ?? null}
            background="dark"
            shadow="drop-shadow(0 2px 4px rgba(0,0,0,0.95)) drop-shadow(0 6px 20px rgba(0,0,0,0.85)) drop-shadow(0 0 1px rgba(0,0,0,0.9))"
            onError={() => setLogoFailed(true)}
            style={{
              transform: 'scale(var(--dk-logo-scale))',
              transition: 'transform 700ms var(--dk-ease-out)',
            }}
          />
        </div>
      )}

      {/* Caption */}
      <div
        className="absolute bottom-0 left-0 right-0 px-3 pb-3 pt-8 pointer-events-none opacity-0 translate-y-[6px] group-hover:opacity-100 group-hover:translate-y-0"
        style={{
          transition: 'opacity 500ms var(--dk-ease-out), transform 450ms var(--dk-ease-out)',
          background: [
            'linear-gradient(to top,',
            'rgba(0,0,0,0.60) 0%,',
            'rgba(0,0,0,0.40) 35%,',
            'rgba(0,0,0,0.10) 70%,',
            'rgba(0,0,0,0) 100%)',
          ].join(' '),
        }}
      >
        {subtitle && (
          <p
            className={cn(
              'text-[11px] text-center pb-0.5 truncate',
              subtitleColor ? undefined : 'text-white/70',
            )}
            style={{
              filter: 'drop-shadow(0 1px 3px rgba(0, 0, 0, 0.9))',
              ...(subtitleColor ? { color: subtitleColor } : {}),
            }}
          >
            {subtitle}
          </p>
        )}
        <p
          className="text-sm font-semibold text-white text-center leading-tight line-clamp-2 overflow-hidden"
          style={{ filter: 'drop-shadow(0 1px 4px rgba(0, 0, 0, 0.9))' }}
        >
          {title}
        </p>
        {artistName && (
          <p
            className="text-xs text-center mt-0.5 truncate text-white/75"
            style={{ filter: 'drop-shadow(0 1px 3px rgba(0, 0, 0, 0.9))' }}
          >
            {artistName}
          </p>
        )}
        {year && (
          <p className="text-[11px] text-center mt-0.5 text-white/50">{year}</p>
        )}
      </div>
    </Root>
  )
})

export { DkMediaCard, DkMediaCard as MediaCard }
