import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { isDesktop, type RemoteDownloadProgress } from '@/lib/desktop/api'
import type { GameServer, ServerGameFile, ServerGamesResponse } from '../types'
import {
  nodeUrlKey,
  pendingNodesToClaim,
  pendingNodesToRefresh,
  probeLocalGameNode,
  type PendingNode,
} from '../pending-nodes'

export type { GameServer, ServerGameFile, ServerGamesResponse, RemoteDownloadProgress }

// ── Query Keys ──
export const serverKeys = {
  all: ['game-servers'] as const,
  lists: () => [...serverKeys.all, 'list'] as const,
  games: () => [...serverKeys.all, 'games'] as const,
}

// ── Hooks: Server CRUD ──

export const CACHED_SERVERS_KEY = 'otix:cached-servers'

export function getCachedGameServers(): GameServer[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CACHED_SERVERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCachedGameServers(servers: GameServer[]): void {
  if (typeof window === 'undefined' || !Array.isArray(servers) || servers.length === 0) return
  try {
    localStorage.setItem(CACHED_SERVERS_KEY, JSON.stringify(servers))
  } catch {
    // ignore
  }
}

export function removeCachedGameServer(serverId: number): void {
  if (typeof window === 'undefined') return
  const cached = getCachedGameServers()
  const updated = cached.filter((s) => s.id !== serverId)
  try {
    localStorage.setItem(CACHED_SERVERS_KEY, JSON.stringify(updated))
  } catch {
    // ignore
  }
}

export function useGameServers(options?: { enabled?: boolean; refetchInterval?: number | false }) {
  return useQuery<GameServer[]>({
    queryKey: serverKeys.lists(),
    queryFn: async () => {
      try {
        const { data } = await apiClient.get<GameServer[]>('/library/servers')
        const list = Array.isArray(data) ? data : []
        if (list.length > 0) {
          saveCachedGameServers(list)
        }
        return list
      } catch (error) {
        const cached = getCachedGameServers()
        if (cached.length > 0) return cached
        throw error
      }
    },
    initialData: () => {
      const cached = getCachedGameServers()
      return cached.length > 0 ? cached : undefined
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
  claimCode?: string
  claim_code?: string
  claimed?: boolean
}): PendingNode {
  return {
    serverName: row.serverName || row.server_name || 'Otix Game Server',
    localUrl: row.localUrl || row.local_url || '',
    authToken: row.authToken || row.auth_token || '',
    claimCode: row.claimCode || row.claim_code || '',
    claimed: row.claimed ?? false,
  }
}

const inFlightClaimKeys = new Set<string>()

function claimKeysFor(node: PendingNode): string[] {
  const keys = [nodeUrlKey(node.localUrl)]
  if (node.authToken) keys.push(`token:${node.authToken}`)
  return keys
}

export function useAutoClaimPendingServers(enabled: boolean) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setReady(false)
      return
    }
    const timer = setTimeout(() => {
      setReady(true)
    }, 2500)
    return () => clearTimeout(timer)
  }, [enabled])

  const active = enabled && ready
  const { data: servers = [] } = useGameServers({ enabled: active, refetchInterval: 15_000 })
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
    enabled: active,
    refetchInterval: 15_000,
  })

  const localProbe = useQuery({
    queryKey: [...serverKeys.all, 'local-probe'],
    queryFn: probeLocalGameNode,
    enabled: active,
    refetchInterval: 15_000,
    retry: false,
  })

  useEffect(() => {
    if (!active || claiming.current) return
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
    onSuccess: (_, serverId) => {
      removeCachedGameServer(serverId)
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

export interface ServerProbeResult {
  remote_accessible: boolean
  status: 'online' | 'unreachable'
  tested_url: string
  latency_ms: number
  message: string
}

export function useClaimGameServer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      claim_code: string
      node_url?: string
      server_name?: string
    }) => {
      const { data } = await apiClient.post<GameServer>('/library/servers/claim', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serverKeys.all })
    },
  })
}

export function useProbeGameServer() {
  return useMutation({
    mutationFn: async (serverId: number) => {
      const { data } = await apiClient.post<ServerProbeResult>(`/library/servers/${serverId}/probe`)
      return data
    },
  })
}

export function usePendingGameServers(options?: { enabled?: boolean }) {
  return useQuery<PendingNode[]>({
    queryKey: [...serverKeys.all, 'pending'],
    queryFn: async () => {
      const { data } = await apiClient.get<Array<{
        serverName?: string
        server_name?: string
        localUrl?: string
        local_url?: string
        authToken?: string
        auth_token?: string
        claimCode?: string
        claim_code?: string
        claimed?: boolean
      }>>('/library/servers/pending')
      return (data || []).map(mapPendingRow)
    },
    enabled: options?.enabled ?? true,
    refetchInterval: 10_000,
  })
}

// ── Store: Remote Downloads Management ──

let activeTransfersSnapshot: RemoteDownloadProgress[] = []
const transferListeners = new Set<() => void>()
let ipcInitialized = false

function setTransfers(updater: (prev: RemoteDownloadProgress[]) => RemoteDownloadProgress[]) {
  activeTransfersSnapshot = updater(activeTransfersSnapshot)
  transferListeners.forEach((listener) => {
    try {
      listener()
    } catch {
      // ignore
    }
  })
}

function subscribeTransfers(onStoreChange: () => void) {
  transferListeners.add(onStoreChange)
  return () => {
    transferListeners.delete(onStoreChange)
  }
}

function getTransfersSnapshot(): RemoteDownloadProgress[] {
  return activeTransfersSnapshot
}

function initRemoteDownloadIPC() {
  if (ipcInitialized || typeof window === 'undefined' || !isDesktop()) return
  ipcInitialized = true

  window.desktopAPI?.downloadsRemoteGetActive?.().then((list) => {
    if (Array.isArray(list)) {
      setTransfers(() => list)
    }
  }).catch(() => {})

  window.desktopAPI?.onRemoteDownloadProgress?.((prog) => {
    setTransfers((prev) => {
      const index = prev.findIndex((p) => p.id === prog.id)
      if (index >= 0) {
        const next = [...prev]
        next[index] = prog
        return next
      }
      return [...prev, prog]
    })
  })

  window.desktopAPI?.onRemoteDownloadCompleted?.((data) => {
    setTransfers((prev) => prev.filter((p) => p.id !== data.downloadId))
  })
}

export function useRemoteDownloads() {
  const desktop = isDesktop()

  useEffect(() => {
    if (!desktop) return
    initRemoteDownloadIPC()
    window.desktopAPI?.downloadsRemoteGetActive?.().then((list) => {
      if (Array.isArray(list)) {
        setTransfers(() => list)
      }
    }).catch(() => {})
  }, [desktop])

  const activeTransfers = useSyncExternalStore(
    subscribeTransfers,
    getTransfersSnapshot,
    getTransfersSnapshot
  )

  const startDownload = useCallback(
    async (file: ServerGameFile, mediaItemId?: string | null, destDir?: string | null) => {
      if (!desktop || !window.desktopAPI?.downloadsRemoteStart) {
        throw new Error('Remote server downloading is only available in the Otix desktop app.')
      }

      const assignedDir = destDir || localStorage.getItem('otix:games-download-dir') || undefined

      const downloadId = await window.desktopAPI.downloadsRemoteStart({
        serverUrl: file.serverUrl,
        fileId: file.fileId,
        filename: file.filename,
        filesize: file.filesize,
        gameTitle: file.gameTitle,
        mediaItemId: mediaItemId || file.catalogItem?.id || null,
        destDir: assignedDir,
      })

      window.desktopAPI?.downloadsRemoteGetActive?.().then((list) => {
        if (Array.isArray(list)) {
          setTransfers(() => list)
        }
      }).catch(() => {})

      return downloadId
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
        setTransfers((prev) => prev.filter((p) => p.id !== downloadId))
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
