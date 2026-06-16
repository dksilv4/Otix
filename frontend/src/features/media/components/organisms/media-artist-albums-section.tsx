// TODO: Review this file
import { useRef, useLayoutEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MediaCard } from '@ui/molecules/media-card'
import { mediaQueries } from '@media/queries/media-queries'
import { cn } from '@/lib/utils'

const BASE_ITEM_WIDTH = 144 // matches w-36 (9rem)
const BASE_GAP = 12         // matches gap-3

interface ArtistAlbumsSectionProps {
  artistPersonId: string
  artistName: string
  currentMediaId: string
  className?: string
}

export function ArtistAlbumsSection({
  artistPersonId,
  artistName,
  currentMediaId,
  className,
}: ArtistAlbumsSectionProps) {
  const { data, isLoading } = useQuery(
    mediaQueries.list({
      type: 'music',
      personId: artistPersonId,
      sortBy: 'release_date',
      sortDir: 'desc',
      limit: 30,
    }),
  )

  const albums = (data?.items ?? [])
    .filter((item) => item.id !== currentMediaId)
    .reduce((acc, item) => {
      const rg = item.albumMusicbrainzReleaseGroupId
      if (rg) {
        if (acc.seen.has(rg)) return acc
        acc.seen.add(rg)
      }
      acc.items.push(item)
      return acc
    }, { items: [] as NonNullable<typeof data>['items'], seen: new Set<string>() }).items

  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Smart sizing — perfectly fill visible area, no partial overflow
  useLayoutEffect(() => {
    const scrollEl = scrollRef.current
    const listEl = listRef.current
    if (!scrollEl || !listEl || albums.length === 0) return

    const update = () => {
      const scrollStyle = getComputedStyle(scrollEl)
      const listStyle = getComputedStyle(listEl)
      const gap = parseFloat(listStyle.columnGap) || BASE_GAP
      const visibleWidth = scrollEl.getBoundingClientRect().width
      const padLeft = parseFloat(scrollStyle.paddingLeft) || 0
      const padRight = parseFloat(scrollStyle.paddingRight) || 0
      const contentWidth = Math.max(0, visibleWidth - padLeft - padRight)

      let count = Math.floor((contentWidth + gap) / (BASE_ITEM_WIDTH + gap))
      count = Math.max(2, Math.min(count, albums.length))

      const totalGaps = (count - 1) * gap
      const cardWidth = Math.max(0, Math.floor((contentWidth - totalGaps) / count))
      listEl.style.setProperty('--card-width', `${cardWidth}px`)
    }

    const observer = new ResizeObserver(update)
    observer.observe(scrollEl)
    update()
    return () => observer.disconnect()
  }, [albums.length])

  if (isLoading || albums.length === 0) return null

  return (
    <section className={cn('space-y-4', className)}>
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold">More by {artistName}</h2>
        <span className="text-sm text-muted-foreground">
          {albums.length} album{albums.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div ref={scrollRef} className="-mx-4 overflow-x-auto px-4 pb-1 pt-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div ref={listRef} className="flex gap-3">
          {albums.map((album) => (
            <div key={album.id} className="shrink-0 -mt-2 rounded-lg" style={{ width: 'var(--card-width)', minWidth: '9rem' }}>
              <MediaCard
                id={album.id}
                mediaType="music"
                title={album.title}
                posterUrl={album.posterUrl}
                releaseDate={album.releaseDate}
                showTypeBadge={false}
                zoomed={false}
                isAdult={album.isAdult}
                artistName={album.albumArtistName || artistName}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
