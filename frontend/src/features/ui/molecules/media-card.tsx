import { memo, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Star } from 'lucide-react'
import { Image } from '@ui/atoms/image'
import { mediaQueries } from '@media/media-queries'
import { cn } from '@/lib/utils'

interface MediaCardProps {
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
  /** Optional subtitle shown below the year — e.g. financial data like "+$42M" */
  subtitle?: string | null
  subtitleColor?: string
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

export const MediaCard = memo(function MediaCard({
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
}: MediaCardProps) {
  const year = releaseDate?.slice(0, 4)
  const params = useMemo(() => ({ mediaType, mediaId: id }), [mediaType, id])
  const queryClient = useQueryClient()
  const handlePrefetch = useCallback(() => {
    queryClient.prefetchQuery(mediaQueries.detail(id))
  }, [queryClient, id])

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
      {/* Textless poster — zooms out on hover (110% → 100%) */}
      <Image
        src={textlessPosterUrl || posterUrl || undefined}
        alt={title}
        className={cn(
          'h-full w-full object-cover transition-transform duration-700 ease-out',
          zoomed && 'scale-110 group-hover:scale-100',
        )}
        fallback={title[0]}
      />

      {/* Darkening gradient — fades in on hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 ease-out pointer-events-none" />

      {/* Financial subtitle — always visible pill at bottom */}
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

      {/* Type badge — top left */}
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

      {/* 18+ badge — top right, always visible */}
      {isAdult && (
        <div className="absolute top-2 right-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold text-white bg-red-600">
            18+
          </span>
        </div>
      )}

      {/* Otix rating — top right */}
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

      {/* Logo — zooms in on hover (90% + invisible → 100% + visible) */}
      {logoUrl && (
        <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
          <img
            src={logoUrl}
            alt={title}
            className="max-w-[70%] max-h-[50%] object-contain scale-75 group-hover:scale-110 transition-transform duration-700 ease-out drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
          />
        </div>
      )}

      {/* Title + year — bottom, fades in on hover */}
      <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500 ease-out pointer-events-none">
        <p className="text-sm font-semibold text-white text-center leading-tight drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          {title}
        </p>
        {year && (
          <p className="text-[11px] font-medium text-white/60 text-center mt-0.5">
            {year}
          </p>
        )}
      </div>
    </Link>
  )
})
