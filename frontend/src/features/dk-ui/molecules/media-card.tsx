import { memo, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Star } from 'lucide-react'
import { DkImage } from '@dk-ui/atoms/image'
import { mediaQueries } from '@media/media-queries'
import { cn } from '@/lib/utils'
import { MEDIA_TYPE_ICON, MEDIA_TYPE_COLOR } from '@/constants/media'
import { parsePositionFromUrl, stripPositionFromUrl } from '@/lib/image-position'
import './media-card.scss'

interface DkMediaCardProps {
  id: string
  mediaType: 'movie' | 'show' | 'game' | 'music'
  title: string
  posterUrl?: string | null
  textlessPosterUrl?: string | null
  logoUrl?: string | null
  releaseDate?: string | null
  avgRating?: number | null
  ratingCount?: number
  showTypeBadge?: boolean
  isAdult?: boolean
  zoomed?: boolean
  className?: string
  subtitle?: string | null
  subtitleColor?: string
  artistName?: string | null
}

const DkMediaCard = memo(function DkMediaCard({
  id,
  mediaType,
  title,
  posterUrl,
  textlessPosterUrl,
  logoUrl,
  releaseDate,
  avgRating,
  ratingCount: _ratingCount,
  showTypeBadge = true,
  isAdult,
  zoomed = true,
  className,
  subtitle,
  subtitleColor,
  artistName,
}: DkMediaCardProps) {
  const year = releaseDate?.slice(0, 4)
  const params = useMemo(() => ({ mediaType, mediaId: id }), [mediaType, id])
  const queryClient = useQueryClient()
  const handlePrefetch = useCallback(() => {
    queryClient.prefetchQuery(mediaQueries.detail(id))
  }, [queryClient, id])

  const imageUrl = textlessPosterUrl || posterUrl || undefined
  const position = imageUrl ? parsePositionFromUrl(imageUrl) : null
  const cleanSrc = imageUrl ? stripPositionFromUrl(imageUrl) : undefined
  const TypeIcon = MEDIA_TYPE_ICON[mediaType]

  return (
    <Link
      to="/media/$mediaType/$mediaId"
      params={params}
      onMouseEnter={handlePrefetch}
      className={cn(
        'dk-media-card',
        mediaType === 'music' && 'dk-media-card--square',
        zoomed && 'dk-media-card--zoomed',
        className,
      )}
    >
      <DkImage
        src={cleanSrc}
        alt={title}
        className="dk-media-card__image"
        style={position ? { objectPosition: `${position.x}% ${position.y}%` } : undefined}
        fallback={title[0]}
      />

      <div className="dk-media-card__gradient-overlay" />

      {subtitle && (
        <div className="dk-media-card__subtitle">
          <span
            className="dk-media-card__subtitle-badge"
            style={{
              color: subtitleColor ?? '#e2e8f0',
              backgroundColor: 'rgba(0,0,0,0.65)',
            }}
          >
            {subtitle}
          </span>
        </div>
      )}

      {showTypeBadge && (
        <div className="dk-media-card__type-badge">
          <span
            className={cn(
              'dk-media-card__type-icon',
              MEDIA_TYPE_COLOR[mediaType] ?? 'bg-muted-foreground',
            )}
          >
            {TypeIcon && <TypeIcon className="dk-media-card__type-icon-svg" />}
          </span>
        </div>
      )}

      {isAdult && (
        <div className="dk-media-card__adult-badge">
          <span className="dk-media-card__adult-label">18+</span>
        </div>
      )}

      {avgRating != null && avgRating > 0 && (
        <div className={cn(
          'dk-media-card__rating',
          isAdult && 'dk-media-card__rating--offset',
        )}>
          <span className="dk-media-card__rating-pill">
            <Star className="dk-media-card__star-icon" />
            {avgRating.toFixed(1)}
          </span>
        </div>
      )}

      {logoUrl && (
        <div className="dk-media-card__logo-wrap">
          <img
            src={logoUrl}
            alt={title}
            className="dk-media-card__logo-img"
          />
        </div>
      )}

      <div className="dk-media-card__caption">
        <p className="dk-media-card__title">{title}</p>
        {artistName && (
          <p className="dk-media-card__artist">{artistName}</p>
        )}
        {year && (
          <p className="dk-media-card__year">{year}</p>
        )}
      </div>
    </Link>
  )
})

export { DkMediaCard, DkMediaCard as MediaCard }
