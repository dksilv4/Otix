export type PathType = 'game' | 'iso'

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
  if (!p) return ''
  return p.trim().replace(/[\\/]+$/, '').toLowerCase()
}

export function getBaseFolderName(p: string | null | undefined): string {
  if (!p) return ''
  const trimmed = p.trim().replace(/[\\/]+$/, '')
  const parts = trimmed.split(/[\\/]/)
  return parts[parts.length - 1] || trimmed
}

export function buildConfiguredFolderList(
  scanPaths: ScanPathItem[],
  gamesInstallPath: string,
  gamesDownloadPath: string,
  serverDownloadPath: string,
): ConfiguredFolderItem[] {
  const normInstall = normalizePath(gamesInstallPath)
  const normDownload = normalizePath(gamesDownloadPath)
  const normIso = normalizePath(serverDownloadPath)

  const itemsMap = new Map<string, ConfiguredFolderItem>()

  // 1. Add all scan paths
  for (const item of scanPaths) {
    const raw = item.path.trim()
    if (!raw) continue
    const key = normalizePath(raw)
    const existing = itemsMap.get(key)
    const isIso = item.type === 'iso' || (normIso !== '' && key === normIso)
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
  if (gamesInstallPath.trim()) {
    const raw = gamesInstallPath.trim()
    const key = normalizePath(raw)
    const existing = itemsMap.get(key)
    if (existing) {
      existing.isInstallation = true
    } else {
      itemsMap.set(key, {
        path: raw,
        name: getBaseFolderName(raw),
        isInstallation: true,
        isGamesDownload: normDownload !== '' && key === normDownload,
        isIso: normIso !== '' && key === normIso,
      })
    }
  }

  // 3. Add games download path if not already in list
  if (gamesDownloadPath.trim()) {
    const raw = gamesDownloadPath.trim()
    const key = normalizePath(raw)
    const existing = itemsMap.get(key)
    if (existing) {
      existing.isGamesDownload = true
    } else {
      itemsMap.set(key, {
        path: raw,
        name: getBaseFolderName(raw),
        isInstallation: normInstall !== '' && key === normInstall,
        isGamesDownload: true,
        isIso: normIso !== '' && key === normIso,
      })
    }
  }

  // 4. Add server/iso download path if not already in list
  if (serverDownloadPath.trim()) {
    const raw = serverDownloadPath.trim()
    const key = normalizePath(raw)
    const existing = itemsMap.get(key)
    if (existing) {
      existing.isIso = true
    } else {
      itemsMap.set(key, {
        path: raw,
        name: getBaseFolderName(raw),
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
  const query = searchQuery.trim().toLowerCase()
  return items.filter((item) => {
    // Filter tab
    if (filterTab === 'installation' && !item.isInstallation) return false
    if (filterTab === 'download' && !item.isGamesDownload) return false
    if (filterTab === 'iso' && !item.isIso) return false

    // Search query
    if (query) {
      const matchPath = item.path.toLowerCase().includes(query)
      const matchName = item.name.toLowerCase().includes(query)
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
  existingPaths: { path: string }[],
  isWindowsPlatform = true,
): SuggestedPathItem[] {
  const normExisting = new Set(existingPaths.map((p) => normalizePath(p.path)))

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
