import { useEffect, useState, useCallback, useRef } from 'react'
import { getDesktopAPI, type NodeDaemonStatus } from '@/lib/desktop/api'
import { probeLocalGameNode, type PendingNode } from '@/features/downloads/pending-nodes'
import { queryClient } from '@/lib/query/client'

export interface UseCompanionNodeOptions {
  onStatusChanged?: (status: NodeDaemonStatus) => void
  autoPair?: boolean
}

export interface UseCompanionNodeReturn {
  status: NodeDaemonStatus | null
  isRunning: boolean
  isStarting: boolean
  port: number
  error: string | null
  version: string | null
  start: (port?: number) => Promise<NodeDaemonStatus | null>
  stop: () => Promise<NodeDaemonStatus | null>
  restart: (port?: number) => Promise<NodeDaemonStatus | null>
}

function resolveDesktopNodeDaemon() {
  const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as unknown as { desktopAPI?: { nodeDaemon?: unknown } }).desktopAPI : null)
  return api?.nodeDaemon as
    | {
        getStatus?: () => Promise<NodeDaemonStatus>
        start?: (port?: number) => Promise<NodeDaemonStatus>
        stop?: () => Promise<NodeDaemonStatus>
        restart?: (port?: number) => Promise<NodeDaemonStatus>
        onStatusChanged?: (callback: (status: NodeDaemonStatus) => void) => () => void
      }
    | undefined
}

export const useCompanionNode = (options?: UseCompanionNodeOptions): UseCompanionNodeReturn => {
  const [status, setStatus] = useState<NodeDaemonStatus | null>(null)
  const prevRunningRef = useRef(false)
  const onStatusChangedRef = useRef(options?.onStatusChanged)
  useEffect(() => {
    onStatusChangedRef.current = options?.onStatusChanged
  }, [options?.onStatusChanged])
  const autoPair = options?.autoPair ?? true

  const handleStatusUpdate = useCallback(
    (newStatus: NodeDaemonStatus) => {
      setStatus(newStatus)
      onStatusChangedRef.current?.(newStatus)

      const running = Boolean(
        newStatus.running ||
          (newStatus as unknown as { state?: string }).state === 'running',
      )
      const port = newStatus.port || 8090

      if (running) {
        if (autoPair) {
          // Probe dynamic local companion node port immediately
          void probeLocalGameNode(fetch, port)
            .then((probed: PendingNode | null) => {
              if (probed && typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('companion-node-probed', {
                    detail: { ...probed, port },
                  }),
                )
              }
            })
            .catch(() => null)

          // Dispatch immediate running & ready events to notify listeners and context
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('companion-node-running', { detail: newStatus }),
            )
            window.dispatchEvent(
              new CustomEvent('companion-node-ready', { detail: newStatus }),
            )
          }

          // Invalidate server queries immediately to avoid 15-second polling latency
          try {
            queryClient.invalidateQueries({ queryKey: ['nodes'] })
            queryClient.invalidateQueries({ queryKey: ['game-servers'] })
          } catch {
            // ignore if query client unavailable in isolated environments
          }
        }
        prevRunningRef.current = true
      } else {
        prevRunningRef.current = false
      }
    },
    [autoPair],
  )

  useEffect(() => {
    const daemon = resolveDesktopNodeDaemon()
    if (!daemon) return

    let mounted = true

    // Poll current status immediately on mount
    if (typeof daemon.getStatus === 'function') {
      daemon
        .getStatus()
        .then((s) => {
          if (mounted && s) {
            handleStatusUpdate(s)
          }
        })
        .catch((err: unknown) => {
          console.warn('[useCompanionNode] getStatus failed:', err)
        })
    }

    // Subscribe to status change events
    let cleanup: (() => void) | undefined
    if (typeof daemon.onStatusChanged === 'function') {
      cleanup = daemon.onStatusChanged((s) => {
        if (mounted && s) {
          handleStatusUpdate(s)
        }
      })
    }

    return () => {
      mounted = false
      if (typeof cleanup === 'function') {
        cleanup()
      }
    }
  }, [handleStatusUpdate])

  const start = useCallback(
    async (port?: number): Promise<NodeDaemonStatus | null> => {
      const daemon = resolveDesktopNodeDaemon()
      if (!daemon?.start) return null
      try {
        const res = await daemon.start(port)
        if (res) handleStatusUpdate(res)
        return res
      } catch (err: unknown) {
        console.error('[useCompanionNode] start failed:', err)
        return null
      }
    },
    [handleStatusUpdate],
  )

  const stop = useCallback(async (): Promise<NodeDaemonStatus | null> => {
    const daemon = resolveDesktopNodeDaemon()
    if (!daemon?.stop) return null
    try {
      const res = await daemon.stop()
      if (res) handleStatusUpdate(res)
      return res
    } catch (err: unknown) {
      console.error('[useCompanionNode] stop failed:', err)
      return null
    }
  }, [handleStatusUpdate])

  const restart = useCallback(
    async (port?: number): Promise<NodeDaemonStatus | null> => {
      const daemon = resolveDesktopNodeDaemon()
      if (!daemon?.restart) return null
      try {
        const res = await daemon.restart(port)
        if (res) handleStatusUpdate(res)
        return res
      } catch (err: unknown) {
        console.error('[useCompanionNode] restart failed:', err)
        return null
      }
    },
    [handleStatusUpdate],
  )

  const isRunning = Boolean(
    status?.running ||
      (status as unknown as { state?: string })?.state === 'running',
  )
  const isStarting = Boolean(
    (status as unknown as { starting?: boolean })?.starting ||
      (status as unknown as { state?: string })?.state === 'starting',
  )
  const port = status?.port ?? 8090
  const error = status?.error ?? null
  const version = status?.version ?? null

  return {
    status,
    isRunning,
    isStarting,
    port,
    error,
    version,
    start,
    stop,
    restart,
  }
}
