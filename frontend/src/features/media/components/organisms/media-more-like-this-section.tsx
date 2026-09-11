import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Carousel } from '@ui/molecules/carousel'
import { DiscoverMediaCard } from '@discover/components/molecules/discover-media-card'
import { mediaQueries } from '@media/queries/media-queries'
import { useMediaParams } from '@media'
import { useAuth } from '@/old-features/auth'
import { cn } from '@/lib/utils'

interface MoreLikeThisSectionProps {
  className?: string
  headerClassName?: string
  trackPaddingInline?: string
}

type Tab = 'similar' | 'forYou'

export function MoreLikeThisSection({
  className,
  headerClassName,
  trackPaddingInline,
}: MoreLikeThisSectionProps) {
  const [activeTab, setActiveTab] = useState<Tab>('similar')
  const { isAuthenticated } = useAuth()

  const { mediaType, mediaId } = useMediaParams()

  const { data: similarData, isLoading: similarLoading } = useQuery(
    mediaQueries.similar(mediaType, mediaId, { limit: 20 }),
  )

  const { data: recommendationsData, isLoading: recommendationsLoading } =
    useQuery(
      mediaQueries.recommendations(mediaType, mediaId, { limit: 20 }),
    )

  const similarItems = Array.isArray(similarData?.items)
    ? similarData.items
    : Array.isArray(similarData)
      ? similarData
      : []
  const forYouItems = Array.isArray(recommendationsData?.items)
    ? recommendationsData.items
    : Array.isArray(recommendationsData)
      ? recommendationsData
      : []

  const hasSimilar = similarLoading || similarItems.length > 0
  const hasForYou =
    isAuthenticated && (recommendationsLoading || forYouItems.length > 0)

  // Nothing to show at all
  if (!hasSimilar && !hasForYou) return null

  const availableTabs: { key: Tab; label: string }[] = []
  if (hasSimilar) availableTabs.push({ key: 'similar', label: 'Similar' })
  if (hasForYou) availableTabs.push({ key: 'forYou', label: 'For You' })

  // If the active tab lost its data, fall back to the first available
  const resolvedTab = availableTabs.find((t) => t.key === activeTab)
    ? activeTab
    : availableTabs[0].key

  const isLoading =
    resolvedTab === 'similar' ? similarLoading : recommendationsLoading
  const items = resolvedTab === 'similar' ? similarItems : forYouItems

  return (
    <section className={cn('w-full space-y-4', className)}>
      <div className={cn('flex items-center gap-3 px-4 sm:px-6 lg:px-8', headerClassName)}>
        <h2 className="text-xl font-bold tracking-tight text-white/90">More Like This</h2>

        {availableTabs.length > 1 && (
          <div className="flex gap-1.5">
            {availableTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full cursor-pointer transition-colors border-0 backdrop-blur ${
                  resolvedTab === tab.key
                    ? 'bg-white/10 text-white'
                    : 'bg-white/5 hover:bg-white/10 text-white/70'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <Carousel isLoading={isLoading} trackPaddingInline={trackPaddingInline}>
        {items.map((item) => (
          <DiscoverMediaCard key={item.id} item={item} />
        ))}
      </Carousel>
    </section>
  )
}
