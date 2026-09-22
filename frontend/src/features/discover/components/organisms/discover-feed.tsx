import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { DiscoverHero } from './discover-hero'
import { MediaSection } from './discover-media-section'
import { TrendingSeasonsSection } from './trending-seasons-section'
import { FreeGamesSection } from './free-games-section'
import { discoverQueries } from '../../queries/discover-queries'

const PRIORITY_RAILS = [
  { title: 'Trending Movies', mediaType: 'movie', listType: 'trending' },
  { title: 'Trending Shows', mediaType: 'show', listType: 'trending' },
] as const

const DEFERRED_RAILS = [
  { title: 'Popular Movies', mediaType: 'movie', listType: 'popular' },
  { title: 'Popular Shows', mediaType: 'show', listType: 'popular' },
  { title: 'New Releases', mediaType: 'game', listType: 'newly_released' },
  { title: 'Now Playing Games', mediaType: 'game', listType: 'now_playing' },
  { title: 'Top Rated Games', mediaType: 'game', listType: 'top_rated' },
  { title: 'Upcoming Games', mediaType: 'game', listType: 'upcoming' },
  { title: 'Best on PC', mediaType: 'game', listType: 'top_rated', platform: 'windows' },
  { title: 'Best on PlayStation 5', mediaType: 'game', listType: 'top_rated', platform: 'playstation-5' },
  { title: 'Best on Xbox Series', mediaType: 'game', listType: 'top_rated', platform: 'xbox-series-x-s' },
  { title: 'Best on Nintendo Switch', mediaType: 'game', listType: 'top_rated', platform: 'nintendo-switch' },
] as const

/**
 * Feed layout composing the hero carousel with personalized media sections.
 *
 * Priority rails fetch in parallel with the hero so the first screen is not
 * a waterfall. Lower rails wait until the hero has titles — an empty hero
 * means an empty catalog, and mounting every rail would leave a stack of
 * skeletons to scroll through.
 */
export function DiscoverFeed() {
  const { data: heroData, isFetched } = useInfiniteQuery(discoverQueries.hero())
  const hasFeedContent = useMemo(() => {
    const pages = heroData?.pages ?? []
    return pages.some((p) => {
      const items = (p as { items?: unknown } | undefined)?.items
      return Array.isArray(items) && items.length > 0
    })
  }, [heroData])
  const catalogEmpty = isFetched && !hasFeedContent

  return (
    <div id="discover-feed" className="space-y-16">
      <DiscoverHero />
      {!catalogEmpty && (
        <>
          {PRIORITY_RAILS.map((rail) => (
            <MediaSection
              key={`${rail.mediaType}-${rail.listType}`}
              title={rail.title}
              mediaType={rail.mediaType}
              listType={rail.listType}
              eager
            />
          ))}
          <TrendingSeasonsSection eager />
          {hasFeedContent && (
            <>
              {DEFERRED_RAILS.map((rail) => (
                <MediaSection
                  key={`${rail.mediaType}-${rail.listType}-${'platform' in rail ? rail.platform : ''}`}
                  title={rail.title}
                  mediaType={rail.mediaType}
                  listType={rail.listType}
                  platform={'platform' in rail ? rail.platform : undefined}
                />
              ))}
              <FreeGamesSection />
            </>
          )}
        </>
      )}
    </div>
  )
}
