// TODO: Review this file
import { memo } from 'react'
import { MediaCard } from '@ui/molecules/media-card'
import './discover-media-card.scss'
import type { MediaItemSummary } from '@media/queries/media-queries'

interface DiscoverMediaCardProps {
  item: MediaItemSummary
  subtitle?: string | null
  className?: string
}

export const DiscoverMediaCard = memo(function DiscoverMediaCard({ item, subtitle, className }: DiscoverMediaCardProps) {
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
      subtitle={subtitle}
      className={className}
      artistName={item.albumArtistName}
    />
  )
})
