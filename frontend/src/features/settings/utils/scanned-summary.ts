import { getDesktopAPI } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'
import { resolveCatalogGame } from '@/features/launcher/data/queries'
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

    if (Array.isArray(files)) {
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
      >(`/library/nodes/${nodeId}/organize/preview`, {
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

export interface ScannedGameSource {
  id: string | number
  sourceType: 'installed' | 'iso' | 'installer' | 'patch'
  title: string
  path: string
  exePath?: string | null
  installDir?: string | null
  format: string
  platform?: string | null
  version?: string | null
  sizeBytes: number
  modifiedAt?: string | null
  isIso?: boolean
  isUpdate?: boolean
  serverName?: string
  serverId?: number | null
  rawGame?: any
}

export interface ScannedGameItem {
  id: string | number
  title: string
  path: string
  exePath?: string | null
  installDir?: string | null
  format: string
  platform?: string | null
  version?: string | null
  isIso: boolean
  isUpdate?: boolean
  updates?: ScannedGameItem[]
  sources?: ScannedGameSource[]
  isMultiSource?: boolean
  hasIsoSource?: boolean
  hasInstalledSource?: boolean
  totalSizeBytes?: number
  posterUrl?: string | null
  backdropUrl?: string | null
  logoUrl?: string | null
  iconUrl?: string | null
  dominantColor?: string | null
  overview?: string | null
  releaseYear?: string | number | null
  sizeBytes?: number
  modifiedAt?: string | null
  matched?: boolean
  confidence?: number | null
  mediaId?: string | number | null
  slug?: string | null
  serverName?: string
  serverId?: number | null
  rawGame?: any
}

export { formatBytes } from '@/lib/utils/format-bytes'

export interface CatalogCandidate {
  id: string | number
  title: string
  slug?: string
  posterUrl?: string | null
  backdropUrl?: string | null
  iconUrl?: string | null
  overview?: string | null
  releaseDate?: string | null
  releaseYear?: string | number | null
}

export type ScannedFilterTab = 'all' | 'matched' | 'unmatched' | 'iso'

export function computeScannedGamesCounts(games: ScannedGameItem[]): {
  all: number
  matched: number
  unmatched: number
  iso: number
} {
  let matched = 0
  let unmatched = 0
  let iso = 0
  for (const g of games) {
    if (g.isIso || g.hasIsoSource) iso++
    if (g.matched) matched++
    else unmatched++
  }
  return {
    all: games.length,
    matched,
    unmatched,
    iso,
  }
}

export function normalizeTitleForGrouping(title?: string | null): string {
  if (!title) return ''
  let clean = title.toLowerCase().trim()
  // Strip trailing file extension
  clean = clean.replace(/\.(iso|bin|cue|exe|zip|rar|7z)$/i, '')
  // Strip disc / disk / CD markers (e.g. Disc 1, CD 2, DVD 1)
  clean = clean.replace(/\b(?:disc|disk|cd|dvd)\s*\d*\b/gi, '')
  // Strip common edition, repack, release group patterns, and edition keyword
  clean = clean.replace(
    /\b(goty|game\s+of\s+the\s+year|deluxe|complete|definitive|ultimate|director'?s\s+cut|enhanced|anniversary|special|standard|gold|collector'?s|digital|edition|repack|fitgirl|dodi|elamigos|codex|skidrow|tenoke|rune|flt)\b/gi,
    '',
  )
  // Strip version tags like v1.0, 1.0.0
  clean = clean.replace(/\bv?\d+(?:\.\d+)+[a-z]?\b/gi, '')
  // Strip non-alphanumeric
  clean = clean.replace(/[^a-z0-9]/g, '')
  return clean.trim()
}

export const UNLINKED_SOURCES_KEY = 'otix:unlinked-sources'

export function getUnlinkedPairKey(idA: string | number, idB: string | number): string {
  const [a, b] = [String(idA), String(idB)].sort()
  return `${a}:::${b}`
}

export function loadUnlinkedSourcePairs(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(UNLINKED_SOURCES_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) {
        return new Set(arr)
      }
    }
  } catch {
    // ignore
  }
  return new Set()
}

export function unlinkSourcePair(idA: string | number, idB: string | number): void {
  if (typeof window === 'undefined') return
  try {
    const pairs = loadUnlinkedSourcePairs()
    pairs.add(getUnlinkedPairKey(idA, idB))
    localStorage.setItem(UNLINKED_SOURCES_KEY, JSON.stringify(Array.from(pairs)))
    window.dispatchEvent(new CustomEvent('scanned-games-updated'))
  } catch {
    // ignore
  }
}

export function relinkSourcePair(idA: string | number, idB: string | number): void {
  if (typeof window === 'undefined') return
  try {
    const pairs = loadUnlinkedSourcePairs()
    pairs.delete(getUnlinkedPairKey(idA, idB))
    localStorage.setItem(UNLINKED_SOURCES_KEY, JSON.stringify(Array.from(pairs)))
    window.dispatchEvent(new CustomEvent('scanned-games-updated'))
  } catch {
    // ignore
  }
}

export function unifyScannedGameSources(items: ScannedGameItem[]): ScannedGameItem[] {
  if (!items || items.length <= 1) return items || []

  const unlinked = loadUnlinkedSourcePairs()
  const groups: ScannedGameItem[][] = []

  for (const item of items) {
    if (item.isUpdate) continue

    let placed = false
    for (const group of groups) {
      const primary = group[0]
      // Check if explicitly unlinked
      if (unlinked.has(getUnlinkedPairKey(primary.id, item.id))) {
        continue
      }

      // Check same mediaId / catalog ID
      if (primary.mediaId && item.mediaId && String(primary.mediaId) === String(item.mediaId)) {
        group.push(item)
        placed = true
        break
      }

      // Check same slug
      if (primary.slug && item.slug && primary.slug === item.slug) {
        group.push(item)
        placed = true
        break
      }

      // Fallback: Check cleaned normalized title if on the same server/node
      const primaryServer = primary.serverId ?? 0
      const itemServer = item.serverId ?? 0
      if (primaryServer === itemServer) {
        const normA = normalizeTitleForGrouping(primary.title)
        const normB = normalizeTitleForGrouping(item.title)
        if (normA && normB && normA.length >= 3 && normA === normB) {
          group.push(item)
          placed = true
          break
        }
      }
    }

    if (!placed) {
      groups.push([item])
    }
  }

  const result: ScannedGameItem[] = []

  for (const group of groups) {
    if (group.length === 1) {
      const single = group[0]
      const isIso = Boolean(single.isIso || single.format?.toUpperCase() === 'ISO')
      const source: ScannedGameSource = {
        id: single.id,
        sourceType: isIso ? 'iso' : single.exePath ? 'installed' : 'installer',
        title: single.title,
        path: single.path,
        exePath: single.exePath,
        installDir: single.installDir,
        format: single.format,
        platform: single.platform,
        version: single.version,
        sizeBytes: single.sizeBytes || 0,
        modifiedAt: single.modifiedAt,
        isIso,
        isUpdate: single.isUpdate,
        serverName: single.serverName,
        serverId: single.serverId,
        rawGame: single.rawGame,
      }
      result.push({
        ...single,
        sources: [source],
        hasIsoSource: isIso,
        hasInstalledSource: !isIso && Boolean(single.exePath || single.format === 'PC'),
        isMultiSource: false,
        totalSizeBytes: single.sizeBytes || 0,
      })
      continue
    }

    // Multiple sources exist! Select primary item:
    // Prefer installed playable item (has exePath and !isIso)
    let primary = group.find((g) => !g.isIso && (g.exePath || g.format?.toUpperCase() === 'PC'))
    if (!primary) {
      // Prefer non-ISO installer
      primary = group.find((g) => !g.isIso)
    }
    if (!primary) {
      // Prefer largest file
      primary = [...group].sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0))[0]
    }

    const otherItems = group.filter((g) => g.id !== primary!.id)

    // Build sources list: primary first, then others
    const sources: ScannedGameSource[] = [
      {
        id: primary.id,
        sourceType: primary.isIso ? 'iso' : primary.exePath ? 'installed' : 'installer',
        title: primary.title,
        path: primary.path,
        exePath: primary.exePath,
        installDir: primary.installDir,
        format: primary.format,
        platform: primary.platform,
        version: primary.version,
        sizeBytes: primary.sizeBytes || 0,
        modifiedAt: primary.modifiedAt,
        isIso: primary.isIso,
        isUpdate: primary.isUpdate,
        serverName: primary.serverName,
        serverId: primary.serverId,
        rawGame: primary.rawGame,
      },
      ...otherItems.map((g): ScannedGameSource => ({
        id: g.id,
        sourceType: g.isIso ? 'iso' : g.exePath ? 'installed' : 'installer',
        title: g.title,
        path: g.path,
        exePath: g.exePath,
        installDir: g.installDir,
        format: g.format,
        platform: g.platform,
        version: g.version,
        sizeBytes: g.sizeBytes || 0,
        modifiedAt: g.modifiedAt,
        isIso: g.isIso,
        isUpdate: g.isUpdate,
        serverName: g.serverName,
        serverId: g.serverId,
        rawGame: g,
      })),
    ]

    // Merge updates from all grouped items
    const combinedUpdates: ScannedGameItem[] = []
    const updateIds = new Set<string | number>()
    for (const g of group) {
      if (Array.isArray(g.updates)) {
        for (const u of g.updates) {
          if (!updateIds.has(u.id)) {
            updateIds.add(u.id)
            combinedUpdates.push(u)
          }
        }
      }
    }

    const hasIsoSource = sources.some((s) => s.isIso || s.format?.toUpperCase() === 'ISO')
    const hasInstalledSource = sources.some((s) => !s.isIso && (s.sourceType === 'installed' || Boolean(s.exePath)))
    const totalSizeBytes = sources.reduce((acc, s) => acc + (s.sizeBytes || 0), 0)

    // Artwork/overview: inherit matched fields if primary lacks them
    const matchedDonor = group.find((g) => g.matched && (g.posterUrl || g.backdropUrl)) || primary

    result.push({
      ...primary,
      posterUrl: primary.posterUrl || matchedDonor.posterUrl,
      backdropUrl: primary.backdropUrl || matchedDonor.backdropUrl,
      logoUrl: primary.logoUrl || matchedDonor.logoUrl,
      iconUrl: primary.iconUrl || matchedDonor.iconUrl,
      overview: primary.overview || matchedDonor.overview,
      mediaId: primary.mediaId || matchedDonor.mediaId,
      slug: primary.slug || matchedDonor.slug,
      matched: Boolean(primary.matched || matchedDonor.matched),
      confidence: primary.confidence ?? matchedDonor.confidence,
      updates: combinedUpdates,
      sources,
      isMultiSource: true,
      hasIsoSource,
      hasInstalledSource,
      totalSizeBytes,
      sizeBytes: totalSizeBytes,
    })
  }

  return result
}

export function filterScannedGames(
  games: ScannedGameItem[],
  filter: ScannedFilterTab,
  search: string,
): ScannedGameItem[] {
  const q = search.trim().toLowerCase()
  return games.filter((g) => {
    if (filter === 'matched' && !g.matched) return false
    if (filter === 'unmatched' && g.matched) return false
    if (filter === 'iso' && !g.isIso) return false
    if (q) {
      const matchTitle = g.title.toLowerCase().includes(q)
      const matchPath = g.path.toLowerCase().includes(q)
      const matchFormat = Boolean(g.format && g.format.toLowerCase().includes(q))
      return matchTitle || matchPath || matchFormat
    }
    return true
  })
}

export function formatMatchConfidence(confidence?: number | null): string {
  if (confidence == null) return ''
  const pct = Math.round(confidence <= 1 ? confidence * 100 : confidence)
  return `${pct}%`
}

function normalizeCatalogCandidates(rawList: any[]): CatalogCandidate[] {
  return rawList
    .filter((item: any) => !item.mediaType || item.mediaType === 'game')
    .map((item: any): CatalogCandidate => {
      let releaseYear: string | number | null = item.releaseYear || item.year || null
      if (!releaseYear && item.releaseDate) {
        try {
          releaseYear = new Date(item.releaseDate).getFullYear()
        } catch {
          // ignore
        }
      }
      const poster = item.posterUrl || item.poster_url || item.images?.poster?.url || null
      const icon = item.iconUrl || item.icon_url || item.images?.icon?.url || item.logoUrl || poster || null
      return {
        id: item.id || item.mediaId || item.media_id,
        title: item.title || item.name || '',
        slug: item.slug || '',
        posterUrl: poster,
        backdropUrl: item.backdropUrl || item.backdrop_url || item.images?.backdrop?.url || null,
        iconUrl: icon,
        overview: item.overview || item.summary || item.description || null,
        releaseDate: item.releaseDate || item.release_date || null,
        releaseYear,
      }
    })
}

export async function searchCatalogGames(query: string): Promise<CatalogCandidate[]> {
  if (!query || query.trim().length === 0) return []
  const trimmed = query.trim()

  // 1. Primary: query otix.app cloud catalog directly
  try {
    const cloudUrl = `https://otix.app/api/v1/search?q=${encodeURIComponent(trimmed)}&page_size=15&media_type=game&include_external=true`
    const res = await fetch(cloudUrl, {
      headers: { Accept: 'application/json' },
    })
    if (res.ok) {
      const data = await res.json()
      const rawList = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.results)
          ? data.results
          : Array.isArray(data)
            ? data
            : []
      if (rawList.length > 0) {
        return normalizeCatalogCandidates(rawList)
      }
    }
  } catch (err) {
    console.warn('Otix.app cloud search failed, trying local:', err)
  }

  // 2. Fallback: local backend
  try {
    const { data } = await apiClient.get<any>('/search', {
      params: { q: trimmed, page_size: 15, media_type: 'game', include_external: true },
    })
    const rawList = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
          ? data
          : []
    return normalizeCatalogCandidates(rawList)
  } catch {
    return []
  }
}

export async function matchScannedGameItem(
  game: ScannedGameItem,
  candidate: CatalogCandidate,
  selectedPlatform?: string,
): Promise<ScannedGameItem> {
  let finalCand = candidate
  if (String(candidate.id).startsWith('igdb:')) {
    try {
      const resolved = await resolveCatalogGame(candidate as any)
      finalCand = {
        ...candidate,
        id: resolved.id,
        title: resolved.title,
        slug: resolved.slug,
      }
    } catch {
      // non-blocking
    }
  }

  const mediaId = String(finalCand.id)
  const mediaTitle = finalCand.title
  const targetPlatform = selectedPlatform?.trim().toLowerCase() || (game.platform && game.platform.toLowerCase() !== 'iso' ? game.platform : undefined)
  const hydratedIcon = finalCand.iconUrl || finalCand.posterUrl || game.iconUrl || game.posterUrl || null

  // 1. Desktop local SQLite acceptSuggestion
  const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
  if (api?.acceptSuggestion) {
    try {
      await api.acceptSuggestion(String(game.id), {
        id: mediaId,
        title: mediaTitle,
        slug: finalCand.slug || '',
        posterUrl: finalCand.posterUrl || null,
        backdropUrl: finalCand.backdropUrl || null,
        iconUrl: hydratedIcon,
        overview: finalCand.overview || null,
        releaseDate: finalCand.releaseDate || null,
        releaseYear: finalCand.releaseYear || null,
        platform: targetPlatform,
        hydrated: finalCand,
      })
    } catch (err) {
      console.warn('[matchScannedGameItem] Desktop acceptSuggestion failed:', err)
    }
  }

  // 2. Node server sync
  const serverId = game.serverId ?? (game.rawGame as any)?.serverId
  if (serverId != null) {
    try {
      await apiClient.post(`/library/nodes/${serverId}/otix/match`, {
        mediaId,
        fileId: (game.rawGame as any)?.serverFileId || game.id,
        filepath: game.path,
        platform: targetPlatform,
        confidence: 1.0,
      })
    } catch (err) {
      console.warn('[matchScannedGameItem] Node server sync failed:', err)
    }
  }

  // 3. Backend match confirm if recordId present
  const recordId = (game.rawGame as any)?.recordId || (game.rawGame as any)?.matchRecordId
  if (recordId) {
    try {
      await apiClient.post(`/library/matches/${recordId}/confirm`, { media_item_id: mediaId })
    } catch (err) {
      console.warn('[matchScannedGameItem] Match record confirm failed:', err)
    }
  }

  let releaseYear: string | number | null = game.releaseYear || null
  if (finalCand.releaseYear) {
    releaseYear = finalCand.releaseYear
  } else if (finalCand.releaseDate) {
    try {
      releaseYear = new Date(finalCand.releaseDate).getFullYear()
    } catch {
      // ignore
    }
  }

  return {
    ...game,
    title: mediaTitle,
    posterUrl: finalCand.posterUrl || game.posterUrl,
    backdropUrl: finalCand.backdropUrl || game.backdropUrl,
    iconUrl: hydratedIcon,
    overview: finalCand.overview || game.overview,
    mediaId,
    slug: finalCand.slug || game.slug,
    releaseYear,
    matched: true,
    confidence: 1.0,
    platform: targetPlatform || game.platform,
  }
}

export async function updateScannedGamePlatform(
  game: ScannedGameItem,
  platform: string,
): Promise<ScannedGameItem> {
  const normPlatform = platform.trim().toLowerCase()

  // 1. Desktop local SQLite acceptSuggestion
  const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
  if (api?.acceptSuggestion) {
    try {
      await api.acceptSuggestion(String(game.id), {
        id: game.mediaId || String(game.id),
        title: game.title,
        platform: normPlatform,
      })
    } catch (err) {
      console.warn('[updateScannedGamePlatform] Desktop acceptSuggestion failed:', err)
    }
  }

  // 2. Node server sync
  const serverId = game.serverId ?? (game.rawGame as any)?.serverId
  if (serverId != null) {
    try {
      await apiClient.post(`/library/nodes/${serverId}/otix/match`, {
        mediaId: game.mediaId || null,
        fileId: (game.rawGame as any)?.serverFileId || game.id,
        filepath: game.path,
        platform: normPlatform,
      })
    } catch (err) {
      console.warn('[updateScannedGamePlatform] Node server sync failed:', err)
    }
  }

  return {
    ...game,
    platform: normPlatform,
  }
}

export async function fetchScannedGamesList(nodeId?: number | null): Promise<ScannedGameItem[]> {
  const isRemote = nodeId != null && nodeId > 0
  const items: ScannedGameItem[] = []

  if (isRemote) {
    try {
      const { data } = await apiClient.get<any>('/library/server-games')
      const files = Array.isArray(data) ? data : data?.files || []
      for (const f of files) {
        if (f.serverId === nodeId || f.server_id === nodeId || !f.serverId) {
          const isUpdate = f.formatCategory === 'update' || f.format_category === 'update'
          const isIso =
            !isUpdate &&
            (f.formatCategory === 'iso' ||
            f.extension?.toLowerCase() === '.iso' ||
            Boolean(f.isIso || f.is_iso))
          const format = isUpdate
            ? 'UPDATE'
            : f.formatCategory
              ? f.formatCategory.toUpperCase()
              : isIso
                ? 'ISO'
                : 'INSTALLER'
          const posterUrl =
            f.otixImages?.poster?.url ||
            f.otixImages?.posterUrl ||
            f.catalogItem?.posterUrl ||
            f.catalog_item?.poster_url ||
            f.otixMetadata?.posterUrl ||
            f.posterUrl ||
            null
          const backdropUrl =
            f.otixImages?.backdrop?.url ||
            f.catalogItem?.backdropUrl ||
            f.catalog_item?.backdrop_url ||
            f.backdropUrl ||
            null
          const logoUrl =
            f.otixImages?.logo?.url ||
            f.catalogItem?.logoUrl ||
            f.catalog_item?.logo_url ||
            f.logoUrl ||
            null
          const iconUrl =
            f.otixImages?.icon?.url ||
            f.catalogItem?.iconUrl ||
            f.catalog_item?.icon_url ||
            f.iconUrl ||
            f.icon_url ||
            f.otixImages?.logo?.url ||
            f.catalogItem?.logoUrl ||
            f.catalog_item?.logo_url ||
            f.logoUrl ||
            f.catalogItem?.posterUrl ||
            f.catalog_item?.poster_url ||
            f.posterUrl ||
            null
          const overview =
            f.otixOverview ||
            f.otix_overview ||
            f.catalogItem?.overview ||
            f.catalog_item?.overview ||
            null
          const title =
            f.otixTitle ||
            f.otix_title ||
            f.catalogItem?.title ||
            f.catalog_item?.title ||
            f.gameTitle ||
            f.game_title ||
            f.title ||
            f.name ||
            (f.filename ? f.filename.replace(/\.[^/.]+$/, '') : '') ||
            (f.relativePath ? f.relativePath.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, '') : '') ||
            'Untitled'
          const mediaId =
            f.otixMediaId ||
            f.otix_media_id ||
            f.catalogItem?.id ||
            f.catalog_item?.id ||
            null
          const matched = Boolean(mediaId || f.matched || f.otixMetadata)
          const confidence = f.otixConfidence ?? f.otix_confidence ?? (matched ? 1.0 : null)
          const exactExe = f.filepath || f.path || f.exePath || f.exe_path || ''
          const exactFolder = f.rootDir || f.root_dir || f.installDir || f.install_dir || ''
          const path = exactExe || exactFolder || f.downloadUrl || ''
          const sizeBytes =
            (f.filesize != null && f.filesize > 0 ? Number(f.filesize) : null) ??
            (f.sizeBytes != null && f.sizeBytes > 0 ? Number(f.sizeBytes) : null) ??
            (f.size_bytes != null && f.size_bytes > 0 ? Number(f.size_bytes) : null) ??
            (f.fileSize != null && f.fileSize > 0 ? Number(f.fileSize) : null) ??
            (f.data?.sizeBytes != null && f.data.sizeBytes > 0 ? Number(f.data.sizeBytes) : null) ??
            (f.data?.filesize != null && f.data.filesize > 0 ? Number(f.data.filesize) : null) ??
            (f.data?.size != null && f.data.size > 0 ? Number(f.data.size) : null) ??
            0
          const modifiedAt =
            f.modifiedAt ||
            f.modified_at ||
            f.updatedAt ||
            f.updated_at ||
            f.createdAt ||
            f.created_at ||
            f.data?.modifiedAt ||
            f.data?.modified_at ||
            null
          const slug = f.otixSlug || f.otix_slug || f.catalogItem?.slug || f.catalog_item?.slug || null

          const rawPlat =
            f.platform ||
            f.catalogItem?.platform ||
            f.catalog_item?.platform ||
            null
          const platform = rawPlat && String(rawPlat).toLowerCase() !== 'iso' ? rawPlat : undefined
          const dominantColor =
            f.dominantColor ||
            f.dominant_color ||
            f.catalogItem?.dominantColor ||
            f.catalog_item?.dominant_color ||
            null

          items.push({
            id: f.id || f.fileId || f.file_id || f.path || String(Math.random()),
            title,
            path,
            exePath: exactExe || null,
            installDir: exactFolder || null,
            format,
            platform,
            version: f.version || f.gameVersion || f.game_version || f.data?.version || null,
            isIso,
            isUpdate,
            posterUrl,
            backdropUrl,
            logoUrl,
            iconUrl,
            dominantColor,
            overview,
            sizeBytes,
            modifiedAt,
            matched,
            confidence,
            mediaId,
            slug,
            serverName: f.serverName || f.server_name || 'Node',
            serverId: f.serverId || f.server_id || nodeId || null,
            rawGame: f,
          })
        }
      }
      if (items.length > 0) {
        return items
      }
    } catch {
      // non-blocking fallback to local desktop database
    }
  }

  const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
  if (api?.getLocalGames) {
    try {
      const rawLocal = (await api.getLocalGames()) || []
      const local = Array.isArray(rawLocal) ? rawLocal : Object.values(rawLocal || {})
      if (local.length > 0 || !isRemote) {
        return local
          .filter((g: any) => !g.isApp && !g.isDlc)
          .map((g: any) => {
        const isIso = g.platform === 'iso'
        const poster = g.posterUrl || g.otixPosterUrl || g.data?.posterUrl || g.matchSuggestion?.posterUrl || null
        const backdrop = g.backdropUrl || g.otixBackdropUrl || g.data?.backdropUrl || null
        const logo = g.logoUrl || g.otixLogoUrl || g.data?.logoUrl || null
        const icon =
          g.iconUrl ||
          g.otixIconUrl ||
          g.data?.iconUrl ||
          g.data?.icon_url ||
          g.logoUrl ||
          g.otixLogoUrl ||
          g.data?.logoUrl ||
          poster ||
          null
        const overview = g.overview || g.data?.overview || g.data?.description || null
        const mediaId = g.otixMediaId || g.data?.id || g.data?.mediaId || null
        const matched = Boolean(mediaId || g.otixMatchVerified || g.matched)
        const confidence = g.otixConfidence ?? (matched ? 1.0 : (g.matchSuggestion?.confidence ?? null))

        let releaseYear: string | number | null = null
        if (g.data?.releaseDate) {
          try {
            releaseYear = new Date(g.data.releaseDate).getFullYear()
          } catch {
            // ignore
          }
        } else if (g.data?.year) {
          releaseYear = g.data.year
        }

        const sizeBytes =
          (g.sizeBytes != null && g.sizeBytes > 0 ? Number(g.sizeBytes) : null) ??
          (g.data?.sizeBytes != null && g.data.sizeBytes > 0 ? Number(g.data.sizeBytes) : null) ??
          (g.data?.filesize != null && g.data.filesize > 0 ? Number(g.data.filesize) : null) ??
          (g.data?.size != null && g.data.size > 0 ? Number(g.data.size) : null) ??
          (g.filesize != null && g.filesize > 0 ? Number(g.filesize) : null) ??
          (Array.isArray(g.sources) ? Number(g.sources.find((s: any) => s?.filesize || s?.sizeBytes)?.filesize || 0) : null) ??
          0
        const modifiedAt =
          g.modifiedAt ||
          g.updatedAt ||
          g.updated_at ||
          g.createdAt ||
          g.created_at ||
          g.data?.modifiedAt ||
          g.data?.modified_at ||
          g.data?.updatedAt ||
          g.data?.createdAt ||
          null

        const rawPlatform = g.platform || g.data?.platform || null
        const platform = rawPlatform && String(rawPlatform).toLowerCase() !== 'iso' ? rawPlatform : undefined
        const dominantColor = g.dominantColor || g.data?.dominantColor || null

        const exactExe =
          g.localExePath ||
          (g.exePath && !g.exePath.startsWith('steam://') ? g.exePath : '') ||
          g.exePath ||
          ''
        const exactFolder = g.installDir || ''
        const path = exactFolder || exactExe || ''

        return {
          id: g.id,
          title: g.otixMediaTitle || g.data?.title || g.title,
          path,
          exePath: exactExe || null,
          installDir: exactFolder || null,
          format: isIso ? 'ISO' : (g.platform ? String(g.platform).toUpperCase() : 'PC'),
          platform,
          version: g.version || g.gameVersion || g.game_version || g.data?.version || null,
          isIso,
          posterUrl: poster,
          backdropUrl: backdrop,
          logoUrl: logo,
          iconUrl: icon,
          dominantColor,
          overview,
          releaseYear,
          sizeBytes,
          modifiedAt,
          matched,
          confidence,
          mediaId,
          slug: g.otixMediaSlug || g.data?.slug || null,
          serverName: 'Local Desktop',
          serverId: 0,
          rawGame: g,
        }
      })
      }
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
          : 'INSTALLER'
      const posterUrl =
        f.otixImages?.poster?.url ||
        f.otixImages?.posterUrl ||
        f.catalogItem?.posterUrl ||
        f.catalog_item?.poster_url ||
        f.otixMetadata?.posterUrl ||
        f.posterUrl ||
        null
      const backdropUrl =
        f.otixImages?.backdrop?.url ||
        f.catalogItem?.backdropUrl ||
        f.catalog_item?.backdrop_url ||
        f.backdropUrl ||
        null
      const logoUrl =
        f.otixImages?.logo?.url ||
        f.catalogItem?.logoUrl ||
        f.catalog_item?.logo_url ||
        f.logoUrl ||
        null
      const iconUrl =
        f.otixImages?.icon?.url ||
        f.catalogItem?.iconUrl ||
        f.catalog_item?.icon_url ||
        f.iconUrl ||
        f.icon_url ||
        f.otixImages?.logo?.url ||
        f.catalogItem?.logoUrl ||
        f.logoUrl ||
        f.catalogItem?.posterUrl ||
        f.catalog_item?.poster_url ||
        f.posterUrl ||
        null
      const overview =
        f.otixOverview ||
        f.otix_overview ||
        f.catalogItem?.overview ||
        f.catalog_item?.overview ||
        null
      const title =
        f.otixTitle ||
        f.otix_title ||
        f.catalogItem?.title ||
        f.catalog_item?.title ||
        f.gameTitle ||
        f.game_title ||
        f.title ||
        f.name ||
        (f.filename ? f.filename.replace(/\.[^/.]+$/, '') : '') ||
        'Untitled'
      const mediaId =
        f.otixMediaId ||
        f.otix_media_id ||
        f.catalogItem?.id ||
        f.catalog_item?.id ||
        null
      const matched = Boolean(mediaId || f.matched || f.otixMetadata)
      const confidence = f.otixConfidence ?? f.otix_confidence ?? (matched ? 1.0 : null)
      const exactExe = f.filepath || f.path || f.exePath || f.exe_path || ''
      const exactFolder = f.rootDir || f.root_dir || f.installDir || f.install_dir || ''
      const path = exactExe || exactFolder || f.downloadUrl || ''
      const sizeBytes =
        (f.filesize != null && f.filesize > 0 ? Number(f.filesize) : null) ??
        (f.sizeBytes != null && f.sizeBytes > 0 ? Number(f.sizeBytes) : null) ??
        (f.size_bytes != null && f.size_bytes > 0 ? Number(f.size_bytes) : null) ??
        (f.fileSize != null && f.fileSize > 0 ? Number(f.fileSize) : null) ??
        (f.data?.sizeBytes != null && f.data.sizeBytes > 0 ? Number(f.data.sizeBytes) : null) ??
        (f.data?.filesize != null && f.data.filesize > 0 ? Number(f.data.filesize) : null) ??
        0
      const modifiedAt =
        f.modifiedAt ||
        f.modified_at ||
        f.updatedAt ||
        f.updated_at ||
        f.createdAt ||
        f.created_at ||
        f.data?.modifiedAt ||
        f.data?.modified_at ||
        null
      const slug = f.otixSlug || f.otix_slug || f.catalogItem?.slug || f.catalog_item?.slug || null

      const rawPlat =
        f.platform ||
        f.catalogItem?.platform ||
        f.catalog_item?.platform ||
        null
      const platform = rawPlat && String(rawPlat).toLowerCase() !== 'iso' ? rawPlat : undefined
      const dominantColor =
        f.dominantColor ||
        f.dominant_color ||
        f.catalogItem?.dominantColor ||
        f.catalog_item?.dominant_color ||
        null

      return {
        id: f.id || f.fileId || f.file_id || f.path,
        title,
        path,
        exePath: exactExe || null,
        installDir: exactFolder || null,
        format,
        platform,
        version: f.version || f.gameVersion || f.game_version || f.data?.version || null,
        isIso,
        posterUrl,
        backdropUrl,
        logoUrl,
        iconUrl,
        dominantColor,
        overview,
        sizeBytes,
        modifiedAt,
        matched,
        confidence,
        mediaId,
        slug,
        serverName: f.serverName || 'Node',
        serverId: f.serverId || f.server_id || null,
        rawGame: f,
      }
    })
  } catch {
    return []
  }
}
