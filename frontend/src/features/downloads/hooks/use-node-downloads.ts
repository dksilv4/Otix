import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { isDesktop, type RemoteDownloadProgress } from '@/lib/desktop/api'
import type { OtixNode, GameServer, ServerGameFile, ServerGamesResponse } from '../types'
import {
  nodeUrlKey,
  pendingNodesToClaim,
  pendingNodesToRefresh,
  probeLocalGameNode,
  unclaimLocalGameNode,
  type PendingNode,
} from '../pending-nodes'

export type { OtixNode, GameServer, ServerGameFile, ServerGamesResponse, RemoteDownloadProgress }

// ── Query Keys ──
export const nodeKeys = {
  all: ['game-servers'] as const,
  lists: () => [...nodeKeys.all, 'list'] as const,
  games: () => [...nodeKeys.all, 'games'] as const,
}

export const serverKeys = nodeKeys

// ── Cache Operations ──

export const CACHED_SERVERS_KEY = 'otix:cached-servers'
export const CACHED_NODES_KEY = CACHED_SERVERS_KEY

import { LOCAL_DESKTOP_NODE_ID } from '@/features/settings/local-desktop-node'

export function getCachedNodes(): OtixNode[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CACHED_NODES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Filter out obsolete legacy synthetic nodes (e.g. retired backend node with id = -2)
    const valid = parsed.filter(
      (node): node is OtixNode =>
        Boolean(node) &&
        typeof (node as { id?: unknown }).id === 'number' &&
        ((node as { id: number }).id > 0 || (node as { id: number }).id === LOCAL_DESKTOP_NODE_ID),
    )
    if (valid.length !== parsed.length) {
      saveCachedNodes(valid)
    }
    return valid
  } catch {
    return []
  }
}

export const getCachedGameServers = getCachedNodes

export function saveCachedNodes(nodes: OtixNode[]): void {
  if (typeof window === 'undefined') return
  try {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      localStorage.removeItem(CACHED_NODES_KEY)
    } else {
      localStorage.setItem(CACHED_NODES_KEY, JSON.stringify(nodes))
    }
  } catch {
    // ignore
  }
}

export const saveCachedGameServers = saveCachedNodes

export function removeCachedNode(nodeId: number): void {
  if (typeof window === 'undefined') return
  const cached = getCachedNodes()
  const updated = cached.filter((s) => s.id !== nodeId)
  try {
    if (updated.length === 0) {
      localStorage.removeItem(CACHED_NODES_KEY)
    } else {
      localStorage.setItem(CACHED_NODES_KEY, JSON.stringify(updated))
    }
  } catch {
    // ignore
  }
}

export const removeCachedGameServer = removeCachedNode

// ── Hooks: Node CRUD ──

export function useNodes(options?: { enabled?: boolean; refetchInterval?: number | false }) {
  return useQuery<OtixNode[]>({
    queryKey: nodeKeys.lists(),
    queryFn: async () => {
      try {
        const { data } = await apiClient.get<OtixNode[]>('/library/servers')
        const list = Array.isArray(data) ? data : []
        saveCachedNodes(list)
        return list
      } catch (error) {
        const cached = getCachedNodes()
        if (cached.length > 0) return cached
        throw error
      }
    },
    initialData: () => {
      const cached = getCachedNodes()
      return cached.length > 0 ? cached : undefined
    },
    initialDataUpdatedAt: 0,
    staleTime: 5_000,
    refetchInterval: options?.refetchInterval,
    enabled: options?.enabled ?? true,
  })
}

export const useGameServers = useNodes

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
    serverName: row.serverName || row.server_name || 'Otix Node',
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
  const { data: servers = [] } = useNodes({ enabled: active, refetchInterval: 15_000 })
  const createServer = useCreateNode()
  const updateServer = useUpdateNode()
  const claiming = useRef(false)
  const createMutateAsync = createServer.mutateAsync
  const updateMutateAsync = updateServer.mutateAsync

  const pendingQuery = useQuery<PendingNode[]>({
    queryKey: [...nodeKeys.all, 'pending'],
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
    queryKey: [...nodeKeys.all, 'local-probe'],
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

export function useNodeGames(options?: { refetchInterval?: number | false }) {
  return useQuery<ServerGamesResponse>({
    queryKey: nodeKeys.games(),
    queryFn: async () => {
      const { data } = await apiClient.get<ServerGamesResponse>('/library/server-games')
      return data || { servers: [], files: [] }
    },
    staleTime: 15_000,
    refetchInterval: options?.refetchInterval,
  })
}

export const useServerGames = useNodeGames

export function useScanNode(nodeId?: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!nodeId) throw new Error('No node selected')
      const { data } = await apiClient.post<{ status?: string; totalFiles?: number }>(
        `/library/servers/${nodeId}/scan`
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nodeKeys.games() })
    },
  })
}

export const useScanGameServer = useScanNode

export function useCreateNode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      name?: string
      local_url?: string
      remote_url?: string
      auth_token?: string
      is_local?: boolean
    }) => {
      const { data } = await apiClient.post<OtixNode>('/library/servers', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nodeKeys.all })
    },
  })
}

export const useCreateGameServer = useCreateNode

export function useUpdateNode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id: number
      name?: string
      local_url?: string
      remote_url?: string
      auth_token?: string
      is_active?: boolean
      is_local?: boolean
    }) => {
      const { id, ...body } = payload
      const { data } = await apiClient.patch<OtixNode>(`/library/servers/${id}`, body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nodeKeys.all })
    },
  })
}

export const useUpdateGameServer = useUpdateNode

export function useDeleteNode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (nodeId: number) => {
      if (nodeId <= 0) {
        return
      }
      try {
        await apiClient.delete(`/library/servers/${nodeId}`)
      } catch (err: unknown) {
        // If the node was already removed on the backend, treat 404 as successful disconnect
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 404) {
          return
        }
        throw err
      }
    },
    onSuccess: (_, nodeId) => {
      removeCachedNode(nodeId)
      queryClient.setQueriesData<OtixNode[]>({ queryKey: nodeKeys.lists() }, (old) => {
        if (!old) return []
        const next = old.filter((s) => s.id !== nodeId)
        saveCachedNodes(next)
        return next
      })
      queryClient.invalidateQueries({ queryKey: nodeKeys.all })
    },
  })
}

export const useDeleteGameServer = useDeleteNode

export function usePingNode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (nodeId: number) => {
      const { data } = await apiClient.post(`/library/servers/${nodeId}/ping`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nodeKeys.lists() })
    },
  })
}

export const usePingGameServer = usePingNode

export interface ServerProbeResult {
  remote_accessible: boolean
  status: 'online' | 'unreachable'
  tested_url: string
  latency_ms: number
  message: string
}

export type NodeProbeResult = ServerProbeResult

export function useClaimNode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      claim_code: string
      node_url?: string
      server_name?: string
      is_local?: boolean
    }) => {
      const { data } = await apiClient.post<OtixNode>('/library/servers/claim', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nodeKeys.all })
    },
  })
}

export const useClaimGameServer = useClaimNode

export function useProbeNode() {
  return useMutation({
    mutationFn: async (nodeId: number) => {
      const { data } = await apiClient.post<NodeProbeResult>(`/library/servers/${nodeId}/probe`)
      return data
    },
  })
}

export const useProbeGameServer = useProbeNode

export function usePendingNodes(options?: { enabled?: boolean }) {
  return useQuery<PendingNode[]>({
    queryKey: [...nodeKeys.all, 'pending'],
    queryFn: async () => {
      const remotePendingPromise = apiClient
        .get<Array<{
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
        .catch(() => ({ data: [] }))

      const localPromise = probeLocalGameNode().catch(() => null)
      const [remoteResp, localNode] = await Promise.all([remotePendingPromise, localPromise])
      const remoteList = (remoteResp.data || []).map(mapPendingRow)
      if (localNode) {
        const filtered = remoteList.filter(
          (r) =>
            !(r.localUrl && nodeUrlKey(r.localUrl) === nodeUrlKey(localNode.localUrl)) &&
            !(localNode.authToken && r.authToken && r.authToken === localNode.authToken),
        )
        return [localNode, ...filtered]
      }
      return remoteList
    },
    enabled: options?.enabled ?? true,
    refetchInterval: 10_000,
  })
}

export const usePendingGameServers = usePendingNodes

export function useUnclaimLocalNode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (authToken?: string) => {
      const ok = await unclaimLocalGameNode(fetch, authToken)
      if (!ok) throw new Error('Failed to unclaim local node')
      try {
        await apiClient.post('/api/v1/servers/unclaim', { authToken })
      } catch {
        // Backend record may have already been cleaned or unreachable
      }
      return ok
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nodeKeys.all })
    },
  })
}

export const useUnclaimGameServer = useUnclaimLocalNode

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
        throw new Error('Remote node downloading is only available in the Otix desktop app.')
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
