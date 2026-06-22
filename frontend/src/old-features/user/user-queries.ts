// TODO: Review this file
import { queryOptions } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import type { MediaItemSummary } from '@/features/media/media-queries'

export interface SteamPublicProfile {
  personaname: string | null
  avatarfull: string | null
  profileurl: string | null
  loccountrycode: string | null
  personastate: number | null
}

export interface PlexPublicProfile {
  username: string | null
  thumb: string | null
}

export interface FriendshipStatus {
  status: 'friends' | 'pending_sent' | 'pending_received' | 'none'
  requestId: string | null
}

export interface UserProfile {
  id: string
  username: string
  avatarUrl: string | null
  bio: string | null
  backgroundUrl: string | null
  createdAt: string
  reviewCount: number
  totalXp: number
  avgUserRating: number | null
  userRatingCount: number
  compositeScore: number | null
  profileSections: string[] | null
  steam?: SteamPublicProfile | null
  plex?: PlexPublicProfile | null
  tmdbUsername?: string | null
  friendshipStatus?: FriendshipStatus | null
  // Follow
  isFollowing?: boolean
  followerCount?: number
  followingCount?: number
  // Gamification
  level?: number
  levelTitle?: string
  xpRank?: number | null
  xpPercentile?: number | null
  // Proposals
  proposalCount?: number
  proposalApprovalRate?: number | null
  // Admin
  isAdmin?: boolean
  // Streaks
  currentLoginStreak?: number
  longestLoginStreak?: number
  currentReviewStreak?: number
  longestReviewStreak?: number
}

export interface BadgeDef {
  badgeKey: string
  label: string
  description: string
  icon: string
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'special'
  earned: boolean
  earnedAt: string | null
  currentValue: number
  targetValue: number
  claimed: boolean
  xpReward: number
}

export interface AchievementDef {
  badgeKey: string
  label: string
  description: string
  icon: string
  tier: string
  target: number
  xpReward: number
}

export interface FollowCounts {
  followers: number
  following: number
}

export interface FollowUser {
  id: string
  username: string
  avatarUrl: string | null
}

export interface UserStats {
  reviewCount: number
  interactionCount: number
  workoutCount: number
  listCount: number
  totalXp: number
}

export interface TopRatedItem {
  review: ReviewWithUser
  mediaItem: {
    id: string
    title: string
    mediaType: string
    posterUrl: string | null
    releaseYear: number | null
  }
}

export interface ActivityEvent {
  type: 'review' | 'interaction'
  timestamp: string
  summary: string
  score?: number | null
  content?: string | null
  interactionType?: string
  mediaItem?: {
    id: string
    title: string
    mediaType: string
    posterUrl: string | null
  }
}

export interface ReviewWithUser {
  userId: string
  mediaItemId: string
  score: number | null
  title: string | null
  content: string | null
  isSpoiler: boolean
  isPrivate: boolean
  createdAt: string
  updatedAt: string
  user: {
    id: string
    username: string
  }
}

export interface ReviewStats {
  totalReviews: number
  ratedCount: number
  averageRating: number | null
  distribution: { score: number; count: number }[]
}

export function computeReviewStats(reviews: { score: number | null }[]): ReviewStats {
  const scored = reviews.filter((r) => r.score != null)
  const distribution = Array.from({ length: 10 }, (_, i) => ({
    score: i + 1,
    count: 0,
  }))
  for (const r of scored) {
    distribution[(r.score! - 1)].count++
  }
  return {
    totalReviews: reviews.length,
    ratedCount: scored.length,
    averageRating: scored.length > 0
      ? scored.reduce((sum, r) => sum + r.score!, 0) / scored.length
      : null,
    distribution,
  }
}

export const userQueries = {
  search: (query: string, limit = 20) =>
    queryOptions({
      queryKey: ['user', 'search', query, limit],
      queryFn: async () => {
        const { data } = await apiClient.get<UserSearchListResponse>('/users/search', {
          params: { q: query, limit },
        })
        return data
      },
      enabled: query.length > 0,
      staleTime: 1000 * 60 * 5,
    }),

  profile: (username: string) =>
    queryOptions({
      queryKey: ['user', username],
      queryFn: async () => {
        const { data } = await apiClient.get<UserProfile>(`/users/${username}`)
        return data
      },
      staleTime: 1000 * 60 * 5,
    }),

  reviews: (username: string) =>
    queryOptions({
      queryKey: ['user', username, 'reviews'],
      queryFn: async () => {
        const { data } = await apiClient.get<ReviewWithUser[]>(`/users/${username}/reviews`)
        return data
      },
      staleTime: 1000 * 60 * 5,
    }),

  stats: (username: string) =>
    queryOptions({
      queryKey: ['user', username, 'stats'],
      queryFn: async () => {
        const { data } = await apiClient.get<UserStats>(`/users/${username}/stats`)
        return data
      },
      staleTime: 1000 * 60 * 5,
    }),

  topRated: (username: string) =>
    queryOptions({
      queryKey: ['user', username, 'top-rated'],
      queryFn: async () => {
        const { data } = await apiClient.get<TopRatedItem[]>(`/users/${username}/top-rated`)
        return data
      },
      staleTime: 1000 * 60 * 5,
    }),

  activity: (username: string) =>
    queryOptions({
      queryKey: ['user', username, 'activity'],
      queryFn: async () => {
        const { data } = await apiClient.get<ActivityEvent[]>(`/users/${username}/activity`)
        return data
      },
      staleTime: 1000 * 30,
    }),

  followCounts: (username: string) =>
    queryOptions({
      queryKey: ['user', username, 'follow-counts'],
      queryFn: async () => {
        const { data } = await apiClient.get<FollowCounts>(`/users/${username}/follow/counts`)
        return data
      },
      staleTime: 1000 * 60 * 2,
    }),

  hallOfFame: (username: string, mediaType?: string) =>
    queryOptions({
      queryKey: ['user', username, 'hall-of-fame', mediaType ?? 'all'],
      queryFn: async () => {
        const params: Record<string, string> = {}
        if (mediaType) params.media_type = mediaType
        const { data } = await apiClient.get<HallOfFameItem[]>(`/users/${username}/hall-of-fame`, { params })
        return data
      },
      staleTime: 1000 * 60 * 5,
    }),

  libraryStats: (username: string) =>
    queryOptions({
      queryKey: ['user', username, 'library-stats'],
      queryFn: async () => {
        const { data } = await apiClient.get<LibraryStats>(`/users/${username}/library-stats`)
        return data
      },
      staleTime: 1000 * 60 * 5,
    }),

  continueWatching: () =>
    queryOptions({
      queryKey: ['user', 'me', 'continue'],
      queryFn: async () => {
        const { data } = await apiClient.get<ContinueItem[]>('/users/me/continue')
        return data
      },
      staleTime: 1000 * 60,
    }),

  friendsActivity: () =>
    queryOptions({
      queryKey: ['user', 'me', 'friends', 'activity'],
      queryFn: async () => {
        const { data } = await apiClient.get<FriendActivityEvent[]>('/users/me/friends/activity')
        return data
      },
      staleTime: 1000 * 30,
    }),

  moodTimeline: (username: string) =>
    queryOptions({
      queryKey: ['user', username, 'mood-timeline'],
      queryFn: async () => {
        const { data } = await apiClient.get<{ checkins: MoodCheckin[] }>(`/users/${username}/mood-timeline`)
        return data.checkins
      },
      staleTime: 1000 * 60 * 5,
    }),

  activityHeatmap: (weeks = 12) =>
    queryOptions({
      queryKey: ['user', 'me', 'activity-heatmap', weeks],
      queryFn: async () => {
        const { data } = await apiClient.get<ActivityHeatmapResponse>('/users/me/activity-heatmap', {
          params: { weeks },
        })
        return data
      },
      staleTime: 1000 * 60 * 5,
    }),

  badges: (username: string) =>
    queryOptions({
      queryKey: ['user', username, 'badges'],
      queryFn: async () => {
        const { data } = await apiClient.get<BadgeDef[]>(`/users/${username}/badges`)
        return data
      },
      staleTime: 1000 * 60 * 5,
    }),

  achievementDefs: () =>
    queryOptions({
      queryKey: ['achievements', 'definitions'],
      queryFn: async () => {
        const { data } = await apiClient.get<AchievementDef[]>('/users/achievements')
        return data
      },
      staleTime: 1000 * 60 * 30,
    }),

  dailyActivity: (day: string) =>
    queryOptions({
      queryKey: ['user', 'me', 'daily-activity', day],
      queryFn: async () => {
        const { data } = await apiClient.get<DailyActivityResponse>('/users/me/daily-activity', {
          params: { day },
        })
        return data
      },
      staleTime: 1000 * 60 * 2,
    }),

  ratingDistribution: (username: string) =>
    queryOptions({
      queryKey: ['user', username, 'rating-distribution'],
      queryFn: async () => {
        const { data } = await apiClient.get<RatingDistribution>(`/users/${username}/rating-distribution`)
        return data
      },
      staleTime: 1000 * 60 * 5,
    }),
}

export interface MoodCheckin {
  date: string
  mood: string
  feeling: string | null
  note: string | null
}

export interface UserSearchResult {
  id: string
  username: string
  avatarUrl: string | null
  bio: string | null
  level: number
  levelTitle: string
  isAdmin: boolean
}

export interface UserSearchListResponse {
  items: UserSearchResult[]
  hasMore: boolean
  total: number | null
}

export interface LibraryStats {
  totalItems: number
  byMediaType: Record<string, number>
  totalWatchTimeMinutes: number
  completionRate: number
  mostActiveDay: string | null
  mostActiveHour: number | null
}

export interface ActivityHeatmapEntry {
  date: string
  workout: number
  movie: number
  show: number
  music: number
}

export interface ActivityHeatmapResponse {
  weeks: number
  dates: ActivityHeatmapEntry[]
}

export interface ContinueItem extends MediaItemSummary {
  interactionType: string
  interactedAt: string
  episodeContext: string | null
}

export interface FriendActivityEvent {
  type: 'review' | 'interaction' | 'episode_watched'
  timestamp: string
  summary: string
  score?: number | null
  content?: string | null
  interactionType?: string
  mediaItem?: {
    id: string
    title: string
    mediaType: string
    posterUrl: string | null
  }
  user: {
    id: string
    username: string
    avatarUrl: string | null
  }
}

export interface HallOfFameItem {
  id: string
  title: string
  mediaType: string
  posterUrl: string | null
  releaseYear: number | null
}

export interface RatingDistributionItem {
  score: number
  movie: number
  show: number
  game: number
  music: number
}

export interface RatingDistribution {
  distribution: RatingDistributionItem[]
  totalRatings: number
}

export interface DailyReviewItem {
  id: string
  media_item_id: string
  media_title: string
  media_type: string
  poster_url: string | null
  score: number | null
  content_preview: string | null
  created_at: string
}

export interface DailyInteractionItem {
  id: string
  media_item_id: string
  media_title: string
  media_type: string
  poster_url: string | null
  interaction_type: string
  created_at: string
}

export interface DailyEpisodeItem {
  id: string
  show_id: string
  show_title: string
  poster_url: string | null
  season_number: number
  episode_number: number
  created_at: string
}

export interface DailyWorkoutItem {
  id: string
  started_at: string
  completed_at: string | null
  exercise_count: number
}

export interface DailyMoodItem {
  mood: string
  feeling: string | null
  note: string | null
}

export interface DailyActivityResponse {
  date: string
  reviews: DailyReviewItem[]
  interactions: DailyInteractionItem[]
  episodes: DailyEpisodeItem[]
  workouts: DailyWorkoutItem[]
  mood: DailyMoodItem | null
}

import { useMutation, useQueryClient } from '@tanstack/react-query'

export function useFollowUser(username: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await apiClient.post(`/users/${username}/follow`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', username] })
      queryClient.invalidateQueries({ queryKey: ['user', username, 'follow-counts'] })
    },
  })
}

export function useUnfollowUser(username: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/users/${username}/follow`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', username] })
      queryClient.invalidateQueries({ queryKey: ['user', username, 'follow-counts'] })
    },
  })
}

export function useUpdateHallOfFame(username: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ mediaType, mediaIds, current }: { mediaType: string; mediaIds: string[]; current: Record<string, string[]> }) => {
      const updated = { ...current, [mediaType]: mediaIds }
      await apiClient.patch('/auth/me', { hall_of_fame_media_ids: updated })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', username, 'hall-of-fame'] })
    },
  })
}

export function useClaimBadge(username: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (badgeKey: string) => {
      await apiClient.post(`/users/me/badges/${badgeKey}/claim`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', username, 'badges'] })
      queryClient.invalidateQueries({ queryKey: ['user', username] })
    },
  })
}

