import { memo, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Star } from 'lucide-react'
import { DkImage } from '@dk-ui/atoms/image'
import { mediaQueries } from '@media/media-queries'
import { cn } from '@/lib/utils'
import { parsePositionFromUrl, stripPositionFromUrl } from '@/lib/image-position'

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

const mediaTypeColor: Record<string, string> = {
  movie: 'bg-rose-600',
  show: 'bg-violet-600',
  game: 'bg-emerald-600',
  music: 'bg-amber-600',
}

const mediaTypeLabel: Record<string, string> = {
  movie: 'Movie',
  show: 'TV',
  game: 'Game',
  music: 'Music',
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

  return (
    <Link
      to="/media/$mediaType/$mediaId"
      params={params}
      onMouseEnter={handlePrefetch}
      className={cn(
        'group block relative rounded-lg overflow-hidden',
        mediaType === 'music' ? 'aspect-square' : 'aspect-[2/3]',
        className,
      )}
    >
      <DkImage
        src={cleanSrc}
        alt={title}
        className={cn(
          'h-full w-full object-cover transition-transform duration-700 ease-out',
          zoomed && 'scale-110 group-hover:scale-100',
        )}
        style={position ? { objectPosition: `${position.x}% ${position.y}%` } : undefined}
        fallback={title[0]}
      />

      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 ease-out pointer-events-none" />

      {subtitle && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10">
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold backdrop-blur-sm"
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
        <div className="absolute top-2 left-2">
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold text-white',
              mediaTypeColor[mediaType] ?? 'bg-muted-foreground',
            )}
          >
            {mediaTypeLabel[mediaType] ?? mediaType}
          </span>
        </div>
      )}

      {isAdult && (
        <div className="absolute top-2 right-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold text-white bg-red-600">
            18+
          </span>
        </div>
      )}

      {avgRating != null && avgRating > 0 && (
        <div className={cn(
          'absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ease-out',
          isAdult ? 'top-8' : 'top-2',
        )}>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white bg-primary/80 backdrop-blur-sm">
            <Star className="h-3 w-3 fill-current" />
            {avgRating.toFixed(1)}
          </span>
        </div>
      )}

      {logoUrl && (
        <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
          <img
            src={logoUrl}
            alt={title}
            className="max-w-[70%] max-h-[50%] object-contain scale-75 group-hover:scale-110 transition-transform duration-700 ease-out drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
          />
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500 ease-out pointer-events-none">
        <p className="text-sm font-semibold text-white text-center leading-tight drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          {title}
        </p>
        {artistName && (
          <p className="text-xs font-semibold text-white/80 text-center mt-0.5 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] truncate">
            {artistName}
          </p>
        )}
        {year && (
          <p className="text-[11px] font-medium text-white/60 text-center mt-0.5">
            {year}
          </p>
        )}
      </div>
    </Link>
  )
})

export { DkMediaCard, DkMediaCard as MediaCard }
