// TODO: Review this file
import { useQuery } from '@tanstack/react-query'
import { MediaCarousel } from '@discover/molecules/media-carousel'
import { mediaQueries } from '../media-queries'
import { cn } from '@/lib/utils'

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
    <section className={cn('space-y-4', className)}>
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold">Recommendations</h2>
        <span className="text-sm text-muted-foreground">For you</span>
      </div>
      <MediaCarousel items={items} isLoading={isLoading} />
    </section>
  )
}
