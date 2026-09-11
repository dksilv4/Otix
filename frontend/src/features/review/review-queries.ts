// TODO: Review this file
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { emitOtixEvent } from '@/lib/plugin-events'
import { mediaKeys } from '@media/queries/media-keys'

export const reviewKeys = {
  all: () => ['reviews'] as const,
  myReview: (mediaType: string, mediaId: string) => [...reviewKeys.all(), 'my', mediaType, mediaId] as const,
  list: (mediaType: string, mediaId: string) => [...reviewKeys.all(), 'list', mediaType, mediaId] as const,
}
import type { MediaRatingOut } from './rating-queries'

export interface ReviewOut {
  userId: string
  mediaItemId: string
  title: string | null
  content: string | null
  isSpoiler: boolean
  isPrivate: boolean
  cooldownUntil: string | null
  createdAt: string
  updatedAt: string
}

export interface ReviewWithUserOut {
  userId: string
  mediaItemId: string
  title: string | null
  content: string | null
  isSpoiler: boolean
  isPrivate: boolean
  createdAt: string
  updatedAt: string
  cooldownUntil: string | null
  user: { id: string; username: string; isAdmin?: boolean }
  rating: MediaRatingOut | null
}

export interface ReviewCreatePayload {
  title?: string | null
  content?: string | null
  isSpoiler?: boolean
  isPrivate?: boolean
}

export const reviewQueries = {
  myReview: (mediaType: string, mediaId: string) =>
    queryOptions({
      queryKey: reviewKeys.myReview(mediaType, mediaId),
      queryFn: async () => {
        const { data } = await apiClient.get<ReviewOut | null>(`/media/${mediaType}/${mediaId}/review`)
        return data
      },
      staleTime: 1000 * 60,
    }),

  list: (mediaType: string, mediaId: string, cursor?: string) =>
    queryOptions({
      queryKey: [...reviewKeys.list(mediaType, mediaId), cursor],
      queryFn: async () => {
        const params: Record<string, string> = { limit: '20' }
        if (cursor) params.cursor = cursor
        const { data } = await apiClient.get<any>(
          `/media/${mediaType}/${mediaId}/reviews`,
          { params },
        )
        if (Array.isArray(data)) return data as ReviewWithUserOut[]
        if (Array.isArray(data?.results)) return data.results as ReviewWithUserOut[]
        if (Array.isArray(data?.items)) return data.items as ReviewWithUserOut[]
        return [] as ReviewWithUserOut[]
      },
      staleTime: 1000 * 30,
    }),
}

export function useUpsertReview(mediaType: string, mediaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: ReviewCreatePayload) => {
      const { data } = await apiClient.put<ReviewOut>(
        `/media/${mediaType}/${mediaId}/review`,
        payload,
      )
      return data
    },
    onMutate: async (payload) => {
      const myReviewKey = reviewKeys.myReview(mediaType, mediaId)
      await qc.cancelQueries({ queryKey: myReviewKey })
      const prevReview = qc.getQueryData<ReviewOut | null>(myReviewKey)
      const optimistic: ReviewOut = {
        userId: '',
        mediaItemId: mediaId,
        title: payload.title ?? null,
        content: payload.content ?? null,
        isSpoiler: payload.isSpoiler ?? false,
        isPrivate: payload.isPrivate ?? false,
        cooldownUntil: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      qc.setQueryData<ReviewOut | null>(myReviewKey, optimistic)
      return { prevReview }
    },
    onError: (_err, _vars, context) => {
      if (context?.prevReview !== undefined) {
        qc.setQueryData(reviewKeys.myReview(mediaType, mediaId), context.prevReview)
      }
    },
    onSuccess: (_data, payload, context) => {
      emitOtixEvent(context?.prevReview ? 'otix:review:updated' : 'otix:review:created', {
        mediaId,
        mediaType,
        review: {
          title: payload.title ?? null,
          content: payload.content ?? null,
          isSpoiler: payload.isSpoiler ?? false,
          isPrivate: payload.isPrivate ?? false,
        },
      })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: reviewKeys.myReview(mediaType, mediaId) })
      qc.invalidateQueries({ queryKey: reviewKeys.list(mediaType, mediaId) })
      qc.invalidateQueries({ queryKey: mediaKeys.detail(mediaType, mediaId) })
    },
  })
}

export function useDeleteReview(mediaType: string, mediaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/media/${mediaType}/${mediaId}/review`)
    },
    onMutate: async () => {
      const myReviewKey = reviewKeys.myReview(mediaType, mediaId)
      await qc.cancelQueries({ queryKey: myReviewKey })
      const prevReview = qc.getQueryData<ReviewOut | null>(myReviewKey)
      qc.setQueryData<ReviewOut | null>(myReviewKey, null)
      return { prevReview }
    },
    onError: (_err, _vars, context) => {
      if (context?.prevReview !== undefined) {
        qc.setQueryData(reviewKeys.myReview(mediaType, mediaId), context.prevReview)
      }
    },
    onSuccess: () => {
      emitOtixEvent('otix:review:deleted', { mediaId, mediaType })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: reviewKeys.myReview(mediaType, mediaId) })
      qc.invalidateQueries({ queryKey: reviewKeys.list(mediaType, mediaId) })
      qc.invalidateQueries({ queryKey: mediaKeys.detail(mediaType, mediaId) })
    },
  })
}
