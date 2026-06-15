import { useQuery } from '@tanstack/react-query'
import { Carousel } from '@ui/molecules/carousel'
import { DiscoverMediaCard } from '@discover/components/molecules/discover-media-card'
import { mediaQueries } from '../media-queries'
import { cn } from '@/lib/utils'

interface RecommendationsSectionProps {
  mediaId: string
  mediaType: string
  className?: string
}

export function RecommendationsSection({ mediaId, mediaType, className }: RecommendationsSectionProps) {
  const { data, isLoading } = useQuery(
    mediaQueries.recommendations(mediaType, mediaId, { limit: 20 }),
  )

  const items = data?.items ?? []
  if (!isLoading && items.length === 0) return null

  return (
    <section className={cn('space-y-4', className)}>
      <div className="flex items-baseline gap-3 px-4 lg:px-8">
        <h2 className="text-lg font-semibold">Recommendations</h2>
        <span className="text-sm text-muted-foreground">For you</span>
      </div>
      <Carousel isLoading={isLoading}>
        {items.map((item) => (
          <DiscoverMediaCard key={item.id} item={item} />
        ))}
      </Carousel>
    </section>
  )
}
