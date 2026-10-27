export { LevelUpModal } from './components/molecules/level-up-modal'
export { LevelUpHost } from './components/organisms/level-up-host'
export { UserXpProgressionBar } from './components/molecules/user-xp-progression-bar'
export { XPProgressRing } from './components/atoms/user-xp-progress-ring'
export { AddSectionButton } from './components/molecules/user-add-section-button'
export { SectionPrivacyToggle } from './components/molecules/section-privacy-toggle'
export { SectionHeader } from './components/molecules/section-header'
export { EditTop5Modal } from './components/molecules/edit-top5-modal'
export { UserProfileSectionItem } from './components/molecules/user-profile-section-item'
export { UserProfileSkeleton } from './components/organisms/user-profile-skeleton'
export { UserProfileTop5 } from './components/organisms/user-profile-top5'
export { UserProfileActivityHeatmap } from './components/organisms/user-profile-activity-heatmap'
export { UserProfileHardwareRig } from './components/organisms/user-profile-hardware-rig'
export { UserProfileGameSessions } from './components/organisms/user-profile-game-sessions'
export { UserProfileReviews } from './components/organisms/user-profile-reviews'
export { UserProfileTopRated } from './components/organisms/user-profile-top-rated'
export { UserProfileStats } from './components/organisms/user-profile-stats'
export { UserProfileBadges } from './components/organisms/user-profile-badges'
export { UserProfileActivity } from './components/organisms/user-profile-activity'
export { UserProfileLibraryBreakdown } from './components/organisms/user-profile-library-breakdown'
export { UserProfileRatingDistribution } from './components/organisms/user-profile-rating-distribution'

export { useProfileSectionVisibility } from './hooks/use-profile-section-visibility'
export { useProfileSections } from './hooks/use-profile-sections'
export {
  ALL_PROFILE_SECTIONS,
  DEFAULT_SECTION_IDS,
  getSectionDefinition,
  resolveSectionVisibility,
  PRIVACY_OPTIONS,
  getNextSectionVisibility,
} from './utils/profile-sections'
export { computeGamification, getLevelTier, getLevelTitle, pickGradient, formatMemberSince } from './utils'
export type {
  UserGamification,
  SectionVisibility,
  SectionVisibilityMap,
  ProfileSectionMeta,
  Top5Item,
  UserHardwareSpecs,
} from './types'
export type { LevelTier } from './constants'
