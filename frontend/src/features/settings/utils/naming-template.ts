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
    label: 'Standard (arr-style)',
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
 * e.g. "{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}" ->
 * [
 *   { type: 'token', text: '{Title}', tokenKey: 'Title', def: ... },
 *   { type: 'literal', text: ' (' },
 *   { type: 'token', text: '{Year}', tokenKey: 'Year', def: ... },
 *   ...
 * ]
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
  category?: 'iso' | 'folder_package' | 'game_exe' | 'update' | 'dlc' | 'rom' | 'metadata'
  isPackage?: boolean
  childFiles?: string[]
}

export const SAMPLE_RELEASES: SampleReleaseData[] = [
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

/**
 * Preview how a template formats sample release metadata.
 */
export function formatTemplateSample(template: string, sample: SampleReleaseData): string {
  if (sample.category === 'update') {
    const yearPart = sample.year ? ` (${sample.year})` : ''
    const ext = sample.ext ? `.${sample.ext}` : ''
    return `${sample.title}${yearPart} [${sample.platform}]/Updates/${sample.originalName}${ext}`
  }

  if (sample.category === 'dlc') {
    const yearPart = sample.year ? ` (${sample.year})` : ''
    const ext = sample.ext ? `.${sample.ext}` : ''
    return `${sample.title}${yearPart} [${sample.platform}]/DLC/${sample.originalName}${ext}`
  }

  if (sample.isPackage) {
    const folderTemplate = template.split(/[\\/]/).slice(0, -1).join('/') || '{Title} ({Year}) [{Platform}]'
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
      ext: '',
    }
    let res = folderTemplate
    for (const [key, value] of Object.entries(tokens)) {
      res = res.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '')
    }
    return res
      .replace(/\(\s*\)/g, '')
      .replace(/\[\s*\]/g, '')
      .replace(/\{\s*\}/g, '')
      .replace(/[\\/]+/g, '/')
      .replace(/\/$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
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

  // Clean empty brackets and multiple slashes
  result = result
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\{\s*\}/g, '')
    .replace(/[\\/]+/g, '/')
    .replace(/\/$/, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\//g, '/')
    .replace(/\/\s+/g, '/')
    .trim()

  return result
}

