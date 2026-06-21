/**
 * React hook for persistent SSE event streams (e.g. notifications).
 *
 * Manages the full lifecycle:
 * - Connects on mount when `enabled`
 * - Reconnects with exponential backoff on error
 * - Cleans up on unmount or when `enabled` becomes false
 *
 * Uses `createSseStream` from `sse-client.ts` with `fetch` + `ReadableStream`
 * (not `EventSource`) so the Bearer token is passed via the Authorization
 * header — no ``?token=`` query param needed.
 */

import { useRef, useEffect, useCallback } from 'react'
import { createSseStream, type SseEvent } from '../api/sse-client'

import { ACCESS_TOKEN_KEY } from '../config/config'
const DEFAULT_RECONNECT_DELAYS = [3_000, 10_000, 30_000, 60_000]

export interface UseSseStreamOptions {
  /** SSE endpoint URL (full URL, not just path — already includes API_BASE_URL). */
  url: string
  /** Called for each incoming event. Return `false` to force-close the stream. */
  onMessage: (event: SseEvent) => void
  /** Whether the stream should be active. */
  enabled?: boolean
  /** Reconnection delays in ms. Defaults to [3s, 10s, 30s, 60s]. */
  reconnectDelays?: number[]
}

export function useSseStream(options: UseSseStreamOptions) {
  const { url, onMessage, enabled = true, reconnectDelays = DEFAULT_RECONNECT_DELAYS } = options

  const abortRef = useRef<AbortController | null>(null)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isActiveRef = useRef(false)
  const onMessageRef = useRef(onMessage)

  // Keep the callback ref fresh without triggering reconnects
  onMessageRef.current = onMessage

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    isActiveRef.current = false
  }, [])

  const connect = useCallback(() => {
    cleanup()

    const token = localStorage.getItem(ACCESS_TOKEN_KEY)
    if (!token) {
      // No token yet — try again after the first reconnect delay
      const delay = reconnectDelays[0]
      reconnectTimerRef.current = setTimeout(() => connect(), delay)
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    isActiveRef.current = true

    const run = async () => {
      try {
        const stream = createSseStream({ url, token, signal: controller.signal })

        for await (const event of stream) {
          if (!isActiveRef.current) break
          reconnectAttemptRef.current = 0 // reset on successful message
          onMessageRef.current(event)
        }

        // Stream ended cleanly — don't reconnect
        isActiveRef.current = false
      } catch (err: unknown) {
        if (!isActiveRef.current) return
        if (err instanceof DOMException && err.name === 'AbortError') {
          // Intentional abort — don't reconnect
          isActiveRef.current = false
          return
        }

        // Connection error — schedule reconnect
        isActiveRef.current = false
        const attempt = reconnectAttemptRef.current
        const delay = reconnectDelays[Math.min(attempt, reconnectDelays.length - 1)]
        reconnectAttemptRef.current = attempt + 1

        reconnectTimerRef.current = setTimeout(() => connect(), delay)
      }
    }

    run()
  }, [url, reconnectDelays, cleanup])

  useEffect(() => {
    if (!enabled) {
      cleanup()
      return
    }

    connect()

    return () => {
      cleanup()
    }
  }, [enabled, connect, cleanup])
}
