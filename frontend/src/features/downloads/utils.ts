/** Utility functions for downloads and transfers. */

import { formatBytes } from '@/lib/utils'
import { isLocalDesktopNode } from '@/features/settings/local-desktop-node'
import type { GameServer, ServerProwlarrRelease, ServerSabnzbdQueueItem, ServerDownloadHistoryItem } from './types'

/** Format ETA in seconds to human-readable string (e.g. "45s left", "3m 12s left", "1h 20m left"). */
export const formatEta = (seconds: number): string => {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return ''
  if (seconds < 60) return `${seconds}s left`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins < 60) return `${mins}m ${secs}s left`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  return `${hours}h ${remMins}m left`
}

/** Format transfer rate in bytes per second to human-readable speed (e.g. "12.4 MB/s"). */
export const formatDownloadSpeed = (bytesPerSec: number): string => {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s'
  return `${formatBytes(bytesPerSec)}/s`
}

/** Format downloaded / total progress description. */
export const formatTransferProgress = (downloaded: number, total: number): string => {
  return `${formatBytes(downloaded)} / ${formatBytes(total)}`
}

export const formatSize = (bytes: number | null): string => {
  if (!bytes) return '—'
  if (bytes > 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`
  if (bytes > 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes > 1_000) return `${(bytes / 1_000).toFixed(0)} KB`
  return `${bytes} B`
}

export const looksLikeAddressPaste = (val: string): boolean => {
  return /^https?:\/\//i.test(val) || val.includes(',') || /:\d+/.test(val) || /\/.+/.test(val)
}

export const connectionTestToneClass = (testResult?: { ok: boolean } | null): string => {
  if (!testResult) return '!bg-amber-400 !text-black hover:!bg-amber-300'
  if (testResult.ok) return '!bg-emerald-500 !text-white hover:!bg-emerald-400'
  return '!bg-rose-500 !text-white hover:!bg-rose-400'
}

export const protocolChip = (protocol?: string): { label: string; className: string } => {
  const p = (protocol || '').toLowerCase()
  if (p === 'usenet') {
    return { label: 'Usenet', className: 'bg-cyan-500/15 text-cyan-300' }
  }
  if (p === 'torrent') {
    return { label: 'Torrent', className: 'bg-amber-500/15 text-amber-300' }
  }
  return { label: protocol || 'Unknown', className: 'bg-white/10 text-white/50' }
}

export const importEligibleNodes = (servers: GameServer[]): GameServer[] => {
  return servers.filter((server) => !isLocalDesktopNode(server) && Number(server.id) > 0)
}

export const pickDefaultPair = (
  nodes: GameServer[],
  preferredDestId?: number,
): { fromId: number | null; toId: number | null } => {
  if (nodes.length < 2) return { fromId: null, toId: null }
  const preferredDest = nodes.find((server) => server.id === preferredDestId) ?? null
  const to = preferredDest ?? nodes[0]
  const from = nodes.find((server) => server.id !== to.id) ?? null
  return { fromId: from?.id ?? null, toId: to.id }
}

export const normalizeReleaseKey = (str: string): string => {
  return str.toLowerCase().replace(/[\s._-]+/g, ' ').trim()
}

export const findReleaseQueueItem = (
  release: ServerProwlarrRelease,
  queueItems: ServerSabnzbdQueueItem[],
  trackedNzoId?: string,
): ServerSabnzbdQueueItem | null => {
  if (trackedNzoId) {
    const direct = queueItems.find((item) => item.nzo_id === trackedNzoId)
    if (direct) return direct
  }
  const cleanTitle = normalizeReleaseKey(release.title)
  if (!cleanTitle) return null
  return (
    queueItems.find((item) => {
      if (item.nzo_id === release.guid) return true
      const itemTitle = normalizeReleaseKey(item.filename)
      if (!itemTitle) return false
      return itemTitle === cleanTitle || itemTitle.includes(cleanTitle) || cleanTitle.includes(itemTitle)
    }) || null
  )
}

export const findReleaseHistoryItem = (
  release: ServerProwlarrRelease,
  historyItems: ServerDownloadHistoryItem[],
  trackedNzoId?: string,
): ServerDownloadHistoryItem | null => {
  if (trackedNzoId) {
    const direct = historyItems.find((item) => item.nzo_id === trackedNzoId)
    if (direct) return direct
  }
  const cleanTitle = normalizeReleaseKey(release.title)
  if (!cleanTitle) return null
  return (
    historyItems.find((item) => {
      if (item.nzo_id === release.guid) return true
      const itemTitle = normalizeReleaseKey(item.title)
      if (!itemTitle) return false
      return itemTitle === cleanTitle || itemTitle.includes(cleanTitle) || cleanTitle.includes(itemTitle)
    }) || null
  )
}

export const isRawDownloadId = (name?: string | null, nzoId?: string | null): boolean => {
  if (!name) return true
  const s = name.trim().toLowerCase()
  if (!s) return true
  if (nzoId && s === nzoId.trim().toLowerCase()) return true
  return s.startsWith('sabnzbd_nzo_') || s.startsWith('nzo_')
}

export const resolveDownloadDisplayTitle = (
  item: { title?: string | null; filename?: string | null; nzo_id?: string | null },
  fallback = 'Usenet Download',
): string => {
  if (item.title && !isRawDownloadId(item.title, item.nzo_id)) {
    return item.title
  }
  if (item.filename && !isRawDownloadId(item.filename, item.nzo_id)) {
    return item.filename
  }
  return item.title || item.filename || item.nzo_id || fallback
}

export const formatRelativeTime = (isoString?: string | null): string => {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return ''
  const now = Date.now()
  const diffSec = Math.floor((now - date.getTime()) / 1000)
  if (diffSec < 60) return 'Just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export const statusBadgeConfig = (status: string): { label: string; className: string } => {
  const s = (status || '').toLowerCase()
  if (s === 'completed' || s === 'complete') {
    return { label: 'Completed', className: 'bg-[var(--status-online)]/15 text-[var(--status-online)]' }
  }
  if (s === 'failed' || s === 'fail' || s === 'error') {
    return { label: 'Failed', className: 'bg-destructive/10 text-destructive' }
  }
  if (s === 'cancelled' || s === 'canceled' || s === 'deleted') {
    return { label: 'Cancelled', className: 'bg-[var(--dk-surface-ghost)] text-muted-foreground' }
  }
  if (s.includes('extract') || s.includes('repair') || s.includes('verif') || s.includes('unpack') || s.includes('post')) {
    return { label: 'Processing', className: 'bg-primary/15 text-primary' }
  }
  if (s.includes('pause')) {
    return { label: 'Paused', className: 'bg-[var(--status-warning)]/15 text-[var(--status-warning)]' }
  }
  return { label: status || 'Queued', className: 'bg-primary/15 text-primary' }
}

export const filterHistoryItems = (
  items: ServerDownloadHistoryItem[],
  statusFilter: 'all' | 'completed' | 'failed' | 'cancelled',
  searchQuery: string,
): ServerDownloadHistoryItem[] => {
  return items.filter((item) => {
    const s = (item.status || '').toLowerCase()
    if (statusFilter === 'completed' && s !== 'completed' && s !== 'complete') return false
    if (statusFilter === 'failed' && s !== 'failed' && s !== 'fail' && s !== 'error') return false
    if (statusFilter === 'cancelled' && s !== 'cancelled' && s !== 'canceled' && s !== 'deleted') return false

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      const titleMatch = (item.title || '').toLowerCase().includes(q)
      const nzoMatch = (item.nzo_id || '').toLowerCase().includes(q)
      if (!titleMatch && !nzoMatch) return false
    }
    return true
  })
}

export const kindLabel = (kind?: 'game' | 'update' | 'dlc' | 'other', version?: string | null) => {
  if (kind === 'update') {
    return {
      label: version ? `Update ${version}` : 'Update',
      className: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
    }
  }
  if (kind === 'dlc') {
    return {
      label: 'DLC',
      className: 'bg-violet-500/15 text-violet-300 border-violet-400/30',
    }
  }
  if (kind === 'game') {
    return {
      label: version ? `Game v${version}` : 'Game',
      className: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
    }
  }
  return null
}

export const seederClass = (seeders: number): string => {
  if (seeders >= 20) return 'text-emerald-400'
  if (seeders >= 5) return 'text-amber-400'
  return 'text-white/45'
}
