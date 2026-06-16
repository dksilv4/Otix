import './discover-feed.scss'
import { DiscoverHero } from './discover-hero'
import { MediaSection } from './media-section'

const sections = [
  { title: 'Movies', mediaType: 'movie' as const, listType: 'popular' },
  { title: 'TV Shows', mediaType: 'show' as const, listType: 'popular' },
  { title: 'Games', mediaType: 'game' as const, listType: 'popular' },
  { title: 'Music', mediaType: 'music' as const, listType: 'popular' },
]

export function DiscoverFeed() {
  return (
    <div className="dk-discover-feed">
      <DiscoverHero />
      {sections.map((section) => (
        <MediaSection key={section.mediaType} {...section} />
      ))}
    </div>
  )
}
