import { type ScannedGameItem, unifyScannedGameSources } from './scanned-summary'
import { formatBytes } from '@/lib/utils/format-bytes'
import type { DkDropdownOption } from '@/components/ui/atoms/dropdown'

export type NodeScanFilterTab = 'all' | 'matched' | 'unmatched' | 'iso' | 'duplicates'
export type NodeScanSortOption =
  | 'name-asc'
  | 'name-desc'
  | 'path-asc'
  | 'path-desc'
  | 'platform-asc'
  | 'platform-desc'
  | 'version-asc'
  | 'version-desc'
  | 'format-asc'
  | 'format-desc'
  | 'size-desc'
  | 'size-asc'
  | 'date-desc'
  | 'date-asc'
  | 'status-desc'
  | 'status-asc'
  | 'status'

export type NodeScanSortColumn =
  | 'name'
  | 'path'
  | 'platform'
  | 'version'
  | 'format'
  | 'size'
  | 'date'
  | 'status'

export interface NodeScanStats {
  totalFiles: number
  matchedCount: number
  unmatchedCount: number
  isoCount: number
  duplicatesCount: number
  totalSizeBytes: number
}

export const SCAN_FILTER_OPTIONS: readonly DkDropdownOption[] = [
  { value: 'all', label: 'All Files' },
  { value: 'matched', label: 'Matched Only' },
  { value: 'unmatched', label: 'Unmatched Only' },
  { value: 'iso', label: 'ISO Discs' },
  { value: 'duplicates', label: 'Multi-source / Duplicates' },
] as const

export const SCAN_SORT_OPTIONS: readonly DkDropdownOption[] = [
  { value: 'name-asc', label: 'Title (A → Z)' },
  { value: 'name-desc', label: 'Title (Z → A)' },
  { value: 'path-asc', label: 'File Name (A → Z)' },
  { value: 'path-desc', label: 'File Name (Z → A)' },
  { value: 'platform-asc', label: 'Platform (A → Z)' },
  { value: 'platform-desc', label: 'Platform (Z → A)' },
  { value: 'version-asc', label: 'Version (Lowest)' },
  { value: 'version-desc', label: 'Version (Highest)' },
  { value: 'format-asc', label: 'Format (A → Z)' },
  { value: 'format-desc', label: 'Format (Z → A)' },
  { value: 'size-desc', label: 'Size (Largest)' },
  { value: 'size-asc', label: 'Size (Smallest)' },
  { value: 'date-desc', label: 'Date (Newest)' },
  { value: 'date-asc', label: 'Date (Oldest)' },
  { value: 'status-desc', label: 'Status (Matched First)' },
  { value: 'status-asc', label: 'Status (Unmatched First)' },
] as const

export const SCAN_PAGE_SIZE_OPTIONS: readonly DkDropdownOption[] = [
  { value: '25', label: '25 rows' },
  { value: '50', label: '50 rows' },
  { value: '100', label: '100 rows' },
] as const

export function computeNodeScanStats(files: ScannedGameItem[]): NodeScanStats {
  let matchedCount = 0
  let unmatchedCount = 0
  let isoCount = 0
  let duplicatesCount = 0
  let totalSizeBytes = 0

  for (const f of files) {
    if (f.matched) {
      matchedCount++
    } else {
      unmatchedCount++
    }
    if (f.isIso || f.hasIsoSource || f.sources?.some((s) => s.isIso)) {
      isoCount++
    }
    if (f.isMultiSource || (f.sources && f.sources.length > 1)) {
      duplicatesCount++
    }
    if (f.sizeBytes && typeof f.sizeBytes === 'number' && f.sizeBytes > 0) {
      totalSizeBytes += f.sizeBytes
    }
  }

  return {
    totalFiles: files.length,
    matchedCount,
    unmatchedCount,
    isoCount,
    duplicatesCount,
    totalSizeBytes,
  }
}

export function getFileExtension(path: string | null | undefined): string {
  if (!path) return ''
  const trimmed = path.trim()
  const lastDot = trimmed.lastIndexOf('.')
  if (lastDot === -1 || lastDot === trimmed.length - 1) return ''
  return trimmed.slice(lastDot + 1).toLowerCase()
}

export function splitPathForDisplay(p: string | null | undefined): {
  dir: string
  filename: string
} {
  if (!p) return { dir: '', filename: '' }
  const trimmed = p.trim()
  const lastSlash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (lastSlash === -1) {
    return { dir: '', filename: trimmed }
  }
  return {
    dir: trimmed.slice(0, lastSlash + 1),
    filename: trimmed.slice(lastSlash + 1),
  }
}

export function getFileFormatBadge(item: ScannedGameItem): {
  label: string
  isIso: boolean
} {
  if (item.isIso) {
    return { label: 'ISO', isIso: true }
  }
  const fmt = (item.format || '').toUpperCase()
  if (fmt && fmt !== 'UNKNOWN') {
    return { label: fmt, isIso: false }
  }
  const ext = getFileExtension(item.path).toUpperCase()
  if (ext) {
    return { label: ext, isIso: ext === 'ISO' }
  }
  return { label: 'FILE', isIso: false }
}

export interface GamePlatformOption {
  value: string
  label: string
}

export const GAME_PLATFORM_OPTIONS: GamePlatformOption[] = [
  { value: 'pc', label: 'PC (Windows)' },
  { value: 'steam', label: 'Steam' },
  { value: 'epic', label: 'Epic Games' },
  { value: 'gog', label: 'GOG' },
  { value: 'ps1', label: 'PlayStation (PS1)' },
  { value: 'ps2', label: 'PlayStation 2 (PS2)' },
  { value: 'ps3', label: 'PlayStation 3 (PS3)' },
  { value: 'ps4', label: 'PlayStation 4 (PS4)' },
  { value: 'ps5', label: 'PlayStation 5 (PS5)' },
  { value: 'psp', label: 'PlayStation Portable (PSP)' },
  { value: 'psvita', label: 'PlayStation Vita' },
  { value: 'switch', label: 'Nintendo Switch' },
  { value: 'wiiu', label: 'Nintendo Wii U' },
  { value: 'wii', label: 'Nintendo Wii' },
  { value: 'gamecube', label: 'Nintendo GameCube' },
  { value: 'n64', label: 'Nintendo 64' },
  { value: 'snes', label: 'Super Nintendo (SNES)' },
  { value: 'nes', label: 'Nintendo (NES)' },
  { value: 'nds', label: 'Nintendo DS' },
  { value: '3ds', label: 'Nintendo 3DS' },
  { value: 'gba', label: 'Game Boy Advance' },
  { value: 'xbox', label: 'Xbox' },
  { value: 'xbox360', label: 'Xbox 360' },
  { value: 'dreamcast', label: 'Sega Dreamcast' },
  { value: 'saturn', label: 'Sega Saturn' },
  { value: 'genesis', label: 'Sega Genesis' },
  { value: 'arcade', label: 'Arcade / MAME' },
]

export function normalizePlatformValue(platform?: string | null): string {
  if (!platform) return 'pc'
  const p = platform.trim().toLowerCase()
  if (p === 'iso' || p === 'unknown') return 'pc'
  if (['windows', 'win', 'pc'].includes(p)) return 'pc'
  if (['playstation 2', 'ps2'].includes(p)) return 'ps2'
  if (['playstation 3', 'ps3'].includes(p)) return 'ps3'
  if (['playstation 4', 'ps4'].includes(p)) return 'ps4'
  if (['playstation 5', 'ps5'].includes(p)) return 'ps5'
  if (['playstation 1', 'ps1', 'psx', 'playstation'].includes(p)) return 'ps1'
  if (['playstation portable', 'psp'].includes(p)) return 'psp'
  if (['playstation vita', 'psvita', 'vita'].includes(p)) return 'psvita'
  if (['nintendo switch', 'switch'].includes(p)) return 'switch'
  if (['nintendo wii u', 'wii u', 'wiiu'].includes(p)) return 'wiiu'
  if (['nintendo wii', 'wii'].includes(p)) return 'wii'
  if (['nintendo gamecube', 'gamecube', 'gc'].includes(p)) return 'gamecube'
  if (['nintendo 64', 'n64'].includes(p)) return 'n64'
  if (['super nintendo', 'snes'].includes(p)) return 'snes'
  if (['nintendo entertainment system', 'nes'].includes(p)) return 'nes'
  if (['nintendo ds', 'nds'].includes(p)) return 'nds'
  if (['nintendo 3ds', '3ds'].includes(p)) return '3ds'
  if (['game boy advance', 'gba'].includes(p)) return 'gba'
  if (['xbox 360', 'xbox360'].includes(p)) return 'xbox360'
  if (['xbox original', 'xbox'].includes(p)) return 'xbox'
  if (['sega dreamcast', 'dreamcast'].includes(p)) return 'dreamcast'
  if (['sega saturn', 'saturn'].includes(p)) return 'saturn'
  if (['sega genesis', 'genesis', 'megadrive', 'mega drive'].includes(p)) return 'genesis'
  const found = GAME_PLATFORM_OPTIONS.find((opt) => opt.value === p)
  return found ? found.value : 'pc'
}

export function resolvePlatformLabel(item: ScannedGameItem): string {
  const rawPlatform = (item.platform || '').trim().toLowerCase()
  if (rawPlatform && rawPlatform !== 'iso' && rawPlatform !== 'unknown') {
    if (rawPlatform === 'steam') return 'Steam'
    if (rawPlatform === 'epic') return 'Epic'
    if (rawPlatform === 'gog') return 'GOG'
    if (rawPlatform === 'pc' || rawPlatform === 'windows') return 'PC'
    if (rawPlatform === 'ps2' || rawPlatform === 'playstation 2') return 'PS2'
    if (rawPlatform === 'ps3' || rawPlatform === 'playstation 3') return 'PS3'
    if (rawPlatform === 'ps1' || rawPlatform === 'psx' || rawPlatform === 'playstation') return 'PS1'
    if (rawPlatform === 'ps4' || rawPlatform === 'playstation 4') return 'PS4'
    if (rawPlatform === 'ps5' || rawPlatform === 'playstation 5') return 'PS5'
    if (rawPlatform === 'psp' || rawPlatform === 'playstation portable') return 'PSP'
    if (rawPlatform === 'psvita' || rawPlatform === 'vita' || rawPlatform === 'playstation vita') return 'PS Vita'
    if (rawPlatform === 'switch' || rawPlatform === 'nintendo switch') return 'Switch'
    if (rawPlatform === 'gamecube' || rawPlatform === 'gc') return 'GameCube'
    if (rawPlatform === 'wii') return 'Wii'
    if (rawPlatform === 'wiiu' || rawPlatform === 'wii u') return 'Wii U'
    if (rawPlatform === 'xbox') return 'Xbox'
    if (rawPlatform === 'xbox360' || rawPlatform === 'xbox 360') return 'Xbox 360'
    if (rawPlatform === 'n64' || rawPlatform === 'nintendo 64') return 'N64'
    if (rawPlatform === 'snes' || rawPlatform === 'super nintendo') return 'SNES'
    if (rawPlatform === 'nes') return 'NES'
    if (rawPlatform === 'nds' || rawPlatform === 'nintendo ds') return 'NDS'
    if (rawPlatform === '3ds' || rawPlatform === 'nintendo 3ds') return '3DS'
    if (rawPlatform === 'gba' || rawPlatform === 'game boy advance') return 'GBA'
    if (rawPlatform === 'dreamcast' || rawPlatform === 'sega dreamcast') return 'Dreamcast'
    if (rawPlatform === 'saturn' || rawPlatform === 'sega saturn') return 'Saturn'
    if (rawPlatform === 'genesis' || rawPlatform === 'megadrive') return 'Genesis'
    if (rawPlatform === 'arcade') return 'Arcade'
    return rawPlatform.toUpperCase()
  }

  // Infer platform from file path or title
  const p = `${item.path || ''} ${item.title || ''}`.toLowerCase()
  if (p.includes('\\ps2\\') || p.includes('/ps2/') || p.includes('playstation 2') || p.includes('ps2')) return 'PS2'
  if (p.includes('\\ps3\\') || p.includes('/ps3/') || p.includes('playstation 3') || p.includes('ps3')) return 'PS3'
  if (p.includes('\\ps4\\') || p.includes('/ps4/') || p.includes('playstation 4') || p.includes('ps4')) return 'PS4'
  if (p.includes('\\ps1\\') || p.includes('/ps1/') || p.includes('playstation 1') || p.includes('\\psx\\') || p.includes('/psx/')) return 'PS1'
  if (p.includes('\\psp\\') || p.includes('/psp/') || p.includes('playstation portable')) return 'PSP'
  if (p.includes('\\psvita\\') || p.includes('/psvita/') || p.includes('\\vita\\') || p.includes('/vita/')) return 'PS Vita'
  if (p.includes('\\switch\\') || p.includes('/switch/') || p.includes('nintendo switch') || p.includes('yuzu') || p.includes('ryujinx')) return 'Switch'
  if (p.includes('\\gamecube\\') || p.includes('/gamecube/') || p.includes('\\gc\\') || p.includes('/gc/')) return 'GameCube'
  if (p.includes('\\wiiu\\') || p.includes('/wiiu/') || p.includes('wii u') || p.includes('cemu')) return 'Wii U'
  if (p.includes('\\wii\\') || p.includes('/wii/') || p.includes('dolphin')) return 'Wii'
  if (p.includes('\\xbox360\\') || p.includes('/xbox360/') || p.includes('xbox 360') || p.includes('x360') || p.includes('xenia')) return 'Xbox 360'
  if (p.includes('\\xbox\\') || p.includes('/xbox/') || p.includes('original xbox')) return 'Xbox'
  if (p.includes('\\dreamcast\\') || p.includes('/dreamcast/') || p.includes('redream') || p.includes('flycast')) return 'Dreamcast'
  if (p.includes('\\saturn\\') || p.includes('/saturn/')) return 'Saturn'
  if (p.includes('\\3ds\\') || p.includes('/3ds/') || p.includes('citra')) return '3DS'
  if (p.includes('\\nds\\') || p.includes('/nds/') || p.includes('desmume') || p.includes('melonds')) return 'NDS'
  if (p.includes('\\gba\\') || p.includes('/gba/') || p.includes('gameboy advance') || p.includes('mgba')) return 'GBA'
  if (p.includes('\\snes\\') || p.includes('/snes/') || p.includes('snes9x')) return 'SNES'
  if (p.includes('\\nes\\') || p.includes('/nes/')) return 'NES'
  if (p.includes('\\n64\\') || p.includes('/n64/') || p.includes('mupen')) return 'N64'

  // Infer from file extension
  const ext = getFileExtension(item.path).toLowerCase().replace(/^\./, '')
  if (['rvz', 'gcm'].includes(ext)) return 'GameCube'
  if (['wbfs'].includes(ext)) return 'Wii'
  if (['wua', 'rpx'].includes(ext)) return 'Wii U'
  if (['nsp', 'xci'].includes(ext)) return 'Switch'
  if (['cso'].includes(ext)) return 'PSP'
  if (['3ds', 'cia'].includes(ext)) return '3DS'
  if (['nds'].includes(ext)) return 'NDS'
  if (['gba'].includes(ext)) return 'GBA'
  if (['sfc', 'smc'].includes(ext)) return 'SNES'
  if (['nes'].includes(ext)) return 'NES'
  if (['z64', 'v64', 'n64'].includes(ext)) return 'N64'
  if (['cdi', 'gdi'].includes(ext)) return 'Dreamcast'
  if (['xex'].includes(ext)) return 'Xbox 360'

  // Fallback to PC (NEVER return 'ISO')
  return 'PC'
}

export function resolveItemVersion(item: ScannedGameItem): string | null {
  if (item.version && typeof item.version === 'string' && item.version.trim()) {
    const v = item.version.trim()
    return v.startsWith('v') || v.startsWith('V') || v.toLowerCase().startsWith('build') ? v : `v${v}`
  }

  // Check rawGame fields
  const raw = item.rawGame as any
  if (raw) {
    const rawV =
      raw.version ||
      raw.gameVersion ||
      raw.game_version ||
      raw.data?.version ||
      raw.data?.gameVersion ||
      raw.data?.buildId
    if (rawV && typeof rawV === 'string' && rawV.trim()) {
      const v = rawV.trim()
      return v.startsWith('v') || v.startsWith('V') || v.toLowerCase().startsWith('build') ? v : `v${v}`
    }
  }

  // 1. Check linked updates / patches (the latest update version determines game patch version)
  if (item.updates && item.updates.length > 0) {
    for (const upd of item.updates) {
      const { filename: updFilename } = splitPathForDisplay(upd.path)
      const updVer = extractVersionFromString(`${upd.title || ''} ${updFilename}`)
      if (updVer) return updVer
    }
  }

  // 2. Check the game's executable / target file name
  const exactFile = item.exePath || item.path || ''
  const { filename } = splitPathForDisplay(exactFile)
  if (filename) {
    const fileVer = extractVersionFromString(filename)
    if (fileVer) return fileVer
  }

  // 3. Check the immediate game directory name (leaf folder only, ignoring parent drives and shares)
  const baseDir = getGameBaseDir(exactFile || item.installDir || '')
  if (baseDir) {
    const leafDir = baseDir.split(/[\\/]/).filter(Boolean).pop() || ''
    if (leafDir) {
      const dirVer = extractVersionFromString(leafDir)
      if (dirVer) return dirVer
    }
  }

  // 4. Check the game's title
  if (item.title) {
    const titleVer = extractVersionFromString(item.title)
    if (titleVer) return titleVer
  }

  return null
}

/**
 * Extracts a normalized version tag (e.g. "v1.32", "v65536") from game-specific names.
 * Never matches IP addresses, drive letters, network paths, or generic numbers.
 */
function extractVersionFromString(segment: string): string | null {
  if (!segment || !segment.trim()) return null

  // Clean out common false-positive path/network tokens if present
  const cleaned = segment
    .replace(/(?:https?:\/\/|ftp:\/\/)[^\s/]+/gi, '') // URLs
    .replace(/\b(?:192|127|10|172)\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?\b/g, '') // IPs
    .replace(/\b(?:x86|x64|win32|win64)\b/gi, '') // Architectures

  // 1. Explicit update / patch / build version: e.g. "patch_1.32", "update.v2.1.0", "build 404"
  const updMatch = cleaned.match(
    /\b(?:update|patch|hotfix|build)s?[\s._-]*(?:v(?:er(?:sion)?)?[\s._-]*)?(\d+(?:[._]\d+){0,4}[a-z]?)\b/i,
  )
  if (updMatch && updMatch[1]) {
    return `v${updMatch[1].replace(/_/g, '.')}`
  }

  // 2. Bracketed or parenthesized version: e.g. "[1.32]", "(1.63)", "[v1.04]"
  const bracketMatch = cleaned.match(/(?:\[|\()(?:v(?:er)?)?(\d+(?:\.\d+){1,4}[a-z]?)(?:\]|\))/i)
  if (bracketMatch && bracketMatch[1]) {
    return `v${bracketMatch[1].replace(/_/g, '.')}`
  }

  // 3. Switch integer title versions: e.g. "[v65536]", "v131072"
  const switchMatch = cleaned.match(/(?:\[|\b)v(\d{4,})(?:\]|\b)/i)
  if (switchMatch && switchMatch[1]) {
    return `v${switchMatch[1]}`
  }

  // 4. Prefixed version: e.g. "v1.2", "v2.0.4", "v1.32b"
  const vMatch = cleaned.match(/\bv(\d+(?:[._]\d+){1,4}[a-z]?)\b/i)
  if (vMatch && vMatch[1]) {
    return `v${vMatch[1].replace(/_/g, '.')}`
  }

  // 5. Trailing version in setup or release: e.g. "setup-1.2.exe" or "setup-v1.2.exe"
  const setupMatch = cleaned.match(/(?:setup|game|pkg|release)[-_.]+(?:v)?(\d+(?:[._]\d+){1,3})\b/i)
  if (setupMatch && setupMatch[1]) {
    return `v${setupMatch[1].replace(/_/g, '.')}`
  }

  return null
}

export function cleanTitleForSearch(title: string): string {
  if (!title) return ''
  return title
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/\[(?:fitgirl|dodi|tinyrepack|codex|skidrow|plaza|flt|rune)[^\]]*\]/gi, '')
    .replace(/\b(?:v\d+[\d._-]*|build[\s._-]?\d+|update[\s._-]?\d+|patch[\s._-]?\d+|repack|rip)\b/gi, '')
    .replace(/\((?:19\d\d|20\d\d)\)/g, '')
    .replace(/[-_.]+/g, ' ')
    .trim()
}

export function formatScanDateTime(isoDate?: string | null): string {
  if (!isoDate) return 'Unknown'
  try {
    const d = new Date(isoDate)
    if (isNaN(d.getTime())) return 'Unknown'
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return 'Unknown'
  }
}

export function getFileFormatDescription(item: ScannedGameItem): string {
  const badge = getFileFormatBadge(item)
  if (badge.isIso || item.isIso) return 'Disc Image (ISO)'
  const fmt = badge.label.toUpperCase()
  if (fmt === 'EXE') return 'Windows Executable (.exe)'
  if (fmt === 'UPDATE') return 'Game Update / Patch'
  if (fmt === 'ROM') return 'Console ROM'
  if (['ZIP', 'RAR', '7Z'].includes(fmt)) return 'Compressed Archive'
  return `${fmt} File`
}

export type NodeScanColumnId =
  | 'icon'
  | 'title'
  | 'filename'
  | 'platform'
  | 'version'
  | 'format'
  | 'size'
  | 'date'
  | 'status'
  | 'actions'

export interface ColumnDefinition {
  id: NodeScanColumnId
  label: string
  alwaysVisible?: boolean
  defaultVisible: boolean
  width?: string
}

export const SCAN_TABLE_COLUMNS: ColumnDefinition[] = [
  { id: 'icon', label: 'Icon', alwaysVisible: true, defaultVisible: true, width: '48px' },
  { id: 'title', label: 'File / Title', alwaysVisible: true, defaultVisible: true },
  { id: 'filename', label: 'File Name', defaultVisible: true, width: '28%' },
  { id: 'platform', label: 'Platform', defaultVisible: true, width: '80px' },
  { id: 'version', label: 'Version', defaultVisible: true, width: '75px' },
  { id: 'format', label: 'Format', defaultVisible: true, width: '70px' },
  { id: 'size', label: 'Size', defaultVisible: true, width: '85px' },
  { id: 'date', label: 'Date', defaultVisible: true, width: '95px' },
  { id: 'status', label: 'Status', defaultVisible: true, width: '60px' },
  { id: 'actions', label: 'Actions', alwaysVisible: true, defaultVisible: true, width: '130px' },
]

export const DEFAULT_VISIBLE_COLUMNS: Record<NodeScanColumnId, boolean> = {
  icon: true,
  title: true,
  filename: true,
  platform: true,
  version: true,
  format: true,
  size: true,
  date: true,
  status: true,
  actions: true,
}

export const COLUMN_STORAGE_KEY = 'otix:node-scan-columns'

export function loadStoredColumnVisibility(): Record<NodeScanColumnId, boolean> {
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY)
    if (!raw) return DEFAULT_VISIBLE_COLUMNS
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_VISIBLE_COLUMNS, ...parsed, icon: true, title: true, actions: true }
  } catch {
    return DEFAULT_VISIBLE_COLUMNS
  }
}

export function saveStoredColumnVisibility(vis: Record<NodeScanColumnId, boolean>): void {
  try {
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(vis))
  } catch {
    // ignore
  }
}

export function getNextSortOption(
  column: NodeScanSortColumn,
  currentSort: NodeScanSortOption,
): NodeScanSortOption {
  switch (column) {
    case 'name':
      return currentSort === 'name-asc' ? 'name-desc' : 'name-asc'
    case 'path':
      return currentSort === 'path-asc' ? 'path-desc' : 'path-asc'
    case 'platform':
      return currentSort === 'platform-asc' ? 'platform-desc' : 'platform-asc'
    case 'version':
      return currentSort === 'version-asc' ? 'version-desc' : 'version-asc'
    case 'format':
      return currentSort === 'format-asc' ? 'format-desc' : 'format-asc'
    case 'size':
      return currentSort === 'size-desc' ? 'size-asc' : 'size-desc'
    case 'date':
      return currentSort === 'date-desc' ? 'date-asc' : 'date-desc'
    case 'status':
      return currentSort === 'status-desc' || currentSort === 'status'
        ? 'status-asc'
        : 'status-desc'
    default:
      return 'name-asc'
  }
}

export function getColumnSortState(
  column: NodeScanSortColumn,
  currentSort: NodeScanSortOption,
): 'asc' | 'desc' | null {
  if (column === 'name') {
    if (currentSort === 'name-asc') return 'asc'
    if (currentSort === 'name-desc') return 'desc'
  }
  if (column === 'path') {
    if (currentSort === 'path-asc') return 'asc'
    if (currentSort === 'path-desc') return 'desc'
  }
  if (column === 'platform') {
    if (currentSort === 'platform-asc') return 'asc'
    if (currentSort === 'platform-desc') return 'desc'
  }
  if (column === 'version') {
    if (currentSort === 'version-asc') return 'asc'
    if (currentSort === 'version-desc') return 'desc'
  }
  if (column === 'format') {
    if (currentSort === 'format-asc') return 'asc'
    if (currentSort === 'format-desc') return 'desc'
  }
  if (column === 'size') {
    if (currentSort === 'size-asc') return 'asc'
    if (currentSort === 'size-desc') return 'desc'
  }
  if (column === 'date') {
    if (currentSort === 'date-asc') return 'asc'
    if (currentSort === 'date-desc') return 'desc'
  }
  if (column === 'status') {
    if (currentSort === 'status-asc') return 'asc'
    if (currentSort === 'status-desc' || currentSort === 'status') return 'desc'
  }
  return null
}

export function formatScanDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return '—'
  }
}

const UPDATE_NAME_PATTERN = /(?:[\b_.-](?:update|patch|hotfix|dlc|fix)[\b_.-]|[-_.]v\d+\.\d+[-_. ]?(?:update|patch|fix))/i

export function isLikelyUpdateFile(item: { path?: string; format?: string; isUpdate?: boolean }): boolean {
  if (item.isUpdate || item.format?.toUpperCase() === 'UPDATE') return true
  const p = item.path || ''
  if (!p) return false
  const { dir, filename } = splitPathForDisplay(p)
  if (UPDATE_NAME_PATTERN.test(filename)) return true
  const lowerDir = dir.toLowerCase()
  if (
    lowerDir.includes('/updates/') ||
    lowerDir.includes('\\updates\\') ||
    lowerDir.includes('/patches/') ||
    lowerDir.includes('\\patches\\')
  ) {
    return true
  }
  return false
}

export function getGameBaseDir(filePath: string): string {
  const { dir } = splitPathForDisplay(filePath)
  const normalized = dir.replace(/\\/g, '/').replace(/\/+$/, '')
  return normalized.replace(
    /\/(?:bin|x64|x86|win64|win32|shipping|binaries)(?:\/(?:x64|x86|win64|shipping))?$/i,
    '',
  )
}

export function groupGamesAndUpdates(files: ScannedGameItem[]): ScannedGameItem[] {
  const updates: ScannedGameItem[] = []
  const mainGames: ScannedGameItem[] = []

  for (const f of files) {
    if (f.isUpdate || f.format?.toUpperCase() === 'UPDATE' || isLikelyUpdateFile(f)) {
      updates.push({ ...f, isUpdate: true, format: f.format || 'UPDATE' })
    } else {
      mainGames.push({ ...f, updates: f.updates ? [...f.updates] : [] })
    }
  }

  const orphanedUpdates: ScannedGameItem[] = []

  for (const upd of updates) {
    let matchedParent: ScannedGameItem | undefined

    const updPath = (upd.path || '').toLowerCase().replace(/\\/g, '/')
    const updTitle = (upd.title || '').toLowerCase()
    const updClean = updPath.replace(/[^a-z0-9]/g, '')

    // 1. Check parent game by directory proximity
    for (const game of mainGames) {
      const baseDir = getGameBaseDir(game.path || '').toLowerCase()
      if (baseDir && baseDir.length > 3 && updPath.startsWith(baseDir)) {
        matchedParent = game
        break
      }
    }

    // 2. Check by title matching if not found by folder
    if (!matchedParent) {
      for (const game of mainGames) {
        const rawTitle = (game.title || '').toLowerCase().replace(/^(the|a|an)\s+/i, '').trim()
        const cleanTitle = rawTitle.replace(/[^a-z0-9]/g, '')
        if (cleanTitle.length >= 3 && (updClean.includes(cleanTitle) || updTitle.includes(rawTitle))) {
          matchedParent = game
          break
        }
      }
    }

    // 3. Check by mediaId if both are matched
    if (!matchedParent && upd.mediaId) {
      matchedParent = mainGames.find((g) => g.mediaId && g.mediaId === upd.mediaId)
    }

    if (matchedParent) {
      if (!matchedParent.updates) {
        matchedParent.updates = []
      }
      matchedParent.updates.push(upd)
    } else {
      orphanedUpdates.push(upd)
    }
  }

  // Unify duplicate game sources (e.g. Installed + ISO)
  const unified = unifyScannedGameSources(mainGames)
  return [...unified, ...orphanedUpdates]
}

export function filterAndSortScannedFiles(
  files: ScannedGameItem[],
  filter: NodeScanFilterTab,
  searchQuery: string,
  sort: NodeScanSortOption,
): ScannedGameItem[] {
  const query = searchQuery.trim().toLowerCase()

  const filtered = files.filter((item) => {
    // 1. Status Filter
    if (filter === 'matched' && !item.matched) return false
    if (filter === 'unmatched' && item.matched) return false
    if (filter === 'iso' && !item.isIso && !item.hasIsoSource && !item.sources?.some((s) => s.isIso)) return false
    if (filter === 'duplicates' && !item.isMultiSource && (!item.sources || item.sources.length <= 1)) return false

    // 2. Search query filter
    if (query) {
      const matchTitle = item.title?.toLowerCase().includes(query) ?? false
      const matchPath = item.path?.toLowerCase().includes(query) ?? false
      const matchFormat = item.format?.toLowerCase().includes(query) ?? false
      const matchPlatform = resolvePlatformLabel(item).toLowerCase().includes(query)
      const matchExt = getFileExtension(item.path).includes(query)
      const matchVersion = (resolveItemVersion(item) || '').toLowerCase().includes(query)
      if (!matchTitle && !matchPath && !matchFormat && !matchPlatform && !matchExt && !matchVersion) {
        return false
      }
    }

    return true
  })

  // Sort
  return filtered.sort((a, b) => {
    if (sort === 'name-asc') {
      return (a.title || '').localeCompare(b.title || '')
    }
    if (sort === 'name-desc') {
      return (b.title || '').localeCompare(a.title || '')
    }
    if (sort === 'path-asc') {
      return (a.path || '').localeCompare(b.path || '')
    }
    if (sort === 'path-desc') {
      return (b.path || '').localeCompare(a.path || '')
    }
    if (sort === 'platform-asc') {
      return resolvePlatformLabel(a).localeCompare(resolvePlatformLabel(b))
    }
    if (sort === 'platform-desc') {
      return resolvePlatformLabel(b).localeCompare(resolvePlatformLabel(a))
    }
    if (sort === 'version-asc') {
      const aVer = resolveItemVersion(a) || ''
      const bVer = resolveItemVersion(b) || ''
      return aVer.localeCompare(bVer, undefined, { numeric: true })
    }
    if (sort === 'version-desc') {
      const aVer = resolveItemVersion(a) || ''
      const bVer = resolveItemVersion(b) || ''
      return bVer.localeCompare(aVer, undefined, { numeric: true })
    }
    if (sort === 'format-asc') {
      const aBadge = getFileFormatBadge(a).label
      const bBadge = getFileFormatBadge(b).label
      return aBadge.localeCompare(bBadge)
    }
    if (sort === 'format-desc') {
      const aBadge = getFileFormatBadge(a).label
      const bBadge = getFileFormatBadge(b).label
      return bBadge.localeCompare(aBadge)
    }
    if (sort === 'size-desc') {
      return (b.sizeBytes || 0) - (a.sizeBytes || 0)
    }
    if (sort === 'size-asc') {
      return (a.sizeBytes || 0) - (b.sizeBytes || 0)
    }
    if (sort === 'date-desc') {
      const aTime = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0
      const bTime = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0
      return bTime - aTime
    }
    if (sort === 'date-asc') {
      const aTime = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0
      const bTime = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0
      return aTime - bTime
    }
    if (sort === 'status' || sort === 'status-desc') {
      const aVal = a.matched ? 1 : 0
      const bVal = b.matched ? 1 : 0
      if (bVal !== aVal) return bVal - aVal
      return (a.title || '').localeCompare(b.title || '')
    }
    if (sort === 'status-asc') {
      const aVal = a.matched ? 1 : 0
      const bVal = b.matched ? 1 : 0
      if (aVal !== bVal) return aVal - bVal
      return (a.title || '').localeCompare(b.title || '')
    }
    return 0
  })
}

export function paginateScannedFiles(
  files: ScannedGameItem[],
  page: number,
  pageSize: number,
): {
  pagedItems: ScannedGameItem[]
  totalPages: number
  startIndex: number
  endIndex: number
} {
  const total = files.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.max(1, Math.min(page, totalPages))
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, total)
  const pagedItems = files.slice(startIndex, endIndex)

  return {
    pagedItems,
    totalPages,
    startIndex,
    endIndex,
  }
}

export function formatScanSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—'
  return formatBytes(bytes)
}

export function getNodeStorageScanKey(nodeId?: number | null): string {
  return `otix:node-scan-files:${nodeId ?? 'local'}`
}
