import type { UpdateStatus } from '@/lib/desktop/api'

import { formatBytes } from '@/lib/utils/format-bytes'
export { formatBytes }

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
 * Title helper for UpdateModal
 */
export const getUpdateModalTitle = (
  status: UpdateStatus,
  isDownloaded: boolean,
  isDownloading: boolean
): string => {
  if (isDownloaded) return 'Update Ready to Install'
  if (isDownloading) return 'Downloading Update'
  if (status === 'available') return 'New Update Available'
  if (status === 'error') return 'Update Error'
  if (status === 'not-available') return 'Otix is Up to Date'
  return 'Software Update'
}

/**
 * Description helper for UpdateModal
 */
export const getUpdateModalDescription = (
  status: UpdateStatus,
  isDownloaded: boolean,
  isDownloading: boolean
): string => {
  if (isDownloaded) return 'The latest version has been downloaded and is ready to apply.'
  if (isDownloading) return 'Downloading the update package in the background.'
  if (status === 'available') return 'A newer release is available with updates and improvements.'
  if (status === 'error') return 'Could not complete update check or download.'
  if (status === 'not-available') return 'You are running the newest version of Otix.'
  return 'Manage client software updates and release notes.'
}

export interface LatestReleaseNotesResult {
  version: string
  notes: string
  publishedAt?: string
}

let cachedReleaseNotes: LatestReleaseNotesResult | null = null

/**
 * Fetch the latest release details and notes directly from GitHub releases API.
 */
export const fetchLatestReleaseNotes = async (): Promise<LatestReleaseNotesResult | null> => {
  if (cachedReleaseNotes) {
    return cachedReleaseNotes
  }
  try {
    const res = await fetch('https://api.github.com/repos/dksilv4/Otix/releases/latest', {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      tag_name?: string
      name?: string
      body?: string
      published_at?: string
    }
    const version = data.tag_name ? data.tag_name.replace(/^v/, '') : data.name || ''
    const notes = data.body || ''
    cachedReleaseNotes = {
      version,
      notes,
      publishedAt: data.published_at,
    }
    return cachedReleaseNotes
  } catch {
    return null
  }
}

/**
 * Animation variant for UpdateNotificationToast
 */
export const toastAnimation = {
  initial: { opacity: 0, y: 30, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 20, scale: 0.95 },
}

/**
 * Split and clean raw release notes into individual bullet points.
 * Filters out top-level markdown headings (#, ##, ###), horizontal dividers,
 * and automated compare URLs / footers.
 */
export const parseReleaseNotes = (raw: string | null | undefined): string[] => {
  if (!raw || typeof raw !== 'string') return []
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^#+\s+/.test(line))
    .filter((line) => !/^[-*_]{3,}$/.test(line))
    .filter((line) => !/^\*\*Full Changelog\*\*/i.test(line))
    .filter((line) => !/^Full Changelog:/i.test(line))
    .map((line) => line.replace(/^([*\-•]|\d+\.)\s+/, '').trim())
    .filter(Boolean)
}

export const STORAGE_KEY_AUTO_CHECK = 'otix:updater:auto-check'
export const STORAGE_KEY_AUTO_DOWNLOAD = 'otix:updater:auto-download'
export const STORAGE_KEY_ALLOW_PRERELEASE = 'otix:updater:allow-prerelease'

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

export const readAllowPrereleasePreference = (): boolean => {
  try {
    const val = localStorage.getItem(STORAGE_KEY_ALLOW_PRERELEASE)
    return val === null ? false : val === 'true'
  } catch {
    return false
  }
}

export const saveAllowPrereleasePreference = (enabled: boolean): void => {
  try {
    localStorage.setItem(STORAGE_KEY_ALLOW_PRERELEASE, String(enabled))
  } catch {
    // ignore
  }
}

/**
 * Sanitize and format updater errors into user-friendly messages,
 * hiding verbose HTTP headers, raw JSON, and 404/atom-feed noise.
 */
export const formatUpdateError = (raw: string | null | undefined): string | null => {
  if (!raw) return null
  const str = String(raw).trim()
  if (
    str.includes('releases.atom') ||
    (str.includes('404') && (str.includes('github.com') || str.includes('dksilv4/Otix')))
  ) {
    return 'Update check unavailable: release servers returned 404.'
  }
  if (str.includes('403') || str.includes('rate limit exceeded')) {
    return 'GitHub API rate limit exceeded. Please try again later.'
  }
  if (
    str.includes('ERR_INTERNET_DISCONNECTED') ||
    str.includes('ERR_NAME_NOT_RESOLVED') ||
    str.includes('ENOTFOUND')
  ) {
    return 'Network error: Unable to reach update servers. Check your connection.'
  }
  if (str.includes('ETIMEDOUT')) {
    return 'Connection timed out while checking for updates.'
  }
  if (str.includes('sha512 checksum mismatch')) {
    return 'Update package verification failed: Checksum mismatch.'
  }
  if (str.includes('method: GET url:') || /^(?:404|500|502|503)\b/.test(str)) {
    const firstLine = str.split('\n')[0]
    return firstLine.replace(/^\d+\s+["']?/, '').replace(/["']$/, '').trim() || 'Failed to check for updates.'
  }
  return str
}

/**
 * Format ISO timestamp into a user-friendly release date (e.g. Oct 21, 2026)
 */
export const formatReleaseNotesDate = (isoDate?: string | null): string => {
  if (!isoDate) return ''
  try {
    const d = new Date(isoDate)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

