import { getDesktopAPI } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'
import { normalizePath } from './paths'

export interface ScannedFilesSummaryData {
  totalCount: number
  organizedCount: number
  unorganizedCount: number
  matchedCount: number
  isoCount: number
  installedCount: number
  organizedPercentage: number
  lastScannedAt?: string | null
}

export const SCANNED_SUMMARY_KEY_PREFIX = 'otix:scanned-files-summary'

export function getScannedSummaryStorageKey(nodeId?: number | null): string {
  return `${SCANNED_SUMMARY_KEY_PREFIX}:${nodeId ?? 'local'}`
}

export function loadStoredScannedSummary(nodeId?: number | null): ScannedFilesSummaryData | null {
  try {
    const raw = localStorage.getItem(getScannedSummaryStorageKey(nodeId))
    if (!raw) return null
    return JSON.parse(raw) as ScannedFilesSummaryData
  } catch {
    return null
  }
}

export function saveStoredScannedSummary(
  data: ScannedFilesSummaryData,
  nodeId?: number | null,
): void {
  try {
    localStorage.setItem(getScannedSummaryStorageKey(nodeId), JSON.stringify(data))
  } catch {
    // ignore
  }
}

const UNORGANIZED_PATTERNS = [
  /\[fitgirl[ _-]?repack\]/i,
  /\[dodi[ _-]?repack\]/i,
  /\[tinyrepack\]/i,
  /setup[-_]?\d*\.exe/i,
  /unins\d+\.exe/i,
  /\bpart\d+\.rar\b/i,
  /\.part\d+\./i,
  /\bcodex\b/i,
  /\bskidrow\b/i,
  /\bplaza\b/i,
  /\bflt\b/i,
  /\brune\b/i,
  /\brg[-_ ]mechanics\b/i,
  /\b_unpak\b/i,
  /\.tmp$/i,
]

const YEAR_ORGANIZED_PATTERN = /\((?:19\d\d|20\d\d)\)/

export function isPathOrganized(
  item: {
    path?: string
    installDir?: string
    exePath?: string
    status?: string
    platform?: string
    isOrganized?: boolean
  },
  installPath?: string,
  isoPath?: string,
): boolean {
  if (item.status === 'already_organized' || item.isOrganized === true) {
    return true
  }

  const p = item.installDir || item.exePath || item.path || ''
  if (!p) return false

  const normalized = normalizePath(p)

  // Check if it has obvious unorganized / release archive junk
  for (const pattern of UNORGANIZED_PATTERNS) {
    if (pattern.test(normalized)) {
      return false
    }
  }

  // Check if located in a configured install folder
  if (installPath && installPath.trim()) {
    const normInstall = normalizePath(installPath)
    if (normInstall && normalized.startsWith(normInstall)) {
      return true
    }
  }

  // Check if located in a configured ISO folder and has clean year
  if (isoPath && isoPath.trim()) {
    const normIso = normalizePath(isoPath)
    if (normIso && normalized.startsWith(normIso) && YEAR_ORGANIZED_PATTERN.test(normalized)) {
      return true
    }
  }

  // Check if path or folder matches standard "Title (Year)" pattern
  if (YEAR_ORGANIZED_PATTERN.test(normalized)) {
    return true
  }

  // Installed platform games (Steam, GOG, Epic) installed properly
  if (
    item.platform &&
    ['steam', 'gog', 'epic', 'ubisoft', 'ea', 'battlenet'].includes(item.platform)
  ) {
    return true
  }

  return false
}

export function computeScannedFilesSummary(
  games: Array<{
    id?: string
    path?: string
    exePath?: string
    installDir?: string
    platform?: string
    status?: string
    otixMediaId?: string | null
    otixMatchVerified?: boolean
    data?: any
    matchSuggestion?: any
    otixMatchSuggestion?: any
    isOrganized?: boolean
  }>,
  installPath?: string,
  isoPath?: string,
): ScannedFilesSummaryData {
  const totalCount = games.length
  let organizedCount = 0
  let matchedCount = 0
  let isoCount = 0
  let installedCount = 0

  for (const g of games) {
    const isIso = g.platform === 'iso'
    if (isIso) {
      isoCount++
    }

    const isInstalled = Boolean(
      g.installDir || (g.platform && g.platform !== 'iso' && g.platform !== 'unknown'),
    )
    if (isInstalled) {
      installedCount++
    }

    const isMatched = Boolean(
      g.otixMediaId || g.otixMatchVerified || g.data || g.matchSuggestion || g.otixMatchSuggestion,
    )
    if (isMatched) {
      matchedCount++
    }

    if (isPathOrganized(g, installPath, isoPath)) {
      organizedCount++
    }
  }

  const unorganizedCount = Math.max(0, totalCount - organizedCount)
  const organizedPercentage = totalCount > 0 ? Math.round((organizedCount / totalCount) * 100) : 0

  return {
    totalCount,
    organizedCount,
    unorganizedCount,
    matchedCount,
    isoCount,
    installedCount,
    organizedPercentage,
    lastScannedAt: new Date().toISOString(),
  }
}

export async function fetchDesktopScannedSummary(
  installPath?: string,
  isoPath?: string,
): Promise<ScannedFilesSummaryData> {
  const api =
    getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)

  if (!api?.getLocalGames) {
    return {
      totalCount: 0,
      organizedCount: 0,
      unorganizedCount: 0,
      matchedCount: 0,
      isoCount: 0,
      installedCount: 0,
      organizedPercentage: 0,
      lastScannedAt: null,
    }
  }

  try {
    const games = (await api.getLocalGames()) || []
    return computeScannedFilesSummary(games, installPath, isoPath)
  } catch {
    return {
      totalCount: 0,
      organizedCount: 0,
      unorganizedCount: 0,
      matchedCount: 0,
      isoCount: 0,
      installedCount: 0,
      organizedPercentage: 0,
      lastScannedAt: null,
    }
  }
}

export async function fetchNodeScannedSummary(
  nodeId: number,
  isoPath?: string,
  _installPath?: string,
): Promise<ScannedFilesSummaryData | null> {
  try {
    // Attempt organize preview first to obtain accurate organization status
    const previewRes = await apiClient.post<
      Array<{
        sourcePath?: string
        targetPath?: string
        status?: string
        matched?: boolean
        type?: string
      }>
    >(`/library/servers/${nodeId}/organize/preview`, {
      directory: isoPath || '',
      template: '',
    })

    const items = previewRes?.data
    if (Array.isArray(items) && items.length > 0) {
      let organizedCount = 0
      let matchedCount = 0
      let isoCount = 0

      for (const item of items) {
        if (item.status === 'already_organized') {
          organizedCount++
        }
        if (item.matched) {
          matchedCount++
        }
        if (item.type === 'iso' || item.type === 'rom') {
          isoCount++
        }
      }

      const totalCount = items.length
      const unorganizedCount = Math.max(0, totalCount - organizedCount)
      const organizedPercentage = totalCount > 0 ? Math.round((organizedCount / totalCount) * 100) : 0

      return {
        totalCount,
        organizedCount,
        unorganizedCount,
        matchedCount,
        isoCount,
        installedCount: Math.max(0, totalCount - isoCount),
        organizedPercentage,
        lastScannedAt: new Date().toISOString(),
      }
    }
  } catch {
    // Node preview endpoint might be empty or unavailable
  }

  // Fallback to cached summary or empty
  const stored = loadStoredScannedSummary(nodeId)
  if (stored) return stored

  return null
}
