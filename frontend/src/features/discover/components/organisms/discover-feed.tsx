import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { DiscoverHero } from './discover-hero'
import { MediaSection } from './discover-media-section'
import { FreeGamesSection } from './free-games-section'
import { discoverQueries } from '../../queries/discover-queries'

/**
 * Feed layout composing the hero carousel with personalized media sections.
 *
 * The section stack is only mounted once the hero resolves with content. The
 * hero is the broadest catalog query (any artwork-backed item), so when it
 * comes back empty the catalog is empty too and every section would be empty —
 * mounting them would leave an endless stack of loading skeletons to scroll
 * through, which is why the whole feed hides down to the empty filler instead.
 */
export function DiscoverFeed() {
  const { data: heroData } = useInfiniteQuery(discoverQueries.hero())
  const hasFeedContent = useMemo(() => {
    const pages = heroData?.pages ?? []
    return pages.some((p) => (Array.isArray(p?.items) ? p.items.length > 0 : false))
  }, [heroData])

  return (
    <div id="discover-feed" className="space-y-16">
      <DiscoverHero />
      {hasFeedContent && (
        <>
          <MediaSection
            title="Trending Movies"
            mediaType="movie"
            listType="trending"
          />
          <MediaSection
            title="Trending Shows"
            mediaType="show"
            listType="trending"
          />
          <MediaSection
            title="Trending Games"
            mediaType="game"
            listType="trending"
          />
          <MediaSection
            title="Trending Music"
            mediaType="music"
            listType="trending"
          />
          <MediaSection
            title="Popular Movies"
            mediaType="movie"
            listType="popular"
          />
          <MediaSection
            title="Popular Shows"
            mediaType="show"
            listType="popular"
          />
          <MediaSection
            title="Popular Games"
            mediaType="game"
            listType="popular"
          />
          <MediaSection
            title="Popular Music"
            mediaType="music"
            listType="popular"
          />
          <MediaSection
            title="Top Rated Games"
            mediaType="game"
            listType="top_rated"
          />
          <MediaSection
            title="Upcoming Games"
            mediaType="game"
            listType="upcoming"
          />
          <FreeGamesSection />
        </>
      )}
    </div>
  )
}
