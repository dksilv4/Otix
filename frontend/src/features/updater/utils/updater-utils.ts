import type { UpdateStatus } from '@/lib/desktop/api'

/**
 * Format bytes into readable string (e.g. 14.2 MB)
 */
export const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const clampedI = Math.min(i, units.length - 1)
  const val = bytes / Math.pow(1024, clampedI)
  return `${val.toFixed(clampedI > 0 ? 1 : 0)} ${units[clampedI]}`
}

/**
 * Format download transfer rate (e.g. 2.4 MB/s)
 */
export const formatSpeed = (bytesPerSecond: number): string => {
  if (!bytesPerSecond || bytesPerSecond <= 0) return '0 KB/s'
  return `${formatBytes(bytesPerSecond)}/s`
}

/**
 * Human-readable label for updater status
 */
export const getUpdateStatusLabel = (status: UpdateStatus, version?: string): string => {
  switch (status) {
    case 'checking':
      return 'Checking for updates...'
    case 'available':
      return version ? `Update v${version} available` : 'New update available'
    case 'downloading':
      return 'Downloading update...'
    case 'downloaded':
      return version ? `Version v${version} ready to install` : 'Update ready to install'
    case 'not-available':
      return 'Otix is up to date'
    case 'error':
      return 'Update check failed'
    case 'idle':
    default:
      return 'Up to date'
  }
}
