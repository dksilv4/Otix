import { memo } from 'react'
import { motion } from 'framer-motion'
import { Carousel } from '@ui/molecules/carousel'
import { useDiscoverContinueWatching } from '../../hooks/use-discover-continue-watching'
import { usePlayContinueWatching } from '../../hooks/use-play-continue-watching'
import { DiscoverContinueWatchingCard } from '../molecules/discover-continue-watching-card'
import { DiscoverSectionError } from '../molecules/discover-section-error'
import { MediaSectionSkeleton } from '../molecules/discover-media-section-skeleton'

interface DiscoverContinueWatchingSectionProps {
  eager?: boolean
}

/**
 * Continue Watching carousel in the Discover feed.
 * Only rendered if Plex is connected and there are active in-progress/on-deck items.
 */
export const DiscoverContinueWatchingSection = memo(({
  eager = false,
}: DiscoverContinueWatchingSectionProps = {}) => {
  const { ref, items, showSkeleton, isEmpty, isError, refetch, isPlexConnected } =
    useDiscoverContinueWatching(eager)
  const { playItem, loadingItemId } = usePlayContinueWatching()

  if (!isPlexConnected || isEmpty) {
    return null
  }

  return (
    <motion.section
      id="discover-continue-watching-section"
      ref={ref}
      initial={{ opacity: 1, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.5 }}
    >
      {showSkeleton ? (
        <MediaSectionSkeleton
          cardAspectRatio="aspect-video"
          cardWidth="w-[280px]"
          cardClassName="rounded-2xl"
        />
      ) : isError && items.length === 0 ? (
        <DiscoverSectionError
          title="Continue Watching"
          onRetry={() => void refetch()}
        />
      ) : (
        <Carousel
          title="Continue Watching"
          subtitle="Pick up right where you left off"
          minItemWidth={280}
          gap={14}
          showArrows
        >
          {items.map((item) => (
            <DiscoverContinueWatchingCard
              key={`${item.serverId || 'srv'}-${item.id}`}
              item={item}
              isPlaying={loadingItemId === item.id}
              onPlay={playItem}
            />
          ))}
        </Carousel>
      )}
    </motion.section>
  )
})
