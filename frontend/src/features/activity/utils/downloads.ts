import { formatBytes } from '@/lib/utils'
import type { ServerDownloadHistoryItem } from '@/features/downloads/usenet-types'
import type { ServerArrQueueItem } from '@/features/downloads/arr-types'
import type { Download } from '@/features/downloads/types'
import type { ServerSabnzbdQueueItem } from '@/features/downloads/types'
import { resolveDownloadDisplayTitle } from '@/features/downloads/utils'

export const historyMeta = (item: ServerDownloadHistoryItem): string => {
  const parts: string[] = [(item.protocol || 'usenet').toUpperCase(), item.status]
  if (item.size_bytes) parts.push(formatBytes(item.size_bytes))
  return parts.join(' · ')
}

export interface DownloadsSummary {
  totalActive: number
  isDownloading: boolean
  activeSpeed: string | null
  primaryItemTitle: string | null
  primaryProgress: number
  hasDownloads: boolean
}

export const computeDownloadsSummary = ({
  localDownloads = [],
  serverItems = [],
  sonarrRecords = [],
  radarrRecords = [],
  usenetSpeed,
}: {
  localDownloads?: Download[]
  serverItems?: ServerSabnzbdQueueItem[]
  sonarrRecords?: ServerArrQueueItem[]
  radarrRecords?: ServerArrQueueItem[]
  usenetSpeed?: string | null
}): DownloadsSummary => {
  const activeLocal = localDownloads.filter(
    (d) => d.status === 'queued' || d.status === 'downloading' || d.status === 'processing',
  )

  const activeSonarr = sonarrRecords.filter((r) => {
    const s = (r.status || '').toLowerCase()
    return s.includes('download') || s.includes('queue') || s.includes('grab')
  })

  const activeRadarr = radarrRecords.filter((r) => {
    const s = (r.status || '').toLowerCase()
    return s.includes('download') || s.includes('queue') || s.includes('grab')
  })

  // Deduplicate serverItems that match sonarr/radarr downloadId
  const claimedNzos = new Set<string>()
  for (const r of sonarrRecords) {
    if (r.downloadId) claimedNzos.add(r.downloadId)
    if (r.download_id) claimedNzos.add(r.download_id)
  }
  for (const r of radarrRecords) {
    if (r.downloadId) claimedNzos.add(r.downloadId)
    if (r.download_id) claimedNzos.add(r.download_id)
  }

  const unclaimedServer = serverItems.filter((item) => !claimedNzos.has(item.nzo_id))

  const totalActive =
    activeLocal.length + unclaimedServer.length + activeSonarr.length + activeRadarr.length

  const hasDownloads = totalActive > 0 || localDownloads.length > 0 || serverItems.length > 0

  const isDownloading =
    activeLocal.some((d) => d.status === 'downloading') ||
    activeSonarr.some((r) => (r.status || '').toLowerCase().includes('download')) ||
    activeRadarr.some((r) => (r.status || '').toLowerCase().includes('download')) ||
    serverItems.some((s) => (s.status || '').toLowerCase().includes('download'))

  // Find primary downloading item to show in summary preview
  let primaryItemTitle: string | null = null
  let primaryProgress = 0

  if (activeSonarr.length > 0) {
    const first = activeSonarr[0]
    const show = first.showTitle || first.show_title || first.series?.title
    const season = first.seasonNumber ?? first.season_number
    const ep = first.episodeNumber ?? first.episode_number
    const epLabel = season != null && ep != null ? ` S${String(season).padStart(2, '0')}E${String(ep).padStart(2, '0')}` : ''
    primaryItemTitle = show ? `${show}${epLabel}` : first.title
    if (first.size && first.size > 0) {
      const left = first.sizeLeft ?? first.size_left ?? 0
      primaryProgress = Math.min(100, Math.max(0, ((first.size - left) / first.size) * 100))
    }
  } else if (activeRadarr.length > 0) {
    const first = activeRadarr[0]
    primaryItemTitle = first.movieTitle || first.movie_title || first.movie?.title || first.title
    if (first.size && first.size > 0) {
      const left = first.sizeLeft ?? first.size_left ?? 0
      primaryProgress = Math.min(100, Math.max(0, ((first.size - left) / first.size) * 100))
    }
  } else if (unclaimedServer.length > 0) {
    const first = unclaimedServer[0]
    primaryItemTitle = resolveDownloadDisplayTitle(first)
    primaryProgress = Math.min(100, Math.max(0, first.percentage ?? 0))
  } else if (activeLocal.length > 0) {
    const first = activeLocal[0]
    primaryItemTitle = first.mediaItemTitle ?? first.nzbName ?? 'Download'
    primaryProgress = first.percentage ?? 0
  }

  const activeSpeed =
    (usenetSpeed && usenetSpeed !== '0 B/s' && usenetSpeed !== '0 KB/s' ? usenetSpeed : null) ||
    serverItems.find((s) => s.speed && s.speed !== '0 B/s')?.speed ||
    null

  return {
    totalActive,
    isDownloading,
    activeSpeed,
    primaryItemTitle,
    primaryProgress: Math.round(primaryProgress),
    hasDownloads,
  }
}
