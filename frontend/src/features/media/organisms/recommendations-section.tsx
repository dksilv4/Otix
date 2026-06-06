import { useQuery } from '@tanstack/react-query'
import { MediaCarousel } from '@discover/molecules/media-carousel'
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
      <MediaCarousel items={items} isLoading={isLoading} />
    </section>
  )
}
