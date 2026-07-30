import { DiscoverHero } from './discover-hero'
import { MediaSection } from './discover-media-section'
import { FreeGamesSection } from './free-games-section'

/**
 * Feed layout composing the hero carousel with personalized media sections.
 */
export function DiscoverFeed() {
  return (
    <div id="discover-feed" className="space-y-16">
      <DiscoverHero />
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
      <FreeGamesSection />
    </div>
  )
}
