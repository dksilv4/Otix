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

export const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

/** Returns true when the game ends within 48 hours. */
export const isEndingSoon = (dateStr: string | null | undefined): boolean => {
  if (!dateStr) return false
  const diff = new Date(dateStr).getTime() - Date.now()
  return diff > 0 && diff < 48 * 60 * 60 * 1000
}
