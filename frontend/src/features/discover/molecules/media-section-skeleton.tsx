import { Skeleton } from '@ui/atoms/skeleton'
import './media-section-skeleton.scss'

export function MediaSectionSkeleton() {
  return (
    <div className="dk-discover-media-section-skeleton">
      <div className="dk-discover-media-section-skeleton__header">
        <div className="dk-discover-media-section-skeleton__bar" />
        <div className="dk-discover-media-section-skeleton__bar dk-discover-media-section-skeleton__bar--short" />
      </div>
      <div
        className="dk-discover-media-section-skeleton__carousel"
        style={{ gap: 'var(--carousel-gap, 1.25rem)' }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="dk-discover-media-section-skeleton__card"
            style={{ width: 'var(--card-width, 240px)', aspectRatio: '2 / 3' }}
          >
            <Skeleton className="h-full w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}
