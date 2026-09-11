import { memo } from 'react'
import { motion } from 'framer-motion'
import { useSectionFetch } from '@discover/hooks/use-section-fetch'
import { MediaCarousel } from '../molecules/discover-media-carousel'
import { MediaSectionSkeleton } from '../molecules/discover-media-section-skeleton'

interface MediaSectionProps {
  title: string
  mediaType: string
  listType: string
  genre?: string
  language?: string
  isAnime?: boolean
  platform?: string
}

export const MediaSection = memo(function MediaSection({
  title,
  mediaType,
  listType,
  genre,
  language,
  isAnime,
  platform,
}: MediaSectionProps) {
  const { ref, items, showSkeleton, isEmpty } = useSectionFetch({
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
  })

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
      ) : (
        <MediaCarousel
          items={items}
          title={title}
          viewAllLink="/search"
          viewAllSearch={{ q: '', type: mediaType, sort: '' }}
        />
      )}
    </motion.section>
  )
})
