import { memo, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Carousel } from '@ui/molecules/carousel'
import { MediaSectionSkeleton } from '../molecules/discover-media-section-skeleton'
import { apiClient } from '@/lib/api/client'
import { GenreCard } from '@/features/genre/components/genre-card'
import type { GenreOption } from '@/features/genre/types'

interface DiscoverGenresSectionProps {
  className?: string
  eager?: boolean
}

export const DiscoverGenresSection = memo(function DiscoverGenresSection({
  className,
}: DiscoverGenresSectionProps) {
  const { data: genres = [], isLoading, isError } = useQuery<GenreOption[]>({
    queryKey: ['genres', 'all'],
    queryFn: async () => {
      const { data } = await apiClient.get<GenreOption[]>('/media/genres')
      return data
    },
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  })

  // Deduplicate genres by slug
  const displayGenres = useMemo(() => {
    if (!Array.isArray(genres) || genres.length === 0) return []
    const seen = new Set<string>()
    return genres.filter((g) => {
      const slug = g.slug?.toLowerCase()
      if (!slug || seen.has(slug)) return false
      seen.add(slug)
      return true
    })
  }, [genres])

  if (!isLoading && displayGenres.length === 0) {
    return null
  }

  return (
    <motion.section
      id="discover-section-genres"
      className={className}
      initial={{ opacity: 1, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.5 }}
    >
      {isLoading ? (
        <MediaSectionSkeleton />
      ) : isError ? null : (
        <Carousel
          title="Explore by Genre"
          viewAllLink="/genres"
          minItemWidth={250}
          gap={12}
          showArrows
        >
          {displayGenres.map((genre, index) => (
            <GenreCard
              key={genre.slug}
              genre={genre}
              priority={index < 4}
              className="min-w-[250px] w-full"
            />
          ))}
        </Carousel>
      )}
    </motion.section>
  )
})
