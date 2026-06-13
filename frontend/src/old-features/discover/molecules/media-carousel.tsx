// TODO: Review this file
import { memo } from 'react'
import { Skeleton } from '@ui/atoms/skeleton'
import { cn } from '@/lib/utils'
import { DiscoverMediaCard } from './discover-media-card'
import './media-carousel.scss'
import type { MediaItemSummary } from '@media/media-queries'

interface MediaCarouselProps {
  items: MediaItemSummary[]
  isLoading: boolean
  className?: string
  getSubtitle?: (item: MediaItemSummary) => string | null | undefined
}

export const MediaCarousel = memo(function MediaCarousel({ items, isLoading, className, getSubtitle }: MediaCarouselProps) {
  if (isLoading) {
    return (
      <div className="dk-discover-carousel__track">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="dk-discover-carousel__card">
            <Skeleton className="dk-discover-carousel__skeleton" />
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) return null

  return (
    <div className={cn('dk-discover-carousel', className)}>
      <div className="dk-discover-carousel__track">
        {items.map((item, i) => (
          <div key={item.id} className="dk-discover-carousel__card" style={{ animationDelay: `${i * 0.15}s` }}>
            <DiscoverMediaCard item={item} subtitle={getSubtitle?.(item)} />
          </div>
        ))}
      </div>
    </div>
  )
})
