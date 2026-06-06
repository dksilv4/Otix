// TODO: Review this file
import { useQuery } from '@tanstack/react-query'
import { MediaCard } from '@ui/molecules/media-card'
import { mediaQueries } from '../media-queries'
import { cn } from '@/lib/utils'
import './artist-albums-section.scss'

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
    <section className={cn('dk-media-artist-albums-section', className)}>
      <div className="dk-media-artist-albums-section__header">
        <h2 className="dk-media-artist-albums-section__title">More by {artistName}</h2>
        <span className="dk-media-artist-albums-section__count">
          {albums.length} album{albums.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="dk-media-artist-albums-section__scroll-area">
        <div className="dk-media-artist-albums-section__list">
          {albums.map((album) => (
            <div key={album.id} className="dk-media-artist-albums-section__item">
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
