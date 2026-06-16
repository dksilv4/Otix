import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { MediaCard } from '@ui/molecules/media-card'
import { mediaQueries } from '@media'

export function ArtistAlbumsSection({ className }: { className?: string } = {}) {
  const params = useParams({ strict: false }) as { mediaType?: string; mediaId?: string }
  const mediaType = params.mediaType || 'music'
  const mediaId = params.mediaId || ''

  const { data: detailData } = useQuery(mediaQueries.detail(mediaType, mediaId))
  if (!detailData || detailData.mediaType !== 'music') return null

  const primaryArtist = detailData.credits?.find((c) => c.role === 'primary')
  if (!primaryArtist) return null

  const artistPersonId = primaryArtist.person.id
  const artistName = primaryArtist.person.name
  const currentMediaId = detailData.id

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
    <section className={`space-y-4 ${className || ''}`}>
      <div className="flex items-baseline gap-2">
        <h2 className="text-lg font-semibold">More by {artistName}</h2>
        <span className="text-sm text-muted-foreground/70">
          {albums.length} album{albums.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="overflow-x-auto pb-1 scrollbar-none">
        <div className="flex gap-3">
          {albums.map((album) => (
            <div key={album.id} className="shrink-0 w-36 sm:w-40 lg:w-44">
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
