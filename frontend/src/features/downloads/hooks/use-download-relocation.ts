import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getDesktopAPI } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'

export interface RelocationItem {
  id: string
  title: string
  sourceFilename: string
  sourcePath: string
  targetPath: string
  sourceType?: 'download' | 'staging' | 'peer_transfer' | 'samba' | string
  formatCategory?: 'iso' | 'installer' | 'game' | 'archive' | 'rom' | 'update' | string
  sizeBytes?: number
  isFolder?: boolean
  releaseGroup?: string
  year?: number | string
  platform?: string
  status?: 'pending' | 'relocating' | 'completed' | 'failed'
  error?: string
}

export interface UseDownloadRelocationOptions {
  nodeId?: number | null
  userId?: string
  stagingPath?: string
  libraryPath?: string
  namingTemplate?: string
  initialItems?: RelocationItem[]
  autoScan?: boolean
}

export interface UseDownloadRelocationResult {
  unorganizedItems: RelocationItem[]
  activeItem: RelocationItem | null
  totalCount: number
  isRelocating: boolean
  isScanning: boolean
  error: string | null
  autoOrganizeEnabled: boolean
  setAutoOrganizeEnabled: (enabled: boolean) => Promise<void> | void
  relocate: (itemId: string) => Promise<boolean>
  relocateAll: () => Promise<boolean>
  dismissItem: (itemId: string) => void
  rescan: () => Promise<void>
  addUnorganizedItem: (item: Partial<RelocationItem> & { sourcePath: string }) => RelocationItem
}

export const AUTO_ORGANIZE_STORAGE_KEY = 'otix:auto-organize-enabled'
export const UNORGANIZED_ITEMS_STORAGE_KEY = 'otix:unorganized-downloads'
export const DISMISSED_RELOCATIONS_STORAGE_KEY = 'otix:dismissed-relocations'

/** Normalize Windows / POSIX path slashes to standard forward slashes without trailing slashes. */
export const normalizePathSeparators = (pathStr: string): string => {
  if (!pathStr) return ''
  return pathStr.replace(/\\+/g, '/').replace(/\/+/g, '/').replace(/\/+$/, '')
}

/** Extract base filename from full path. */
export const extractFilename = (pathStr: string): string => {
  const norm = normalizePathSeparators(pathStr)
  const segments = norm.split('/')
  return segments[segments.length - 1] || norm
}

interface ParsedMetadata {
  title: string
  cleanTitle: string
  year?: number
  platform?: string
  group?: string
  edition?: string
  version?: string
  extension?: string
}

const COMMON_SCENE_GROUPS = [
  'RUNE',
  'CODEX',
  'FLT',
  'FAIRLIGHT',
  'REPACK',
  'ELAMIGOS',
  'FITGIRL',
  'DODI',
  'EMPRESS',
  'SKIDROW',
  'CPY',
  'GOG',
  'TENOKE',
  'RAZOR1911',
  'TINYISO',
  'PLAZA',
  'PROPHET',
  'RELOADED',
]

/** Parse game title, release year, platform, and scene group from raw filename or directory. */
export const cleanReleaseTitle = (rawName: string): ParsedMetadata => {
  let name = rawName.trim()
  let extension = ''

  // Strip file extension if present
  const extMatch = name.match(/\.([a-zA-Z0-9]{2,5})$/i)
  if (extMatch) {
    const candidateExt = extMatch[1].toLowerCase()
    const gameExtensions = ['iso', 'zip', 'rar', '7z', 'exe', 'z64', 'sfc', 'nsp', 'xci', 'pkg', 'chd', 'rvz']
    if (gameExtensions.includes(candidateExt)) {
      extension = extMatch[1]
      name = name.slice(0, -extMatch[0].length)
    }
  }

  // Extract Scene / Repack Group
  let group: string | undefined
  const groupMatch = name.match(/-([A-Za-z0-9_]+)$/)
  if (groupMatch) {
    group = groupMatch[1]
    name = name.slice(0, -groupMatch[0].length)
  } else {
    for (const g of COMMON_SCENE_GROUPS) {
      const gRegex = new RegExp(`[._\\-\\s](${g})[._\\-\\s]?$`, 'i')
      const m = name.match(gRegex)
      if (m) {
        group = m[1]
        name = name.slice(0, -m[0].length)
        break
      }
    }
  }

  // Extract Platform
  let platform: string | undefined
  const platformMatch = name.match(/\[(PC|Switch|N64|PS3|PS4|PS5|Xbox|Wii|GameCube|NES|SNES|GBA|NDS|3DS)\]/i)
  if (platformMatch) {
    platform = platformMatch[1]
    name = name.replace(platformMatch[0], ' ')
  } else {
    const rawPlatform = name.match(/(?:[._\-\s]|^)(PC|Switch|N64|PS3|PS4|PS5|Xbox|Wii|GameCube|NES|SNES|GBA|NDS|3DS)(?:[._\-\s]|$)/i)
    if (rawPlatform) {
      platform = rawPlatform[1]
      name = name.replace(new RegExp(`(^|[._\\-\\s])${rawPlatform[1]}([._\\-\\s]|$)`, 'i'), '$1 $2')
    }
  }

  // Extract Version (requires v / ver prefix)
  let version: string | undefined
  const verMatch = name.match(/\bv(?:er(?:sion)?)?[\s._-]*(\d+(?:[._]\d+){0,4}(?:[._-]?[a-zA-Z0-9]+)?)\b/i)
  if (verMatch) {
    version = verMatch[1]
    name = name.replace(verMatch[0], ' ')
  }

  // Extract Edition
  let edition: string | undefined
  const editionMatch = name.match(
    /\b(GOTY|Game[\s._-]of[\s._-]the[\s._-]Year|Deluxe[\s._-]Edition|Ultimate[\s._-]Edition|Complete[\s._-]Edition|Definitive[\s._-]Edition|Directors?[\s._-]Cut)\b/i,
  )
  if (editionMatch) {
    edition = editionMatch[1].replace(/[._-]+/g, ' ')
    name = name.replace(editionMatch[0], ' ')
  }

  // Extract Year (1970 - 2029)
  let year: number | undefined
  const yearMatch = name.match(/(?:[._\-\s(]|^)(19[7-9]\d|20[0-2]\d)(?:[._\-\s)]|$)/)
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10)
    name = name.replace(new RegExp(`(^|[._\\-\\s(])${yearMatch[1]}([._\\-\\s)]|$)`), '$1 $2')
  }

  // Clean remaining dots, underscores, dashes
  const cleanTitle = name
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    title: cleanTitle || rawName,
    cleanTitle: cleanTitle || rawName,
    year,
    platform: platform || 'PC',
    group,
    edition,
    version,
    extension,
  }
}

/** Compute normalized target path preview (source -> target). */
export const computeNormalizedTargetPath = (
  sourcePath: string,
  libraryRoot?: string,
  namingTemplate?: string,
): string => {
  const normSource = normalizePathSeparators(sourcePath)
  const filename = extractFilename(normSource)
  const parsed = cleanReleaseTitle(filename)

  const root = libraryRoot ? normalizePathSeparators(libraryRoot) : 'D:/Games'

  if (namingTemplate) {
    let result = namingTemplate
    result = result.replace(/{Title}/g, parsed.cleanTitle)
    result = result.replace(/{CleanTitle}/g, parsed.cleanTitle)
    result = result.replace(/{Year}/g, parsed.year ? String(parsed.year) : '')
    result = result.replace(/{Platform}/g, parsed.platform || 'PC')
    result = result.replace(/{ReleaseGroup}/g, parsed.group || 'Scene')
    result = result.replace(/{Edition}/g, parsed.edition || '')
    result = result.replace(/{Version}/g, parsed.version || '')
    result = result.replace(/{OriginalName}/g, filename.replace(/\.[^.]+$/, ''))
    result = result.replace(/{ext}/g, parsed.extension || '')

    // Clean up empty parentheses or square brackets caused by missing tokens
    result = result
      .replace(/\(\s*\)/g, '')
      .replace(/\[\s*\]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\/+/g, '/')
      .replace(/\.\s*$/, '')
      .trim()

    return normalizePathSeparators(`${root}/${result}`)
  }

  // Default standard Otix game library structure: {Title} ({Year})/{OriginalName}
  const folderPart = parsed.year ? `${parsed.cleanTitle} (${parsed.year})` : parsed.cleanTitle
  return normalizePathSeparators(`${root}/${folderPart}/${filename}`)
}

export const useDownloadRelocation = (
  options: UseDownloadRelocationOptions = {},
): UseDownloadRelocationResult => {
  const {
    nodeId = null,
    userId,
    stagingPath = '~/Downloads/Games',
    libraryPath = 'D:/Games',
    namingTemplate,
    initialItems,
    autoScan = true,
  } = options

  // Persistent auto-organize setting
  const [autoOrganizeEnabled, setAutoOrganizeEnabledState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTO_ORGANIZE_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  // List of detected unorganized items in staging / downloads
  const [unorganizedItems, setUnorganizedItems] = useState<RelocationItem[]>(() => {
    if (initialItems && initialItems.length > 0) {
      return initialItems
    }
    try {
      const raw = localStorage.getItem(UNORGANIZED_ITEMS_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {
      // ignore
    }
    return []
  })

  const [isRelocating, setIsRelocating] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Persist unorganized items to localStorage
  const saveUnorganizedItems = useCallback((items: RelocationItem[]) => {
    try {
      localStorage.setItem(UNORGANIZED_ITEMS_STORAGE_KEY, JSON.stringify(items))
    } catch {
      // ignore
    }
  }, [])

  // Auto-organize setting toggle
  const setAutoOrganizeEnabled = useCallback(
    async (enabled: boolean) => {
      setAutoOrganizeEnabledState(enabled)
      try {
        localStorage.setItem(AUTO_ORGANIZE_STORAGE_KEY, String(enabled))
      } catch {
        // ignore
      }

      // Sync with desktop settings if in Electron
      const api = getDesktopAPI()
      if (api?.downloadsSaveConfig && userId) {
        try {
          await api.downloadsSaveConfig({ userId, autoOrganizeEnabled: enabled })
        } catch {
          // ignore
        }
      }

      // Sync with companion node if connected
      if (nodeId && nodeId > 0) {
        try {
          await apiClient.post(`/library/servers/${nodeId}/organize`, {
            autoOrganizeEnabled: enabled,
          })
        } catch {
          // ignore
        }
      }

      // If auto-organize was just enabled and we have pending unorganized items,
      // trigger background relocation automatically.
      if (enabled && unorganizedItems.length > 0) {
        void relocateAll()
      }
    },
    [nodeId, userId, unorganizedItems],
  )

  // Programmatically add or register a newly detected download
  const addUnorganizedItem = useCallback(
    (item: Partial<RelocationItem> & { sourcePath: string }): RelocationItem => {
      const normSource = normalizePathSeparators(item.sourcePath)
      const filename = extractFilename(normSource)
      const parsed = cleanReleaseTitle(filename)
      const targetPath =
        item.targetPath || computeNormalizedTargetPath(normSource, libraryPath, namingTemplate)

      const newItem: RelocationItem = {
        id: item.id || `reloc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: item.title || parsed.cleanTitle,
        sourceFilename: item.sourceFilename || filename,
        sourcePath: normSource,
        targetPath,
        sourceType: item.sourceType || 'staging',
        formatCategory: item.formatCategory || 'game',
        sizeBytes: item.sizeBytes,
        isFolder: item.isFolder ?? !parsed.extension,
        releaseGroup: item.releaseGroup || parsed.group,
        year: item.year || parsed.year,
        platform: item.platform || parsed.platform,
        status: item.status || 'pending',
      }

      setUnorganizedItems((prev) => {
        const exists = prev.find((i) => i.sourcePath.toLowerCase() === newItem.sourcePath.toLowerCase())
        if (exists) return prev
        const next = [newItem, ...prev]
        saveUnorganizedItems(next)
        return next
      })

      return newItem
    },
    [libraryPath, namingTemplate, saveUnorganizedItems],
  )

  // Dismiss item from prompt without relocating
  const dismissItem = useCallback(
    (itemId: string) => {
      try {
        const raw = localStorage.getItem(DISMISSED_RELOCATIONS_STORAGE_KEY)
        const dismissed: string[] = raw ? JSON.parse(raw) : []
        if (!dismissed.includes(itemId)) {
          dismissed.push(itemId)
          localStorage.setItem(DISMISSED_RELOCATIONS_STORAGE_KEY, JSON.stringify(dismissed))
        }
      } catch {
        // ignore
      }

      setUnorganizedItems((prev) => {
        const next = prev.filter((i) => i.id !== itemId)
        saveUnorganizedItems(next)
        return next
      })
    },
    [saveUnorganizedItems],
  )

  // 1-Click relocate single item mutation
  const relocate = useCallback(
    async (itemId: string): Promise<boolean> => {
      const item = unorganizedItems.find((i) => i.id === itemId)
      if (!item) return false

      setIsRelocating(true)
      setError(null)

      setUnorganizedItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, status: 'relocating' } : i)),
      )

      try {
        const api = getDesktopAPI()

        if (api?.executeOrganization) {
          const results = (await api.executeOrganization([
            { sourcePath: item.sourcePath, targetPath: item.targetPath },
          ])) as Array<{ success?: boolean; error?: string }>

          const firstResult = results?.[0]
          if (firstResult && firstResult.success === false) {
            throw new Error(firstResult.error || 'Relocation failed')
          }
        } else if (nodeId && nodeId > 0) {
          await apiClient.post(`/library/servers/${nodeId}/organize/execute`, {
            items: [{ sourcePath: item.sourcePath, targetPath: item.targetPath }],
            deleteEmptyFolders: true,
          })
        }

        // Successfully relocated — refresh scanned games if available
        if (api?.hydrateMatchedGames) {
          try {
            await api.hydrateMatchedGames()
          } catch {
            // ignore
          }
        }

        // Remove from unorganized items
        setUnorganizedItems((prev) => {
          const next = prev.filter((i) => i.id !== itemId)
          saveUnorganizedItems(next)
          return next
        })

        return true
      } catch (err: any) {
        const msg = err?.message || 'Failed to relocate item to library'
        setError(msg)
        setUnorganizedItems((prev) =>
          prev.map((i) => (i.id === itemId ? { ...i, status: 'failed', error: msg } : i)),
        )
        return false
      } finally {
        setIsRelocating(false)
      }
    },
    [unorganizedItems, nodeId, saveUnorganizedItems],
  )

  // Relocate all unorganized items in 1 click
  const relocateAll = useCallback(async (): Promise<boolean> => {
    if (unorganizedItems.length === 0) return true

    setIsRelocating(true)
    setError(null)

    try {
      const itemsToMove = unorganizedItems.map((i) => ({
        sourcePath: i.sourcePath,
        targetPath: i.targetPath,
      }))

      const api = getDesktopAPI()
      if (api?.executeOrganization) {
        await api.executeOrganization(itemsToMove)
      } else if (nodeId && nodeId > 0) {
        await apiClient.post(`/library/servers/${nodeId}/organize/execute`, {
          items: itemsToMove,
          deleteEmptyFolders: true,
        })
      }

      if (api?.hydrateMatchedGames) {
        try {
          await api.hydrateMatchedGames()
        } catch {
          // ignore
        }
      }

      setUnorganizedItems([])
      saveUnorganizedItems([])
      return true
    } catch (err: any) {
      const msg = err?.message || 'Failed to relocate all items'
      setError(msg)
      return false
    } finally {
      setIsRelocating(false)
    }
  }, [unorganizedItems, nodeId, saveUnorganizedItems])

  // Scan staging/download folders for unorganized items
  const rescan = useCallback(async () => {
    setIsScanning(true)
    setError(null)

    try {
      const api = getDesktopAPI()
      let scannedItems: RelocationItem[] = []

      if (api?.smartOrganizePreview) {
        const previewResults = (await api.smartOrganizePreview(
          stagingPath,
          namingTemplate,
        )) as Array<{
          sourcePath?: string
          sourceFilename?: string
          targetPath?: string
          type?: string
          status?: string
        }>

        if (Array.isArray(previewResults)) {
          const actionable = previewResults.filter(
            (item) => item.status && item.status !== 'already_organized',
          )

          scannedItems = actionable.map((item, idx) => {
            const normSource = normalizePathSeparators(item.sourcePath || '')
            const filename = item.sourceFilename || extractFilename(normSource)
            const parsed = cleanReleaseTitle(filename)
            const target =
              item.targetPath ||
              computeNormalizedTargetPath(normSource, libraryPath, namingTemplate)

            return {
              id: `desktop-scanned-${idx}-${filename}`,
              title: parsed.cleanTitle,
              sourceFilename: filename,
              sourcePath: normSource,
              targetPath: normalizePathSeparators(target),
              sourceType: 'staging',
              formatCategory: (item.type as any) || 'game',
              releaseGroup: parsed.group,
              year: parsed.year,
              platform: parsed.platform,
              status: 'pending',
            }
          })
        }
      }

      if (scannedItems.length > 0) {
        // Read dismissed ids
        let dismissed: string[] = []
        try {
          const rawDismissed = localStorage.getItem(DISMISSED_RELOCATIONS_STORAGE_KEY)
          if (rawDismissed) dismissed = JSON.parse(rawDismissed)
        } catch {
          // ignore
        }

        const filtered = scannedItems.filter((i) => !dismissed.includes(i.id))
        setUnorganizedItems(filtered)
        saveUnorganizedItems(filtered)

        // If auto-organize is enabled, execute automatic relocation immediately
        if (autoOrganizeEnabled && filtered.length > 0) {
          void relocateAll()
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to scan staging directory')
    } finally {
      setIsScanning(false)
    }
  }, [stagingPath, namingTemplate, libraryPath, saveUnorganizedItems, autoOrganizeEnabled, relocateAll])

  // Scan upon initial mount if autoScan is enabled and items are not provided
  const initialScanDone = useRef(false)
  useEffect(() => {
    if (!autoScan || initialScanDone.current || (initialItems && initialItems.length > 0)) return
    initialScanDone.current = true
    void rescan()
  }, [autoScan, initialItems, rescan])

  const activeItem = useMemo(() => unorganizedItems[0] || null, [unorganizedItems])

  return {
    unorganizedItems,
    activeItem,
    totalCount: unorganizedItems.length,
    isRelocating,
    isScanning,
    error,
    autoOrganizeEnabled,
    setAutoOrganizeEnabled,
    relocate,
    relocateAll,
    dismissItem,
    rescan,
    addUnorganizedItem,
  }
}
