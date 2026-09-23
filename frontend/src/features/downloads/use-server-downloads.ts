import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { isDesktop, type RemoteDownloadProgress } from '@/lib/desktop/api'
import type { GameServer, ServerGameFile, ServerGamesResponse } from './types'
import { ACCESS_TOKEN_KEY, API_BASE_URL } from '@/lib/config'

export type { GameServer, ServerGameFile, ServerGamesResponse }

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

/** Retired: separate Otix Server nodes are no longer claimed. */
export function useAutoClaimPendingServers(_enabled: boolean) {
  // no-op — Django backend is the only product node
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
      const token = localStorage.getItem(ACCESS_TOKEN_KEY) || ''
      // Desktop rebuilds `${serverUrl}/api/v1/files/{id}/download` — origin without /api/v1.
      const apiOrigin = API_BASE_URL.replace(/\/api\/v1\/?$/, '') || file.serverUrl

      return await window.desktopAPI.downloadsRemoteStart({
        serverUrl: apiOrigin,
        fileId: file.fileId,
        filename: file.filename,
        filesize: file.filesize,
        gameTitle: file.gameTitle,
        mediaItemId: mediaItemId || file.catalogItem?.id || null,
        destDir: assignedDir,
        authToken: token || null,
        downloadUrl: file.downloadUrl || undefined,
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
