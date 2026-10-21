import { memo } from 'react'
import { motion } from 'framer-motion'
import { Carousel } from '@ui/molecules/carousel'
import { useStreamableCatalog } from '@/features/media/hooks/use-stream-availability'
import { DiscoverMediaCard } from '../molecules/discover-media-card'
import { MediaSectionSkeleton } from '../molecules/discover-media-section-skeleton'

interface DiscoverStreamableSectionProps {
  className?: string
}

export const DiscoverStreamableSection = memo(({
  className = '',
}: DiscoverStreamableSectionProps) => {
  const { isPlexConnected, items, isLoading } = useStreamableCatalog()

  if (!isPlexConnected || (!isLoading && items.length === 0)) {
    return null
  }

  return (
    <motion.section
      id="discover-streamable-section"
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.5 }}
      className={className}
    >
      {isLoading && items.length === 0 ? (
        <MediaSectionSkeleton
          cardAspectRatio="aspect-[2/3]"
          cardWidth="w-[160px]"
          cardClassName="rounded-xl"
        />
      ) : (
        <Carousel
          title="Available to Stream"
          subtitle="Ready to watch from your personal media library"
          minItemWidth={160}
          gap={14}
          showArrows
        >
          {items.slice(0, 24).map((item) => (
            <DiscoverMediaCard
              key={`streamable-${item.id}`}
              item={item}
              showTypeBadge
            />
          ))}
        </Carousel>
      )}
    </motion.section>
  )
})
