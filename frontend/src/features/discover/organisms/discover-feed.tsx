import { DiscoverHero } from '@discover/organisms/discover-hero'
import { MediaSection } from '@discover/organisms/media-section'

const sections = [
  { title: 'Movies', mediaType: 'movie' as const, viewAllHref: '/search?type=movie' },
  { title: 'TV Shows', mediaType: 'show' as const, viewAllHref: '/search?type=show' },
  { title: 'Games', mediaType: 'game' as const, viewAllHref: '/search?type=game' },
]

export function DiscoverFeed() {
  return (
    <div className="space-y-16">
      <DiscoverHero />
      {sections.map((section) => (
        <MediaSection key={section.mediaType} {...section} />
      ))}
    </div>
  )
}
