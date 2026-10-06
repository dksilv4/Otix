import { memo } from 'react'
import { motion } from 'framer-motion'
import { Carousel } from '@ui/molecules/carousel'
import { useSeasonSectionFetch } from '@discover/hooks/use-season-section-fetch'
import { DiscoverSeasonCard } from '../molecules/discover-season-card'
import { DiscoverSectionError } from '../molecules/discover-section-error'
import { MediaSectionSkeleton } from '../molecules/discover-media-section-skeleton'

/**
 * New Seasons rail. Unlike the media sections this surfaces each show's latest
 * Season (rendered + deep-linked by DiscoverSeasonCard), not the show itself —
 * the trend is driven by a freshly-premiered season, so that is what the card
 * represents. Fed by /discover/season/trending (show/trending stays the plain
 * shows feed rendered by MediaSection).
 */
export const TrendingSeasonsSection = memo(({
  eager = false,
}: {
  eager?: boolean
}) => {
  const { ref, items, showSkeleton, isEmpty, isError, refetch } = useSeasonSectionFetch(eager)

  if (isEmpty) return null

  return (
    <motion.section
      id="discover-section-season-trending"
      ref={ref}
      initial={{ opacity: 1, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.5 }}
    >
      {showSkeleton ? (
        <MediaSectionSkeleton />
      ) : isError && items.length === 0 ? (
        <DiscoverSectionError title="New Seasons" onRetry={() => void refetch()} />
      ) : (
        <Carousel
          title="New Seasons"
          minItemWidth={250}
          gap={12}
          showArrows
          viewAllLink="/discover/season/trending"
        >
          {(Array.isArray(items) ? items.filter(Boolean) : []).map((season) => (
            <DiscoverSeasonCard key={`${season.showId}-${season.seasonNumber}`} season={season} />
          ))}
        </Carousel>
      )}
    </motion.section>
  )
})
