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
