import type { ServerArrQueueItem } from '@/features/downloads/arr-types'
import { resolveEpisodeMetadata } from '@/features/downloads/utils/episode-download'

export interface MatchMediaOptions {
  mediaId?: string | number | null
  tmdbId?: string | number | null
  tvdbId?: string | number | null
  title?: string | null
}

/**
 * Checks whether an Arr queue record belongs to a given media item by
 * Otix mediaItemId, TMDb ID, TVDb ID, or normalized title prefix match.
 */
export const isMatchingArrRecord = (
  record: ServerArrQueueItem,
  opts: MatchMediaOptions,
): boolean => {
  if (!record) return false

  const targetMediaId = opts.mediaId != null ? String(opts.mediaId).trim() : ''
  const targetTmdb = opts.tmdbId != null ? String(opts.tmdbId).trim() : ''
  const targetTvdb = opts.tvdbId != null ? String(opts.tvdbId).trim() : ''
  const targetTitle = (opts.title || '').trim().toLowerCase()

  // 1. Direct Otix mediaItemId match
  const recMediaId = record.mediaItemId ?? (record as any).media_item_id
  if (targetMediaId && recMediaId != null && String(recMediaId).trim() === targetMediaId) {
    return true
  }

  // 2. TMDb ID match
  const recTmdb =
    record.tmdbId ??
    (record as any).tmdb_id ??
    record.movie?.tmdbId ??
    record.series?.tmdbId
  if (targetTmdb && recTmdb != null && String(recTmdb).trim() === targetTmdb) {
    return true
  }

  // 3. TVDb ID match
  const recTvdb = record.series?.tvdbId ?? (record as any).tvdbId ?? (record as any).tvdb_id
  if (targetTvdb && recTvdb != null && String(recTvdb).trim() === targetTvdb) {
    return true
  }

  // 4. Title match
  if (targetTitle) {
    const showTitle = (record.showTitle || (record as any).show_title || record.series?.title || '').trim().toLowerCase()
    const movieTitle = (record.movieTitle || (record as any).movie_title || record.movie?.title || '').trim().toLowerCase()
    const releaseTitle = (record.title || '').trim().toLowerCase()
    const normalizedRelease = releaseTitle.replace(/[._-]+/g, ' ')

    if (showTitle && (showTitle === targetTitle || showTitle.includes(targetTitle))) {
      return true
    }
    if (movieTitle && (movieTitle === targetTitle || movieTitle.includes(targetTitle))) {
      return true
    }
    if (normalizedRelease.startsWith(targetTitle)) {
      return true
    }
  }

  return false
}

/**
 * Checks whether a record matches a specific season and episode number.
 */
export const matchEpisodeRecord = (
  record: ServerArrQueueItem,
  seasonNumber: number,
  episodeNumber: number,
): boolean => {
  const meta = resolveEpisodeMetadata(record)
  return meta.seasonNumber === seasonNumber && meta.episodeNumber === episodeNumber
}

/**
 * Resolves the live download speed for a queue item by matching
 * its download client ID against SABnzbd / Usenet queue items, or reading its speed property.
 */
export const resolveItemSpeed = (
  record: ServerArrQueueItem,
  usenetItems?: Array<{ nzoId?: string; nzo_id?: string; speed?: string }>,
  fallbackSpeed?: string | null,
): string | null => {
  const downloadId = record.downloadId || (record as any).download_id
  if (downloadId && usenetItems && usenetItems.length > 0) {
    const matched = usenetItems.find((u) => (u.nzoId || u.nzo_id) === downloadId)
    if (matched?.speed && matched.speed !== '0 B/s' && matched.speed !== '0 KB/s') {
      return matched.speed
    }
  }

  const directSpeed = (record as any).speed
  if (typeof directSpeed === 'string' && directSpeed.trim() && directSpeed !== '0 B/s') {
    return directSpeed.trim()
  }

  if (fallbackSpeed && fallbackSpeed !== '0 B/s' && fallbackSpeed !== '0 KB/s') {
    return fallbackSpeed
  }

  return null
}

export interface AggregatedQueueProgress {
  overallProgress: number
  totalSize: number
  totalRemaining: number
  speed: string | null
  eta: string | null
  activeCount: number
}

/**
 * Aggregates progress, size, speed and ETA across matched queue records.
 */
export const aggregateQueueProgress = (
  records: ServerArrQueueItem[],
  usenetItems?: Array<{ nzoId?: string; nzo_id?: string; speed?: string }>,
  fallbackSpeed?: string | null,
): AggregatedQueueProgress => {
  if (!records || records.length === 0) {
    return {
      overallProgress: 0,
      totalSize: 0,
      totalRemaining: 0,
      speed: null,
      eta: null,
      activeCount: 0,
    }
  }

  let totalSize = 0
  let totalRemaining = 0
  let primarySpeed: string | null = null
  let primaryEta: string | null = null

  for (const rec of records) {
    const size = rec.size || 0
    const left = rec.sizeLeft ?? (rec as any).size_left ?? 0
    totalSize += size
    totalRemaining += left

    if (!primarySpeed) {
      primarySpeed = resolveItemSpeed(rec, usenetItems, null)
    }

    if (!primaryEta) {
      const timeleft = rec.timeleft || (rec as any).estimatedCompletionTime || (rec as any).estimated_completion_time
      if (timeleft && timeleft !== '00:00:00') {
        primaryEta = timeleft
      }
    }
  }

  const rawOverallProgress =
    totalSize > 0
      ? Math.min(100, Math.max(0, ((totalSize - totalRemaining) / totalSize) * 100))
      : records
          .map((r) => resolveEpisodeMetadata(r).percentage)
          .reduce((acc, p) => acc + p, 0) / (records.length || 1)

  return {
    overallProgress: Math.round(rawOverallProgress * 10) / 10,
    totalSize,
    totalRemaining,
    speed: primarySpeed || fallbackSpeed || null,
    eta: primaryEta || null,
    activeCount: records.length,
  }
}

/**
 * Checks whether an Arr queue item has finished downloading / importing.
 */
export const isArrQueueItemComplete = (record: ServerArrQueueItem): boolean => {
  if (!record) return false

  const size = record.size || 0
  const sizeLeft = record.sizeLeft ?? (record as any).size_left ?? 0
  const status = (record.status || '').toLowerCase()
  const trackedStatus = String((record as any).trackedDownloadStatus || '').toLowerCase()

  if (['completed', 'downloaded', 'imported'].includes(status)) {
    return true
  }

  if (['completed', 'ok'].includes(trackedStatus) && size > 0 && sizeLeft <= 0) {
    return true
  }

  if (size > 0 && sizeLeft <= 0) {
    return true
  }

  const meta = resolveEpisodeMetadata(record)
  if (meta.percentage >= 100 && (sizeLeft <= 0 || !size)) {
    return true
  }

  return false
}
