import type { QueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'
import { libraryKeys } from '@library/library-keys'
import { syncPlexWatched } from '@/features/integrations/plex-sync/utils/plex-sync'
import { usePlexLibraries, streamPlexLibrarySync } from '@library/library-queries'
import type { PlexLibraryInfo } from '@library/library-queries'
import { connectTaskSseStream, type SseEvent } from '@/lib/api/sse-client'
import { isDesktop } from '@/lib/desktop/api'
import { openExternal } from '@/lib/utils/open-external'
import { ACCESS_TOKEN_KEY } from '@/lib/config'
import { extractIntegrationMessage } from '../utils/integrations'
import type {
  SettingsUser,
  PlexIntegration,
  PlexSyncResult,
  PlexLibraryProgress,
} from '../types'

export const usePlexIntegration = (
  user: SettingsUser | null | undefined,
  queryClient: QueryClient,
  _handleConnect: (provider: string) => void,
  activeAbortControllerRef: { current: AbortController | null },
) => {
  const [plexConnecting, setPlexConnecting] = useState(false)
  const [plexDisconnecting, setPlexDisconnecting] = useState(false)
  const [plexSyncing, setPlexSyncing] = useState(false)
  const [plexSyncResult, setPlexSyncResult] = useState<PlexSyncResult | null>(null)
  const [discoveringPlex, setDiscoveringPlex] = useState(false)
  const [plexLibraryProgress, setPlexLibraryProgress] = useState<Record<string, PlexLibraryProgress>>({})
  const [plexLibraryErrors, setPlexLibraryErrors] = useState<Record<string, string>>({})
  const [syncingLibraryIds, setSyncingLibraryIds] = useState<Set<string>>(new Set())

  const [plexWatchlistSyncing, setPlexWatchlistSyncing] = useState(false)
  const [plexWatchlistSyncResult, setPlexWatchlistSyncResult] = useState<{
    total: number
    matched: number
    seeded: number
  } | null>(null)
  const [plexWatchedSyncing, setPlexWatchedSyncing] = useState(false)
  const [plexWatchedSyncResult, setPlexWatchedSyncResult] = useState<{
    total: number
    matched: number
    seeded: number
    episodes: number
  } | null>(null)
  const [plexConnected, setPlexConnected] = useState(Boolean(user?.plexId))
  const isPlexConnected = plexConnected
  const [plex, setPlex] = useState<PlexIntegration | null>(null)
  const [plexWatchHistoryEnabled, setPlexWatchHistoryEnabled] = useState(user?.plexWatchHistoryEnabled ?? false)
  const [plexStorageModalOpen, setPlexStorageModalOpen] = useState(false)
  const [plexMessage, setPlexMessage] = useState('')
  const [plexError, setPlexError] = useState('')

  const { data: plexLibraries, isLoading: plexLibrariesLoading, refetch: refetchLibraries } = usePlexLibraries({ enabled: isPlexConnected })

  useEffect(() => {
    if (user?.plexId) {
      setPlexConnected(true)
    }
  }, [user?.plexId])

  useEffect(() => {
    if (user?.plexWatchHistoryEnabled !== undefined) {
      setPlexWatchHistoryEnabled(user.plexWatchHistoryEnabled)
    }
  }, [user?.plexWatchHistoryEnabled])

  const handlePlexConnect = async () => {
    if (plexConnecting) return
    setPlexConnecting(true)
    setPlexError('')
    try {
      const { data } = await apiClient.post('/auth/oauth/plex', isDesktop() ? { source: 'desktop' } : undefined)
      openExternal(data.authUrl || data.auth_url)
    } catch (err) {
      setPlexError(extractIntegrationMessage(err))
    } finally {
      setPlexConnecting(false)
    }
  }

  const handlePlexDisconnect = async () => {
    if (plexDisconnecting) return
    activeAbortControllerRef.current?.abort()
    setPlexDisconnecting(true)
    setPlexError('')
    setPlexMessage('')
    try {
      await apiClient.delete('/auth/oauth/plex/disconnect')
      setPlexConnected(false)
      setPlex(null)
      setPlexLibraryProgress({})
      setPlexLibraryErrors({})
      setPlexSyncResult(null)
      setPlexWatchlistSyncResult(null)
      setPlexWatchedSyncResult(null)
      setPlexMessage('Plex account unlinked.')
    } catch (err) {
      setPlexError(extractIntegrationMessage(err))
    } finally {
      setPlexDisconnecting(false)
    }
  }

  const handlePlexSync = async () => {
    if (plexSyncing || syncingLibraryIds.size > 0 || discoveringPlex) return
    activeAbortControllerRef.current?.abort()
    const abortController = new AbortController()
    activeAbortControllerRef.current = abortController

    setPlexSyncing(true)
    setPlexError('')
    setPlexMessage('')
    setPlexLibraryErrors({})
    setPlexSyncResult(null)
    setPlexLibraryProgress({})

    const progressKey = (server: string, library: string) => {
      const match = plexLibraries?.find((l) => l.serverName === server && l.title === library)
      return match ? String(match.id) : `${server}:${library}`
    }

    try {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY) ?? ''
      await connectTaskSseStream(
        {
          createEndpoint: '/integrations/plex/sync',
          streamEndpoint: (taskId: string) => `/integrations/plex/sync/${taskId}/stream`,
          terminalEvents: ['sync_complete', 'error'],
          token,
          signal: abortController.signal,
        },
        (event: SseEvent) => {
          switch (event.type) {
            case 'server_found':
              break
            case 'library_found': {
              const key = progressKey(event.serverName as string, event.libraryName as string)
              setPlexLibraryProgress((prev) => ({
                ...prev,
                [key]: {
                  serverName: event.serverName as string,
                  libraryName: event.libraryName as string,
                  itemsProcessed: 0,
                  itemsTotal: 0,
                  phase: 'pending',
                },
              }))
              break
            }
            case 'syncing_library': {
              const key = progressKey(event.serverName as string, event.libraryName as string)
              setPlexLibraryProgress((prev) => ({
                ...prev,
                [key]: {
                  serverName: event.serverName as string,
                  libraryName: event.libraryName as string,
                  itemsProcessed: 0,
                  itemsTotal: (event.itemsTotal as number) || 0,
                  phase: 'syncing',
                },
              }))
              break
            }
            case 'library_progress': {
              const key = progressKey(event.serverName as string, event.libraryName as string)
              const realValue = (event.itemsProcessed as number) || 0
              setPlexLibraryProgress((prev) => {
                const lib = prev[key]
                return {
                  ...prev,
                  [key]: {
                    ...lib,
                    serverName: event.serverName as string,
                    libraryName: event.libraryName as string,
                    itemsProcessed: realValue,
                    itemsTotal: (event.itemsTotal as number) || lib?.itemsTotal || realValue,
                    phase: 'syncing',
                  },
                }
              })
              break
            }
            case 'library_complete': {
              const serverName = event.serverName as string
              const libraryName = event.libraryName as string
              const key = progressKey(serverName, libraryName)
              const total = (event.total as number) || (event.itemCount as number) || 0
              setPlexLibraryProgress((prev) => {
                const lib = prev[key]
                return {
                  ...prev,
                  [key]: {
                    ...lib,
                    serverName,
                    libraryName,
                    itemsProcessed: total,
                    itemsTotal: total,
                    phase: 'complete' as const,
                  },
                }
              })
              const eventLibId = event.libraryId ? String(event.libraryId) : undefined
              queryClient.setQueryData<PlexLibraryInfo[]>([...libraryKeys.tab('plex'), 'libraries'], (old: PlexLibraryInfo[] | undefined) => {
                if (!old) return old
                return old.map((l: PlexLibraryInfo) => {
                  const isMatch = eventLibId
                    ? String(l.id) === eventLibId
                    : (l.serverName === serverName && l.title === libraryName)
                  return isMatch
                    ? { ...l, itemCount: total, lastSyncedAt: new Date().toISOString() }
                    : l
                })
              })
              break
            }
            case 'sync_complete':
              setPlexSyncResult(event as unknown as PlexSyncResult)
              setPlexMessage(
                `Synced ${event.total} Plex items from ${event.libraries} libraries on ${event.servers} server(s). Seeded ${event.seeded} new catalog items.`,
              )
              void refetchLibraries()
              void queryClient.invalidateQueries({ queryKey: libraryKeys.all() })
              setTimeout(() => {
                setPlexLibraryProgress({})
              }, 1500)
              break
            case 'error':
              setPlexError((event.message as string) || 'Plex sync encountered an error.')
              setPlexLibraryProgress((prev) => {
                const next = { ...prev }
                for (const k of Object.keys(next)) {
                  if (next[k].phase === 'syncing') {
                    next[k] = { ...next[k], phase: 'failed' }
                  }
                }
                return next
              })
              break
          }
        },
      )
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setPlexError(extractIntegrationMessage(err))
    } finally {
      setPlexSyncing(false)
    }
  }

  const handlePlexWatchlistSync = async () => {
    if (plexWatchlistSyncing || plexSyncing || syncingLibraryIds.size > 0 || discoveringPlex) return
    setPlexWatchlistSyncing(true)
    setPlexError('')
    setPlexMessage('')
    setPlexWatchlistSyncResult(null)
    try {
      const { data } = await apiClient.post<{ total: number; matched: number; seeded: number }>(
        '/integrations/plex/watchlist/sync',
      )
      setPlexWatchlistSyncResult(data)
      setPlexMessage(`Found ${data.matched} matches out of ${data.total} watchlist items. Seeded ${data.seeded} items.`)
    } catch (err) {
      setPlexError(extractIntegrationMessage(err))
    } finally {
      setPlexWatchlistSyncing(false)
    }
  }

  const handlePlexWatchedSync = async () => {
    if (plexWatchedSyncing || plexWatchlistSyncing || plexSyncing || syncingLibraryIds.size > 0 || discoveringPlex) return
    setPlexWatchedSyncing(true)
    setPlexError('')
    setPlexMessage('')
    setPlexWatchedSyncResult(null)
    try {
      const data = await syncPlexWatched()
      setPlexWatchedSyncResult(data)
      const epText = data.episodes > 0 ? ` and ${data.episodes} episodes` : ''
      setPlexMessage(`Matched ${data.matched} watched items${epText} out of ${data.total} total items. Seeded ${data.seeded} items.`)
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all() })
    } catch (err) {
      setPlexError(extractIntegrationMessage(err))
    } finally {
      setPlexWatchedSyncing(false)
    }
  }

  const handleDiscoverLibraries = async () => {
    if (discoveringPlex || plexSyncing || syncingLibraryIds.size > 0) return
    setDiscoveringPlex(true)
    setPlexError('')
    setPlexMessage('')
    try {
      const { data } = await apiClient.get<{ servers?: unknown[]; libraries?: unknown[]; unreachableServers?: string[] }>(
        '/integrations/plex/servers',
      )
      await refetchLibraries()
      const libCount = data?.libraries?.length ?? 0
      const serverCount = data?.servers?.length ?? 0
      let msg = `Discovered ${libCount} librar${libCount === 1 ? 'y' : 'ies'} on ${serverCount} server(s).`
      if (data?.unreachableServers?.length) {
        msg += ` (${data.unreachableServers.join(', ')} unreachable)`
      }
      setPlexMessage(msg)
    } catch (err) {
      setPlexError(extractIntegrationMessage(err))
    } finally {
      setDiscoveringPlex(false)
    }
  }

  const handleSyncLibrary = async (library: PlexLibraryInfo) => {
    const libIdStr = String(library.id)
    if (syncingLibraryIds.has(library.id) || syncingLibraryIds.size > 0 || plexSyncing || discoveringPlex) return
    setSyncingLibraryIds((prev) => new Set(prev).add(library.id))
    setPlexLibraryErrors((prev) => {
      const next = { ...prev }
      delete next[libIdStr]
      return next
    })
    setPlexMessage('')
    setPlexLibraryProgress((prev) => ({
      ...prev,
      [libIdStr]: {
        serverName: library.serverName,
        libraryName: library.title,
        itemsProcessed: 0,
        itemsTotal: library.itemCount || 0,
        phase: 'syncing',
      },
    }))

    try {
      const result = await streamPlexLibrarySync(library.id, (event) => {
        switch (event.type) {
          case 'syncing_library': {
            setPlexLibraryProgress((prev) => ({
              ...prev,
              [libIdStr]: {
                serverName: library.serverName,
                libraryName: library.title,
                phase: 'syncing',
                itemsProcessed: prev[libIdStr]?.itemsProcessed ?? 0,
                itemsTotal: (event.itemsTotal as number) || (prev[libIdStr]?.itemsTotal ?? 0),
              },
            }))
            break
          }
          case 'library_progress': {
            const realValue = event.itemsProcessed as number
            setPlexLibraryProgress((prev) => ({
              ...prev,
              [libIdStr]: {
                serverName: library.serverName,
                libraryName: library.title,
                phase: 'syncing',
                itemsProcessed: realValue,
                itemsTotal: (event.itemsTotal as number) || (prev[libIdStr]?.itemsTotal ?? realValue),
              },
            }))
            break
          }
          case 'library_complete': {
            const total = event.total as number
            setPlexLibraryProgress((prev) => ({
              ...prev,
              [libIdStr]: {
                serverName: library.serverName,
                libraryName: library.title,
                itemsProcessed: total,
                itemsTotal: total,
                phase: 'complete',
              },
            }))
            break
          }
        }
      })
      setPlexMessage(`Synced ${library.title}: ${result.matched} matched, ${result.seeded} seeded out of ${result.total} items.`)
      queryClient.setQueryData<PlexLibraryInfo[]>([...libraryKeys.tab('plex'), 'libraries'], (old: PlexLibraryInfo[] | undefined) => {
        if (!old) return old
        return old.map((l: PlexLibraryInfo) =>
          String(l.id) === libIdStr
            ? { ...l, itemCount: result.total, lastSyncedAt: new Date().toISOString() }
            : l,
        )
      })
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all() })
      await refetchLibraries()
    } catch (err) {
      const msg = extractIntegrationMessage(err)
      setPlexLibraryErrors((prev) => ({
        ...prev,
        [libIdStr]: msg,
      }))
      setPlexLibraryProgress((prev) => {
        const next = { ...prev }
        delete next[libIdStr]
        return next
      })
    } finally {
      setSyncingLibraryIds((prev) => {
        const next = new Set(prev)
        next.delete(library.id)
        return next
      })
      setTimeout(() => {
        setPlexLibraryProgress((prev) => {
          const next = { ...prev }
          delete next[libIdStr]
          return next
        })
      }, 1500)
    }
  }

  return {
    plexConnecting,
    setPlexConnecting,
    plexDisconnecting,
    setPlexDisconnecting,
    plexSyncing,
    setPlexSyncing,
    plexSyncResult,
    setPlexSyncResult,
    discoveringPlex,
    setDiscoveringPlex,
    plexLibraryProgress,
    setPlexLibraryProgress,
    plexLibraryErrors,
    setPlexLibraryErrors,
    syncingLibraryIds,
    setSyncingLibraryIds,
    plexWatchlistSyncing,
    setPlexWatchlistSyncing,
    plexWatchlistSyncResult,
    setPlexWatchlistSyncResult,
    plexWatchedSyncing,
    setPlexWatchedSyncing,
    plexWatchedSyncResult,
    setPlexWatchedSyncResult,
    plexConnected,
    isPlexConnected,
    setPlexConnected,
    plex,
    setPlex,
    plexWatchHistoryEnabled,
    setPlexWatchHistoryEnabled,
    plexStorageModalOpen,
    setPlexStorageModalOpen,
    plexMessage,
    setPlexMessage,
    plexError,
    setPlexError,
    plexLibraries,
    plexLibrariesLoading,
    refetchLibraries,
    handlePlexConnect,
    handlePlexDisconnect,
    handlePlexSync,
    handlePlexWatchlistSync,
    handlePlexWatchedSync,
    handleDiscoverLibraries,
    handleSyncLibrary,
  }
}
