export const STORE_LABELS: Record<string, string> = {
  epic: 'Epic Games',
  steam: 'Steam',
  gog: 'GOG',
}

export const storeLabel = (store: string, storeName?: string | null): string => {
  return STORE_LABELS[store] || storeName || store
}

export const formatTimeRemaining = (dateStr: string | null | undefined): string | null => {
  if (!dateStr) return null
  const target = new Date(dateStr).getTime()
  const now = Date.now()
  const diff = target - now
  if (diff <= 0) return 'Ending soon'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (days > 1) return `${days}d ${hours}h left`
  if (days === 1) return `1d ${hours}h left`
  if (hours > 0) return `${hours}h ${mins}m left`
  if (mins > 0) return `${mins}m left`
  return 'Ending soon'
}

export { formatMonthDay as formatDate } from '@/lib/utils/format-date'

/** Returns true when the game ends within 48 hours. */
export const isEndingSoon = (dateStr: string | null | undefined): boolean => {
  if (!dateStr) return false
  const diff = new Date(dateStr).getTime() - Date.now()
  return diff > 0 && diff < 48 * 60 * 60 * 1000
}

export const isSteamPackItem = (item: { store?: string | null; itemType?: string | null }): boolean => {
  if (item.store?.toLowerCase() !== 'steam') return false
  const type = item.itemType?.toLowerCase()
  return type === 'dlc' || type === 'pack' || type === 'bundle'
}

// ── Claimed Free Games Persistence ──────────────────────────────────────────

export const CLAIMED_FREE_GAMES_STORAGE_KEY = 'otix:claimed-free-games'
export const CLAIMED_FREE_GAMES_CHANGED_EVENT = 'otix:claimed-free-games-changed'
export const HIDE_CLAIMED_FREE_GAMES_STORAGE_KEY = 'otix:hide-claimed-free-games'
export const HIDE_CLAIMED_FREE_GAMES_CHANGED_EVENT = 'otix:hide-claimed-free-games-changed'

export const getFreeGameClaimKey = (item: {
  store?: string | null
  id?: string | number | null
  externalId?: string | number | null
}): string => {
  const store = (item.store || 'game').toLowerCase().trim()
  const rawId = String(item.id ?? item.externalId ?? '').trim()
  if (!rawId) return store
  if (rawId.toLowerCase().startsWith(`${store}:`)) {
    return rawId.toLowerCase()
  }
  return `${store}:${rawId}`.toLowerCase()
}

export const readClaimedFreeGames = (): string[] => {
  try {
    const raw = localStorage.getItem(CLAIMED_FREE_GAMES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map((k) => String(k).toLowerCase()) : []
  } catch {
    return []
  }
}

export const writeClaimedFreeGames = (keys: string[]): void => {
  try {
    const unique = Array.from(new Set(keys.map((k) => k.toLowerCase())))
    localStorage.setItem(CLAIMED_FREE_GAMES_STORAGE_KEY, JSON.stringify(unique))
  } catch {
    // Ignore storage write quota error
  }
}

export const readHideClaimedPreference = (): boolean => {
  try {
    return localStorage.getItem(HIDE_CLAIMED_FREE_GAMES_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export const writeHideClaimedPreference = (hide: boolean): void => {
  try {
    localStorage.setItem(HIDE_CLAIMED_FREE_GAMES_STORAGE_KEY, String(hide))
  } catch {
    // Ignore storage write quota error
  }
}
