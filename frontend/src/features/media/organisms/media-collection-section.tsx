// TODO: Review this file
import { useRef, useLayoutEffect } from 'react'
import { MediaCard } from '@ui/molecules/media-card'
import { cn } from '@/lib/utils'

const BASE_ITEM_WIDTH = 144 // matches w-36 (9rem)
const BASE_GAP = 12         // matches gap-3

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
  const scrollRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  // Smart sizing — perfectly fill visible area, no partial overflow
  useLayoutEffect(() => {
    const scrollEl = scrollRef.current
    const innerEl = innerRef.current
    if (!scrollEl || !innerEl || collection.movies.length === 0) return

    const update = () => {
      const scrollStyle = getComputedStyle(scrollEl)
      const innerStyle = getComputedStyle(innerEl)
      const gap = parseFloat(innerStyle.columnGap) || BASE_GAP
      const visibleWidth = scrollEl.getBoundingClientRect().width
      const padLeft = parseFloat(scrollStyle.paddingLeft) || 0
      const padRight = parseFloat(scrollStyle.paddingRight) || 0
      const contentWidth = Math.max(0, visibleWidth - padLeft - padRight)

      let count = Math.floor((contentWidth + gap) / (BASE_ITEM_WIDTH + gap))
      count = Math.max(2, Math.min(count, collection.movies.length))

      const totalGaps = (count - 1) * gap
      const cardWidth = Math.max(0, Math.floor((contentWidth - totalGaps) / count))
      innerEl.style.setProperty('--card-width', `${cardWidth}px`)
    }

    const observer = new ResizeObserver(update)
    observer.observe(scrollEl)
    update()
    return () => observer.disconnect()
  }, [collection.movies.length])

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

      <div ref={scrollRef} className="-mx-4 overflow-x-auto px-4 pb-1 pt-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div ref={innerRef} className="flex gap-3">
          {collection.movies.map((movie) => {
            const isCurrent = movie.id === currentMediaId

            return (
              <div
                key={movie.id}
                className={cn(
                  'shrink-0 -mt-2 rounded-lg',
                  isCurrent && 'ring-2 ring-primary',
                )}
                style={{ width: 'var(--card-width)', minWidth: '9rem' }}
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
