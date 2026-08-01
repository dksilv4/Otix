// TODO: Review this file
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { emitOtixEvent } from '@/lib/plugin-events'
import { mediaKeys } from '@media/queries/media-keys'

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
  myRating: (mediaType: string, mediaId: string) => ['media-rating', 'my', mediaType, mediaId] as const,
  list: (mediaType: string, mediaId: string) => ['media-rating', 'list', mediaType, mediaId] as const,
}

export const ratingQueries = {
  myRating: (mediaType: string, mediaId: string) =>
    queryOptions({
      queryKey: ratingKeys.myRating(mediaType, mediaId),
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
    onMutate: async (score) => {
      const ratingKey = ratingKeys.myRating(mediaType, mediaId)
      await qc.cancelQueries({ queryKey: ratingKey })
      const prevRating = qc.getQueryData<MediaRatingOut | null>(ratingKey)
      const optimistic: MediaRatingOut = {
        userId: '',
        mediaItemId: mediaId,
        score,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      qc.setQueryData<MediaRatingOut | null>(ratingKey, optimistic)
      return { prevRating }
    },
    onError: (_err, _vars, context) => {
      if (context?.prevRating !== undefined) {
        qc.setQueryData(ratingKeys.myRating(mediaType, mediaId), context.prevRating)
      }
    },
    onSuccess: (_data, variables) => {
      emitOtixEvent('otix:interaction:rated', { mediaId, mediaType, rating: variables })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ratingKeys.myRating(mediaType, mediaId) })
      qc.invalidateQueries({ queryKey: mediaKeys.detail(mediaType, mediaId) })
    },
  })
}

export function useDeleteRating(mediaType: string, mediaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/media/${mediaType}/${mediaId}/rating`)
    },
    onMutate: async () => {
      const ratingKey = ratingKeys.myRating(mediaType, mediaId)
      await qc.cancelQueries({ queryKey: ratingKey })
      const prevRating = qc.getQueryData<MediaRatingOut | null>(ratingKey)
      qc.setQueryData<MediaRatingOut | null>(ratingKey, null)
      return { prevRating }
    },
    onError: (_err, _vars, context) => {
      if (context?.prevRating !== undefined) {
        qc.setQueryData(ratingKeys.myRating(mediaType, mediaId), context.prevRating)
      }
    },
    onSuccess: () => {
      emitOtixEvent('otix:interaction:rated', { mediaId, mediaType, rating: 0 })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ratingKeys.myRating(mediaType, mediaId) })
      qc.invalidateQueries({ queryKey: mediaKeys.detail(mediaType, mediaId) })
    },
  })
}
