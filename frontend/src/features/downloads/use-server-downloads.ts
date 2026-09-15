import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { isDesktop, type RemoteDownloadProgress } from '@/lib/desktop/api'
import type { GameServer, ServerGameFile, ServerGamesResponse } from './types'

export type { GameServer, ServerGameFile, ServerGamesResponse }

// ── Query Keys ──
export const serverKeys = {
  all: ['game-servers'] as const,
  lists: () => [...serverKeys.all, 'list'] as const,
  games: () => [...serverKeys.all, 'games'] as const,
}

// ── Hooks: Server CRUD ──

export function useGameServers() {
  return useQuery<GameServer[]>({
    queryKey: serverKeys.lists(),
    queryFn: async () => {
      const { data } = await apiClient.get<GameServer[]>('/library/servers')
      return data || []
    },
    staleTime: 30_000,
  })
}

export function useServerGames() {
  return useQuery<ServerGamesResponse>({
    queryKey: serverKeys.games(),
    queryFn: async () => {
      const { data } = await apiClient.get<ServerGamesResponse>('/library/server-games')
      return data || { servers: [], files: [] }
    },
    staleTime: 60_000,
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
