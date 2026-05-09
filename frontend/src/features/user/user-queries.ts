import { queryOptions } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export interface UserProfile {
  id: string
  username: string
  avatarUrl: string | null
  bio: string | null
  backgroundUrl: string | null
  createdAt: string
  reviewCount: number
}

export interface ReviewWithUser {
  userId: string
  mediaItemId: string
  score: number | null
  title: string | null
  content: string | null
  isSpoiler: boolean
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
}
