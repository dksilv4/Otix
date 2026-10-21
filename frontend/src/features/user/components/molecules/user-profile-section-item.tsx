import type { SectionVisibility } from '../../types'
import { useProfileSectionVisibility } from '../../hooks/use-profile-section-visibility'
import { UserProfileTop5 } from '../organisms/user-profile-top5'
import { UserProfileActivityHeatmap } from '../organisms/user-profile-activity-heatmap'
import { UserProfileHardwareRig } from '../organisms/user-profile-hardware-rig'
import { UserProfileGameSessions } from '../organisms/user-profile-game-sessions'
import { UserProfileReviews } from '../organisms/user-profile-reviews'
import { UserProfileTopRated } from '../organisms/user-profile-top-rated'
import { UserProfileStats } from '../organisms/user-profile-stats'
import { UserProfileBadges } from '../organisms/user-profile-badges'
import { UserProfileActivity } from '../organisms/user-profile-activity'
import { UserProfileLibraryBreakdown } from '../organisms/user-profile-library-breakdown'
import { UserProfileRatingDistribution } from '../organisms/user-profile-rating-distribution'

interface UserProfileSectionItemProps {
  sectionId: string
  username: string
  isOwner?: boolean
  visibilityMap?: Record<string, SectionVisibility> | null
}

export const UserProfileSectionItem = ({
  sectionId,
  username,
  isOwner = false,
  visibilityMap,
}: UserProfileSectionItemProps) => {
  const { visibility, setVisibility, toggleVisibility, isUpdating } = useProfileSectionVisibility({
    sectionId,
    username,
    currentVisibilityMap: visibilityMap,
  })

  switch (sectionId) {
    case 'top_5':
      return (
        <UserProfileTop5
          username={username}
          isOwner={isOwner}
          visibility={visibility}
          onToggleVisibility={toggleVisibility}
          onChangeVisibility={setVisibility}
          isUpdatingVisibility={isUpdating}
        />
      )
    case 'activity_heatmap':
      return (
        <UserProfileActivityHeatmap
          username={username}
          isOwner={isOwner}
          visibility={visibility}
          onToggleVisibility={toggleVisibility}
          onChangeVisibility={setVisibility}
          isUpdatingVisibility={isUpdating}
        />
      )
    case 'hardware_rig':
      return (
        <UserProfileHardwareRig
          username={username}
          isOwner={isOwner}
          visibility={visibility}
          onToggleVisibility={toggleVisibility}
          onChangeVisibility={setVisibility}
          isUpdatingVisibility={isUpdating}
        />
      )
    case 'game_sessions':
      return (
        <UserProfileGameSessions
          username={username}
          isOwner={isOwner}
          visibility={visibility}
          onToggleVisibility={toggleVisibility}
          onChangeVisibility={setVisibility}
          isUpdatingVisibility={isUpdating}
        />
      )
    case 'reviews':
      return (
        <UserProfileReviews
          username={username}
          isOwner={isOwner}
          visibility={visibility}
          onToggleVisibility={toggleVisibility}
          onChangeVisibility={setVisibility}
          isUpdatingVisibility={isUpdating}
        />
      )
    case 'top_rated':
      return (
        <UserProfileTopRated
          username={username}
          isOwner={isOwner}
          visibility={visibility}
          onToggleVisibility={toggleVisibility}
          onChangeVisibility={setVisibility}
          isUpdatingVisibility={isUpdating}
        />
      )
    case 'stats':
      return (
        <UserProfileStats
          username={username}
          isOwner={isOwner}
          visibility={visibility}
          onToggleVisibility={toggleVisibility}
          onChangeVisibility={setVisibility}
          isUpdatingVisibility={isUpdating}
        />
      )
    case 'achievements':
      return (
        <UserProfileBadges
          username={username}
          isOwner={isOwner}
          visibility={visibility}
          onToggleVisibility={toggleVisibility}
          onChangeVisibility={setVisibility}
          isUpdatingVisibility={isUpdating}
        />
      )
    case 'recent_activity':
      return (
        <UserProfileActivity
          username={username}
          isOwner={isOwner}
          visibility={visibility}
          onToggleVisibility={toggleVisibility}
          onChangeVisibility={setVisibility}
          isUpdatingVisibility={isUpdating}
        />
      )
    case 'library_breakdown':
      return (
        <UserProfileLibraryBreakdown
          username={username}
          isOwner={isOwner}
          visibility={visibility}
          onToggleVisibility={toggleVisibility}
          onChangeVisibility={setVisibility}
          isUpdatingVisibility={isUpdating}
        />
      )
    case 'rating_distribution':
      return (
        <UserProfileRatingDistribution
          username={username}
          isOwner={isOwner}
          visibility={visibility}
          onToggleVisibility={toggleVisibility}
          onChangeVisibility={setVisibility}
          isUpdatingVisibility={isUpdating}
        />
      )
    default:
      return null
  }
}
