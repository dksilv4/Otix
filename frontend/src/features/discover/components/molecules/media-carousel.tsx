import { memo } from 'react'
import { Carousel } from '@ui/molecules/carousel'
import { DiscoverMediaCard } from './discover-media-card'
import type { MediaItemSummary } from '@media/media-queries'

interface MediaCarouselProps {
  items: MediaItemSummary[]
  isLoading?: boolean
  className?: string
}

export const MediaCarousel = memo(function MediaCarousel({
  items,
  isLoading = false,
  className,
}: MediaCarouselProps) {
  return (
    <Carousel
      className={className}
      minItemWidth={250}
      gap={12}
      showArrows
      isLoading={isLoading}
    >
      {items.map((item) => (
        <DiscoverMediaCard key={item.id} item={item} />
      ))}
    </Carousel>
  )
})
