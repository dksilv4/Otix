import { memo } from 'react'
import { motion } from 'framer-motion'
import { Carousel } from '@ui/molecules/carousel'
import { useGenreSectionFetch } from '../../hooks/use-genre-section-fetch'
import { MediaSectionSkeleton } from '../molecules/discover-media-section-skeleton'
import { DiscoverSectionError } from '../molecules/discover-section-error'
import { GenreCard } from '@/features/genre/components/genre-card'

interface DiscoverGenresSectionProps {
  title?: string
  mediaType?: 'movie' | 'show' | 'game' | 'music'
  className?: string
  eager?: boolean
  limit?: number
}

export const DiscoverGenresSection = memo(function DiscoverGenresSection({
  title = 'Explore by Genre',
  mediaType,
  className,
  eager = false,
  limit = 10,
}: DiscoverGenresSectionProps) {
  const { ref, items, showSkeleton, isEmpty, isError, refetch } = useGenreSectionFetch(
    mediaType,
    eager,
    limit,
  )

  if (isEmpty) return null

  return (
    <motion.section
      id="discover-section-genres"
      ref={ref}
      className={className}
      initial={{ opacity: 1, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.5 }}
    >
      {showSkeleton ? (
        <MediaSectionSkeleton
          cardAspectRatio="aspect-[16/10]"
          cardWidth="w-[250px]"
          cardClassName="rounded-2xl"
        />
      ) : isError && items.length === 0 ? (
        <DiscoverSectionError title={title} onRetry={() => void refetch()} />
      ) : (
        <Carousel
          title={title}
          subtitle="Browse catalog by category"
          viewAllLink="/genres"
          minItemWidth={250}
          gap={12}
          showArrows
        >
          {items.map((genre, index) => (
            <GenreCard
              key={genre.slug}
              genre={genre}
              mediaType={mediaType}
              priority={eager && index < 4}
              className="min-w-[250px] w-full"
            />
          ))}
        </Carousel>
      )}
    </motion.section>
  )
})
