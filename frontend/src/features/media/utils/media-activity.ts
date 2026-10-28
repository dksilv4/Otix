import type { MediaActivityStatus } from '../types/media-activity'

export const resolveActivityLookupKeys = (
  mediaType?: string,
  tmdbId?: string | number | null,
  mediaId?: string | number | null,
): string[] => {
  const keys: string[] = []
  const type = mediaType === 'show' ? 'show' : 'movie'

  if (tmdbId) {
    keys.push(`tmdb:${type}:${tmdbId}`)
    keys.push(String(tmdbId))
  }

  if (mediaId) {
    const rawId = String(mediaId)
    keys.push(`tmdb:${type}:${rawId}`)
    keys.push(rawId)

    const parsedTmdb = /^tmdb:(?:movie:|show:)?(\d+)$/i.exec(rawId)?.[1]
    if (parsedTmdb) {
      keys.push(`tmdb:${type}:${parsedTmdb}`)
      keys.push(parsedTmdb)
    }
  }

  return keys
}

export const formatActivityStatusLabel = (
  status: MediaActivityStatus,
  isPartial?: boolean,
  episodeCount?: number,
  totalEpisodes?: number,
): string => {
  switch (status) {
    case 'processing':
      return 'Processing Download'
    case 'requested':
      return 'Requested on Node'
    case 'available':
      if (isPartial && episodeCount != null && totalEpisodes != null) {
        return `Available (${episodeCount}/${totalEpisodes} episodes)`
      }
      return 'Available to Stream'
    default:
      return 'Activity'
  }
}

export const formatActivityTooltip = (
  status: MediaActivityStatus,
  nodeName?: string,
  ownerName?: string,
  isOwned?: boolean,
  progress?: number,
): string => {
  const nodeLabel = nodeName ? ` · ${nodeName}` : ''
  const friendLabel = !isOwned && ownerName ? ` (via ${ownerName})` : ''

  switch (status) {
    case 'processing':
      return `Downloading${progress != null ? ` (${progress.toFixed(0)}%)` : ''}${nodeLabel}${friendLabel}`
    case 'requested':
      return `Requested${nodeLabel}${friendLabel}`
    case 'available':
      return `Available to stream${nodeLabel}${friendLabel}`
    default:
      return 'Media Activity'
  }
}

export const formatActivityBytes = (bytes?: number | null): string => {
  if (bytes == null || isNaN(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const formatted = (bytes / Math.pow(1024, i)).toFixed(1)
  return `${formatted} ${units[i]}`
}
