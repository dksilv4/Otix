import { useState, useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { gameServersKeys } from '../queries/gameservers-queries'
import { refreshGameServerStatus, probeServerFromClient, applyProbeResultToGameServer } from '../utils/server-probe'
import type { DedicatedGameServer } from '../types'

export interface UseGameServersRefreshOptions {
  enabled?: boolean
  intervalMs?: number
  probeTimeoutMs?: number
}

export function useGameServersRefresh(
  servers: DedicatedGameServer[],
  options: UseGameServersRefreshOptions = {},
) {
  const { enabled = true, intervalMs = 20_000, probeTimeoutMs = 3500 } = options

  const queryClient = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshingServerIds, setRefreshingServerIds] = useState<Set<number>>(new Set())
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)

  const isMountedRef = useRef(true)
  const isRefreshingRef = useRef(false)
  const serversRef = useRef(servers)
  useEffect(() => {
    serversRef.current = servers
  }, [servers])

  const initialRefreshedRef = useRef(false)

  const updateServerInCache = useCallback(
    (updated: DedicatedGameServer) => {
      queryClient.setQueriesData<DedicatedGameServer[]>(
        { queryKey: gameServersKeys.lists() },
        (oldList) => {
          if (!oldList) return oldList
          return oldList.map((s) => (s.id === updated.id ? updated : s))
        },
      )
      queryClient.setQueryData(gameServersKeys.detail(updated.id), updated)
      if (updated.mediaItemId) {
        queryClient.setQueriesData<DedicatedGameServer[]>(
          { queryKey: gameServersKeys.byGame(updated.mediaItemId) },
          (oldList) => {
            if (!oldList) return oldList
            return oldList.map((s) => (s.id === updated.id ? updated : s))
          },
        )
      }
    },
    [queryClient],
  )

  const refreshServer = useCallback(
    async (serverId: number) => {
      const target = serversRef.current.find((s) => s.id === serverId)
      if (!target) return

      if (isMountedRef.current) {
        setRefreshingServerIds((prev) => new Set(prev).add(serverId))
      }

      try {
        // First check for local client probe to immediately reflect local PC stats/ping
        const probeResult = await probeServerFromClient(target, probeTimeoutMs)
        if (probeResult) {
          const optimistic = applyProbeResultToGameServer(target, probeResult)
          updateServerInCache(optimistic)
        }

        const { server: finalServer } = await refreshGameServerStatus(target, probeTimeoutMs)
        updateServerInCache(finalServer)
      } catch (err: unknown) {
        console.error(`[useGameServersRefresh] Failed refreshing server ${serverId}:`, err)
      } finally {
        if (isMountedRef.current) {
          setRefreshingServerIds((prev) => {
            const next = new Set(prev)
            next.delete(serverId)
            return next
          })
        }
      }
    },
    [probeTimeoutMs, updateServerInCache],
  )

  const refreshAll = useCallback(async () => {
    if (isRefreshingRef.current) return
    const currentList = serversRef.current
    if (!currentList || currentList.length === 0) return

    isRefreshingRef.current = true
    if (isMountedRef.current) {
      setIsRefreshing(true)
      setRefreshingServerIds(new Set(currentList.map((s) => s.id)))
    }

    try {
      await Promise.allSettled(
        currentList.map(async (server) => {
          try {
            // Optimistic PC probe
            const probeResult = await probeServerFromClient(server, probeTimeoutMs)
            if (probeResult) {
              const optimistic = applyProbeResultToGameServer(server, probeResult)
              updateServerInCache(optimistic)
            }

            const { server: updated } = await refreshGameServerStatus(server, probeTimeoutMs)
            updateServerInCache(updated)
          } catch (err: unknown) {
            console.error(`[useGameServersRefresh] Failed refreshing server ${server.id}:`, err)
          } finally {
            if (isMountedRef.current) {
              setRefreshingServerIds((prev) => {
                const next = new Set(prev)
                next.delete(server.id)
                return next
              })
            }
          }
        }),
      )

      if (isMountedRef.current) {
        setLastRefreshedAt(new Date())
      }
    } finally {
      isRefreshingRef.current = false
      if (isMountedRef.current) {
        setIsRefreshing(false)
        setRefreshingServerIds(new Set())
      }
    }
  }, [probeTimeoutMs, updateServerInCache])

  // Initial trigger when servers are first available
  useEffect(() => {
    if (!enabled || servers.length === 0) return
    if (!initialRefreshedRef.current) {
      initialRefreshedRef.current = true
      void refreshAll()
    }
  }, [enabled, servers.length, refreshAll])

  // Periodic polling interval while the user stays on the page
  useEffect(() => {
    if (!enabled || intervalMs <= 0) return

    const intervalId = setInterval(() => {
      // Only execute probe if the document is currently visible to prevent unnecessary network traffic
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }
      void refreshAll()
    }, intervalMs)

    return () => clearInterval(intervalId)
  }, [enabled, intervalMs, refreshAll])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  return {
    isRefreshing,
    refreshingServerIds,
    lastRefreshedAt,
    refreshServer,
    refreshAll,
  }
}
