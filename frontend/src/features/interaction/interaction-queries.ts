import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { interactionKeys } from './interaction-keys'

export interface UserInteractionState {
  liked: boolean
  watchlisted: boolean
  watched: boolean
  played: boolean
  started: boolean
}

export interface InteractionCounts {
  likeCount: number
  watchlistCount: number
  watchedCount: number
  playedCount: number
  startedCount: number
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

const VALID_TYPES = ['liked', 'watchlisted', 'watched', 'played', 'started'] as const
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

export function useToggleInteraction(mediaId: string) {
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
      await qc.cancelQueries({ queryKey: interactionKeys.forMedia(mediaId) })

      const previous = qc.getQueryData<UserInteractionState>(
        interactionKeys.forMedia(mediaId),
      )

      if (previous) {
        qc.setQueryData<UserInteractionState>(
          interactionKeys.forMedia(mediaId),
          { ...previous, [type]: active },
        )
      }

      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(interactionKeys.forMedia(mediaId), context.previous)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: interactionKeys.forMedia(mediaId) })
      qc.invalidateQueries({ queryKey: ['media', 'detail', mediaId] })
      qc.invalidateQueries({ queryKey: ['media', 'list'] })
    },
  })
}
