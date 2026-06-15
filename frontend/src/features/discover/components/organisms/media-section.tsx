import { memo } from 'react'
import { motion } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useSectionFetch } from '@discover/hooks/use-section-fetch'
import { MediaCarousel } from '../molecules/media-carousel'
import { MediaSectionSkeleton } from '../molecules/media-section-skeleton'

interface MediaSectionProps {
  title: string
  mediaType: string
  listType: string
  genre?: string
  language?: string
  isAnime?: boolean
}

export const MediaSection = memo(function MediaSection({
  title,
  mediaType,
  listType,
  genre,
  language,
  isAnime,
}: MediaSectionProps) {
  const { ref, items, showSkeleton, isEmpty } = useSectionFetch({
    id: '',
    title,
    mediaType,
    listType,
    genre: genre ?? null,
    language: language ?? null,
    isAnime: isAnime ?? null,
    isPersonalized: false,
    reason: null,
  })

  if (isEmpty) return null

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex items-center justify-between mb-4 px-4 lg:px-8">
        <h2 className="text-xl font-bold text-white/90">{title}</h2>
        <Link
          to="/search"
          search={{ q: '', type: mediaType, sort: '' }}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-white/80 transition-colors"
        >
          View All <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {showSkeleton ? (
        <MediaSectionSkeleton />
      ) : (
        <MediaCarousel items={items} />
      )}
    </motion.section>
  )
})
