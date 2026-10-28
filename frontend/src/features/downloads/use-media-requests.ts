import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { useHasSession } from '@/lib/providers/auth'

export interface MediaRequestItem {
  id: number
  userId: number
  serverId?: number | null
  serverName?: string | null
  mediaType: 'movie' | 'show' | 'game' | 'usenet'
  mediaItemId?: number | null
  title: string
  year?: number | null
  tmdbId?: string | null
  tvdbId?: string | null
  posterUrl?: string | null
  service: string
  instanceId?: string | null
  instanceName?: string | null
  qualityProfileName?: string | null
  rootFolderPath?: string | null
  status:
    | 'requested'
    | 'processing'
    | 'downloading'
    | 'available'
    | 'completed'
    | 'failed'
    | 'cancelled'
  progress: number
  searchNow: boolean
  monitored: boolean
  externalId?: string | null
  errorMessage?: string | null
  completedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export interface CreateMediaRequestPayload {
  serverId?: number | null
  service?: string
  mediaType?: string
  title: string
  year?: number | null
  tmdbId?: string | null
  tvdbId?: string | null
  posterUrl?: string | null
  instanceId?: string | null
  instanceName?: string | null
  qualityProfileName?: string | null
  rootFolderPath?: string | null
  searchNow?: boolean
  monitored?: boolean
  externalId?: string | null
}

export const mediaRequestKeys = {
  all: ['media-requests'] as const,
  list: (filters?: { serverId?: number; mediaType?: string; status?: string }) =>
    [...mediaRequestKeys.all, 'list', filters] as const,
}

export function useMediaRequests(filters?: {
  serverId?: number
  mediaType?: string
  status?: string
}) {
  const hasSession = useHasSession()

  return useQuery<{ items: MediaRequestItem[] }>({
    queryKey: mediaRequestKeys.list(filters),
    queryFn: async () => {
      const { data } = await apiClient.get<{ items: MediaRequestItem[] }>('/library/requests', {
        params: {
          server_id: filters?.serverId,
          media_type: filters?.mediaType,
          status: filters?.status,
        },
      })
      return data || { items: [] }
    },
    enabled: hasSession,
    staleTime: 10_000,
    refetchInterval: 15_000,
  })
}

export function useCreateMediaRequest() {
  const queryClient = useQueryClient()

  return useMutation<MediaRequestItem, Error, CreateMediaRequestPayload>({
    mutationFn: async (payload) => {
      const { data } = await apiClient.post<MediaRequestItem>('/library/requests', payload)
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mediaRequestKeys.all })
    },
  })
}

export function useDeleteMediaRequest() {
  const queryClient = useQueryClient()

  return useMutation<{ ok: boolean }, Error, number>({
    mutationFn: async (requestId) => {
      const { data } = await apiClient.delete<{ ok: boolean }>(`/library/requests/${requestId}`)
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mediaRequestKeys.all })
    },
  })
}
