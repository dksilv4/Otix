import { memo } from 'react'
import { Link } from '@tanstack/react-router'
import { Image } from '@ui/atoms/image'
import { cn } from '@/lib/utils'
import { formatDate } from '@media/utils'
import type { SeasonSummary } from '@media/queries/media-queries'

interface DiscoverSeasonCardProps {
  season: SeasonSummary
  className?: string
}

/**
 * Poster card for the Trending Shows rail. Renders a show's latest Season and
 * deep-links to the show detail page with that season pre-selected. The show
 * has no logo artwork in this context, so a persistent bottom caption carries
 * the season + show name instead of the hover-only caption used by media cards.
 */
export const DiscoverSeasonCard = memo(({
  season,
  className,
}: DiscoverSeasonCardProps) => {
  const title =
    season.name && season.name.trim()
      ? season.name
      : season.seasonNumber === 0
        ? 'Specials'
        : `Season ${season.seasonNumber}`
  return (
    <Link
      to="/media/$mediaType/$mediaId"
      params={{ mediaType: 'show', mediaId: String(season.showId) }}
      search={{ season: season.seasonNumber }}
      className={cn('group relative block aspect-[2/3] overflow-hidden rounded-lg', className)}
    >
      <div className="absolute inset-0 transition-transform duration-700 [--dk-img-scale:1.1] group-hover:[--dk-img-scale:1]"
        style={{ transform: 'scale(var(--dk-img-scale))', transition: 'transform 700ms var(--dk-ease-out)' }}
      >
        <Image
          src={season.posterUrl ?? undefined}
          alt={title}
          className="h-full w-full"
          fallback={season.seasonNumber === 0 ? 'Special' : `S${season.seasonNumber}`}
        />
      </div>

      {/* Persistent bottom caption — season art isn't self-describing like a
          show's logo, so always show the show + season labels. */}
      <div
        className="absolute inset-x-0 bottom-0 px-3 pb-3 pt-10"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.42) 45%, rgba(0,0,0,0) 100%)',
        }}
      >
        <p
          className="truncate text-[11px] text-white/70"
          style={{ filter: 'drop-shadow(0 1px 3px rgba(0, 0, 0, 0.9))' }}
        >
          {season.showTitle}
        </p>
        <p
          className="line-clamp-2 text-sm font-semibold leading-tight text-white"
          style={{ filter: 'drop-shadow(0 1px 4px rgba(0, 0, 0, 0.9))' }}
        >
          {title}
        </p>
        {season.airDate && (
          <p className="text-[11px] text-white/50">
            Premiered {formatDate(season.airDate)}
          </p>
        )}
      </div>
    </Link>
  )
})
