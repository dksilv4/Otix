// TODO: Review this file
import './collection-section.scss'
import { MediaCard } from '@ui/molecules/media-card'
import { cn } from '@/lib/utils'

interface CollectionMovie {
  id: string
  title: string
  posterUrl: string | null
  releaseDate: string | null
  slug: string
  isAdult?: boolean
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
    <section className={cn('dk-media-collection', className)}>
      <div className="dk-media-collection__header">
        <h2 className="dk-media-collection__title">{collection.name}</h2>
        <span className="dk-media-collection__count">
          {collection.movies.length} movie{collection.movies.length !== 1 ? 's' : ''}
        </span>
      </div>

      {collection.overview && (
        <p className="dk-media-collection__overview">
          {collection.overview}
        </p>
      )}

      <div className="dk-media-collection__scroll">
        <div className="dk-media-collection__inner">
          {collection.movies.map((movie) => {
            const isCurrent = movie.id === currentMediaId

            return (
              <div
                key={movie.id}
                className={cn(
                  'dk-media-collection__card',
                  isCurrent && 'dk-media-collection__card--current',
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
