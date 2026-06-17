// TODO: Review this file
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'

export interface MediaRatingOut {
  userId: string
  mediaItemId: string
  score: number
  createdAt: string
  updatedAt: string
}

export interface MediaRatingAggregateOut {
  score: number
  avgRating: number | null
  ratingCount: number
}

export const ratingKeys = {
  myRating: (mediaId: string) => ['media-rating', 'my', mediaId] as const,
  list: (mediaId: string) => ['media-rating', 'list', mediaId] as const,
}

export const ratingQueries = {
  myRating: (mediaType: string, mediaId: string) =>
    queryOptions({
      queryKey: ratingKeys.myRating(mediaId),
      queryFn: async () => {
        const { data } = await apiClient.get<MediaRatingOut | null>(`/media/${mediaType}/${mediaId}/rating`)
        return data
      },
      staleTime: 1000 * 60,
    }),
}

export function useUpsertRating(mediaType: string, mediaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (score: number) => {
      const { data } = await apiClient.put<MediaRatingAggregateOut>(
        `/media/${mediaType}/${mediaId}/rating`,
        { score },
      )
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ratingKeys.myRating(mediaId) })
      qc.invalidateQueries({ queryKey: ['media', 'detail', mediaId] })
    },
  })
}

export function useDeleteRating(mediaType: string, mediaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/media/${mediaType}/${mediaId}/rating`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ratingKeys.myRating(mediaId) })
      qc.invalidateQueries({ queryKey: ['media', 'detail', mediaId] })
    },
  })
}
