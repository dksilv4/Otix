import { MediaCard } from '@ui/molecules/media-card'
import { cn } from '@/lib/utils'

interface CollectionMovie {
  id: string
  title: string
  posterUrl: string | null
  releaseDate: string | null
  slug: string
}

interface CollectionSectionProps {
  collection: {
    id: string
    name: string
    overview: string | null
    posterUrl: string | null
    backdropUrl: string | null
    movies: CollectionMovie[]
  }
  currentMediaId: string
  className?: string
}

export function CollectionSection({ collection, currentMediaId, className }: CollectionSectionProps) {
  if (collection.movies.length === 0) return null

  return (
    <section className={cn('space-y-4', className)}>
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold">{collection.name}</h2>
        <span className="text-sm text-muted-foreground">
          {collection.movies.length} movie{collection.movies.length !== 1 ? 's' : ''}
        </span>
      </div>

      {collection.overview && (
        <p className="max-w-2xl text-sm text-muted-foreground line-clamp-2">
          {collection.overview}
        </p>
      )}

      <div className="-mx-4 overflow-x-auto px-4 pb-1 pt-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex gap-3">
          {collection.movies.map((movie) => {
            const isCurrent = movie.id === currentMediaId

            return (
              <div
                key={movie.id}
                className={cn(
                  'w-36 shrink-0 -mt-2 rounded-lg',
                  isCurrent && 'ring-2 ring-primary',
                )}
              >
                <MediaCard
                  id={movie.id}
                  mediaType="movie"
                  title={movie.title}
                  posterUrl={movie.posterUrl}
                  releaseDate={movie.releaseDate}
                  showTypeBadge={false}
                  zoomed={false}
                  isAdult={movie.isAdult}
                />
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
