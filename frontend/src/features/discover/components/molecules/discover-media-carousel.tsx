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
  priority?: boolean
  hideStreamBadge?: boolean
  snap?: boolean
}

export const MediaCarousel = memo(({
  items,
  isLoading = false,
  className,
  title,
  viewAllLink,
  viewAllSearch,
  priority = false,
  hideStreamBadge = false,
  snap = true,
}: MediaCarouselProps) => {
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
      snap={snap}
    >
      {(Array.isArray(items) ? items.filter((item) => item && item.id) : []).map((item, index) => (
        <DiscoverMediaCard
          key={item.id}
          item={item}
          priority={priority && index < 4}
          hideStreamBadge={hideStreamBadge}
        />
      ))}
    </Carousel>
  )
})
