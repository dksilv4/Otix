import { useQuery } from '@tanstack/react-query'
import { MediaCard } from '@ui/molecules/media-card'
import { mediaQueries } from '../media-queries'
import { cn } from '@/lib/utils'

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

  if (isLoading || albums.length === 0) return null

  return (
    <section className={cn('space-y-4', className)}>
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold">More by {artistName}</h2>
        <span className="text-sm text-muted-foreground">
          {albums.length} album{albums.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-1 pt-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex gap-3">
          {albums.map((album) => (
            <div key={album.id} className="w-36 shrink-0 -mt-2 rounded-lg">
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
