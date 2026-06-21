// TODO: Review this file
import './profile-section-renderer.scss'
import { X } from 'lucide-react'
import { HallOfFameSection } from './profile-hall-of-fame-section'
import { LibraryBreakdownSection } from './profile-library-breakdown-section'
import { MoodTimelineSection } from './profile-mood-timeline-section'
import { StreakShowcaseSection } from './profile-streak-showcase-section'
import { ProfileAchievementsSection } from './profile-achievements-section'
import { ProfileRatingDistributionSection } from './profile-rating-distribution-section'

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
 rating_distribution: ProfileRatingDistributionSection,
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
 <div className="dk-user-section-renderer">
 {sections.map((sectionId) => {
 const Component = SECTION_COMPONENTS[sectionId]
 if (!Component) return null
 return (
 <div key={sectionId} className="dk-user-section-renderer__section">
 {isOwner && onRemoveSection && (
 <button
 onClick={() => onRemoveSection(sectionId)}
 className="dk-user-section-renderer__remove-btn"
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
