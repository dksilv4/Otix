import { useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Carousel } from '@ui/molecules/carousel'
import { DiscoverMediaCard } from '@discover/components/molecules/discover-media-card'
import { mediaQueries } from '@media/queries/media-queries'
import { cn } from '@/lib/utils'

interface SimilarSectionProps {
  className?: string
}

export function SimilarSection({ className }: SimilarSectionProps = {}) {
  const params = useParams({ strict: false }) as { mediaType?: string; mediaId?: string }
  const mediaType = params.mediaType || 'movie'
  const mediaId = params.mediaId || ''
  const { data, isLoading } = useQuery(
    mediaQueries.similar(mediaType, mediaId, { limit: 20 }),
  )

  const items = data?.items ?? []
  if (!isLoading && items.length === 0) return null

  return (
    <section className={cn('space-y-4', className)}>
      <h2 className="px-4 lg:px-8 text-lg font-semibold">Similar</h2>
      <Carousel isLoading={isLoading}>
        {items.map((item) => (
          <DiscoverMediaCard key={item.id} item={item} />
        ))}
      </Carousel>
    </section>
  )
}
