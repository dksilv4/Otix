import { ReviewsSection } from './profile-reviews-section'
import { StatsSection } from './profile-stats-section'
import { TopRatedSection } from './profile-top-rated-section'
import { ActivitySection } from './profile-activity-section'

interface ProfileSectionRendererProps {
  username: string
  sections: string[]
}

const SECTION_COMPONENTS: Record<string, React.FC<{ username: string }>> = {
  reviews: ReviewsSection,
  stats: StatsSection,
  top_rated: TopRatedSection,
  recent_activity: ActivitySection,
}

export function ProfileSectionRenderer({ username, sections }: ProfileSectionRendererProps) {
  return (
    <div className="space-y-10">
      {sections.map((sectionId) => {
        const Component = SECTION_COMPONENTS[sectionId]
        if (!Component) return null
        return <Component key={sectionId} username={username} />
      })}
    </div>
  )
}
