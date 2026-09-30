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
  },
]

/**
 * Preview how a template formats sample release metadata.
 */
export function formatTemplateSample(template: string, sample: SampleReleaseData): string {
  const tokens: Record<string, string> = {
    Title: sample.title,
    CleanTitle: sample.title,
    Year: sample.year,
    Platform: sample.platform,
    ReleaseGroup: sample.group,
    Edition: sample.edition,
    Version: sample.version,
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
