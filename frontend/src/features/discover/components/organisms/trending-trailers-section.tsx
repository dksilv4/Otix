import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { discoverQueries } from '@discover/queries/discover-queries'
import { Carousel } from '@ui/molecules/carousel'
import { MediaCard } from '@ui/molecules/media-card'
import { MediaSectionSkeleton } from '../molecules/discover-media-section-skeleton'
import { TrailerVideoModal } from '../molecules/trailer-video-modal'
import type { TrendingTrailerItem } from '@discover/types'

const TrailerCard = ({
  item,
  onPlay,
}: {
  item: TrendingTrailerItem
  onPlay: () => void
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPlay()
    }
  }

  return (
    <div
      className="relative group cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={onPlay}
      onKeyDown={handleKeyDown}
    >
      <MediaCard
        id={item.id}
        mediaType={item.mediaType as 'movie' | 'show' | 'game' | 'music'}
        title={item.title}
        posterUrl={item.posterUrl}
        textlessPosterUrl={item.textlessPosterUrl}
        logoUrl={item.logoUrl}
        releaseDate={item.releaseDate}
        avgRating={item.avgRating ?? undefined}
        ratingCount={item.ratingCount ?? undefined}
        showTypeBadge
      />
      {/* Play button overlay on hover */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-all rounded-lg">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/90 text-black opacity-0 group-hover:opacity-100 transition-all shadow-lg transform group-hover:scale-110">
          <Play className="h-5 w-5 fill-current ml-0.5" />
        </div>
      </div>
    </div>
  )
};

export const TrendingTrailersSection = ({ className }: { className?: string }) => {
  const { data: items = [], isLoading } = useQuery(discoverQueries.trailers())
  const [activeTrailer, setActiveTrailer] = useState<TrendingTrailerItem | null>(null)

  if (!isLoading && items.length === 0) return null

  return (
    <>
      <section className={className}>
        {isLoading ? (
          <MediaSectionSkeleton />
        ) : (
          <Carousel
            title="Trending Trailers"
            viewAllLink="/search"
            viewAllSearch={{ q: '', type: '', sort: '' }}
          >
            {items.map((item) => (
              <TrailerCard
                key={item.id}
                item={item}
                onPlay={() => setActiveTrailer(item)}
              />
            ))}
          </Carousel>
        )}
      </section>

      {/* Video modal */}
      {activeTrailer && activeTrailer.trailerYoutubeId && (
        <TrailerVideoModal
          youtubeId={activeTrailer.trailerYoutubeId}
          title={activeTrailer.title}
          onClose={() => setActiveTrailer(null)}
        />
      )}
    </>
  )
};
