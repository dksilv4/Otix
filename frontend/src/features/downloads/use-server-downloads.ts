import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { isDesktop, type RemoteDownloadProgress } from '@/lib/desktop/api'
import type { GameServer, ServerGameFile, ServerGamesResponse } from './types'
import {
  nodeUrlKey,
  pendingNodesToClaim,
  pendingNodesToRefresh,
  probeLocalGameNode,
  type PendingNode,
} from './pending-nodes'

export type { GameServer, ServerGameFile, ServerGamesResponse }

// ── Query Keys ──
export const serverKeys = {
  all: ['game-servers'] as const,
  lists: () => [...serverKeys.all, 'list'] as const,
  games: () => [...serverKeys.all, 'games'] as const,
}

// ── Hooks: Server CRUD ──

export function useGameServers(options?: { enabled?: boolean; refetchInterval?: number | false }) {
  return useQuery<GameServer[]>({
    queryKey: serverKeys.lists(),
    queryFn: async () => {
      const { data } = await apiClient.get<GameServer[]>('/library/servers')
      return data || []
    },
    staleTime: 15_000,
    refetchInterval: options?.refetchInterval,
    enabled: options?.enabled ?? true,
  })
}

function mapPendingRow(row: {
  serverName?: string
  server_name?: string
  localUrl?: string
  local_url?: string
  authToken?: string
  auth_token?: string
}): PendingNode {
  return {
    serverName: row.serverName || row.server_name || 'Otix Game Server',
    localUrl: row.localUrl || row.local_url || '',
    authToken: row.authToken || row.auth_token || '',
  }
}

const inFlightClaimKeys = new Set<string>()

function claimKeysFor(node: PendingNode): string[] {
  const keys = [nodeUrlKey(node.localUrl)]
  if (node.authToken) keys.push(`token:${node.authToken}`)
  return keys
}

export function useAutoClaimPendingServers(enabled: boolean) {
  const { data: servers = [] } = useGameServers({ enabled, refetchInterval: 15_000 })
  const createServer = useCreateGameServer()
  const updateServer = useUpdateGameServer()
  const claiming = useRef(false)
  const createMutateAsync = createServer.mutateAsync
  const updateMutateAsync = updateServer.mutateAsync

  const pendingQuery = useQuery<PendingNode[]>({
    queryKey: [...serverKeys.all, 'pending'],
    queryFn: async () => {
      const { data } = await apiClient.get<Array<{
        serverName?: string
        server_name?: string
        localUrl?: string
        local_url?: string
        authToken?: string
        auth_token?: string
      }>>('/library/servers/pending')
      return (data || []).map(mapPendingRow)
    },
    enabled,
    refetchInterval: 15_000,
  })

  const localProbe = useQuery({
    queryKey: [...serverKeys.all, 'local-probe'],
    queryFn: probeLocalGameNode,
    enabled,
    refetchInterval: 15_000,
    retry: false,
  })

  useEffect(() => {
    if (!enabled || claiming.current) return
    for (const server of servers) {
      for (const url of [server.primaryUrl, server.localUrl]) {
        if (url) inFlightClaimKeys.delete(nodeUrlKey(url))
      }
      if (server.authToken) inFlightClaimKeys.delete(`token:${server.authToken}`)
    }
    const pending = [
      ...(pendingQuery.data || []),
      ...(localProbe.data ? [localProbe.data] : []),
    ]
    const toRefresh = pendingNodesToRefresh(pending, servers)
    const toClaim = pendingNodesToClaim(pending, servers).filter((node) =>
      claimKeysFor(node).every((key) => !inFlightClaimKeys.has(key)),
    )
    if (!toRefresh.length && !toClaim.length) return
    claiming.current = true
    for (const node of toClaim) {
      for (const key of claimKeysFor(node)) inFlightClaimKeys.add(key)
    }
    Promise.all([
      ...toRefresh.map(({ id, node }) =>
        updateMutateAsync({
          id,
          auth_token: node.authToken,
          name: node.serverName,
        }),
      ),
      ...toClaim.map((node) =>
        createMutateAsync({
          name: node.serverName,
          local_url: node.localUrl,
          auth_token: node.authToken || undefined,
        }),
      ),
    ])
      .catch(() => {
        for (const node of toClaim) {
          for (const key of claimKeysFor(node)) inFlightClaimKeys.delete(key)
        }
      })
      .finally(() => {
        claiming.current = false
      })
  }, [createMutateAsync, enabled, localProbe.data, pendingQuery.data, servers, updateMutateAsync])
}

export function useServerGames(options?: { refetchInterval?: number | false }) {
  return useQuery<ServerGamesResponse>({
    queryKey: serverKeys.games(),
    queryFn: async () => {
      const { data } = await apiClient.get<ServerGamesResponse>('/library/server-games')
      return data || { servers: [], files: [] }
    },
    staleTime: 15_000,
    refetchInterval: options?.refetchInterval,
  })
}

export function useScanGameServer(serverId?: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!serverId) throw new Error('No server selected')
      const { data } = await apiClient.post<{ status?: string; totalFiles?: number }>(
        `/library/servers/${serverId}/scan`
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serverKeys.games() })
    },
  })
}

export function useCreateGameServer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      name: string
      local_url?: string
      remote_url?: string
      auth_token?: string
    }) => {
      const { data } = await apiClient.post<GameServer>('/library/servers', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serverKeys.all })
    },
  })
}

export function useUpdateGameServer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id: number
      name?: string
      local_url?: string
      remote_url?: string
      auth_token?: string
      is_active?: boolean
    }) => {
      const { id, ...body } = payload
      const { data } = await apiClient.patch<GameServer>(`/library/servers/${id}`, body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serverKeys.all })
    },
  })
}

export function useDeleteGameServer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (serverId: number) => {
      await apiClient.delete(`/library/servers/${serverId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serverKeys.all })
    },
  })
}

export function usePingGameServer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (serverId: number) => {
      const { data } = await apiClient.post(`/library/servers/${serverId}/ping`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serverKeys.lists() })
    },
  })
}

// ── Hook: Remote Downloads Management ──

export function useRemoteDownloads() {
  const [activeTransfers, setActiveTransfers] = useState<RemoteDownloadProgress[]>([])
  const desktop = isDesktop()

  // Poll / hydrate initial active transfers on mount
  useEffect(() => {
    if (!desktop || !window.desktopAPI?.downloadsRemoteGetActive) return

    window.desktopAPI.downloadsRemoteGetActive().then((list) => {
      if (Array.isArray(list)) setActiveTransfers(list)
    }).catch(() => {})

    const unsubProgress = window.desktopAPI.onRemoteDownloadProgress?.((prog) => {
      setActiveTransfers((prev) => {
        const index = prev.findIndex((p) => p.id === prog.id)
        if (index >= 0) {
          const next = [...prev]
          next[index] = prog
          return next
        }
        return [...prev, prog]
      })
    })

    const unsubComplete = window.desktopAPI.onRemoteDownloadCompleted?.((data) => {
      setActiveTransfers((prev) => prev.filter((p) => p.id !== data.downloadId))
    })

    return () => {
      unsubProgress?.()
      unsubComplete?.()
    }
  }, [desktop])

  const startDownload = useCallback(
    async (file: ServerGameFile, mediaItemId?: string | null, destDir?: string | null) => {
      if (!desktop || !window.desktopAPI?.downloadsRemoteStart) {
        throw new Error('Remote server downloading is only available in the Otix desktop app.')
      }

      const assignedDir = destDir || localStorage.getItem('otix:games-download-dir') || undefined

      return await window.desktopAPI.downloadsRemoteStart({
        serverUrl: file.serverUrl,
        fileId: file.fileId,
        filename: file.filename,
        filesize: file.filesize,
        gameTitle: file.gameTitle,
        mediaItemId: mediaItemId || file.catalogItem?.id || null,
        destDir: assignedDir,
      })
    },
    [desktop]
  )

  const pauseDownload = useCallback(
    async (downloadId: string) => {
      if (!desktop || !window.desktopAPI?.downloadsRemotePause) return false
      return await window.desktopAPI.downloadsRemotePause(downloadId)
    },
    [desktop]
  )

  const resumeDownload = useCallback(
    async (downloadId: string) => {
      if (!desktop || !window.desktopAPI?.downloadsRemoteResume) return false
      return await window.desktopAPI.downloadsRemoteResume(downloadId)
    },
    [desktop]
  )

  const cancelDownload = useCallback(
    async (downloadId: string) => {
      if (!desktop || !window.desktopAPI?.downloadsRemoteCancel) return false
      const ok = await window.desktopAPI.downloadsRemoteCancel(downloadId)
      if (ok) {
        setActiveTransfers((prev) => prev.filter((p) => p.id !== downloadId))
      }
      return ok
    },
    [desktop]
  )

  return {
    activeTransfers,
    startDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    isDesktop: desktop,
  }
}
