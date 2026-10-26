import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import type {
  NodeLibraryPath,
  StorageShare,
  GameMatchRecord,
} from '../types/node-paths'

export const NODE_PATHS_QUERY_KEY = (nodeId?: number | null) => ['library', 'nodes', nodeId, 'paths'] as const
export const STORAGE_SHARES_QUERY_KEY = ['library', 'shares'] as const
export const GAME_MATCHES_QUERY_KEY = (status?: string, q?: string) => ['library', 'matches', status, q] as const

export const useNodePaths = (nodeId?: number | null) => {
  return useQuery({
    queryKey: NODE_PATHS_QUERY_KEY(nodeId),
    queryFn: async () => {
      if (!nodeId) return []
      const res = await apiClient.get<NodeLibraryPath[]>(`/library/nodes/${nodeId}/paths`)
      return Array.isArray(res.data) ? res.data : []
    },
    enabled: !!nodeId,
  })
}

export const useStorageShares = () => {
  return useQuery({
    queryKey: STORAGE_SHARES_QUERY_KEY,
    queryFn: async () => {
      const res = await apiClient.get<StorageShare[]>('/library/shares')
      return Array.isArray(res.data) ? res.data : []
    },
  })
}

export const useSaveNodePaths = (nodeId?: number | null) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (paths: Partial<NodeLibraryPath>[]) => {
      if (!nodeId) throw new Error('Node ID is required')
      const res = await apiClient.put<NodeLibraryPath[]>(`/library/nodes/${nodeId}/paths`, { paths })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NODE_PATHS_QUERY_KEY(nodeId) })
    },
  })
}

export const useDeleteNodePath = (nodeId?: number | null) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (pathId: number) => {
      if (!nodeId) throw new Error('Node ID is required')
      await apiClient.delete(`/library/nodes/${nodeId}/paths/${pathId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NODE_PATHS_QUERY_KEY(nodeId) })
    },
  })
}

export const useCreateStorageShare = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (share: Partial<StorageShare>) => {
      const res = await apiClient.post<StorageShare>('/library/shares', share)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STORAGE_SHARES_QUERY_KEY })
    },
  })
}

export const useGameMatches = (status?: string, q?: string) => {
  return useQuery({
    queryKey: GAME_MATCHES_QUERY_KEY(status, q),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (q) params.set('q', q)
      const queryStr = params.toString() ? `?${params.toString()}` : ''
      const res = await apiClient.get<GameMatchRecord[]>(`/library/matches${queryStr}`)
      return Array.isArray(res.data) ? res.data : []
    },
  })
}

export const useConfirmMatch = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ recordId, mediaItemId }: { recordId: number; mediaItemId: string }) => {
      const res = await apiClient.post<GameMatchRecord>(`/library/matches/${recordId}/confirm`, {
        mediaItemId,
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library', 'matches'] })
    },
  })
}

export const useUnmatchRecord = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (recordId: number) => {
      const res = await apiClient.post<GameMatchRecord>(`/library/matches/${recordId}/unmatch`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library', 'matches'] })
    },
  })
}

export const useIngestManifest = (nodeId?: number | null) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (manifest: { files: any[]; removed_keys?: string[] }) => {
      if (!nodeId) throw new Error('Node ID is required')
      const res = await apiClient.post<{ ingested: number; matches_created: number }>(
        `/library/nodes/${nodeId}/manifest`,
        manifest,
      )
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library', 'matches'] })
      queryClient.invalidateQueries({ queryKey: NODE_PATHS_QUERY_KEY(nodeId) })
    },
  })
}
