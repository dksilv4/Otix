import { X } from 'lucide-react'
import { HallOfFameSection } from './profile-hall-of-fame-section'
import { LibraryBreakdownSection } from './profile-library-breakdown-section'
import { MoodTimelineSection } from './profile-mood-timeline-section'
import { StreakShowcaseSection } from './profile-streak-showcase-section'
import { ProfileAchievementsSection } from './profile-achievements-section'

interface ProfileSectionRendererProps {
  username: string
  sections: string[]
  isOwner: boolean
  onRemoveSection?: (sectionId: string) => void
  loginStreak: number
  longestLoginStreak: number
  reviewStreak: number
  longestReviewStreak: number
}

const SECTION_COMPONENTS: Record<string, React.FC<{ username: string }>> = {
  hof_movie: (props) => <HallOfFameSection {...props} mediaType="movie" />,
  hof_show: (props) => <HallOfFameSection {...props} mediaType="show" />,
  hof_game: (props) => <HallOfFameSection {...props} mediaType="game" />,
  hof_music: (props) => <HallOfFameSection {...props} mediaType="music" />,
  library_breakdown: LibraryBreakdownSection,
  mood_timeline: MoodTimelineSection,
  achievements: ProfileAchievementsSection,
}

export function ProfileSectionRenderer({
  username,
  sections,
  isOwner,
  onRemoveSection,
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
        return (
          <div key={sectionId} className="relative group/section">
            {isOwner && onRemoveSection && (
              <button
                onClick={() => onRemoveSection(sectionId)}
                className="absolute -top-2 -right-2 z-10 p-1 rounded-full bg-[var(--dk-surface-overlay)] border border-white/[0.06] text-muted-foreground/40 hover:text-destructive hover:border-destructive/30 opacity-0 group-hover/section:opacity-100 transition-all"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <Component username={username} />
          </div>
        )
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
