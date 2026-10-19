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

/**
 * Split and clean raw release notes into individual bullet points
 */
export const parseReleaseNotes = (raw: string | null | undefined): string[] => {
  if (!raw || typeof raw !== 'string') return []
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^([*\-•]|\d+\.)\s+/, '').trim())
    .filter(Boolean)
}

export const STORAGE_KEY_AUTO_CHECK = 'otix:updater:auto-check'
export const STORAGE_KEY_AUTO_DOWNLOAD = 'otix:updater:auto-download'

export const readAutoCheckPreference = (): boolean => {
  try {
    const val = localStorage.getItem(STORAGE_KEY_AUTO_CHECK)
    return val === null ? true : val === 'true'
  } catch {
    return true
  }
}

export const saveAutoCheckPreference = (enabled: boolean): void => {
  try {
    localStorage.setItem(STORAGE_KEY_AUTO_CHECK, String(enabled))
  } catch {
    // ignore
  }
}

export const readAutoDownloadPreference = (): boolean => {
  try {
    const val = localStorage.getItem(STORAGE_KEY_AUTO_DOWNLOAD)
    return val === null ? true : val === 'true'
  } catch {
    return true
  }
}

export const saveAutoDownloadPreference = (enabled: boolean): void => {
  try {
    localStorage.setItem(STORAGE_KEY_AUTO_DOWNLOAD, String(enabled))
  } catch {
    // ignore
  }
}
