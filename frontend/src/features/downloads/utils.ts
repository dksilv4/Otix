/** Utility functions for downloads and transfers. */

import { formatBytes } from '@/lib/utils'

/** Format ETA in seconds to human-readable string (e.g. "45s left", "3m 12s left", "1h 20m left"). */
export function formatEta(seconds: number): string {
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
export function formatDownloadSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s'
  return `${formatBytes(bytesPerSec)}/s`
}

/** Format downloaded / total progress description. */
export function formatTransferProgress(downloaded: number, total: number): string {
  return `${formatBytes(downloaded)} / ${formatBytes(total)}`
}
