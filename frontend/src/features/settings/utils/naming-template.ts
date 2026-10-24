/**
 * Naming Template & Token Utilities for Game Library & ISO Organization.
 *
 * Provides syntax tokenization, color coding, preset folder structures,
 * and live preview generation.
 */

export interface TokenDef {
  token: string
  label: string
  description: string
  example: string
  colorClass: string
  bgClass: string
  borderClass: string
}

export const TOKEN_COLOR_MAP: Record<string, TokenDef> = {
  Title: {
    token: '{Title}',
    label: 'Title',
    description: 'Clean game title',
    example: 'Cyberpunk 2077',
    colorClass: 'text-cyan-300',
    bgClass: 'bg-cyan-500/15',
    borderClass: 'border-cyan-500/30',
  },
  CleanTitle: {
    token: '{CleanTitle}',
    label: 'Clean Title',
    description: 'Normalized game title fallback',
    example: 'Cyberpunk 2077',
    colorClass: 'text-cyan-300',
    bgClass: 'bg-cyan-500/15',
    borderClass: 'border-cyan-500/30',
  },
  Year: {
    token: '{Year}',
    label: 'Year',
    description: 'Release year',
    example: '2020',
    colorClass: 'text-emerald-300',
    bgClass: 'bg-emerald-500/15',
    borderClass: 'border-emerald-500/30',
  },
  Platform: {
    token: '{Platform}',
    label: 'Platform',
    description: 'Target platform',
    example: 'PC',
    colorClass: 'text-purple-300',
    bgClass: 'bg-purple-500/15',
    borderClass: 'border-purple-500/30',
  },
  ReleaseGroup: {
    token: '{ReleaseGroup}',
    label: 'Release Group',
    description: 'Scene release or repack group',
    example: 'ElAmigos',
    colorClass: 'text-amber-300',
    bgClass: 'bg-amber-500/15',
    borderClass: 'border-amber-500/30',
  },
  Edition: {
    token: '{Edition}',
    label: 'Edition',
    description: 'Special game edition',
    example: 'GOTY Edition',
    colorClass: 'text-rose-300',
    bgClass: 'bg-rose-500/15',
    borderClass: 'border-rose-500/30',
  },
  Version: {
    token: '{Version}',
    label: 'Version',
    description: 'Game build or version number',
    example: '2.12',
    colorClass: 'text-yellow-300',
    bgClass: 'bg-yellow-500/15',
    borderClass: 'border-yellow-500/30',
  },
  OriginalName: {
    token: '{OriginalName}',
    label: 'Original Name',
    description: 'Unprocessed release filename or folder',
    example: 'Cyberpunk.2077.v2.12.REPACK-ELAMIGOS',
    colorClass: 'text-indigo-300',
    bgClass: 'bg-indigo-500/15',
    borderClass: 'border-indigo-500/30',
  },
  MediaType: {
    token: '{MediaType}',
    label: 'Media Type',
    description: 'Media format tag (ISO, PC, Update)',
    example: 'ISO',
    colorClass: 'text-sky-300',
    bgClass: 'bg-sky-500/15',
    borderClass: 'border-sky-500/30',
  },
  ext: {
    token: '{ext}',
    label: 'Extension',
    description: 'File extension (auto-filled)',
    example: 'iso',
    colorClass: 'text-zinc-300',
    bgClass: 'bg-zinc-500/15',
    borderClass: 'border-zinc-500/30',
  },
  Region: {
    token: '{Region}',
    label: 'Region',
    description: 'ROM region (USA, EUR, JPN, World)',
    example: 'USA',
    colorClass: 'text-amber-300',
    bgClass: 'bg-amber-500/15',
    borderClass: 'border-amber-500/30',
  },
  TitleId: {
    token: '{TitleId}',
    label: 'Title ID',
    description: 'Console or platform title identifier',
    example: '0100F2C0115B6000',
    colorClass: 'text-fuchsia-300',
    bgClass: 'bg-fuchsia-500/15',
    borderClass: 'border-fuchsia-500/30',
  },
}

export interface IsoFolderPreset {
  id: string
  label: string
  description: string
  template: string
  badge: string
}

export const ISO_FOLDER_PRESETS: IsoFolderPreset[] = [
  {
    id: 'standard',
    label: 'Standard',
    description: 'Subfolder with Year & Platform, preserves original release name for file',
    template: '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}',
    badge: 'Recommended',
  },
  {
    id: 'clean_game_folder',
    label: 'Clean Game Folder',
    description: 'Title & Year folder with clean ISO filename',
    template: '{Title} ({Year})/{Title}.{ext}',
    badge: 'Clean',
  },
  {
    id: 'flat_title',
    label: 'Flat by Title',
    description: 'Single folder per game matching title',
    template: '{Title}/{Title}.{ext}',
    badge: 'Simple',
  },
  {
    id: 'scene_release',
    label: 'Scene Release Format',
    description: 'Organized by Title with Version and Release Group in the filename',
    template: '{Title}/{Title}.v{Version}-{ReleaseGroup}.{ext}',
    badge: 'Archival',
  },
  {
    id: 'year_subfolder',
    label: 'Year Grouped',
    description: 'Organize games categorized first by release year',
    template: '{Year}/{Title}/{OriginalName}.{ext}',
    badge: 'Chronological',
  },
  {
    id: 'platform_subfolder',
    label: 'Platform Subfolders',
    description: 'Sort library into top-level Platform folders with Title and Year',
    template: '{Platform}/{Title} ({Year})/{Title}.{ext}',
    badge: 'Consolidated',
  },
  {
    id: 'rom_standard',
    label: 'ROMs & Emulation',
    description: 'Organize ROMs by Platform, Title, and Region',
    template: '{Platform}/{Title} ({Region})/{Title}.{ext}',
    badge: 'Emulation',
  },
]

export interface TokenSpan {
  type: 'token' | 'literal'
  text: string
  tokenKey?: string
  def?: TokenDef
}

/**
 * Tokenize a template string into tokens and literal separator spans.
 */
export function tokenizeTemplate(template: string): TokenSpan[] {
  const spans: TokenSpan[] = []
  const regex = /\{(\w+)\}/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(template)) !== null) {
    if (match.index > lastIndex) {
      spans.push({
        type: 'literal',
        text: template.slice(lastIndex, match.index),
      })
    }

    const key = match[1]
    const def = TOKEN_COLOR_MAP[key]
    spans.push({
      type: 'token',
      text: match[0],
      tokenKey: key,
      def,
    })

    lastIndex = regex.lastIndex
  }

  if (lastIndex < template.length) {
    spans.push({
      type: 'literal',
      text: template.slice(lastIndex),
    })
  }

  return spans
}

export interface SampleReleaseData {
  title: string
  year: string
  platform: string
  group: string
  edition: string
  version: string
  originalName: string
  mediaType: string
  ext: string
  region?: string
  titleId?: string
  category?: 'iso' | 'folder_package' | 'game_exe' | 'update' | 'dlc' | 'mod' | 'crack' | 'bonus' | 'rom' | 'metadata'
  isPackage?: boolean
  childFiles?: string[]
}

export const SAMPLE_RELEASES: SampleReleaseData[] = [
  // 1. Base Game ISO
  {
    title: 'Cyberpunk 2077',
    year: '2020',
    platform: 'PC',
    group: 'ElAmigos',
    edition: 'Ultimate Edition',
    version: '2.12',
    originalName: 'Cyberpunk.2077.v2.12.REPACK-ELAMIGOS',
    mediaType: 'ISO',
    ext: 'iso',
    category: 'iso',
  },
  // 2. DLC / Expansion for Cyberpunk 2077
  {
    title: 'Cyberpunk 2077',
    year: '2020',
    platform: 'PC',
    group: 'CDPR',
    edition: 'Phantom Liberty',
    version: '2.0',
    originalName: 'Cyberpunk.2077.Phantom.Liberty.DLC-ELAMIGOS',
    mediaType: 'DLC',
    ext: 'iso',
    category: 'dlc',
  },
  // 3. Update patch for Cyberpunk 2077
  {
    title: 'Cyberpunk 2077',
    year: '2020',
    platform: 'PC',
    group: 'Scene',
    edition: '',
    version: '2.13',
    originalName: 'Cyberpunk 2077 update 2.12 - 2.13',
    mediaType: 'Update',
    ext: 'exe',
    category: 'update',
  },
  // 4. Mod for Cyberpunk 2077
  {
    title: 'Cyberpunk 2077',
    year: '2020',
    platform: 'PC',
    group: 'NexusMods',
    edition: '',
    version: '1.32.0',
    originalName: 'Cyber Engine Tweaks v1.32.0',
    mediaType: 'Mod',
    ext: 'zip',
    category: 'mod',
  },
  // 5. Crackfix for Cyberpunk 2077
  {
    title: 'Cyberpunk 2077',
    year: '2020',
    platform: 'PC',
    group: 'RUNE',
    edition: '',
    version: '2.12',
    originalName: 'Cyberpunk.2077.v2.12.Crackfix-RUNE',
    mediaType: 'Crack',
    ext: 'exe',
    category: 'crack',
  },
  // 6. Bonus / Soundtrack for Cyberpunk 2077
  {
    title: 'Cyberpunk 2077',
    year: '2020',
    platform: 'PC',
    group: 'CDPR',
    edition: 'Original Soundtrack',
    version: '',
    originalName: 'Cyberpunk 2077 Official Soundtrack (FLAC)',
    mediaType: 'Bonus',
    ext: 'zip',
    category: 'bonus',
  },
  // 7. Base Game ISO - Elden Ring
  {
    title: 'Elden Ring',
    year: '2022',
    platform: 'PC',
    group: 'RUNE',
    edition: 'Shadow of the Erdtree',
    version: '1.14',
    originalName: 'Elden.Ring.Shadow.of.the.Erdtree.REPACK-RUNE',
    mediaType: 'ISO',
    ext: 'iso',
    category: 'iso',
  },
  // 8. Mod for Elden Ring
  {
    title: 'Elden Ring',
    year: '2022',
    platform: 'PC',
    group: 'LukeYui',
    edition: '',
    version: '1.8.2',
    originalName: 'Seamless Co-op Mod v1.8.2',
    mediaType: 'Mod',
    ext: 'zip',
    category: 'mod',
  },
  // 9. Base Game ISO - The Witcher 3
  {
    title: 'The Witcher 3',
    year: '2015',
    platform: 'PC',
    group: 'GOG',
    edition: 'GOTY Edition',
    version: '4.04',
    originalName: 'The.Witcher.3.Wild.Hunt.GOTY-GOG',
    mediaType: 'ISO',
    ext: 'iso',
    category: 'iso',
  },
  // 10. DLC for The Witcher 3
  {
    title: 'The Witcher 3',
    year: '2015',
    platform: 'PC',
    group: 'GOG',
    edition: 'Blood and Wine',
    version: '1.32',
    originalName: 'The.Witcher.3.Wild.Hunt.Blood.and.Wine.DLC-GOG',
    mediaType: 'DLC',
    ext: 'exe',
    category: 'dlc',
  },
  // 11. Folder Package (Repack with installer files)
  {
    title: 'Baldurs Gate 3',
    year: '2023',
    platform: 'PC',
    group: 'FitGirl',
    edition: '',
    version: '4.1.1',
    originalName: 'Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL',
    mediaType: 'Folder Package',
    ext: '',
    category: 'folder_package',
    isPackage: true,
    childFiles: ['setup.exe', 'setup-fitgirl-1.bin', 'setup-fitgirl-2.bin', 'quickSFV.exe'],
  },
  // 12. Installed game folder package
  {
    title: 'Hollow Knight',
    year: '2017',
    platform: 'PC',
    group: 'Team Cherry',
    edition: '',
    version: '1.5.0',
    originalName: 'Hollow Knight',
    mediaType: 'Folder Package',
    ext: '',
    category: 'folder_package',
    isPackage: true,
    childFiles: ['HollowKnight.exe', 'UnityCrashHandler64.exe', 'hollow_knight_Data'],
  },
  // 13. Standalone Portable Game Executable
  {
    title: 'Hades II',
    year: '2024',
    platform: 'PC',
    group: 'Supergiant',
    edition: 'Early Access',
    version: '0.91024',
    originalName: 'Hades.II.v0.91024-EarlyAccess',
    mediaType: 'Game Exe',
    ext: 'exe',
    category: 'game_exe',
  },
  // 14. Console Emulation ROM - Switch
  {
    title: 'The Legend of Zelda Tears of the Kingdom',
    year: '2023',
    platform: 'Switch',
    group: 'Nintendo',
    edition: '',
    version: '1.0',
    originalName: 'The Legend of Zelda Tears of the Kingdom [0100F2C0115B6000][v0]',
    mediaType: 'ROM',
    ext: 'nsp',
    region: 'World',
    titleId: '0100F2C0115B6000',
    category: 'rom',
  },
  // 15. Console Emulation ROM - N64
  {
    title: 'Super Mario 64',
    year: '1996',
    platform: 'N64',
    group: 'Nintendo',
    edition: '',
    version: '1.0',
    originalName: 'Super Mario 64 (USA)',
    mediaType: 'ROM',
    ext: 'z64',
    region: 'USA',
    category: 'rom',
  },
  // 16. Console Emulation ROM - PS2
  {
    title: 'God of War II',
    year: '2007',
    platform: 'PS2',
    group: 'Sony',
    edition: '',
    version: '1.0',
    originalName: 'God of War II (USA)',
    mediaType: 'ROM',
    ext: 'chd',
    region: 'USA',
    category: 'rom',
  },
  // 17. Console Emulation ROM - GBA
  {
    title: 'Pokemon - Emerald Version',
    year: '2004',
    platform: 'GBA',
    group: 'Game Freak',
    edition: '',
    version: '1.0',
    originalName: 'Pokemon - Emerald Version (USA, Europe)',
    mediaType: 'ROM',
    ext: 'gba',
    region: 'USA',
    category: 'rom',
  },
]

export function getGameFolderFromTemplate(template: string, sample: SampleReleaseData): string {
  const parts = template.split(/[\\/]/)
  const folderPattern = parts.length > 1 ? parts.slice(0, -1).join('/') : '{Title} ({Year}) [{Platform}]'

  const tokens: Record<string, string> = {
    Title: sample.title,
    CleanTitle: sample.title,
    Year: sample.year,
    Platform: sample.platform,
    ReleaseGroup: sample.group,
    Edition: sample.edition,
    Version: sample.version,
    Region: sample.region || '',
    TitleId: sample.titleId || '',
    OriginalName: sample.originalName,
    MediaType: sample.mediaType,
    ext: sample.ext || '',
  }

  let folder = folderPattern
  for (const [key, value] of Object.entries(tokens)) {
    folder = folder.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '')
  }

  return folder
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\{\s*\}/g, '')
    .replace(/[\\/]+/g, '/')
    .replace(/\/$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Preview how a template formats sample release metadata.
 */
export function formatTemplateSample(template: string, sample: SampleReleaseData): string {
  const folder = getGameFolderFromTemplate(template, sample)
  const extPart = sample.ext ? `.${sample.ext}` : ''

  if (sample.category === 'update') {
    return `${folder}/Updates/${sample.originalName}${extPart}`
  }

  if (sample.category === 'dlc') {
    return `${folder}/DLC/${sample.originalName}${extPart}`
  }

  if (sample.category === 'mod') {
    return `${folder}/Mods/${sample.originalName}${extPart}`
  }

  if (sample.category === 'crack') {
    return `${folder}/Crack/${sample.originalName}${extPart}`
  }

  if (sample.category === 'bonus') {
    return `${folder}/Bonus/${sample.originalName}${extPart}`
  }

  if (sample.isPackage) {
    return folder
  }

  const tokens: Record<string, string> = {
    Title: sample.title,
    CleanTitle: sample.title,
    Year: sample.year,
    Platform: sample.platform,
    ReleaseGroup: sample.group,
    Edition: sample.edition,
    Version: sample.version,
    Region: sample.region || '',
    TitleId: sample.titleId || '',
    OriginalName: sample.originalName,
    MediaType: sample.mediaType,
    ext: sample.ext,
  }

  let result = template
  for (const [key, value] of Object.entries(tokens)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '')
  }

  return result
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\{\s*\}/g, '')
    .replace(/[\\/]+/g, '/')
    .replace(/\/$/, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\//g, '/')
    .replace(/\/\s+/g, '/')
    .trim()
}

export interface PresetStructureBreakdown {
  folderPattern: string
  filePattern: string
}

export function getPresetStructureBreakdown(template: string): PresetStructureBreakdown {
  const parts = template.split(/[\\/]/)
  if (parts.length <= 1) {
    return {
      folderPattern: '',
      filePattern: parts[0] || template,
    }
  }
  return {
    folderPattern: parts.slice(0, -1).join(' / '),
    filePattern: parts[parts.length - 1],
  }
}

export type SampleCategoryFilter =
  | 'all'
  | 'iso'
  | 'update'
  | 'dlc'
  | 'mod'
  | 'crack'
  | 'bonus'
  | 'package'
  | 'rom'

export interface CategoryExplanation {
  title: string
  description: string
  ruleNote: string
  badge: string
}

export const CATEGORY_EXPLANATIONS: Record<SampleCategoryFilter, CategoryExplanation> = {
  all: {
    title: 'Complete Multi-Tier Library Structure',
    description: 'Shows how main games, DLC expansions, update patches, mods, and packages are organized simultaneously.',
    ruleNote: 'Files are automatically sorted into dedicated subfolders according to their detected artifact type.',
    badge: 'All Formats',
  },
  iso: {
    title: 'Base Game Images & ISOs',
    description: 'Primary game disc images and clean release containers.',
    ruleNote: 'Formatted strictly following the active template tokens (Title, Year, Platform, Group).',
    badge: 'Base Images',
  },
  update: {
    title: 'Updates & Patch Installers',
    description: 'Standalone game patches, version increments, and update executables.',
    ruleNote: 'Sorted into a dedicated Updates/ subfolder within the parent game folder to keep root clean.',
    badge: 'Updates/',
  },
  dlc: {
    title: 'DLCs & Addon Expansions',
    description: 'Expansion packs, season passes, and downloadable content.',
    ruleNote: 'Sorted into a dedicated DLC/ subfolder under the game folder.',
    badge: 'DLC/',
  },
  mod: {
    title: 'Community Mods & Script Tools',
    description: 'Mods, texture packs, translation patches, and utility plugins.',
    ruleNote: 'Placed into a dedicated Mods/ subfolder under the game folder.',
    badge: 'Mods/',
  },
  crack: {
    title: 'Cracks & Standalone Crackfixes',
    description: 'Supplementary patches, offline crack fixes, and key generators.',
    ruleNote: 'Stored safely in a dedicated Crack/ subfolder under the game folder.',
    badge: 'Crack/',
  },
  bonus: {
    title: 'Bonus Content & Soundtracks',
    description: 'Digital artbooks, OSTs (FLAC/MP3), making-of videos, and manuals.',
    ruleNote: 'Stored neatly in a dedicated Bonus/ subfolder under the game folder.',
    badge: 'Bonus/',
  },
  package: {
    title: 'Folder Packages & Unpacked Games',
    description: 'Multi-file releases, repacks with setup.exe and .bin files, and unpacked game folders.',
    ruleNote: 'The container folder is organized under the game title; internal files remain untouched.',
    badge: 'Packages',
  },
  rom: {
    title: 'Emulation ROMs & Disc Images',
    description: 'Console game dumps across Nintendo, PlayStation, Sega, and retro platforms.',
    ruleNote: 'Integrates {Region} and {TitleId} metadata tokens for emulator library scrapers.',
    badge: 'Emulation',
  },
}

export interface LibraryTreeNode {
  id: string
  name: string
  type: 'root' | 'folder' | 'file'
  path: string
  category?: 'iso' | 'folder_package' | 'game_exe' | 'update' | 'dlc' | 'mod' | 'crack' | 'bonus' | 'rom' | 'metadata'
  badge?: string
  children?: LibraryTreeNode[]
}

function getFilterSamples(filter: SampleCategoryFilter): SampleReleaseData[] {
  switch (filter) {
    case 'mod':
      return SAMPLE_RELEASES.filter((s) => s.category === 'mod')
    case 'update':
      return SAMPLE_RELEASES.filter((s) => s.category === 'update')
    case 'dlc':
      return SAMPLE_RELEASES.filter((s) => s.category === 'dlc')
    case 'crack':
      return SAMPLE_RELEASES.filter((s) => s.category === 'crack')
    case 'bonus':
      return SAMPLE_RELEASES.filter((s) => s.category === 'bonus')
    case 'package':
      return SAMPLE_RELEASES.filter((s) => s.isPackage)
    case 'rom':
      return SAMPLE_RELEASES.filter((s) => s.category === 'rom').slice(0, 3)
    case 'iso':
      return SAMPLE_RELEASES.filter((s) => s.category === 'iso').slice(0, 3)
    case 'all':
    default:
      // Curated diverse samples covering base ISO + DLC + Update + Mod + Crack + Package + ROM
      return [
        SAMPLE_RELEASES[0], // Cyberpunk ISO
        SAMPLE_RELEASES[1], // Cyberpunk DLC
        SAMPLE_RELEASES[2], // Cyberpunk Update
        SAMPLE_RELEASES[3], // Cyberpunk Mod
        SAMPLE_RELEASES[10], // Baldurs Gate 3 Package
        SAMPLE_RELEASES[13], // Zelda ROM
      ]
  }
}

export function generateLibraryTreePreview(
  template: string,
  rootPath = 'D:\\Games\\ISOs',
  filter: SampleCategoryFilter = 'all',
): LibraryTreeNode {
  const cleanRoot = rootPath.trim() || 'D:\\Games\\ISOs'
  const isWindows = cleanRoot.includes('\\') || /^[a-zA-Z]:/.test(cleanRoot)
  const sep = isWindows ? '\\' : '/'

  const rootNode: LibraryTreeNode = {
    id: 'root',
    name: cleanRoot,
    type: 'root',
    path: cleanRoot,
    children: [],
  }

  const samples = getFilterSamples(filter)

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]
    const formatted = formatTemplateSample(template, sample)
    const segments = formatted.split(/[\\/]/).filter(Boolean)
    if (segments.length === 0) continue

    let currentNode = rootNode
    let currentPath = cleanRoot

    for (let s = 0; s < segments.length; s++) {
      const segName = segments[s]
      currentPath = `${currentPath}${sep}${segName}`
      const isFile = s === segments.length - 1 && !sample.isPackage

      if (!currentNode.children) {
        currentNode.children = []
      }

      const existing = currentNode.children.find((c) => c.name === segName)
      let nextNode: LibraryTreeNode
      if (existing) {
        nextNode = existing
      } else {
        let badge: string | undefined
        if (isFile) {
          if (sample.category === 'mod') badge = 'MOD'
          else if (sample.category === 'update') badge = 'UPDATE'
          else if (sample.category === 'dlc') badge = 'DLC'
          else if (sample.category === 'crack') badge = 'CRACK'
          else if (sample.category === 'bonus') badge = 'BONUS'
          else if (sample.category === 'rom') badge = 'ROM'
          else if (sample.category === 'iso') badge = 'ISO'
        }

        nextNode = {
          id: `${currentNode.id}-${s}-${segName}`,
          name: segName,
          type: isFile ? 'file' : 'folder',
          path: currentPath,
          category: isFile ? sample.category : undefined,
          badge,
          children: isFile ? undefined : [],
        }
        currentNode.children.push(nextNode)
      }
      currentNode = nextNode
    }

    // For folder packages, add their child files if present
    if (sample.isPackage && sample.childFiles && sample.childFiles.length > 0) {
      if (!currentNode.children) {
        currentNode.children = []
      }
      for (const childFileName of sample.childFiles) {
        const childPath = `${currentPath}${sep}${childFileName}`
        if (!currentNode.children.some((c) => c.name === childFileName)) {
          currentNode.children.push({
            id: `${currentNode.id}-child-${childFileName}`,
            name: childFileName,
            type: 'file',
            path: childPath,
            category: 'folder_package',
            badge: childFileName.endsWith('.exe') ? 'INSTALLER' : 'DATA',
          })
        }
      }
    }
  }

  return rootNode
}
