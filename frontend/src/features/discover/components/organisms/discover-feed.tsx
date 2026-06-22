import { DiscoverHero } from './discover-hero'
import { MediaSection } from './discover-media-section'

/**
 * Feed layout composing the hero carousel with personalized media sections.
 *
 * NOTE: Trending Trailers section is disabled because YouTube blocks iframe embeds
 * on localhost/self-hosted domains with a sign-in wall. The sections were built
 * (DiscoverTrailerHero, TrendingTrailersSection + TrailerVideoModal) and the backend
 * endpoint /discover/trailers/trending works — they just can't play without a
 * production domain that YouTube trusts. Re-enable when deploying to production.
 */
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
