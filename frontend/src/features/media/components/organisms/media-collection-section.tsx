import { useRef } from 'react'
import { MediaCard } from '@ui/molecules/media-card'
import { useQuery } from '@tanstack/react-query'
import { mediaQueries, formatYear, useMediaParams } from '@media'
import { Image } from '@ui/atoms/image'

export function CollectionSection({ className }: { className?: string } = {}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const { mediaType, mediaId } = useMediaParams()

  const { data } = useQuery(mediaQueries.detail(mediaType, mediaId))
  if (!data || !data.collection) return null
  const collection = data.collection
  const currentMediaId = data.id
  const movies = collection.movies

  if (movies.length === 0) return null

  return (
    <section className={`space-y-4 ${className || ''}`}>
      {/* Header */}
      <div className="flex items-center gap-3">
        {collection.posterUrl && (
          <div className="shrink-0 w-10 h-14 rounded-lg overflow-hidden ring-1 ring-white/10">
            <Image
              src={collection.posterUrl}
              alt={collection.name}
              className="h-full w-full object-cover"
              fallback={collection.name[0]}
            />
          </div>
        )}
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold">{collection.name}</h2>
          <span className="text-sm text-muted-foreground/60">
            {movies.length} film{movies.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {collection.overview && (
        <p className="text-sm leading-relaxed text-muted-foreground/70 line-clamp-2">
          {collection.overview}
        </p>
      )}

      {/* Scrollable row */}
      <div ref={scrollRef} className="overflow-x-auto pb-1 scrollbar-none">
        <div className="flex gap-3">
          {movies.map((movie) => {
            const isCurrent = movie.id === currentMediaId
            const year = formatYear(movie.releaseDate)

            return (
              <div
                key={movie.id}
                className="shrink-0 w-36 sm:w-40 lg:w-44 group">
                <div
                  className={`relative overflow-hidden rounded-xl transition-all duration-300 ${
                    isCurrent
                      ? 'ring-1 ring-primary/30'
                      : 'ring-1 ring-white/5 hover:ring-white/10'
                  }`}
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

                  {year && (
                    <span className="absolute bottom-2 left-2 rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white/50 glass-badge">
                      {year}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
