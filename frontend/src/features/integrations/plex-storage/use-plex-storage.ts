import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import type {
  PlexStorageServer,
  PlexStorageSummary,
  PlexStorageRecommendationsResponse,
} from './types'

export const plexStorageQueryKeys = {
  all: ['plex-storage'] as const,
  servers: () => [...plexStorageQueryKeys.all, 'servers'] as const,
  summary: (serverId?: number | null) => [...plexStorageQueryKeys.all, 'summary', serverId ?? 'all'] as const,
  recommendations: (serverId: number | null | undefined, category: string) =>
    [...plexStorageQueryKeys.all, 'recommendations', serverId ?? 'all', category] as const,
}

export function usePlexStorageServers({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: plexStorageQueryKeys.servers(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ servers: PlexStorageServer[] }>(
        '/integrations/plex/storage/servers'
      )
      return data.servers
    },
    staleTime: 60 * 1000,
    enabled,
  })
}

export function usePlexStorageSummary(
  serverId?: number | null,
  { enabled = true }: { enabled?: boolean } = {}
) {
  return useQuery({
    queryKey: plexStorageQueryKeys.summary(serverId),
    queryFn: async () => {
      const params = serverId ? { server_id: serverId } : {}
      const { data } = await apiClient.get<PlexStorageSummary>(
        '/integrations/plex/storage/summary',
        { params }
      )
      return data
    },
    staleTime: 30 * 1000,
    enabled,
  })
}

export function usePlexStorageRecommendations(
  serverId: number | null | undefined,
  category: string,
  { limit = 100, enabled = true }: { limit?: number; enabled?: boolean } = {}
) {
  return useQuery({
    queryKey: plexStorageQueryKeys.recommendations(serverId, category),
    queryFn: async () => {
      const params: Record<string, string | number> = { category, limit }
      if (serverId) params.server_id = serverId
      const { data } = await apiClient.get<PlexStorageRecommendationsResponse>(
        '/integrations/plex/storage/recommendations',
        { params }
      )
      return data
    },
    staleTime: 30 * 1000,
    enabled,
  })
}

export function useRefreshPlexStorage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (serverId?: number | null) => {
      const payload = serverId ? { server_id: serverId } : {}
      const { data } = await apiClient.post<{ detail: string; success: boolean }>(
        '/integrations/plex/storage/refresh',
        payload
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: plexStorageQueryKeys.all })
    },
  })
}
