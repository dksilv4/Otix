import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { reviewKeys } from './review-keys'

export interface ReviewOut {
  userId: string
  mediaItemId: string
  score: number | null
  title: string | null
  content: string | null
  isSpoiler: boolean
  isPrivate: boolean
  createdAt: string
  updatedAt: string
  cooldownUntil: string | null
}

export interface ReviewWithUserOut extends ReviewOut {
  user: { id: string; username: string; isAdmin?: boolean }
}

export interface ScoreOnlyOut {
  score: number
  avgRating: number | null
  ratingCount: number
}

export interface ReviewCreatePayload {
  score?: number | null
  title?: string | null
  content?: string | null
  isSpoiler?: boolean
  isPrivate?: boolean
}

export const reviewQueries = {
  myReview: (mediaId: string) =>
    queryOptions({
      queryKey: reviewKeys.myReview(mediaId),
      queryFn: async () => {
        const { data } = await apiClient.get<ReviewOut | null>(`/media/${mediaId}/review`)
        return data
      },
      staleTime: 1000 * 60,
    }),

  list: (mediaId: string, cursor?: string) =>
    queryOptions({
      queryKey: [...reviewKeys.list(mediaId), cursor],
      queryFn: async () => {
        const params: Record<string, string> = { limit: '20' }
        if (cursor) params.cursor = cursor
        const { data } = await apiClient.get<ReviewWithUserOut[]>(
          `/media/${mediaId}/reviews`,
          { params },
        )
        return data
      },
      staleTime: 1000 * 30,
    }),
}

export function useUpsertReview(mediaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: ReviewCreatePayload) => {
      const { data } = await apiClient.put<ReviewOut>(
        `/media/${mediaId}/review`,
        payload,
      )
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reviewKeys.myReview(mediaId) })
      qc.invalidateQueries({ queryKey: reviewKeys.list(mediaId) })
      qc.invalidateQueries({ queryKey: ['media', 'detail', mediaId] })
    },
  })
}

export function useDeleteReview(mediaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/media/${mediaId}/review`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reviewKeys.myReview(mediaId) })
      qc.invalidateQueries({ queryKey: reviewKeys.list(mediaId) })
      qc.invalidateQueries({ queryKey: ['media', 'detail', mediaId] })
    },
  })
}

export function useQuickRate(mediaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (score: number) => {
      const { data } = await apiClient.put<ScoreOnlyOut>(
        `/media/${mediaId}/rating`,
        { score },
      )
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reviewKeys.myReview(mediaId) })
      qc.invalidateQueries({ queryKey: ['media', 'detail', mediaId] })
    },
  })
}
