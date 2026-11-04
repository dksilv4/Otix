import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { getDesktopAPI } from '@/lib/desktop/api'
import { synthesizeMatchRecordsFromLocalGames } from '../utils/match-center'
import type {
  NodeLibraryPath,
  StorageShare,
  GameMatchRecord,
} from '../types/node-paths'

export const NODE_PATHS_QUERY_KEY = (nodeId?: number | null) => ['library', 'nodes', nodeId, 'paths'] as const
export const STORAGE_SHARES_QUERY_KEY = ['library', 'shares'] as const
export const GAME_MATCHES_QUERY_KEY = (status?: string, q?: string, nodeId?: number | null) =>
  ['library', 'matches', status, q, nodeId] as const

export const useNodePaths = (nodeId?: number | null) => {
  return useQuery({
    queryKey: NODE_PATHS_QUERY_KEY(nodeId),
    queryFn: async () => {
      if (!nodeId) return []
      try {
        const res = await apiClient.get<NodeLibraryPath[]>(`/library/nodes/${nodeId}/paths`)
        return Array.isArray(res.data) ? res.data : []
      } catch {
        return []
      }
    },
    enabled: !!nodeId && nodeId !== 0,
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

export const useGameMatches = (status?: string, q?: string, nodeId?: number | null) => {
  return useQuery({
    queryKey: GAME_MATCHES_QUERY_KEY(status, q, nodeId),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (q) params.set('q', q)
      if (nodeId !== undefined && nodeId !== null) params.set('node_id', String(nodeId))
      const queryStr = params.toString() ? `?${params.toString()}` : ''
      let serverRecords: GameMatchRecord[] = []
      try {
        const res = await apiClient.get<GameMatchRecord[]>(`/library/matches${queryStr}`)
        if (Array.isArray(res.data)) {
          serverRecords = res.data
        }
      } catch {
        // Backend unavailable or unauthenticated
      }

      const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
      if (api?.getLocalGames) {
        try {
          const raw = await api.getLocalGames()
          const games = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : [])
          if (games.length > 0) {
            const localRecords = synthesizeMatchRecordsFromLocalGames(games, status, q, nodeId)
            if (serverRecords.length > 0) {
              const localByKey = new Map<string, GameMatchRecord>()
              for (const loc of localRecords) {
                if (loc.canonicalKey) localByKey.set(loc.canonicalKey, loc)
                if (loc.relativePath) localByKey.set(loc.relativePath, loc)
              }

              const mergedServer: GameMatchRecord[] = serverRecords.map((sr) => {
                const loc =
                  (sr.canonicalKey && localByKey.get(sr.canonicalKey)) ||
                  (sr.relativePath && localByKey.get(sr.relativePath))
                if (!loc) return sr

                if (loc.matchStatus === 'matched') {
                  return {
                    ...sr,
                    matchStatus: 'matched',
                    confidence: loc.confidence || sr.confidence,
                    mediaItemId: loc.mediaItemId || sr.mediaItemId,
                    media: loc.media || sr.media,
                    candidates:
                      loc.candidates && loc.candidates.length > 0
                        ? loc.candidates
                        : sr.candidates,
                  }
                }
                if (
                  sr.matchStatus === 'matched' &&
                  (!sr.media || !sr.media.posterUrl) &&
                  loc.media
                ) {
                  return {
                    ...sr,
                    media: {
                      ...loc.media,
                      ...sr.media,
                      posterUrl: sr.media?.posterUrl || loc.media.posterUrl,
                      backdropUrl: sr.media?.backdropUrl || loc.media.backdropUrl,
                    },
                  }
                }
                return sr
              })

              const serverKeys = new Set(serverRecords.map((r) => r.canonicalKey).filter(Boolean))
              const serverPaths = new Set(serverRecords.map((r) => r.relativePath).filter(Boolean))
              const combined = [...mergedServer]
              for (const loc of localRecords) {
                if (!serverKeys.has(loc.canonicalKey) && !serverPaths.has(loc.relativePath)) {
                  combined.push(loc)
                }
              }
              return combined
            }
            return localRecords
          }
        } catch {
          // ignore
        }
      }

      return serverRecords
    },
  })
}

export const useClearGameMatches = (nodeId?: number | null) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams()
      if (nodeId !== undefined && nodeId !== null) params.set('node_id', String(nodeId))
      const queryStr = params.toString() ? `?${params.toString()}` : ''
      await apiClient.delete(`/library/matches${queryStr}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library', 'matches'] })
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
