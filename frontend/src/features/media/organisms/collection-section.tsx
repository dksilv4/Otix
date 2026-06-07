// TODO: Review this file
import { useRef, useLayoutEffect } from 'react'
import './collection-section.scss'
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

      <div ref={scrollRef} className="dk-media-collection__scroll">
        <div ref={innerRef} className="dk-media-collection__inner">
          {collection.movies.map((movie) => {
            const isCurrent = movie.id === currentMediaId

            return (
              <div
                key={movie.id}
                className={cn(
                  'dk-media-collection__card',
                  isCurrent && 'dk-media-collection__card--current',
                )}
                style={{ width: 'var(--card-width)' }}
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
