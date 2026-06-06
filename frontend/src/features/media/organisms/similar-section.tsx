import { useQuery } from '@tanstack/react-query'
import { MediaCarousel } from '@discover/molecules/media-carousel'
import { mediaQueries } from '../media-queries'
import { cn } from '@/lib/utils'
import './similar-section.scss'

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
    <section className={cn('dk-media-similar-section', className)}>
      <h2 className="dk-media-similar-section__heading">Similar</h2>
      <MediaCarousel items={items} isLoading={isLoading} />
    </section>
  )
}
