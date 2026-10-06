import { memo } from 'react'
import { motion } from 'framer-motion'
import { useSectionFetch } from '@discover/hooks/use-section-fetch'
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

  if (isEmpty) return null

  return (
    <motion.section
      id={`discover-section-${mediaType}-${listType}`}
      ref={ref}
      initial={{ opacity: 1, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.5 }}
    >
      {showSkeleton ? (
        <MediaSectionSkeleton />
      ) : isError && items.length === 0 ? (
        <DiscoverSectionError title={title} onRetry={() => void refetch()} />
      ) : (
        <MediaCarousel
          items={items}
          title={title}
          viewAllLink={`/discover/${mediaType}/${listType}`}
          viewAllSearch={platform ? { platform } : undefined}
          priority={eager}
        />
      )}
    </motion.section>
  )
})
