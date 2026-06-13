import { useQuery } from '@tanstack/react-query'
import { Carousel } from '@ui/molecules/carousel'
import { DiscoverMediaCard } from '@discover/molecules/discover-media-card'
import { mediaQueries } from '../media-queries'
import { cn } from '@/lib/utils'

interface SimilarSectionProps {
  mediaId: string
  mediaType: string
  className?: string
}

export function SimilarSection({ mediaId, mediaType, className }: SimilarSectionProps) {
  const { data, isLoading } = useQuery(
    mediaQueries.similar(mediaId, { mediaType, limit: 20 }),
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
