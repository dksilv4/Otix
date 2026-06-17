// TODO: Review this file
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { mediaKeys } from '@media/queries/media-keys'

function emit(event: string, payload: unknown) {
  try { (window as any).desktopAPI?.plugin?.emitEvent(event, payload) } catch {}
}

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

export function useUpsertRating(mediaId: string, mediaType: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (score: number) => {
      const { data } = await apiClient.put<MediaRatingAggregateOut>(
        `/media/${mediaType}/${mediaId}/rating`,
        { score },
      )
      return data
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ratingKeys.myRating(mediaType, mediaId) })
      qc.invalidateQueries({ queryKey: mediaKeys.detail(mediaType, mediaId) })
      emit('otix:interaction:rated', { mediaId, mediaType, rating: variables })
    },
  })
}

export function useDeleteRating(mediaId: string, mediaType: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/media/${mediaType}/${mediaId}/rating`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ratingKeys.myRating(mediaType, mediaId) })
      qc.invalidateQueries({ queryKey: mediaKeys.detail(mediaType, mediaId) })
      emit('otix:interaction:rated', { mediaId, mediaType, rating: 0 })
    },
  })
}
