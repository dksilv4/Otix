import { useQuery } from '@tanstack/react-query'
import { MediaCard } from '@ui/molecules/media-card'
import { mediaQueries } from '../media-queries'
import { cn } from '@/lib/utils'

interface SimilarSectionProps {
  mediaId: string
  mediaType: string
  className?: string
}

function SectionSkeleton() {
  return (
    <div className="flex gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="w-36 shrink-0 rounded-lg animate-pulse"
          style={{
            aspectRatio: '2/3',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
          }}
        />
      ))}
    </div>
  )
}

export function SimilarSection({ mediaId, mediaType, className }: SimilarSectionProps) {
  const { data, isLoading } = useQuery(
    mediaQueries.similar(mediaId, { mediaType, limit: 20 }),
  )

  if (isLoading) {
    return (
      <section className={cn('space-y-4', className)}>
        <h2 className="text-lg font-semibold">Similar</h2>
        <div className="-mx-4 overflow-x-auto px-4 pb-1 pt-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <SectionSkeleton />
        </div>
      </section>
    )
  }

  const items = data?.items ?? []
  if (items.length === 0) return null

  return (
    <section className={cn('space-y-4', className)}>
      <h2 className="text-lg font-semibold">Similar</h2>

      <div className="-mx-4 overflow-x-auto px-4 pb-1 pt-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex gap-3">
          {items.map((item) => (
            <div key={item.id} className="w-36 shrink-0 -mt-2 rounded-lg">
              <MediaCard
                id={item.id}
                mediaType={item.mediaType as 'movie' | 'show' | 'game' | 'music'}
                title={item.title}
                posterUrl={item.posterUrl}
                releaseDate={item.releaseDate}
                showTypeBadge={false}
                zoomed={false}
                isAdult={item.isAdult}
                artistName={item.albumArtistName}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
