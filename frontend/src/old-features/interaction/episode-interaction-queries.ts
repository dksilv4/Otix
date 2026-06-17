// TODO: Review this file
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { mediaKeys } from '@media/queries/media-keys'
import { interactionKeys } from './interaction-keys'

function emit(event: string, payload: unknown) {
  try { (window as any).desktopAPI?.plugin?.emitEvent(event, payload) } catch {}
}

export const episodeInteractionKeys = {
  all: () => ['episode-interactions'] as const,
  forShow: (mediaType: string, mediaId: string) => [...episodeInteractionKeys.all(), 'show', mediaType, mediaId] as const,
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
  mediaType: string,
  mediaId: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: episodeInteractionKeys.forShow(mediaType, mediaId),
    queryFn: async () => {
      const { data } = await apiClient.get<EpisodeInteractionsOut>(
        `/media/${mediaType}/${mediaId}/episode-interactions`,
      )
      return data
    },
    staleTime: 1000 * 60 * 2,
    enabled: enabled && !!mediaId,
  })
}

export function useToggleEpisodeWatched(mediaType: string, mediaId: string) {
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
          `/media/${mediaType}/${mediaId}/episodes/${episodeId}/watched`,
        )
        return data
      }
      await apiClient.delete(`/media/${mediaType}/${mediaId}/episodes/${episodeId}/watched`)
      return null
    },
    onMutate: async ({ episodeId, active }) => {
      const key = episodeInteractionKeys.forShow(mediaType, mediaId)
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
        qc.setQueryData(episodeInteractionKeys.forShow(mediaType, mediaId), context.prev)
      }
    },
    onSettled: (data, error, variables) => {
      qc.invalidateQueries({ queryKey: episodeInteractionKeys.forShow(mediaType, mediaId) })
      qc.invalidateQueries({ queryKey: mediaKeys.detail(mediaType, mediaId) })
      qc.invalidateQueries({ queryKey: interactionKeys.forMedia(mediaType, mediaId) })
      if (!error) emit('otix:media:watched', { mediaId, mediaType: 'show', episodeId: variables.episodeId })
    },
  })
}

export function useMarkShowWatched(mediaType: string, mediaId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (active: boolean) => {
      if (active) {
        const { data } = await apiClient.put<BulkMarkResponse>(
          `/media/${mediaType}/${mediaId}/show-watched`,
        )
        return data
      }
      const { data } = await apiClient.delete<BulkMarkResponse>(
        `/media/${mediaType}/${mediaId}/show-watched`,
      )
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: episodeInteractionKeys.forShow(mediaType, mediaId) })
      qc.invalidateQueries({ queryKey: mediaKeys.detail(mediaType, mediaId) })
      qc.invalidateQueries({ queryKey: interactionKeys.forMedia(mediaType, mediaId) })
      emit('otix:media:watched', { mediaId, mediaType: 'show', seasonNumber: 'all' })
    },
  })
}

export function useMarkSeasonWatched(mediaType: string, mediaId: string) {
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
          `/media/${mediaType}/${mediaId}/seasons/${seasonNumber}/watched`,
        )
        return data
      }
      const { data } = await apiClient.delete<BulkMarkResponse>(
        `/media/${mediaType}/${mediaId}/seasons/${seasonNumber}/watched`,
      )
      return data
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: episodeInteractionKeys.forShow(mediaType, mediaId) })
      qc.invalidateQueries({ queryKey: mediaKeys.detail(mediaType, mediaId) })
      qc.invalidateQueries({ queryKey: interactionKeys.forMedia(mediaType, mediaId) })
      emit('otix:media:watched', { mediaId, mediaType: 'show', seasonNumber: variables.seasonNumber })
    },
  })
}
