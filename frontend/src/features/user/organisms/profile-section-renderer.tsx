import { HallOfFameSection } from './profile-hall-of-fame-section'
import { LibraryBreakdownSection } from './profile-library-breakdown-section'
import { MoodTimelineSection } from './profile-mood-timeline-section'
import { StreakShowcaseSection } from './profile-streak-showcase-section'

interface ProfileSectionRendererProps {
  username: string
  sections: string[]
  loginStreak: number
  longestLoginStreak: number
  reviewStreak: number
  longestReviewStreak: number
}

const SECTION_COMPONENTS: Record<string, React.FC<{ username: string }>> = {
  hall_of_fame: HallOfFameSection,
  library_breakdown: LibraryBreakdownSection,
  mood_timeline: MoodTimelineSection,
}

export function ProfileSectionRenderer({
  username,
  sections,
  loginStreak,
  longestLoginStreak,
  reviewStreak,
  longestReviewStreak,
}: ProfileSectionRendererProps) {
  return (
    <div className="space-y-10">
      {sections.map((sectionId) => {
        const Component = SECTION_COMPONENTS[sectionId]
        if (!Component) return null
        return <Component key={sectionId} username={username} />
      })}

      {/* Streak Showcase always renders at the bottom (not configurable) */}
      <StreakShowcaseSection
        loginStreak={loginStreak}
        longestLoginStreak={longestLoginStreak}
        reviewStreak={reviewStreak}
        longestReviewStreak={longestReviewStreak}
      />
    </div>
  )
}
