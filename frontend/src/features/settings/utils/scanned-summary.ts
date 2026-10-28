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
  installPath?: string,
): Promise<ScannedFilesSummaryData | null> {
  // First query the indexed server games from the node
  try {
    const { data } = await apiClient.get<any>('/library/server-games')
    const files = Array.isArray(data) ? data : data?.files || []
    const nodeFiles = files.filter(
      (f: any) => f.serverId === nodeId || f.server_id === nodeId || !f.serverId,
    )

    if (nodeFiles.length > 0) {
      let isoCount = 0
      let matchedCount = 0
      let organizedCount = 0

      for (const f of nodeFiles) {
        const isIso =
          f.formatCategory === 'iso' ||
          f.extension?.toLowerCase() === '.iso' ||
          Boolean(f.isIso || f.is_iso)
        if (isIso) {
          isoCount++
        }
        if (f.otixMediaId || f.otixTitle || f.matched || f.otixMetadata) {
          matchedCount++
        }
        if (
          isPathOrganized(
            {
              path: f.filepath || f.relativePath || f.filename,
              platform: isIso ? 'iso' : undefined,
              isOrganized: f.isOrganized,
            },
            installPath,
            isoPath,
          )
        ) {
          organizedCount++
        }
      }

      const totalCount = nodeFiles.length
      const unorganizedCount = Math.max(0, totalCount - organizedCount)
      const organizedPercentage =
        totalCount > 0 ? Math.round((organizedCount / totalCount) * 100) : 0

      const summary: ScannedFilesSummaryData = {
        totalCount,
        organizedCount,
        unorganizedCount,
        matchedCount,
        isoCount,
        installedCount: Math.max(0, totalCount - isoCount),
        organizedPercentage,
        lastScannedAt: new Date().toISOString(),
      }
      saveStoredScannedSummary(summary, nodeId)
      return summary
    }
  } catch {
    // If fetching server-games failed, try preview or fallback
  }

  // Fallback to organize preview if isoPath is configured
  if (isoPath && isoPath.trim()) {
    try {
      const previewRes = await apiClient.post<
        Array<{
          sourcePath?: string
          targetPath?: string
          status?: string
          matched?: boolean
          type?: string
        }>
      >(`/library/servers/${nodeId}/organize/preview`, {
        directory: isoPath,
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
        const organizedPercentage =
          totalCount > 0 ? Math.round((organizedCount / totalCount) * 100) : 0

        const summary: ScannedFilesSummaryData = {
          totalCount,
          organizedCount,
          unorganizedCount,
          matchedCount,
          isoCount,
          installedCount: Math.max(0, totalCount - isoCount),
          organizedPercentage,
          lastScannedAt: new Date().toISOString(),
        }
        saveStoredScannedSummary(summary, nodeId)
        return summary
      }
    } catch {
      // Node preview endpoint might be empty or unavailable
    }
  }

  // Fallback to cached summary or empty
  const stored = loadStoredScannedSummary(nodeId)
  if (stored) return stored

  return null
}

export interface ScannedGameItem {
  id: string | number
  title: string
  path: string
  format: string
  isIso: boolean
  posterUrl?: string | null
  sizeBytes?: number
  matched?: boolean
  serverName?: string
}

export { formatBytes } from '@/lib/utils/format-bytes'

export async function fetchScannedGamesList(nodeId?: number | null): Promise<ScannedGameItem[]> {
  const isRemote = nodeId != null && nodeId > 0
  const items: ScannedGameItem[] = []

  if (isRemote) {
    try {
      const { data } = await apiClient.get<any>('/library/server-games')
      const files = Array.isArray(data) ? data : data?.files || []
      for (const f of files) {
        if (f.serverId === nodeId || f.server_id === nodeId || !f.serverId) {
          const isIso =
            f.formatCategory === 'iso' ||
            f.extension?.toLowerCase() === '.iso' ||
            Boolean(f.isIso || f.is_iso)
          const format = f.formatCategory
            ? f.formatCategory.toUpperCase()
            : isIso
              ? 'ISO'
              : 'Installer'
          const posterUrl =
            f.otixImages?.poster?.url ||
            f.otixImages?.posterUrl ||
            f.otixMetadata?.posterUrl ||
            f.posterUrl ||
            null
          const title =
            f.gameTitle ||
            f.otixTitle ||
            f.title ||
            f.name ||
            (f.filename ? f.filename.replace(/\.[^/.]+$/, '') : '') ||
            (f.relativePath ? f.relativePath.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, '') : '') ||
            'Untitled'
          const path =
            f.filepath || f.relativePath || f.path || f.installDir || f.downloadUrl || ''
          const sizeBytes = f.filesize ?? f.sizeBytes ?? f.size_bytes ?? 0
          const matched = Boolean(f.otixMediaId || f.otixTitle || f.matched || f.otixMetadata)

          items.push({
            id: f.id || f.fileId || f.file_id || f.path || String(Math.random()),
            title,
            path,
            format,
            isIso,
            posterUrl,
            sizeBytes,
            matched,
            serverName: f.serverName || f.server_name,
          })
        }
      }
      return items
    } catch {
      return []
    }
  }

  const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
  if (api?.getLocalGames) {
    try {
      const local = (await api.getLocalGames()) || []
      return local.map((g: any) => ({
        id: g.id,
        title: g.title,
        path: g.exePath || g.installDir || '',
        format: g.platform === 'iso' ? 'ISO' : 'Installed',
        isIso: g.platform === 'iso',
        posterUrl: g.posterUrl || null,
        sizeBytes: g.sizeBytes || 0,
        matched: Boolean(g.matched || g.externalIds?.length),
        serverName: 'Local Desktop',
      }))
    } catch {
      return []
    }
  }

  try {
    const { data } = await apiClient.get<any>('/library/server-games')
    const files = Array.isArray(data) ? data : data?.files || []
    return files.map((f: any) => {
      const isIso =
        f.formatCategory === 'iso' ||
        f.extension?.toLowerCase() === '.iso' ||
        Boolean(f.isIso || f.is_iso)
      const format = f.formatCategory
        ? f.formatCategory.toUpperCase()
        : isIso
          ? 'ISO'
          : 'Installer'
      const posterUrl =
        f.otixImages?.poster?.url ||
        f.otixImages?.posterUrl ||
        f.otixMetadata?.posterUrl ||
        f.posterUrl ||
        null
      const title =
        f.gameTitle ||
        f.otixTitle ||
        f.title ||
        f.name ||
        (f.filename ? f.filename.replace(/\.[^/.]+$/, '') : '') ||
        'Untitled'
      const path = f.filepath || f.relativePath || f.path || ''
      const sizeBytes = f.filesize ?? f.sizeBytes ?? 0
      const matched = Boolean(f.otixMediaId || f.otixTitle || f.matched || f.otixMetadata)

      return {
        id: f.id || f.fileId || f.file_id || f.path,
        title,
        path,
        format,
        isIso,
        posterUrl,
        sizeBytes,
        matched,
        serverName: f.serverName,
      }
    })
  } catch {
    return []
  }
}
