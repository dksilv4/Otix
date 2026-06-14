// TODO: Review this file
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { interactionKeys } from './interaction-keys'
import { mediaKeys } from '@/old-features/media/media-keys'
import type { MediaItemDetail, MediaItemSummary, MediaListResponse } from '@/old-features/media/media-queries'

export interface UserInteractionState {
  liked: boolean
  watchlisted: boolean
  watched: boolean
  played: boolean
  started: boolean
  listened: boolean
  owned: boolean
}

export interface InteractionCounts {
  likeCount: number
  watchlistCount: number
  watchedCount: number
  playedCount: number
  startedCount: number
  listenedCount: number
}

export interface InteractionOut {
  userId: string
  mediaItemId: string
  interactionType: string
  extraData: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface InteractionToggleResponse {
  interaction: InteractionOut
  counts: InteractionCounts
}

const VALID_TYPES = ['liked', 'watchlisted', 'watched', 'played', 'started', 'listened'] as const
export type InteractionType = (typeof VALID_TYPES)[number]

export function useUserInteractions(
  mediaId: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: interactionKeys.forMedia(mediaId),
    queryFn: async () => {
      const { data } = await apiClient.get<UserInteractionState>(
        `/media/${mediaId}/interactions`,
      )
      return data
    },
    staleTime: 1000 * 60 * 2,
    enabled: enabled && !!mediaId,
  })
}

const COUNT_KEY: Record<InteractionType, keyof InteractionCounts> = {
  liked: 'likeCount',
  watchlisted: 'watchlistCount',
  watched: 'watchedCount',
  played: 'playedCount',
  started: 'startedCount',
  listened: 'listenedCount',
}

export function useToggleInteraction(mediaType: string, mediaId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      type,
      active,
    }: {
      type: InteractionType
      active: boolean
    }) => {
      if (active) {
        const { data } = await apiClient.put<InteractionToggleResponse>(
          `/media/${mediaId}/interactions/${type}`,
          {},
        )
        return data
      }
      await apiClient.delete(`/media/${mediaId}/interactions/${type}`)
      return null
    },
    onMutate: async ({ type, active }) => {
      // Cancel in-flight queries so they don't overwrite our optimistic update
      const interactionKey = interactionKeys.forMedia(mediaId)
      const detailKey = mediaKeys.detail(mediaType, mediaId)
      await qc.cancelQueries({ queryKey: interactionKey })
      await qc.cancelQueries({ queryKey: detailKey })

      // Snapshot current states
      const prevInteraction = qc.getQueryData<UserInteractionState>(interactionKey)
      const prevDetail = qc.getQueryData<MediaItemDetail>(detailKey)

      // 1. Update standalone interaction cache
      if (prevInteraction) {
        qc.setQueryData<UserInteractionState>(interactionKey, {
          ...prevInteraction,
          [type]: active,
        })
      }

      // 2. Update userInteractions inside the media detail cache
      if (prevDetail) {
        const countKey = COUNT_KEY[type]
        qc.setQueryData<MediaItemDetail>(detailKey, {
          ...prevDetail,
          userInteractions: prevDetail.userInteractions
            ? { ...prevDetail.userInteractions, [type]: active }
            : {
                liked: false,
                watchlisted: false,
                watched: false,
                played: false,
                started: false,
                listened: false,
                owned: false,
                [type]: active,
              },
          [countKey]: (prevDetail[countKey] || 0) + (active ? 1 : -1),
        })
      }

      // 3. Update userInteractions in list caches
      const listKeys = qc
        .getQueryCache()
        .findAll({ queryKey: ['media', 'list'] })
        .map((q) => q.queryKey)
      for (const listKey of listKeys) {
        const prevList = qc.getQueryData<MediaListResponse>(listKey)
        if (!prevList?.items) continue
        const itemIdx = prevList.items.findIndex((i: MediaItemSummary) => i.id === mediaId)
        if (itemIdx === -1) continue
        const updatedItems = [...prevList.items]
        const prevItem = updatedItems[itemIdx]
        updatedItems[itemIdx] = {
          ...prevItem,
          userInteractions: prevItem.userInteractions
            ? { ...prevItem.userInteractions, [type]: active }
            : undefined,
        }
        qc.setQueryData<MediaListResponse>(listKey, {
          ...prevList,
          items: updatedItems,
        })
      }

      return { prevInteraction, prevDetail }
    },
    onError: (_err, _vars, context) => {
      if (context?.prevInteraction) {
        qc.setQueryData(
          interactionKeys.forMedia(mediaId),
          context.prevInteraction,
        )
      }
      if (context?.prevDetail) {
        qc.setQueryData(mediaKeys.detail(mediaType, mediaId), context.prevDetail)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: interactionKeys.forMedia(mediaId) })
      qc.invalidateQueries({ queryKey: mediaKeys.detail(mediaType, mediaId) })
      qc.invalidateQueries({ queryKey: ['media', 'list'] })
    },
  })
}
