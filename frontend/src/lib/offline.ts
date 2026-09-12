import { useEffect, useSyncExternalStore } from 'react'

const NETWORK_CODES = new Set([
  'ERR_NETWORK',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ERR_CONNECTION_REFUSED',
  'ERR_CONNECTION_RESET',
  'ERR_HTTP2_STREAM_ERROR',
])

const listeners = new Set<() => void>()
let offlineState = typeof navigator !== 'undefined' ? !navigator.onLine : false

function setOffline(next: boolean) {
  if (offlineState === next) return
  offlineState = next
  listeners.forEach((l) => l())
}

function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: unknown; name?: unknown; message?: unknown }
  if (typeof e.code === 'string' && NETWORK_CODES.has(e.code)) return true
  if (error instanceof TypeError || e.name === 'TypeError') return true
  if (typeof e.message === 'string' && /network|failed to fetch|fetch failed|socket hang up|econn/i.test(e.message)) return true
  return false
}

/** Called from the query cache so backend reachability drives offline state too. */
export function reportNetworkFailure(error: unknown) {
  if (isNetworkError(error)) setOffline(true)
}

export function reportOnline() {
  setOffline(false)
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function getSnapshot() {
  return offlineState
}

/** True when the network is unavailable or the backend is unreachable. */
export function useOffline(): boolean {
  useEffect(() => {
    const onOnline = () => setOffline(false)
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
