import { useSyncExternalStore } from 'react'
import { apiClient } from '@/lib/api/client'

export interface OfflineWatchlistItem {
  mediaType: string
  mediaId: string
  title?: string
  posterUrl?: string | null
  textlessPosterUrl?: string | null
  backdropUrl?: string | null
  logoUrl?: string | null
  releaseDate?: string | null
  addedAt: number
}

export interface OfflineWatchlistInput {
  mediaType: string
  mediaId: string
  title?: string | null
  posterUrl?: string | null
  textlessPosterUrl?: string | null
  backdropUrl?: string | null
  logoUrl?: string | null
  releaseDate?: string | null
}

export const OFFLINE_WATCHLIST_KEY = 'otix:offline-watchlist'
export const PENDING_LOGIN_SYNC_KEY = 'otix:pending-login-sync'

type OfflineWatchlist = OfflineWatchlistItem[]

function readFromStorage(): OfflineWatchlist {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(OFFLINE_WATCHLIST_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

let cached: OfflineWatchlist = readFromStorage()
let cacheValid = true

const listeners = new Set<() => void>()

function getSnapshot(): OfflineWatchlist {
  if (!cacheValid) {
    cached = readFromStorage()
    cacheValid = true
  }
  return cached
}

function mutate(items: OfflineWatchlist) {
  cached = items
  cacheValid = true
  try {
    localStorage.setItem(OFFLINE_WATCHLIST_KEY, JSON.stringify(items))
  } catch {
    // Private-mode / quota — keep in-memory state for this session.
  }
  for (const l of listeners) l()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function getOfflineWatchlist(): OfflineWatchlist {
  return getSnapshot()
}

export function getOfflineWatchlistCount(): number {
  return getSnapshot().length
}

export function useOfflineWatchlistItems(): OfflineWatchlist {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useOfflineWatchlistCount(): number {
  return useOfflineWatchlistItems().length
}

export function useIsOfflineWatchlisted(mediaType: string, mediaId: string): boolean {
  const items = useOfflineWatchlistItems()
  return items.some((i) => i.mediaType === mediaType && i.mediaId === mediaId)
}

/** Toggle an item in the offline watchlist. Returns true when added, false when removed. */
export function toggleOfflineWatchlist(item: OfflineWatchlistInput): boolean {
  const items = getSnapshot()
  const idx = items.findIndex(
    (i) => i.mediaType === item.mediaType && i.mediaId === item.mediaId,
  )
  if (idx >= 0) {
    const next = [...items]
    next.splice(idx, 1)
    mutate(next)
    return false
  }
  mutate([
    {
      mediaType: item.mediaType,
      mediaId: item.mediaId,
      title: item.title ?? undefined,
      posterUrl: item.posterUrl ?? null,
      textlessPosterUrl: item.textlessPosterUrl ?? null,
      backdropUrl: item.backdropUrl ?? null,
      logoUrl: item.logoUrl ?? null,
      releaseDate: item.releaseDate ?? null,
      addedAt: Date.now(),
    },
    ...items,
  ])
  return true
}

export function clearOfflineWatchlist() {
  mutate([])
}

/**
 * PUT each offline item onto the account watchlist. Idempotent, so re-running
 * is safe. Returns the count that succeeded/failed.
 */
export async function syncOfflineWatchlist(): Promise<{ synced: number; failed: number }> {
  const items = getSnapshot()
  let synced = 0
  let failed = 0
  for (const item of items) {
    try {
      await apiClient.put(
        `/media/${item.mediaType}/${item.mediaId}/interactions/watchlisted`,
        {},
      )
      synced++
    } catch {
      failed++
    }
  }
  return { synced, failed }
}
