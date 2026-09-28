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

export interface MediaRatingWithUserOut {
  userId: string
  mediaItemId: string
  score: number
  createdAt: string
  updatedAt: string
  user: { id: string; username: string; isAdmin?: boolean }
  hasReview: boolean
}

export const ratingKeys = {
  myRating: (mediaType: string, mediaId: string | number) => ['media-rating', 'my', mediaType, String(mediaId)] as const,
  list: (mediaType: string, mediaId: string | number) => ['media-rating', 'list', mediaType, String(mediaId)] as const,
}

export const ratingQueries = {
  myRating: (mediaType: string, mediaId: string | number) =>
    queryOptions({
      queryKey: ratingKeys.myRating(mediaType, mediaId),
      queryFn: async () => {
        const idStr = String(mediaId)
        const { data } = await apiClient.get<MediaRatingOut | null>(`/media/${mediaType}/${idStr}/rating`)
        return data
      },
      staleTime: 1000 * 60,
    }),

  list: (mediaType: string, mediaId: string | number) =>
    queryOptions({
      queryKey: ratingKeys.list(mediaType, mediaId),
      queryFn: async () => {
        const idStr = String(mediaId)
        const { data } = await apiClient.get<MediaRatingWithUserOut[]>(
          `/media/${mediaType}/${idStr}/ratings`,
        )
        return Array.isArray(data) ? data : []
      },
      staleTime: 1000 * 30,
    }),
}

export function useUpsertRating(mediaType: string, mediaId: string | number) {
  const qc = useQueryClient()
  const idStr = String(mediaId)
  return useMutation({
    mutationFn: async (score: number) => {
      const { data } = await apiClient.put<MediaRatingAggregateOut>(
        `/media/${mediaType}/${idStr}/rating`,
        { score },
      )
      return data
    },
    onMutate: async (score) => {
      const ratingKey = ratingKeys.myRating(mediaType, idStr)
      await qc.cancelQueries({ queryKey: ratingKey })
      const prevRating = qc.getQueryData<MediaRatingOut | null>(ratingKey)
      const optimistic: MediaRatingOut = {
        userId: '',
        mediaItemId: idStr,
        score,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      qc.setQueryData<MediaRatingOut | null>(ratingKey, optimistic)
      return { prevRating }
    },
    onError: (_err, _vars, context) => {
      if (context?.prevRating !== undefined) {
        qc.setQueryData(ratingKeys.myRating(mediaType, idStr), context.prevRating)
      }
    },
    onSuccess: (_data, variables) => {
      emitOtixEvent('otix:interaction:rated', { mediaId: idStr, mediaType, rating: variables })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ratingKeys.myRating(mediaType, idStr) })
      qc.invalidateQueries({ queryKey: ratingKeys.list(mediaType, idStr) })
      qc.invalidateQueries({ queryKey: mediaKeys.detail(mediaType, idStr) })
    },
  })
}

export function useDeleteRating(mediaType: string, mediaId: string | number) {
  const qc = useQueryClient()
  const idStr = String(mediaId)
  return useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/media/${mediaType}/${idStr}/rating`)
    },
    onMutate: async () => {
      const ratingKey = ratingKeys.myRating(mediaType, idStr)
      await qc.cancelQueries({ queryKey: ratingKey })
      const prevRating = qc.getQueryData<MediaRatingOut | null>(ratingKey)
      qc.setQueryData<MediaRatingOut | null>(ratingKey, null)
      return { prevReview: prevRating }
    },
    onError: (_err, _vars, context) => {
      if (context?.prevReview !== undefined) {
        qc.setQueryData(ratingKeys.myRating(mediaType, idStr), context.prevReview)
      }
    },
    onSuccess: () => {
      emitOtixEvent('otix:interaction:rated', { mediaId: idStr, mediaType, rating: 0 })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ratingKeys.myRating(mediaType, idStr) })
      qc.invalidateQueries({ queryKey: ratingKeys.list(mediaType, idStr) })
      qc.invalidateQueries({ queryKey: mediaKeys.detail(mediaType, idStr) })
    },
  })
}
