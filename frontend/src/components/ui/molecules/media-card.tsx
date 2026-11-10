import { memo, useMemo, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Star } from 'lucide-react'
import { DkImage } from '@ui/atoms/image'
import { mediaQueries } from '@media/queries/media-queries'
import { cn } from '@/lib/utils'
import { MediaLogo } from '@/lib/media/media-logo'
import { MEDIA_TYPE_ICON, MEDIA_TYPE_COLOR } from '@/constants/media'
import { parsePositionFromUrl, stripPositionFromUrl } from '@/lib/utils/image-position'
import { formatSeasonBadgeText, resolveMediaCardRatingPosition } from '@/lib/utils/media-badge'
import { useMediaActivity } from '@/features/media/hooks/use-media-activity'
import { MediaActivityTag } from '@/features/media/components/molecules/media-activity-tag'
import { useModal } from '@/lib/modals/modal-context'
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
  dominantColor?: string | null
  releaseDate?: string | null
  avgRating?: number | null
  ratingCount?: number
  showTypeBadge?: boolean
  isAdult?: boolean
  newSeasonReleased?: boolean
  newSeasonReleaseDate?: string | null
  /** TMDB external id (movie/show). */
  tmdbId?: string | null
  zoomed?: boolean
  className?: string
  subtitle?: string | null
  subtitleColor?: string
  artistName?: string | null
  /** Deprecated — stream overlay removed. Retained for API compatibility. */
  enableQuickStream?: boolean
  /** Render as a plain card (no detail link / prefetch) — for items without a backend detail page. */
  interactive?: boolean
  /** Prioritize image loading for above-the-fold cards. */
  priority?: boolean
  /** Suppress the activity badge on the card if desired. */
  hideStreamBadge?: boolean
}

export const DkMediaCard = memo(({
  id,
  mediaType,
  title,
  posterUrl,
  textlessPosterUrl,
  backdropUrl,
  logoUrl,
  logoColorGuess,
  dominantColor,
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
  enableQuickStream: _enableQuickStream,
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

  const rawActivity = useMediaActivity(
    mediaType,
    tmdbId,
    id,
    undefined,
    undefined,
    { enabled: !hideStreamBadge },
  )
  const nodeActivity = hideStreamBadge ? undefined : rawActivity
  const hasActivityTag = Boolean(nodeActivity)
  const ratingPositionClass = useMemo(
    () => resolveMediaCardRatingPosition({ hasActivityTag, isAdult, newSeasonReleased }),
    [hasActivityTag, isAdult, newSeasonReleased],
  )
  const { openModal } = useModal()

  // Card art resolution:
  // 1. Textless poster (clean portrait art)
  // 2. Poster / cover art (standard portrait art)
  // 3. Backdrop (fallback when no portrait poster exists)
  const imageUrl =
    textlessPosterUrl ||
    posterUrl ||
    backdropUrl ||
    undefined
  const hasCleanArt = Boolean(textlessPosterUrl || (!posterUrl && backdropUrl))
  const [logoFailed, setLogoFailed] = useState(false)
  const showLogo = Boolean(logoUrl && hasCleanArt && !logoFailed)
  const position = imageUrl ? parsePositionFromUrl(imageUrl) : null
  const cleanSrc = imageUrl ? stripPositionFromUrl(imageUrl) : undefined
  const TypeIcon = MEDIA_TYPE_ICON[mediaType]

  const linkProps = useMemo(() => ({
    to: '/media/$mediaType/$mediaId' as const,
    params,
    state: (((prev: any) => ({
      ...prev,
      preview: {
        title,
        logoUrl,
        logoColorGuess,
        dominantColor,
        backdropUrl,
        posterUrl,
        releaseDate,
      },
    })) as any),
  }), [params, title, logoUrl, logoColorGuess, dominantColor, backdropUrl, posterUrl, releaseDate])

  return (
    <div
      data-context-type="media"
      data-media-id={id}
      data-media-type={mediaType}
      data-media-title={title}
      data-media-poster={cleanSrc || posterUrl || undefined}
      data-media-year={year || undefined}
      data-media-tmdb-id={tmdbId || undefined}
      className={cn(
        'group relative block overflow-hidden rounded-lg transition-shadow duration-300',
        mediaType === 'music' ? 'aspect-square' : 'aspect-[2/3]',
        className,
      )}
    >
      {/* Background Image with smooth zoom wrapper */}
      <div
        className={cn(
          'absolute inset-0',
          zoomed && '[--dk-img-scale:1] group-hover:[--dk-img-scale:1.06]',
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

      {/* Primary Stretched Link for clean, non-nested navigation */}
      {interactive && (
        <Link
          {...linkProps}
          onMouseEnter={handlePrefetch}
          className="absolute inset-0 z-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
          aria-label={title}
        />
      )}

      {/* Gradient Overlay — subtle contrast on hover */}
      <div
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        style={{
          background: [
            'linear-gradient(to top,',
            'rgba(0,0,0,0.60) 0%,',
            'rgba(0,0,0,0.30) 25%,',
            'rgba(0,0,0,0.10) 50%,',
            'rgba(0,0,0,0) 100%)',
          ].join(' '),
          transition: 'opacity 500ms var(--dk-ease-out)',
        }}
      />

      {/* Type Badge */}
      {showTypeBadge && (
        <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none">
          <span
            className={cn(
              'inline-flex items-center p-1.5 rounded-full text-primary-foreground shadow-sm backdrop-blur-md',
              MEDIA_TYPE_COLOR[mediaType] ?? 'bg-muted-foreground',
            )}
          >
            {TypeIcon && <TypeIcon className="h-3 w-3" />}
          </span>
        </div>
      )}

      {/* Rating — visible all the time */}
      {avgRating != null && avgRating > 0 && (
        <div
          className={cn(
            'absolute z-10 pointer-events-none transition-all duration-300',
            ratingPositionClass,
          )}
        >
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-primary-foreground bg-primary/85 backdrop-blur-md shadow-sm border border-white/[0.06]">
            <Star className="h-3 w-3 fill-current" />
            {avgRating.toFixed(1)}
          </span>
        </div>
      )}

      {/* New Season Badge */}
      {mediaType === 'show' && newSeasonReleased && (
        <div className="absolute top-2.5 right-2.5 z-10 pointer-events-none">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold text-primary bg-[var(--dk-surface-glass)] border border-white/[0.06] backdrop-blur-md shadow-sm uppercase tracking-wider">
            {formatSeasonBadgeText(newSeasonReleaseDate)}
          </span>
        </div>
      )}

      {/* Adult Badge */}
      {isAdult && (
        <div className={cn('absolute z-10 pointer-events-none', newSeasonReleased ? 'top-8 right-2.5' : 'top-2.5 right-2.5')}>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold text-destructive-foreground bg-destructive/90 backdrop-blur-md border border-white/[0.06]">
            18+
          </span>
        </div>
      )}

      {/* Media Activity Tag (Downloading / Requested / Available on Node) */}
      {nodeActivity && hasActivityTag && (
        <div
          className={cn(
            'absolute z-10',
            newSeasonReleased ? 'top-10 right-3' : isAdult ? 'top-8 right-2.5' : 'top-3 right-3',
          )}
        >
          <MediaActivityTag
            status={nodeActivity.status}
            progress={nodeActivity.progress}
            nodeName={nodeActivity.nodeName}
            ownerName={nodeActivity.owner?.displayName || nodeActivity.owner?.username}
            isOwned={nodeActivity.isOwned ?? true}
            onClick={() => {
              openModal(
                <MediaActivityModal
                  activity={nodeActivity}
                  mediaId={id}
                  initialPosterUrl={cleanSrc || posterUrl}
                />,
              )
            }}
          />
        </div>
      )}

      {/* Background dark scrim layer for cards with logos to improve contrast */}
      {showLogo && (
        <div className="absolute inset-0 pointer-events-none bg-black/25 group-hover:bg-black/15 transition-colors duration-500" />
      )}

      {/* Logo */}
      {showLogo && (
        <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none z-0">
          <div
            className="absolute inset-0 opacity-75 group-hover:opacity-90 transition-opacity duration-500"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.25) 50%, rgba(0, 0, 0, 0) 80%)',
            }}
          />
          <MediaLogo
            src={logoUrl!}
            alt={title}
            className="relative z-10 max-w-[80%] max-h-[55%] object-contain [--dk-logo-scale:0.9] group-hover:[--dk-logo-scale:1.08]"
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

      {/* Caption — reveals gracefully on hover/focus-within */}
      <div
        className="absolute bottom-0 left-0 right-0 px-3 pb-3 pt-8 pointer-events-none opacity-0 translate-y-[6px] group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 z-10"
        style={{
          transition: 'opacity 500ms var(--dk-ease-out), transform 450ms var(--dk-ease-out)',
          background: [
            'linear-gradient(to top,',
            'rgba(0,0,0,0.70) 0%,',
            'rgba(0,0,0,0.40) 35%,',
            'rgba(0,0,0,0.10) 70%,',
            'rgba(0,0,0,0) 100%)',
          ].join(' '),
        }}
      >
        {subtitle && (
          <p
            className={cn(
              'text-[11px] text-center pb-0.5 truncate text-foreground/80',
              subtitleColor ? undefined : 'text-foreground/75',
            )}
            style={{
              filter: 'drop-shadow(0 1px 3px rgba(0, 0, 0, 0.9))',
              ...(subtitleColor ? { color: subtitleColor } : {}),
            }}
          >
            {subtitle}
          </p>
        )}
        {!showLogo && (
          <p
            className="text-sm font-semibold text-foreground text-center leading-tight line-clamp-2 overflow-hidden"
            style={{ filter: 'drop-shadow(0 1px 4px rgba(0, 0, 0, 0.9))' }}
          >
            {title}
          </p>
        )}
        {artistName && (
          <p
            className="text-xs text-center mt-0.5 truncate text-muted-foreground"
            style={{ filter: 'drop-shadow(0 1px 3px rgba(0, 0, 0, 0.9))' }}
          >
            {artistName}
          </p>
        )}
        {year && (
          <p className="text-[11px] text-center mt-0.5 text-muted-foreground/80">{year}</p>
        )}
      </div>
    </div>
  )
})

export { DkMediaCard as MediaCard }
