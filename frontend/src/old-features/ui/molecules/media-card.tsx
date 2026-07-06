import { memo, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Star } from 'lucide-react'
import { DkImage } from '@ui/atoms/image'
import { mediaQueries } from '@media'
import { cn } from '@/lib/utils'
import { MEDIA_TYPE_ICON, MEDIA_TYPE_COLOR } from '@/constants/media'
import { parsePositionFromUrl, stripPositionFromUrl } from '@/lib/utils/image-position'

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
  newSeasonReleased?: boolean
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
  newSeasonReleased,
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
    queryClient.prefetchQuery(mediaQueries.detail(mediaType, id))
  }, [queryClient, mediaType, id])

  const imageUrl = textlessPosterUrl || posterUrl || undefined
  const position = imageUrl ? parsePositionFromUrl(imageUrl) : null
  const cleanSrc = imageUrl ? stripPositionFromUrl(imageUrl) : undefined
  const TypeIcon = MEDIA_TYPE_ICON[mediaType]

  const linkProps = useMemo(() => ({
    to: '/media/$mediaType/$mediaId' as const,
    params,
  }), [params])

  return (
    <Link
      {...(linkProps as any)}
      onMouseEnter={handlePrefetch}
      className={cn(
        'group relative block overflow-hidden rounded-lg',
        mediaType === 'music' ? 'aspect-square' : 'aspect-[2/3]',
        className,
      )}
    >
      {/* Image with zoom effect wrapper */}
      <div
        className={cn(
          'absolute inset-0',
          zoomed ? '[--dk-img-scale:1.1]' : '[--dk-img-scale:1]',
          'group-hover:[--dk-img-scale:1]',
        )}
        style={{
          transform: 'scale(var(--dk-img-scale))',
          transition: zoomed ? 'transform 700ms var(--dk-ease-out)' : undefined,
        }}
      >
        <DkImage
          src={cleanSrc}
          alt={title}
          className="h-full w-full"
          style={position ? { objectPosition: `${position.x}% ${position.y}%` } : undefined}
          fallback={title[0]}
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
            New Season
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

      {/* Rating */}
      {avgRating != null && avgRating > 0 && (
        <div
          className={cn(
            'absolute right-2 opacity-0 group-hover:opacity-100',
            isAdult ? 'top-8' : 'top-2',
          )}
          style={{ transition: 'opacity 500ms var(--dk-ease-out)' }}
        >
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white bg-primary/80 backdrop-blur-sm">
            <Star className="h-3 w-3 fill-current" />
            {avgRating.toFixed(1)}
          </span>
        </div>
      )}

      {/* Logo */}
      {logoUrl && (
        <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
          <img
            src={logoUrl}
            alt={title}
            className="max-w-[80%] max-h-[55%] object-contain [--dk-logo-scale:0.85] group-hover:[--dk-logo-scale:1.15]"
            style={{
              transform: 'scale(var(--dk-logo-scale))',
              transition: 'transform 700ms var(--dk-ease-out)',
              filter: 'drop-shadow(0 2px 8px rgba(0, 0, 0, 0.8))',
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
    </Link>
  )
})

export { DkMediaCard, DkMediaCard as MediaCard }
