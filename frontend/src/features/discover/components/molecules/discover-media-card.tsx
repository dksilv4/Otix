import { memo, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { MediaCard } from '@ui/molecules/media-card'
import { useModal } from '@/lib/modals'
import { ContextMenuTrigger, buildMediaMenuItems } from '@/features/_config/context-menu'
import type { MediaItemSummary } from '@media/queries/media-queries'

interface DiscoverMediaCardProps {
  item: MediaItemSummary
  showTypeBadge?: boolean
  subtitle?: string | null
  className?: string
  priority?: boolean
  interactive?: boolean
}

export const DiscoverMediaCard = memo(({
  item,
  showTypeBadge = true,
  subtitle,
  className,
  priority = false,
  interactive = true,
}: DiscoverMediaCardProps) => {
  const navigate = useNavigate()
  const { openModal } = useModal()

  const menuItems = useMemo(() => {
    return buildMediaMenuItems(
      {
        type: 'media',
        id: item.id,
        mediaType: item.mediaType as any,
        title: item.title,
        posterUrl: item.posterUrl ?? undefined,
        year: item.releaseDate?.slice(0, 4),
        tmdbId: item.tmdbId ?? undefined,
      },
      { navigate, openModal },
    )
  }, [item, navigate, openModal])

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
