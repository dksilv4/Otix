import type { DiscoverContinueWatchingItem } from '../types'

/**
 * Returns human-readable remaining playback time (e.g., '24m left') or null.
 */
export const formatContinueWatchingRemaining = (
  viewOffset?: number,
  duration?: number,
): string | null => {
  if (!duration || !viewOffset || duration <= viewOffset) return null
  const remainingMs = duration - viewOffset
  if (remainingMs < 60000) return '<1m left'
  const minutes = Math.round(remainingMs / 60000)
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const remMin = minutes % 60
    return remMin > 0 ? `${hours}h ${remMin}m left` : `${hours}h left`
  }
  return `${minutes}m left`
}

/**
 * Resolves context subtitle for a continue watching item.
 */
export const getContinueWatchingSubtitle = (
  item: DiscoverContinueWatchingItem,
): string => {
  if (item.mediaType === 'show') {
    if (item.seasonNumber != null && item.episodeNumber != null) {
      return item.episodeTitle
        ? `S${item.seasonNumber}:E${item.episodeNumber} · ${item.episodeTitle}`
        : `S${item.seasonNumber}:E${item.episodeNumber}`
    }
    return item.episodeTitle || item.subtitle || ''
  }
  return item.year ? String(item.year) : item.subtitle || ''
}

/**
 * Resolves optimal artwork URL (wide backdrop/still preferred for 16:9 cards).
 */
export const getContinueWatchingArtwork = (
  item: DiscoverContinueWatchingItem,
): string | undefined => {
  return item.backdropUrl || item.thumb || undefined
}
