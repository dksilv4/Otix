// TODO: Review this file
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export interface UserRatingOut {
  raterId: string
  ratedUserId: string
  score: number
  createdAt: string
  updatedAt: string
}

export interface UserReputationOut {
  avgUserRating: number | null
  userRatingCount: number
  compositeScore: number | null
  components: {
    contribution: number
    trust: number
    tenure: number
  }
}

export const userRatingKeys = {
  myRating: (username: string) => ['user-rating', 'my', username] as const,
  reputation: (username: string) => ['user', username, 'reputation'] as const,
}

export const userRatingQueries = {
  myRating: (username: string) =>
    queryOptions({
      queryKey: userRatingKeys.myRating(username),
      queryFn: async () => {
        const { data } = await apiClient.get<UserRatingOut | null>(`/users/${username}/rating`)
        return data
      },
      staleTime: 1000 * 60,
    }),

  reputation: (username: string) =>
    queryOptions({
      queryKey: userRatingKeys.reputation(username),
      queryFn: async () => {
        const { data } = await apiClient.get<UserReputationOut>(`/users/${username}/reputation`)
        return data
      },
      staleTime: 1000 * 60 * 5,
    }),
}

export function useRateUser(username: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (score: number) => {
      const { data } = await apiClient.put<UserRatingOut>(`/users/${username}/rating`, { score })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userRatingKeys.myRating(username) })
      qc.invalidateQueries({ queryKey: ['user', username] })
      qc.invalidateQueries({ queryKey: userRatingKeys.reputation(username) })
    },
  })
}

export function useDeleteUserRating(username: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/users/${username}/rating`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userRatingKeys.myRating(username) })
      qc.invalidateQueries({ queryKey: ['user', username] })
      qc.invalidateQueries({ queryKey: userRatingKeys.reputation(username) })
    },
  })
}
