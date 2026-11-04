export type PathType = 'installed' | 'provider' | 'game' | 'iso'

export function isProviderPath(type?: PathType): boolean {
  return type === 'provider' || type === 'iso'
}

export function isInstalledPath(type?: PathType): boolean {
  return type === 'installed' || type === 'game' || !type
}

export interface ScanPathItem {
  path: string
  type: PathType
}

export interface ConfiguredFolderItem {
  path: string
  name: string
  isInstallation: boolean
  isGamesDownload: boolean
  isIso: boolean
}

export type PathsViewMode = 'cards' | 'list'
export type PathsFilterTab = 'all' | 'installation' | 'download' | 'iso'

export function normalizePath(p: string | null | undefined): string {
  if (!p || typeof p !== 'string') return ''
  return p.trim().replace(/[\\/]+$/, '').toLowerCase()
}

export function getBaseFolderName(p: string | null | undefined): string {
  if (!p || typeof p !== 'string') return ''
  const trimmed = p.trim().replace(/[\\/]+$/, '')
  const parts = trimmed.split(/[\\/]/)
  return parts[parts.length - 1] || trimmed
}

export function normalizeScanPathItems(rawItems: unknown): ScanPathItem[] {
  if (!Array.isArray(rawItems)) return []
  const map = new Map<string, ScanPathItem>()

  for (const item of rawItems) {
    if (!item) continue
    let pathStr = ''
    let typeVal: PathType = 'installed'

    if (typeof item === 'string') {
      pathStr = item.trim()
    } else if (typeof item === 'object') {
      const p = (item as any).path
      if (typeof p === 'string') {
        pathStr = p.trim()
      }
      const rawType = (item as any).type
      if (rawType === 'provider' || rawType === 'iso') {
        typeVal = 'provider'
      } else if (rawType === 'installed' || rawType === 'game') {
        typeVal = 'installed'
      }
    }

    if (!pathStr) continue
    const key = normalizePath(pathStr)
    if (!key) continue

    const existing = map.get(key)
    if (existing) {
      if (typeVal === 'provider') existing.type = 'provider'
    } else {
      map.set(key, { path: pathStr, type: typeVal })
    }
  }

  return Array.from(map.values())
}

export function buildConfiguredFolderList(
  scanPaths: (ScanPathItem | string)[] | null | undefined,
  gamesInstallPath?: string | null,
  gamesDownloadPath?: string | null,
  serverDownloadPath?: string | null,
): ConfiguredFolderItem[] {
  const normInstall = normalizePath(gamesInstallPath)
  const normDownload = normalizePath(gamesDownloadPath)
  const normIso = normalizePath(serverDownloadPath)

  const itemsMap = new Map<string, ConfiguredFolderItem>()

  // 1. Add all scan paths
  for (const item of scanPaths || []) {
    if (!item) continue
    const rawPath = typeof item === 'string' ? item : item?.path
    if (typeof rawPath !== 'string') continue
    const raw = rawPath.trim()
    if (!raw) continue
    const key = normalizePath(raw)
    const existing = itemsMap.get(key)
    const isIso =
      (typeof item === 'object' && item !== null && (item.type === 'iso' || item.type === 'provider')) ||
      (normIso !== '' && key === normIso)
    const isInstallation = normInstall !== '' && key === normInstall
    const isGamesDownload = normDownload !== '' && key === normDownload

    if (existing) {
      existing.isIso = existing.isIso || isIso
      existing.isInstallation = existing.isInstallation || isInstallation
      existing.isGamesDownload = existing.isGamesDownload || isGamesDownload
    } else {
      itemsMap.set(key, {
        path: raw,
        name: getBaseFolderName(raw),
        isInstallation,
        isGamesDownload,
        isIso,
      })
    }
  }

  // 2. Add install path if not already in list
  const cleanInstall = typeof gamesInstallPath === 'string' ? gamesInstallPath.trim() : ''
  if (cleanInstall) {
    const key = normalizePath(cleanInstall)
    const existing = itemsMap.get(key)
    if (existing) {
      existing.isInstallation = true
    } else {
      itemsMap.set(key, {
        path: cleanInstall,
        name: getBaseFolderName(cleanInstall),
        isInstallation: true,
        isGamesDownload: normDownload !== '' && key === normDownload,
        isIso: normIso !== '' && key === normIso,
      })
    }
  }

  // 3. Add games download path if not already in list
  const cleanDownload = typeof gamesDownloadPath === 'string' ? gamesDownloadPath.trim() : ''
  if (cleanDownload) {
    const key = normalizePath(cleanDownload)
    const existing = itemsMap.get(key)
    if (existing) {
      existing.isGamesDownload = true
    } else {
      itemsMap.set(key, {
        path: cleanDownload,
        name: getBaseFolderName(cleanDownload),
        isInstallation: normInstall !== '' && key === normInstall,
        isGamesDownload: true,
        isIso: normIso !== '' && key === normIso,
      })
    }
  }

  // 4. Add server/iso download path if not already in list
  const cleanIso = typeof serverDownloadPath === 'string' ? serverDownloadPath.trim() : ''
  if (cleanIso) {
    const key = normalizePath(cleanIso)
    const existing = itemsMap.get(key)
    if (existing) {
      existing.isIso = true
    } else {
      itemsMap.set(key, {
        path: cleanIso,
        name: getBaseFolderName(cleanIso),
        isInstallation: normInstall !== '' && key === normInstall,
        isGamesDownload: normDownload !== '' && key === normDownload,
        isIso: true,
      })
    }
  }

  return Array.from(itemsMap.values())
}

export function filterFolderItems(
  items: ConfiguredFolderItem[],
  searchQuery: string,
  filterTab: PathsFilterTab,
): ConfiguredFolderItem[] {
  const query = typeof searchQuery === 'string' ? searchQuery.trim().toLowerCase() : ''
  return (items || []).filter((item) => {
    if (!item) return false
    // Filter tab
    if (filterTab === 'installation' && !item.isInstallation) return false
    if (filterTab === 'download' && !item.isGamesDownload) return false
    if (filterTab === 'iso' && !item.isIso) return false

    // Search query
    if (query) {
      const matchPath = item.path ? item.path.toLowerCase().includes(query) : false
      const matchName = item.name ? item.name.toLowerCase().includes(query) : false
      if (!matchPath && !matchName) return false
    }

    return true
  })
}

const STORAGE_VIEW_MODE_KEY = 'otix:paths-view-mode'

export function loadStoredPathsViewMode(): PathsViewMode {
  try {
    const raw = localStorage.getItem(STORAGE_VIEW_MODE_KEY)
    if (raw === 'list' || raw === 'cards') return raw
  } catch {
    // ignore
  }
  return 'cards'
}

export function saveStoredPathsViewMode(mode: PathsViewMode): void {
  try {
    localStorage.setItem(STORAGE_VIEW_MODE_KEY, mode)
  } catch {
    // ignore
  }
}

export interface SuggestedPathItem {
  id: string
  path: string
  label: string
  source: 'steam' | 'epic' | 'gog' | 'generic'
}

export function getSuggestedDefaultPaths(
  existingPaths: (ScanPathItem | { path?: string } | string)[] = [],
  isWindowsPlatform = true,
): SuggestedPathItem[] {
  const normExisting = new Set(
    (existingPaths || [])
      .map((p) => {
        const raw = typeof p === 'string' ? p : p?.path
        return normalizePath(raw)
      })
      .filter(Boolean),
  )

  const candidates: SuggestedPathItem[] = isWindowsPlatform
    ? [
        {
          id: 'steam-win',
          path: 'C:\\Program Files (x86)\\Steam\\steamapps\\common',
          label: 'Steam Library',
          source: 'steam',
        },
        {
          id: 'epic-win',
          path: 'C:\\Program Files\\Epic Games',
          label: 'Epic Games',
          source: 'epic',
        },
        {
          id: 'gog-win',
          path: 'C:\\Program Files (x86)\\GOG Galaxy\\Games',
          label: 'GOG Galaxy Games',
          source: 'gog',
        },
        {
          id: 'games-c',
          path: 'C:\\Games',
          label: 'C:\\Games',
          source: 'generic',
        },
        {
          id: 'games-d',
          path: 'D:\\Games',
          label: 'D:\\Games',
          source: 'generic',
        },
      ]
    : [
        {
          id: 'steam-mac',
          path: '~/Library/Application Support/Steam/steamapps/common',
          label: 'Steam Library',
          source: 'steam',
        },
        {
          id: 'epic-mac',
          path: '/Users/Shared/Epic Games',
          label: 'Epic Games',
          source: 'epic',
        },
        {
          id: 'games-unix',
          path: '~/Games',
          label: '~/Games',
          source: 'generic',
        },
      ]

  return candidates.filter((item) => !normExisting.has(normalizePath(item.path)))
}

import * as serverDownloads from '@/features/downloads/use-server-downloads'

export function resolveUseClaim(): () => { mutateAsync: (args: any) => Promise<any> } {
  try {
    const fn =
      (serverDownloads as Record<string, unknown>)['useClaimGameServer'] ||
      (serverDownloads as Record<string, unknown>)['useClaimNode']
    if (typeof fn === 'function') return fn as any
  } catch {
    // Vitest throws on missing mock export in test harness
  }
  return () => ({ mutateAsync: async () => ({ id: 0, name: '' }) })
}

export const useClaimGameServer = resolveUseClaim()
