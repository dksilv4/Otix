import { isTitleMatch } from '@media'
import { releaseMatchesSearchHint } from './release-parse'
import type { ServerGameFile } from './types'
import type { ServerDownloadHistoryItem } from './usenet-types'

type HistoryRow = ServerDownloadHistoryItem & {
  nzoId?: string
  mediaItemId?: string | null
  sizeBytes?: number
}

function historyNzoId(item: HistoryRow): string {
  return item.nzoId || item.nzo_id || ''
}

function historyMediaId(item: HistoryRow): string {
  return (item.mediaItemId || item.media_item_id || '').trim()
}

export function matchServerGameFile(
  files: ServerGameFile[] | undefined,
  mediaId?: string | null,
  mediaTitle?: string | null,
): ServerGameFile | null {
  if (!files?.length) return null
  const id = mediaId?.trim() || ''
  const title = mediaTitle?.trim() || ''
  return (
    files.find((file) => {
      if (id && file.catalogItem?.id === id) return true
      if (title && file.catalogItem?.title && isTitleMatch(file.catalogItem.title, title)) return true
      if (title && isTitleMatch(file.gameTitle, title)) return true
      if (title && (releaseMatchesSearchHint(file.filename, title) || releaseMatchesSearchHint(file.gameTitle, title))) {
        return true
      }
      return false
    }) || null
  )
}

export function findCompletedServerDownload(
  items: ServerDownloadHistoryItem[] | undefined,
  mediaId?: string | null,
  mediaTitle?: string | null,
): ServerDownloadHistoryItem | null {
  if (!items?.length) return null
  const id = mediaId?.trim() || ''
  const title = mediaTitle?.trim() || ''
  const completed = items.filter((item) => (item.status || '').toLowerCase() === 'completed')
  if (!completed.length) return null

  if (id) {
    const byMedia = completed.find((item) => historyMediaId(item) === id)
    if (byMedia) return byMedia
  }
  if (title) {
    return (
      completed.find(
        (item) => isTitleMatch(item.title, title) || releaseMatchesSearchHint(item.title, title),
      ) || null
    )
  }
  return null
}

export function completedDownloadKey(item: ServerDownloadHistoryItem | null | undefined): string | null {
  if (!item) return null
  return historyNzoId(item) || null
}

export function completedDownloadSize(item: ServerDownloadHistoryItem | null | undefined): number | null {
  if (!item) return null
  const row = item as HistoryRow
  const size = row.sizeBytes ?? row.size_bytes
  return size && size > 0 ? size : null
}

export function serverInstallCaption(opts: {
  serverName?: string | null
  filesize?: number | null
  indexed: boolean
  formatBytes?: (bytes: number) => string
}): { button: string; caption: string; title: string } {
  const name = opts.serverName?.trim() || 'server'
  const size =
    opts.filesize && opts.filesize > 0 && opts.formatBytes ? ` · ${opts.formatBytes(opts.filesize)}` : ''
  if (opts.indexed) {
    return {
      button: 'Install',
      caption: `On ${name}${size}`,
      title: `On ${name}, not installed on this device`,
    }
  }
  return {
    button: 'Install',
    caption: `Ready on ${name}`,
    title: `Downloaded to ${name} — not installed on this device`,
  }
}
