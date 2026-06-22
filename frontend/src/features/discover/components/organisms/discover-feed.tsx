import { DiscoverHero } from './discover-hero'
import { DiscoverTrailerHero } from './discover-trailer-hero'
import { MediaSection } from './discover-media-section'
import { TrendingTrailersSection } from './trending-trailers-section'

/** Feed layout composing the hero carousel with personalized media sections. */
export function DiscoverFeed() {
  return (
    <div className="space-y-16">
      <DiscoverHero />
      <DiscoverTrailerHero />
      <TrendingTrailersSection />
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
    </div>
  )
}
