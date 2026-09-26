import { memo, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { MediaCard } from '@ui/molecules/media-card'
import { ContextMenuTrigger } from '@/features/_config/context-menu'
import type { MediaItemSummary } from '@media/queries/media-queries'
import type { ContextMenuItemDef } from '@/features/_config/context-menu'

interface DiscoverMediaCardProps {
  item: MediaItemSummary
  showTypeBadge?: boolean
  subtitle?: string | null
  className?: string
  priority?: boolean
  interactive?: boolean
}

export const DiscoverMediaCard = memo(function DiscoverMediaCard({
  item,
  showTypeBadge = true,
  subtitle,
  className,
  priority = false,
  interactive = true,
}: DiscoverMediaCardProps) {
  const navigate = useNavigate()

  const menuItems: ContextMenuItemDef[] = [
    {
      id: 'view-details',
      label: 'View Details',
      onClick: useCallback(() => {
        navigate({ to: '/media/$mediaType/$mediaId', params: { mediaType: item.mediaType, mediaId: item.id } })
      }, [navigate, item.mediaType, item.id]),
    },
    {
      id: 'add-to-library',
      label: 'Add to Library',
      subItems: [
        { id: 'watched', label: 'Mark as Watched', onClick: () => {} },
        { id: 'owned', label: 'Mark as Owned', onClick: () => {} },
        { id: 'wishlist', label: 'Add to Wishlist', onClick: () => {} },
      ],
    },
  ]

  return (
    <ContextMenuTrigger
      items={menuItems}
      mediaType={item.mediaType as any}
      data={{ itemId: item.id }}
      disabled={!interactive}
    >
      <MediaCard
        id={item.id}
        mediaType={item.mediaType as 'movie' | 'show' | 'game' | 'music'}
        title={item.title}
        posterUrl={item.posterUrl}
        textlessPosterUrl={item.textlessPosterUrl}
        backdropUrl={item.backdropUrl}
        logoUrl={item.logoUrl}
        logoColorGuess={item.logoColorGuess}
        releaseDate={item.releaseDate}
        avgRating={item.avgRating}
        ratingCount={item.ratingCount}
        showTypeBadge={showTypeBadge}
        isAdult={item.isAdult}
        newSeasonReleased={item.newSeasonReleased}
        newSeasonReleaseDate={item.newSeasonReleaseDate}
        tmdbId={item.tmdbId}
        subtitle={subtitle}
        artistName={item.albumArtistName}
        className={className}
        priority={priority}
        interactive={interactive}
      />
    </ContextMenuTrigger>
  )
})
