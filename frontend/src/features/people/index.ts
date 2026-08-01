// ── People feature barrel ─────────────────────────

export { createPeopleRoutes } from './router'
export { PeopleDetailPage } from './pages/people-detail-page'
export { PeopleCard } from './components/molecules/people-card'
export { PeopleTimeline } from './components/organisms/people-timeline'
export { PeopleTimelineFilters } from './components/organisms/people-timeline-filters'

export { peopleQueries, peopleKeys, useFollowPerson, useUnfollowPerson, useRatePerson, useUnratePerson } from './queries/people-queries'

export type {
  PersonDetail,
  PersonSummary,
  PersonCredit,
  PersonListResponse,
  RelatedArtist,
  EpisodeInfo,
  SeasonInfo,
  PeopleCardProps,
} from './types'

export { formatDate, getCreditsStats, groupCredits, expandCredits, formatRole, formatCountdown, formatDateRange, isUpcoming } from './utils'
export type { GroupedCredit, TimelineGroup } from './utils'
