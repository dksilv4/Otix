// TODO: Review this file
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { mediaKeys } from '@/features/media/media-keys'
import { interactionKeys } from './interaction-keys'

export const episodeInteractionKeys = {
  all: () => ['episode-interactions'] as const,
  forShow: (mediaId: string) => [...episodeInteractionKeys.all(), 'show', mediaId] as const,
}

export interface EpisodeInteractionState {
  episodeId: string
  watched: boolean
  watchedAt: string | null
}

export interface EpisodeInteractionsOut {
  episodes: Record<string, EpisodeInteractionState>
}

export interface ShowProgressOut {
  watchedEpisodes: number
  totalEpisodes: number
  progressPct: number
  completedSeasons: number[]
}

export interface EpisodeToggleResponse {
  interaction: EpisodeInteractionState
  showProgress: ShowProgressOut
}

export interface BulkMarkResponse {
  episodesMarked: number
}

export function useEpisodeInteractions(
  mediaId: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: episodeInteractionKeys.forShow(mediaId),
    queryFn: async () => {
      const { data } = await apiClient.get<EpisodeInteractionsOut>(
        `/media/${mediaId}/episode-interactions`,
      )
      return data
    },
    staleTime: 1000 * 60 * 2,
    enabled: enabled && !!mediaId,
  })
}

export function useToggleEpisodeWatched(mediaId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      episodeId,
      active,
    }: {
      episodeId: string
      active: boolean
    }) => {
      if (active) {
        const { data } = await apiClient.put<EpisodeToggleResponse>(
          `/media/${mediaId}/episodes/${episodeId}/watched`,
        )
        return data
      }
      await apiClient.delete(`/media/${mediaId}/episodes/${episodeId}/watched`)
      return null
    },
    onMutate: async ({ episodeId, active }) => {
      const key = episodeInteractionKeys.forShow(mediaId)
      await qc.cancelQueries({ queryKey: key })

      const prev = qc.getQueryData<EpisodeInteractionsOut>(key)
      if (prev) {
        qc.setQueryData<EpisodeInteractionsOut>(key, {
          ...prev,
          episodes: {
            ...prev.episodes,
            [episodeId]: {
              episodeId,
              watched: active,
              watchedAt: active ? new Date().toISOString() : null,
            },
          },
        })
      }

      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        qc.setQueryData(episodeInteractionKeys.forShow(mediaId), context.prev)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: episodeInteractionKeys.forShow(mediaId) })
      qc.invalidateQueries({ queryKey: ['media', 'detail'] })
      qc.invalidateQueries({ queryKey: interactionKeys.forMedia(mediaId) })
    },
  })
}

export function useMarkShowWatched(mediaId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (active: boolean) => {
      if (active) {
        const { data } = await apiClient.put<BulkMarkResponse>(
          `/media/${mediaId}/show-watched`,
        )
        return data
      }
      const { data } = await apiClient.delete<BulkMarkResponse>(
        `/media/${mediaId}/show-watched`,
      )
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: episodeInteractionKeys.forShow(mediaId) })
      qc.invalidateQueries({ queryKey: ['media', 'detail'] })
      qc.invalidateQueries({ queryKey: interactionKeys.forMedia(mediaId) })
    },
  })
}

export function useMarkSeasonWatched(mediaId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      seasonNumber,
      active,
    }: {
      seasonNumber: number
      active: boolean
    }) => {
      if (active) {
        const { data } = await apiClient.put<BulkMarkResponse>(
          `/media/${mediaId}/seasons/${seasonNumber}/watched`,
        )
        return data
      }
      const { data } = await apiClient.delete<BulkMarkResponse>(
        `/media/${mediaId}/seasons/${seasonNumber}/watched`,
      )
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: episodeInteractionKeys.forShow(mediaId) })
      qc.invalidateQueries({ queryKey: ['media', 'detail'] })
      qc.invalidateQueries({ queryKey: interactionKeys.forMedia(mediaId) })
    },
  })
}
