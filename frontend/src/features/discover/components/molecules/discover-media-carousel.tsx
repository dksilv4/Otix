import { memo } from 'react'
import { Carousel } from '@ui/molecules/carousel'
import { DiscoverMediaCard } from './discover-media-card'
import type { MediaItemSummary } from '@media/queries/media-queries'

interface MediaCarouselProps {
  items: MediaItemSummary[]
  isLoading?: boolean
  className?: string
  title?: string
  viewAllLink?: string
  viewAllSearch?: Record<string, any>
}

export const MediaCarousel = memo(function MediaCarousel({
  items,
  isLoading = false,
  className,
  title,
  viewAllLink,
  viewAllSearch,
}: MediaCarouselProps) {
  return (
    <Carousel
      className={className}
      minItemWidth={250}
      gap={12}
      showArrows
      isLoading={isLoading}
      title={title}
      viewAllLink={viewAllLink}
      viewAllSearch={viewAllSearch}
    >
      {items.map((item) => (
        <DiscoverMediaCard key={item.id} item={item} />
      ))}
    </Carousel>
  )
})
