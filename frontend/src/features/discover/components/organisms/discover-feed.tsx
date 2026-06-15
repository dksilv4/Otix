import { DiscoverHero } from './discover-hero'
import { MediaSection } from './media-section'

/** Feed layout composing the hero carousel with personalized media sections. */
export function DiscoverFeed() {
  return (
    <div className="space-y-16">
      <DiscoverHero />
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
