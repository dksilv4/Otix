import { memo } from 'react'
import { MediaCard } from '@ui/molecules/media-card'
import type { MediaItemSummary } from '@media/media-queries'

interface DiscoverMediaCardProps {
  item: MediaItemSummary
  className?: string
}

export const DiscoverMediaCard = memo(function DiscoverMediaCard({ item, className }: DiscoverMediaCardProps) {
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
      isAdult={item.isAdult}
      className={className}
      artistName={item.albumArtistName}
    />
  )
})
