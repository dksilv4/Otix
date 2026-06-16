import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Carousel } from '@ui/molecules/carousel'
import { DiscoverMediaCard } from '@discover/components/molecules/discover-media-card'
import { mediaQueries } from '@media/queries/media-queries'
import { useAuth } from '@/old-features/auth'
import { cn } from '@/lib/utils'

interface MoreLikeThisSectionProps {
  className?: string
}

type Tab = 'similar' | 'forYou'

export function MoreLikeThisSection({ className }: MoreLikeThisSectionProps) {
  const [activeTab, setActiveTab] = useState<Tab>('similar')
  const { isAuthenticated } = useAuth()

  const params = useParams({ strict: false }) as {
    mediaType?: string
    mediaId?: string
  }
  const mediaType = params.mediaType || 'movie'
  const mediaId = params.mediaId || ''

  const { data: similarData, isLoading: similarLoading } = useQuery(
    mediaQueries.similar(mediaType, mediaId, { limit: 20 }),
  )

  const { data: recommendationsData, isLoading: recommendationsLoading } =
    useQuery(
      mediaQueries.recommendations(mediaType, mediaId, { limit: 20 }),
    )

  const similarItems = similarData?.items ?? []
  const forYouItems = recommendationsData?.items ?? []

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
    <section className={cn('space-y-4', className)}>
      <div className="flex items-center gap-3 px-4 lg:px-8">
        <h2 className="text-lg font-semibold">More Like This</h2>

        {availableTabs.length > 1 && (
          <div className="flex gap-1.5">
            {availableTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'px-3 py-1.5 text-xs font-semibold rounded-full cursor-pointer transition-colors border-0 backdrop-blur',
                  resolvedTab === tab.key
                    ? 'bg-white/10 text-white'
                    : 'bg-white/5 hover:bg-white/10 text-white/70',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <Carousel isLoading={isLoading}>
        {items.map((item) => (
          <DiscoverMediaCard key={item.id} item={item} />
        ))}
      </Carousel>
    </section>
  )
}
