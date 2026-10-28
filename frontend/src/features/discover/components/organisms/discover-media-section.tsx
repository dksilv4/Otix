import { memo, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useSectionFetch } from '@discover/hooks/use-section-fetch'
import { useStreamableCatalog } from '@/features/media/hooks/use-stream-availability'
import { filterStreamableItems } from '../../utils/rail'
import { MediaCarousel } from '../molecules/discover-media-carousel'
import { DiscoverSectionError } from '../molecules/discover-section-error'
import { MediaSectionSkeleton } from '../molecules/discover-media-section-skeleton'

interface MediaSectionProps {
  title: string
  mediaType: string
  listType: string
  genre?: string
  language?: string
  isAnime?: boolean
  platform?: string
  /** Start the list request immediately instead of waiting for the rail to enter view. */
  eager?: boolean
  /** Active intent filter from Discover header (e.g., 'streamable'). */
  activeIntent?: string
}

export const MediaSection = memo(({
  title,
  mediaType,
  listType,
  genre,
  language,
  isAnime,
  platform,
  eager = false,
  activeIntent,
}: MediaSectionProps) => {
  const { ref, items, showSkeleton, isEmpty, isError, refetch } = useSectionFetch({
    id: '',
    title,
    mediaType,
    listType,
    genre: genre ?? null,
    language: language ?? null,
    isAnime: isAnime ?? null,
    platform: platform ?? null,
    isPersonalized: false,
    reason: null,
  }, eager)

  const isStreamableIntent = activeIntent === 'streamable'
  const { streamableIds, isLoading: isStreamCatalogLoading } = useStreamableCatalog()

  const displayedItems = useMemo(() => {
    if (!isStreamableIntent) return items
    return filterStreamableItems(items, streamableIds)
  }, [isStreamableIntent, items, streamableIds])

  if (isEmpty) return null
  if (isStreamableIntent && !showSkeleton && !isStreamCatalogLoading && displayedItems.length === 0) {
    return null
  }

  const isLoadingSkeleton = showSkeleton || (isStreamableIntent && isStreamCatalogLoading && items.length === 0)

  return (
    <motion.section
      id={`discover-section-${mediaType}-${listType}`}
      ref={ref}
      initial={{ opacity: 1, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.5 }}
    >
      {isLoadingSkeleton ? (
        <MediaSectionSkeleton />
      ) : isError && displayedItems.length === 0 ? (
        <DiscoverSectionError title={title} onRetry={() => void refetch()} />
      ) : (
        <MediaCarousel
          items={displayedItems}
          title={title}
          viewAllLink={`/discover/${mediaType}/${listType}`}
          viewAllSearch={platform ? { platform } : undefined}
          priority={eager}
          hideStreamBadge={isStreamableIntent}
        />
      )}
    </motion.section>
  )
})
