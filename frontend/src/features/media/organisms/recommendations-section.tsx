import { useQuery } from '@tanstack/react-query'
import { Carousel } from '@ui/molecules/carousel'
import { DiscoverMediaCard } from '@discover/molecules/discover-media-card'
import { mediaQueries } from '../media-queries'
import { cn } from '@/lib/utils'
import './recommendations-section.scss'

interface RecommendationsSectionProps {
  mediaId: string
  className?: string
}

export function RecommendationsSection({ mediaId, className }: RecommendationsSectionProps) {
  const { data, isLoading } = useQuery(
    mediaQueries.recommendations(mediaId, { limit: 20 }),
  )

  const items = data?.items ?? []
  if (!isLoading && items.length === 0) return null

  return (
    <section className={cn('dk-media-recommendations', className)}>
      <div className="dk-media-recommendations__header">
        <h2 className="dk-media-recommendations__title">Recommendations</h2>
        <span className="dk-media-recommendations__description">For you</span>
      </div>
      <Carousel isLoading={isLoading}>
        {items.map((item) => (
          <DiscoverMediaCard key={item.id} item={item} />
        ))}
      </Carousel>
    </section>
  )
}
