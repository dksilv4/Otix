import { memo } from 'react'
import { MediaCard } from '@ui/molecules/media-card'
import type { MediaItemSummary } from '@media/media-queries'

interface DiscoverMediaCardProps {
  item: MediaItemSummary
  showTypeBadge?: boolean
  className?: string
}

export const DiscoverMediaCard = memo(function DiscoverMediaCard({
  item,
  showTypeBadge = true,
  className,
}: DiscoverMediaCardProps) {
  return (
    <MediaCard
      id={item.id}
      mediaType={item.mediaType as 'movie' | 'show' | 'game' | 'music'}
      title={item.title}
      posterUrl={item.posterUrl}
      textlessPosterUrl={item.textlessPosterUrl}
      logoUrl={item.logoUrl}
      releaseDate={item.releaseDate}
      avgRating={item.avgRating}
      ratingCount={item.ratingCount}
      showTypeBadge={showTypeBadge}
      isAdult={item.isAdult}
      className={className}
    />
  )
})
