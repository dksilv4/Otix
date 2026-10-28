import type { ServerProwlarrRelease } from './usenet-types'
import { sortReleasesByQuality } from './usenet-utils'

export type ReleaseKind = 'game' | 'update' | 'dlc' | 'other'

export interface ParsedGameRelease {
  kind: ReleaseKind
  gameKey: string
  gameTitle: string
  editionKey: string
  editionLabel: string
  version: string | null
  sceneGroup: string | null
  repackerKey: string
  repackerLabel: string
  platform: string | null
  platformKey: string | null
  location: string | null
  locationCode: string | null
  year: string | null
  matchedQuery: boolean
  rawTitle: string
}

export interface ClassifiedRelease {
  release: ServerProwlarrRelease
  parsed: ParsedGameRelease
}

export interface VersionBucket {
  version: string | null
  items: ClassifiedRelease[]
}

export interface EditionBucket {
  key: string
  title: string
  versions: VersionBucket[]
}

export interface ReleaseSection {
  id: ReleaseKind
  title: string
  editions: EditionBucket[]
}

const FULL_PACK_RE =
  /\b(?:incl(?:uding)?|incl\.?)\b[\s._-]*(?:all[\s._-]*)?(?:updates?|dlcs?|dlc)\b/i
const UPDATE_RE =
  /(?:^|[^a-z0-9])(?:updates?d?|patch(?:es)?|hotfix(?:es)?|crackfix(?:es)?|crack[\s._-]*only)(?=$|[^a-z])/i
const DLC_RE = /(?:^|[^a-z0-9])(?:dlcs?|expansion(?:s)?|add[\s._-]*ons?)(?=$|[^a-z])/i
const COMPLETE_EDITION_RE = /\bcomplete[\s._-]*edition\b/i
const SCENE_GROUP_RE = /-([A-Za-z][A-Za-z0-9]{1,24})(?:\.[A-Za-z0-9]+)?$/
const FILE_EXT_RE = /\.(nzb|rar|iso|zip|7z|exe|torrent)$/i
const UPDATE_VERSION_RE =
  /\b(?:update|patch|hotfix|crackfix)s?d?[\s._-]*(?:v(?:er(?:sion)?)?[\s._-]*)?(\d+(?:[._]\d+){0,4})\b/i
const PREFIXED_VERSION_RE = /\bv(?:er(?:sion)?)?[\s._-]*(\d+(?:[._]\d+){1,4})\b/i

const EDITIONS: { key: string; label: string; pattern: RegExp }[] = [
  { key: 'goty', label: 'Game of the Year', pattern: /\b(?:goty|game[\s._-]*of[\s._-]*the[\s._-]*year)\b/i },
  { key: 'directors', label: "Director's Cut", pattern: /\bdirectors?[\s._-]*cut\b/i },
  { key: 'royal', label: 'Royal Edition', pattern: /\broyal(?:[\s._-]*edition)?\b/i },
  { key: 'deluxe', label: 'Deluxe Edition', pattern: /\bdeluxe(?:[\s._-]*edition)?\b/i },
  { key: 'ultimate', label: 'Ultimate Edition', pattern: /\bultimate(?:[\s._-]*edition)?\b/i },
  { key: 'definitive', label: 'Definitive Edition', pattern: /\bdefinitive(?:[\s._-]*edition)?\b/i },
  { key: 'legendary', label: 'Legendary Edition', pattern: /\blegendary(?:[\s._-]*edition)?\b/i },
  { key: 'premium', label: 'Premium Edition', pattern: /\bpremium(?:[\s._-]*edition)?\b/i },
  { key: 'gold', label: 'Gold Edition', pattern: /\bgold(?:[\s._-]*edition)?\b/i },
  { key: 'complete', label: 'Complete Edition', pattern: /\bcomplete(?:[\s._-]*edition)?\b/i },
  { key: 'enhanced', label: 'Enhanced Edition', pattern: /\benhanced(?:[\s._-]*edition)?\b/i },
  { key: 'anniversary', label: 'Anniversary Edition', pattern: /\banniversary(?:[\s._-]*edition)?\b/i },
  { key: 'remastered', label: 'Remastered', pattern: /\bremaster(?:ed)?\b/i },
  { key: 'collection', label: 'Collection', pattern: /\bcollection\b/i },
]

const STANDARD_EDITION = { key: 'standard', label: 'Standard' }

const REPACKERS: { key: string; label: string; pattern: RegExp }[] = [
  { key: 'elamigos', label: 'ElAmigos', pattern: /\belamigos\b/i },
  { key: 'fitgirl', label: 'FitGirl', pattern: /\bfitgirl\b/i },
  { key: 'dodi', label: 'DODI', pattern: /\bdodi\b/i },
  { key: 'empress', label: 'EMPRESS', pattern: /\bempress\b/i },
  { key: 'codex', label: 'CODEX', pattern: /\bcodex\b/i },
  { key: 'rune', label: 'RUNE', pattern: /\brune\b/i },
  { key: 'flt', label: 'FLT', pattern: /\bflt\b/i },
  { key: 'skidrow', label: 'SKIDROW', pattern: /\bskidrow\b/i },
  { key: 'plaza', label: 'PLAZA', pattern: /\bplaza\b/i },
  { key: 'cpy', label: 'CPY', pattern: /\bcpy\b/i },
  { key: 'gog', label: 'GOG', pattern: /\bgog\b/i },
  { key: 'steam', label: 'Steam', pattern: /\bsteam\b/i },
]

const NOISE_TAGS = new Set([
  'repack',
  'proper',
  'readnfo',
  'internal',
  'dirfix',
  'nfofix',
  'multi',
  'multilang',
  'english',
  'eng',
  'iso',
  'setup',
  'gog',
  'steam',
  'epic',
  'origin',
  'fitgirl',
  'dodi',
  'elamigos',
  'rune',
  'flt',
  'empress',
  'codex',
  'skidrow',
  'plaza',
  'cpy',
  'goldberg',
  'pc',
  'windows',
  'win',
  'goty',
  'complete',
  'edition',
  'royal',
  'deluxe',
  'ultimate',
  'definitive',
  'collection',
  'bundle',
  'update',
  'updates',
  'patch',
  'patches',
  'hotfix',
  'hotfixes',
  'crackfix',
  'crack',
  'only',
  'dlc',
  'dlcs',
  'expansion',
  'expansions',
  'incl',
  'including',
  'all',
  'gold',
  'legendary',
  'premium',
  'enhanced',
  'anniversary',
  'remaster',
  'remastered',
  'directors',
  'director',
  'cut',
  'year',
  'the',
  // Platforms
  'switch',
  'nsw',
  'ps5',
  'ps4',
  'ps3',
  'ps2',
  'ps1',
  'psx',
  'psp',
  'psvita',
  'xbox',
  'x360',
  'wii',
  'wiiu',
  'gamecube',
  'ngc',
  'snes',
  'sfc',
  'nes',
  'nds',
  '3ds',
  'gba',
  'gbc',
  'linux',
  'macos',
  'osx',
  // Locations / Countries
  'usa',
  'eur',
  'jpn',
  'asia',
  'world',
  'global',
  'ger',
  'fra',
  'spa',
  'ita',
  'kor',
  'rus',
  'bra',
  'aus',
  'chn',
])

export interface PlatformInfo {
  key: string
  label: string
}

export interface LocationInfo {
  code: string
  label: string
}

const PLATFORMS: { key: string; label: string; pattern: RegExp }[] = [
  // Nintendo consoles & handhelds
  { key: 'switch', label: 'Nintendo Switch', pattern: /(?:^|[^a-z0-9])(?:nsw|switch|nintendo[\s._-]*switch)(?=$|[^a-z0-9])/i },
  { key: 'wiiu', label: 'Wii U', pattern: /(?:^|[^a-z0-9])(?:wii[\s._-]*u|wiiu)(?=$|[^a-z0-9])/i },
  { key: 'wii', label: 'Wii', pattern: /(?:^|[^a-z0-9])wii(?=$|[^a-z0-9])/i },
  { key: 'gamecube', label: 'GameCube', pattern: /(?:^|[^a-z0-9])(?:gamecube|ngc)(?=$|[^a-z0-9])/i },
  { key: 'n64', label: 'Nintendo 64', pattern: /(?:^|[^a-z0-9])(?:n64|nintendo[\s._-]*64)(?=$|[^a-z0-9])/i },
  { key: 'snes', label: 'SNES', pattern: /(?:^|[^a-z0-9])(?:snes|sfc|super[\s._-]*nintendo)(?=$|[^a-z0-9])/i },
  { key: 'nes', label: 'NES', pattern: /(?:^|[^a-z0-9])(?:nes|famicom)(?=$|[^a-z0-9])/i },
  { key: '3ds', label: 'Nintendo 3DS', pattern: /(?:^|[^a-z0-9])(?:3ds|nintendo[\s._-]*3ds)(?=$|[^a-z0-9])/i },
  { key: 'nds', label: 'Nintendo DS', pattern: /(?:^|[^a-z0-9])(?:nds|nintendo[\s._-]*ds)(?=$|[^a-z0-9])/i },
  { key: 'gba', label: 'Game Boy Advance', pattern: /(?:^|[^a-z0-9])(?:gba|game[\s._-]*boy[\s._-]*advance)(?=$|[^a-z0-9])/i },
  { key: 'gbc', label: 'Game Boy Color', pattern: /(?:^|[^a-z0-9])(?:gbc|game[\s._-]*boy[\s._-]*color)(?=$|[^a-z0-9])/i },
  { key: 'gb', label: 'Game Boy', pattern: /(?:^|[^a-z0-9])(?:game[\s._-]*boy|\(gb\)|\[gb\])(?=$|[^a-z0-9])/i },

  // PlayStation
  { key: 'ps5', label: 'PS5', pattern: /(?:^|[^a-z0-9])(?:ps5|playstation[\s._-]*5)(?=$|[^a-z0-9])/i },
  { key: 'ps4', label: 'PS4', pattern: /(?:^|[^a-z0-9])(?:ps4|playstation[\s._-]*4)(?=$|[^a-z0-9])/i },
  { key: 'ps3', label: 'PS3', pattern: /(?:^|[^a-z0-9])(?:ps3|playstation[\s._-]*3)(?=$|[^a-z0-9])/i },
  { key: 'ps2', label: 'PS2', pattern: /(?:^|[^a-z0-9])(?:ps2|playstation[\s._-]*2)(?=$|[^a-z0-9])/i },
  { key: 'ps1', label: 'PS1', pattern: /(?:^|[^a-z0-9])(?:ps1|psx|playstation[\s._-]*1)(?=$|[^a-z0-9])/i },
  { key: 'psp', label: 'PSP', pattern: /(?:^|[^a-z0-9])(?:psp|playstation[\s._-]*portable)(?=$|[^a-z0-9])/i },
  { key: 'psvita', label: 'PS Vita', pattern: /(?:^|[^a-z0-9])(?:psvita|psv|vita)(?=$|[^a-z0-9])/i },

  // Xbox
  { key: 'xbox-series', label: 'Xbox Series', pattern: /(?:^|[^a-z0-9])(?:xbsx|xsx|xbox[\s._-]*series(?:[\s._-]*[xs])?)(?=$|[^a-z0-9])/i },
  { key: 'xbox-one', label: 'Xbox One', pattern: /(?:^|[^a-z0-9])(?:xbox[\s._-]*one|xbo|xb1)(?=$|[^a-z0-9])/i },
  { key: 'xbox-360', label: 'Xbox 360', pattern: /(?:^|[^a-z0-9])(?:x360|xbox[\s._-]*360)(?=$|[^a-z0-9])/i },
  { key: 'xbox', label: 'Xbox', pattern: /(?:^|[^a-z0-9])xbox(?=$|[^a-z0-9])/i },

  // Sega
  { key: 'dreamcast', label: 'Dreamcast', pattern: /(?:^|[^a-z0-9])(?:dreamcast|\(dc\)|\[dc\])(?=$|[^a-z0-9])/i },
  { key: 'saturn', label: 'Saturn', pattern: /(?:^|[^a-z0-9])(?:sega[\s._-]*saturn|saturn)(?=$|[^a-z0-9])/i },
  { key: 'genesis', label: 'Genesis', pattern: /(?:^|[^a-z0-9])(?:genesis|megadrive|mega[\s._-]*drive)(?=$|[^a-z0-9])/i },

  // Computer OS / PC
  { key: 'linux', label: 'Linux', pattern: /(?:^|[^a-z0-9])linux(?=$|[^a-z0-9])/i },
  { key: 'mac', label: 'macOS', pattern: /(?:^|[^a-z0-9])(?:macos|osx|mac[\s._-]*os)(?=$|[^a-z0-9])/i },
  { key: 'pc', label: 'PC', pattern: /(?:^|[^a-z0-9])(?:pc|windows|win(?:32|64)?)(?=$|[^a-z0-9])/i },
]

const PC_SCENE_REPACKERS = new Set([
  'elamigos',
  'fitgirl',
  'dodi',
  'empress',
  'codex',
  'rune',
  'flt',
  'skidrow',
  'plaza',
  'cpy',
  'gog',
  'steam',
  'goldberg',
])

const MULTI_REGION_RE = /[([]\s*(?:USA?|EUR?|Europe|JPN?|Japan|Asia|World|Global)(?:\s*,\s*(?:USA?|EUR?|Europe|JPN?|Japan|Asia|World|Global|Aus(?:tralia)?|Korea|KOR))+\s*[)\]]/i

const LOCATIONS: { code: string; label: string; pattern: RegExp }[] = [
  // Multi-region combinations in brackets
  { code: 'usa-eur', label: 'USA / Europe', pattern: /[([]\s*(?:USA?|US)\s*,\s*(?:EUR?|Europe)\s*[)\]]/i },
  { code: 'usa-jpn', label: 'USA / Japan', pattern: /[([]\s*(?:USA?|US)\s*,\s*(?:JPN?|Japan)\s*[)\]]/i },

  // North America / USA
  { code: 'usa', label: 'USA', pattern: /[([]\s*(?:USA?|US)\s*[)\]]|(?:^|[^a-z0-9])(?:usa|north[\s._-]*america)(?=$|[^a-z0-9])/i },

  // Europe
  { code: 'eur', label: 'Europe', pattern: /[([]\s*(?:EUR?|EU|Europe)\s*[)\]]|(?:^|[^a-z0-9])(?:eur|europe)(?=$|[^a-z0-9])/i },

  // Japan
  { code: 'jpn', label: 'Japan', pattern: /[([]\s*(?:JPN?|JP|Japan)\s*[)\]]|(?:^|[^a-z0-9])(?:jpn|japan)(?=$|[^a-z0-9])/i },

  // World / Global
  { code: 'world', label: 'World', pattern: /[([]\s*(?:World|Global)\s*[)\]]|(?:^|[^a-z0-9])(?:world|global)(?=$|[^a-z0-9])/i },

  // Asia
  { code: 'asia', label: 'Asia', pattern: /[([]\s*Asia\s*[)\]]|(?:^|[^a-z0-9])asia(?=$|[^a-z0-9])/i },

  // Specific Countries
  { code: 'uk', label: 'UK', pattern: /[([]\s*(?:UK|United[\s._-]*Kingdom)\s*[)\]]|(?:^|[^a-z0-9])united[\s._-]*kingdom(?=$|[^a-z0-9])/i },
  { code: 'ger', label: 'Germany', pattern: /[([]\s*(?:GER|DE|German|Germany)\s*[)\]]|(?:^|[^a-z0-9])(?:ger|german|germany)(?=$|[^a-z0-9])/i },
  { code: 'fra', label: 'France', pattern: /[([]\s*(?:FRA|FR|French|France)\s*[)\]]|(?:^|[^a-z0-9])(?:fra|french|france)(?=$|[^a-z0-9])/i },
  { code: 'spa', label: 'Spain', pattern: /[([]\s*(?:SPA|ES|Spanish|Spain)\s*[)\]]|(?:^|[^a-z0-9])(?:spa|spanish|spain)(?=$|[^a-z0-9])/i },
  { code: 'ita', label: 'Italy', pattern: /[([]\s*(?:ITA|IT|Italian|Italy)\s*[)\]]|(?:^|[^a-z0-9])(?:ita|italian|italy)(?=$|[^a-z0-9])/i },
  { code: 'aus', label: 'Australia', pattern: /[([]\s*(?:AUS|AU|Australia)\s*[)\]]|(?:^|[^a-z0-9])(?:aus|australia)(?=$|[^a-z0-9])/i },
  { code: 'kor', label: 'Korea', pattern: /[([]\s*(?:KOR|KR|Korea|Korean)\s*[)\]]|(?:^|[^a-z0-9])(?:kor|korea|korean)(?=$|[^a-z0-9])/i },
  { code: 'bra', label: 'Brazil', pattern: /[([]\s*(?:BRA|BR|Brazil|Brazilian|PT-BR)\s*[)\]]|(?:^|[^a-z0-9])(?:bra|brazil|brazilian)(?=$|[^a-z0-9])/i },
  { code: 'rus', label: 'Russia', pattern: /[([]\s*(?:RUS|RU|Russia|Russian)\s*[)\]]|(?:^|[^a-z0-9])(?:rus|russia|russian)(?=$|[^a-z0-9])/i },
  { code: 'chn', label: 'China', pattern: /[([]\s*(?:CHN|CN|China|Chinese|ZH)\s*[)\]]|(?:^|[^a-z0-9])(?:chn|china|chinese)(?=$|[^a-z0-9])/i },
]

export function extractPlatform(
  title: string,
  sceneGroup?: string | null,
  repackerKey?: string | null,
): PlatformInfo | null {
  for (const plat of PLATFORMS) {
    if (plat.pattern.test(title)) return { key: plat.key, label: plat.label }
  }
  const group = (sceneGroup ?? '').toLowerCase()
  const repacker = (repackerKey ?? '').toLowerCase()
  if (PC_SCENE_REPACKERS.has(repacker) || PC_SCENE_REPACKERS.has(group)) {
    return { key: 'pc', label: 'PC' }
  }
  return null
}

export function extractLocation(title: string, searchHint?: string): LocationInfo | null {
  const hintTokens = new Set(
    (searchHint || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  )

  // Check multi-region bracket first
  if (MULTI_REGION_RE.test(title)) {
    const specific = LOCATIONS.find((loc) => loc.pattern.test(title))
    if (specific) return { code: specific.code, label: specific.label }
    return { code: 'world', label: 'World' }
  }

  for (const loc of LOCATIONS) {
    if (loc.pattern.test(title)) {
      if (hintTokens.has(loc.code) || hintTokens.has(loc.label.toLowerCase())) {
        continue
      }
      return { code: loc.code, label: loc.label }
    }
  }

  // Check MULTi language tags, e.g. MULTi5, MULTi13, MULTi
  const multiMatch = title.match(/(?:^|[^a-z0-9])multi(\d+)?(?=$|[^a-z0-9])/i)
  if (multiMatch) {
    return {
      code: 'multi',
      label: multiMatch[1] ? `MULTi${multiMatch[1]}` : 'MULTi',
    }
  }

  return null
}

export function extractReleaseYear(title: string, searchHint?: string): string | null {
  const hintTokens = new Set(
    (searchHint || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  )

  // 1. In brackets or parentheses: (2023), [2018], (1998)
  const bracketMatch = title.match(/[([]\s*(19[7-9]\d|20[0-3]\d)\s*[)\]]/)
  if (bracketMatch?.[1]) {
    const yr = bracketMatch[1]
    if (!hintTokens.has(yr)) return yr
  }

  // 2. Standalone 4-digit year tokens (1970 - 2035)
  const matches = [...title.matchAll(/(?:^|[^a-z0-9])(19[7-9]\d|20[0-3]\d)(?=$|[^a-z0-9])/gi)]
  for (const match of matches) {
    const yr = match[1]
    if (!hintTokens.has(yr)) return yr
  }

  return null
}

const ROMAN: Record<string, string> = {
  i: '1',
  ii: '2',
  iii: '3',
  iv: '4',
  vi: '6',
  vii: '7',
  viii: '8',
  ix: '9',
  x: '10',
  xi: '11',
  xii: '12',
  xiii: '13',
  xiv: '14',
  xv: '15',
}

const SECTION_TITLES: Record<ReleaseKind, string> = {
  game: 'Game',
  update: 'Updates',
  dlc: 'DLC',
  other: 'Other',
}

function stripSceneGroup(title: string): { body: string; group: string | null } {
  const trimmed = title.replace(FILE_EXT_RE, '').trim()
  const match = trimmed.match(SCENE_GROUP_RE)
  if (!match) return { body: trimmed, group: null }
  return { body: trimmed.slice(0, -match[0].length).trim(), group: match[1] }
}

function tokenize(body: string): string[] {
  return body
    .toLowerCase()
    .replace(/(update|patch|hotfix|dlc)s?d?(?=\d)/g, '$1 ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function isYearToken(token: string): boolean {
  return /^(19|20)\d{2}$/.test(token)
}

function isVersionToken(token: string): boolean {
  if (isYearToken(token)) return false
  return /^v?\d+(?:[._]\d+){1,4}$/i.test(token) || /^v\d+$/i.test(token)
}

function normalizeToken(token: string): string {
  const lower = token.toLowerCase()
  return ROMAN[lower] ?? lower
}

function titleCase(token: string): string {
  if (/^\d+$/.test(token)) return token
  return token.charAt(0).toUpperCase() + token.slice(1)
}

export function extractReleaseVersion(title: string): string | null {
  const fromUpdate = title.match(UPDATE_VERSION_RE)
  if (fromUpdate?.[1]) return fromUpdate[1].replace(/_/g, '.')
  const prefixed = title.match(PREFIXED_VERSION_RE)
  if (prefixed?.[1]) return prefixed[1].replace(/_/g, '.')
  return null
}

export function classifyReleaseKind(title: string): ReleaseKind {
  const spaced = title.replace(/[._]/g, ' ')
  if (FULL_PACK_RE.test(title) || FULL_PACK_RE.test(spaced)) return 'game'
  if (UPDATE_RE.test(title) || UPDATE_RE.test(spaced)) return 'update'
  if ((DLC_RE.test(title) || DLC_RE.test(spaced)) && !COMPLETE_EDITION_RE.test(title)) return 'dlc'
  return 'game'
}

export function extractEdition(title: string): { key: string; label: string } {
  for (const edition of EDITIONS) {
    if (edition.pattern.test(title)) return { key: edition.key, label: edition.label }
  }
  return STANDARD_EDITION
}

export function extractRepacker(title: string, sceneGroup?: string | null): { key: string; label: string } {
  const haystack = `${title} ${sceneGroup ?? ''}`
  for (const repacker of REPACKERS) {
    if (repacker.pattern.test(haystack)) return { key: repacker.key, label: repacker.label }
  }
  if (sceneGroup?.trim()) return { key: sceneGroup.toLowerCase(), label: sceneGroup }
  return { key: 'unknown', label: 'Unknown' }
}

function buildGameIdentity(tokens: string[]): { key: string; title: string } {
  const kept: string[] = []
  let skippingKindTail = false
  let skippingVersionTail = false

  for (const raw of tokens) {
    const token = raw.toLowerCase()
    if (
      token === 'update' ||
      token === 'updates' ||
      token === 'updated' ||
      token === 'patch' ||
      token === 'patches' ||
      token === 'hotfix' ||
      token === 'dlc' ||
      token === 'dlcs' ||
      token === 'expansion'
    ) {
      skippingKindTail = true
      continue
    }
    if (skippingKindTail) continue
    if (NOISE_TAGS.has(token)) continue
    if (/^multi\d+$/i.test(token)) continue
    if (/^\d{3,4}p$/i.test(token)) continue
    if (isVersionToken(token)) {
      skippingVersionTail = true
      continue
    }
    if (skippingVersionTail && /^\d{1,4}$/.test(token)) continue
    skippingVersionTail = false
    kept.push(normalizeToken(token))
  }

  const key = kept.join(' ').replace(/\s+/g, ' ').trim()
  const title = kept.map(titleCase).join(' ')
  return { key, title }
}

function hintKey(hint?: string): string {
  if (!hint?.trim()) return ''
  const { body } = stripSceneGroup(hint.trim())
  return buildGameIdentity(tokenize(body)).key
}

function initialsFor(key: string): string {
  const tokens = key.split(' ').filter(Boolean)
  const letters = tokens.filter((token) => !/^\d+$/.test(token)).map((token) => token[0]).join('')
  const numbers = tokens.filter((token) => /^\d+$/.test(token)).join('')
  return `${letters}${numbers}`
}

function keysCompatible(key: string, hint: string): boolean {
  if (!key || !hint) return false
  if (key === hint) return true
  if (key.startsWith(`${hint} `) || hint.startsWith(`${key} `)) return true
  const hintInitials = initialsFor(hint)
  const compact = key.replace(/\s+/g, '')
  if (hintInitials.length >= 3 && (compact === hintInitials || compact.startsWith(hintInitials))) {
    return true
  }
  if (hintInitials.length >= 3 && key.split(' ')[0] === hintInitials) return true
  const hintTokens = hint.split(' ')
  if (hintTokens.length < 2) return key.includes(hint)
  const keySet = new Set(key.split(' '))
  const overlap = hintTokens.filter((token) => keySet.has(token)).length
  return overlap / hintTokens.length >= 0.75
}

function leftoverLabel(identityKey: string, hint: string): string | null {
  if (!hint || !identityKey) return null
  if (identityKey === hint) return null
  if (!identityKey.startsWith(`${hint} `)) return null
  const leftover = identityKey.slice(hint.length).trim()
  if (!leftover) return null
  return leftover.split(' ').filter(Boolean).map(titleCase).join(' ')
}

export function parseReleaseTitle(title: string, searchHint?: string): ParsedGameRelease {
  const { body, group } = stripSceneGroup(title)
  const tokens = tokenize(body)
  const identity = buildGameIdentity(tokens)
  const hint = hintKey(searchHint)
  const matchedQuery = !hint || keysCompatible(identity.key, hint)
  const gameKey = hint && matchedQuery ? hint : identity.key
  const gameTitle = gameKey === hint ? buildGameIdentity(tokenize(hint)).title || identity.title : identity.title
  const kind = classifyReleaseKind(title)
  const tagged = extractEdition(title)
  const namedLeftover = leftoverLabel(identity.key, hint)
  const edition =
    tagged.key !== STANDARD_EDITION.key
      ? tagged
      : kind === 'dlc' && namedLeftover
        ? { key: namedLeftover.toLowerCase(), label: namedLeftover }
        : STANDARD_EDITION
  const repacker = extractRepacker(title, group)
  const platform = extractPlatform(title, group, repacker.key)
  const location = extractLocation(title, searchHint)
  const year = extractReleaseYear(title, searchHint)

  return {
    kind,
    gameKey: gameKey || identity.key || title.toLowerCase(),
    gameTitle: gameTitle || identity.title || title,
    editionKey: edition.key,
    editionLabel: edition.label,
    version: extractReleaseVersion(title),
    sceneGroup: group,
    repackerKey: repacker.key,
    repackerLabel: repacker.label,
    platform: platform?.label ?? null,
    platformKey: platform?.key ?? null,
    location: location?.label ?? null,
    locationCode: location?.code ?? null,
    year,
    matchedQuery,
    rawTitle: title,
  }
}

export function releaseMatchesSearchHint(title: string, searchHint?: string): boolean {
  if (!title.trim() || !searchHint?.trim()) return false
  return parseReleaseTitle(title, searchHint).matchedQuery
}

export function compareVersions(a: string | null, b: string | null): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  const left = a.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const right = b.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const len = Math.max(left.length, right.length)
  for (let i = 0; i < len; i += 1) {
    const diff = (right[i] ?? 0) - (left[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function sortClassified(items: ClassifiedRelease[], kind: ReleaseKind): ClassifiedRelease[] {
  if (kind === 'update') {
    return [...items].sort((a, b) => {
      const versionDiff = compareVersions(a.parsed.version, b.parsed.version)
      if (versionDiff !== 0) return versionDiff
      return sortReleasesByQuality([a.release, b.release])[0] === a.release ? -1 : 1
    })
  }
  const ranked = sortReleasesByQuality(items.map((item) => item.release))
  const byGuid = new Map(items.map((item) => [item.release.guid, item]))
  return ranked
    .map((release) => byGuid.get(release.guid))
    .filter((item): item is ClassifiedRelease => Boolean(item))
}

function versionParts(version: string): number[] {
  return version.split('.').map((part) => Number.parseInt(part, 10) || 0)
}

function canonicalVersion(version: string | null): string {
  if (!version) return ''
  const parts = versionParts(version)
  while (parts.length > 1 && parts[parts.length - 1] === 0) parts.pop()
  return parts.join('.')
}

export function isVersionLineage(child: string | null, parent: string | null): boolean {
  if (!child || !parent) return false
  const childParts = versionParts(canonicalVersion(child) || child)
  const parentParts = versionParts(canonicalVersion(parent) || parent)
  if (parentParts.length === 0 || childParts.length < parentParts.length) return false
  return parentParts.every((part, index) => childParts[index] === part)
}

function familyKeyForUpdate(
  updateVersion: string | null,
  installerVersions: string[],
  hasUnversionedInstaller = false,
): string {
  if (!updateVersion) return ''
  const matches = installerVersions.filter((version) => isVersionLineage(updateVersion, version))
  if (matches.length > 0) {
    return [...matches].sort((a, b) => versionParts(b).length - versionParts(a).length)[0]
  }
  if (hasUnversionedInstaller) {
    return ''
  }
  return updateVersion
}

export interface VersionFamily {
  version: string | null
  releases: ClassifiedRelease[]
  updates: ClassifiedRelease[]
}

export interface RepackCluster {
  key: string
  title: string
  isOther: boolean
  versions: VersionFamily[]
}

function emptyFamily(version: string | null): VersionFamily {
  return { version, releases: [], updates: [] }
}

export function groupReleasesByRepackerAndVersion(
  releases: ServerProwlarrRelease[],
  searchHint?: string,
): RepackCluster[] {
  const classified = releases.map((release) => ({
    release,
    parsed: parseReleaseTitle(release.title, searchHint),
  }))

  const buckets = new Map<string, ClassifiedRelease[]>()
  for (const item of classified) {
    const key =
      searchHint && !item.parsed.matchedQuery
        ? 'other'
        : item.parsed.repackerKey || 'unknown'
    const list = buckets.get(key)
    if (list) list.push(item)
    else buckets.set(key, [item])
  }

  return [...buckets.entries()]
    .map(([key, items]) => {
      const isOther = key === 'other'
      const title = isOther ? 'Other results' : items[0]?.parsed.repackerLabel || 'Unknown'
      const installerVersions = items
        .filter((item) => item.parsed.kind !== 'update' && item.parsed.version)
        .map((item) => item.parsed.version as string)
      const hasUnversionedInstaller = items.some(
        (item) => item.parsed.kind !== 'update' && !item.parsed.version,
      )
      const families = new Map<string, VersionFamily>()

      const family = (version: string | null) => {
        const familyKey = canonicalVersion(version)
        const existing = families.get(familyKey)
        if (existing) return existing
        const created = emptyFamily(familyKey || null)
        families.set(familyKey, created)
        return created
      }

      for (const item of items) {
        if (item.parsed.kind === 'update') {
          const target = familyKeyForUpdate(
            item.parsed.version,
            installerVersions,
            hasUnversionedInstaller,
          )
          family(target || null).updates.push(item)
          continue
        }
        family(item.parsed.version).releases.push(item)
      }

      const versions = [...families.values()]
        .map((entry) => ({
          version: entry.version,
          releases: sortClassified(entry.releases, 'game'),
          updates: sortClassified(entry.updates, 'update'),
        }))
        .sort((a, b) => compareVersions(a.version, b.version))

      return { key, title, isOther, versions }
    })
    .sort((a, b) => {
      if (a.isOther !== b.isOther) return a.isOther ? 1 : -1
      if (a.key === 'unknown' && b.key !== 'unknown') return 1
      if (b.key === 'unknown' && a.key !== 'unknown') return -1
      const aSize = Math.max(
        0,
        ...a.versions.flatMap((family) => family.releases.map((item) => item.release.size || 0)),
      )
      const bSize = Math.max(
        0,
        ...b.versions.flatMap((family) => family.releases.map((item) => item.release.size || 0)),
      )
      if (aSize !== bSize) return bSize - aSize
      return a.title.localeCompare(b.title)
    })
}

export function collectReleaseVersions(clusters: RepackCluster[]): string[] {
  const versions = new Set<string>()
  for (const cluster of clusters) {
    for (const family of cluster.versions) {
      if (family.version) versions.add(family.version)
      for (const item of [...family.releases, ...family.updates]) {
        if (item.parsed.version) versions.add(item.parsed.version)
      }
    }
  }
  return [...versions].sort((a, b) => compareVersions(a, b))
}

export function familyMatchesVersion(family: VersionFamily, selected: string): boolean {
  if (!selected || selected === 'all') return true
  if (family.version === selected) return true
  if (family.version && (isVersionLineage(selected, family.version) || isVersionLineage(family.version, selected))) {
    return true
  }
  return [...family.releases, ...family.updates].some((item) => item.parsed.version === selected)
}

export function filterRepackCluster(
  cluster: RepackCluster,
  protocol: 'all' | 'usenet' | 'torrent',
  version: string,
): RepackCluster | null {
  const matchProtocol = (items: ClassifiedRelease[]) =>
    protocol === 'all'
      ? items
      : items.filter((item) => item.release.protocol?.toLowerCase() === protocol)

  const versions = cluster.versions
    .map((family) => ({
      ...family,
      releases: matchProtocol(family.releases),
      updates: matchProtocol(family.updates),
    }))
    .filter((family) => family.releases.length + family.updates.length > 0)
    .filter((family) => familyMatchesVersion(family, version))

  if (versions.length === 0) return null
  return { ...cluster, versions }
}

export function repackClusterCounts(cluster: RepackCluster) {
  return cluster.versions.reduce(
    (sum, family) => ({
      releases: sum.releases + family.releases.length,
      updates: sum.updates + family.updates.length,
      total: sum.total + family.releases.length + family.updates.length,
    }),
    { releases: 0, updates: 0, total: 0 },
  )
}

export interface GamePack {
  key: string
  title: string
  version: string | null
  releases: ClassifiedRelease[]
  updates: ClassifiedRelease[]
}

export interface EditionResultGroup {
  key: string
  title: string
  isOther: boolean
  packs: GamePack[]
}

function packsForItems(items: ClassifiedRelease[]): GamePack[] {
  const installerVersions = items
    .filter((item) => item.parsed.kind !== 'update' && item.parsed.version)
    .map((item) => item.parsed.version as string)
  const hasUnversionedInstaller = items.some(
    (item) => item.parsed.kind !== 'update' && !item.parsed.version,
  )
  const families = new Map<string, VersionFamily>()
  const family = (version: string | null) => {
    const familyKey = canonicalVersion(version)
    const existing = families.get(familyKey)
    if (existing) return existing
    const created = emptyFamily(familyKey || null)
    families.set(familyKey, created)
    return created
  }

  for (const item of items) {
    if (item.parsed.kind === 'update') {
      const target = familyKeyForUpdate(
        item.parsed.version,
        installerVersions,
        hasUnversionedInstaller,
      )
      family(target || null).updates.push(item)
      continue
    }
    family(item.parsed.version).releases.push(item)
  }

  return [...families.values()]
    .map((entry) => {
      const version = entry.version
      return {
        key: version || 'none',
        title: version ? `v${version}` : 'Initial Release',
        version,
        releases: sortClassified(entry.releases, 'game'),
        updates: sortClassified(entry.updates, 'update'),
      }
    })
    .sort((a, b) => compareVersions(a.version, b.version))
}

export function groupResultsByEditionAndPack(
  releases: ServerProwlarrRelease[],
  searchHint?: string,
): EditionResultGroup[] {
  const classified = releases.map((release) => ({
    release,
    parsed: parseReleaseTitle(release.title, searchHint),
  }))

  const matched: ClassifiedRelease[] = []
  const other: ClassifiedRelease[] = []

  for (const item of classified) {
    if (searchHint && !item.parsed.matchedQuery) other.push(item)
    else matched.push(item)
  }

  const groups: EditionResultGroup[] = []
  if (matched.length > 0) {
    groups.push({
      key: 'versions',
      title: '',
      isOther: false,
      packs: packsForItems(matched),
    })
  }
  if (other.length > 0) {
    groups.push({
      key: 'other',
      title: 'Other results',
      isOther: true,
      packs: packsForItems(other),
    })
  }
  return groups
}

export function collectEditionPackVersions(groups: EditionResultGroup[]): string[] {
  const versions = new Set<string>()
  for (const group of groups) {
    for (const pack of group.packs) {
      if (pack.version) versions.add(pack.version)
      for (const item of [...pack.releases, ...pack.updates]) {
        if (item.parsed.version) versions.add(item.parsed.version)
      }
    }
  }
  return [...versions].sort((a, b) => compareVersions(a, b))
}

export function collectEditionPackPlatforms(
  groups: EditionResultGroup[],
): { key: string; label: string }[] {
  const seen = new Map<string, string>()
  for (const group of groups) {
    for (const pack of group.packs) {
      for (const item of [...pack.releases, ...pack.updates]) {
        if (item.parsed.platformKey && item.parsed.platform) {
          seen.set(item.parsed.platformKey, item.parsed.platform)
        }
      }
    }
  }
  return [...seen.entries()].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label))
}

export function filterEditionGroups(
  groups: EditionResultGroup[],
  protocol: 'all' | 'usenet' | 'torrent',
  version: string,
  platform: string = 'all',
): EditionResultGroup[] {
  const matchProtocol = (items: ClassifiedRelease[]) =>
    protocol === 'all'
      ? items
      : items.filter((item) => item.release.protocol?.toLowerCase() === protocol)

  const matchPlatform = (items: ClassifiedRelease[]) =>
    platform === 'all'
      ? items
      : items.filter((item) => (item.parsed.platformKey || 'unknown') === platform)

  return groups
    .map((group) => {
      const packs = group.packs
        .map((pack) => {
          const filteredReleases = matchPlatform(matchProtocol(pack.releases))
          const filteredUpdates = matchPlatform(matchProtocol(pack.updates))
          return {
            ...pack,
            releases: filteredReleases,
            updates: filteredUpdates,
          }
        })
        .filter((pack) => pack.releases.length + pack.updates.length > 0)
        .filter((pack) =>
          familyMatchesVersion(
            { version: pack.version, releases: pack.releases, updates: pack.updates },
            version,
          ),
        )
      return { ...group, packs }
    })
    .filter((group) => group.packs.length > 0)
}

function bucketByEdition(items: ClassifiedRelease[], kind: ReleaseKind): EditionBucket[] {
  const editions = new Map<string, ClassifiedRelease[]>()
  for (const item of items) {
    const key = item.parsed.editionKey || STANDARD_EDITION.key
    const list = editions.get(key)
    if (list) list.push(item)
    else editions.set(key, [item])
  }

  return [...editions.entries()]
    .map(([key, grouped]) => {
      const title = grouped[0]?.parsed.editionLabel || STANDARD_EDITION.label
      const byVersion = new Map<string, ClassifiedRelease[]>()
      for (const item of sortClassified(grouped, kind)) {
        const versionKey = item.parsed.version || ''
        const list = byVersion.get(versionKey)
        if (list) list.push(item)
        else byVersion.set(versionKey, [item])
      }
      const versions: VersionBucket[] = [...byVersion.entries()]
        .map(([versionKey, versionItems]) => ({
          version: versionKey || null,
          items: versionItems,
        }))
        .sort((a, b) => compareVersions(a.version, b.version))
      return { key, title, versions }
    })
    .sort((a, b) => {
      if (a.key === STANDARD_EDITION.key && b.key !== STANDARD_EDITION.key) return -1
      if (b.key === STANDARD_EDITION.key && a.key !== STANDARD_EDITION.key) return 1
      const aSize = Math.max(0, ...a.versions.flatMap((bucket) => bucket.items.map((item) => item.release.size || 0)))
      const bSize = Math.max(0, ...b.versions.flatMap((bucket) => bucket.items.map((item) => item.release.size || 0)))
      if (aSize !== bSize) return bSize - aSize
      return a.title.localeCompare(b.title)
    })
}

export function groupSearchReleases(
  releases: ServerProwlarrRelease[],
  searchHint?: string,
): ReleaseSection[] {
  const classified = releases.map((release) => ({
    release,
    parsed: parseReleaseTitle(release.title, searchHint),
  }))

  const byKind: Record<ReleaseKind, ClassifiedRelease[]> = {
    game: [],
    update: [],
    dlc: [],
    other: [],
  }

  for (const item of classified) {
    if (searchHint && !item.parsed.matchedQuery) byKind.other.push(item)
    else byKind[item.parsed.kind].push(item)
  }

  return (['game', 'update', 'dlc', 'other'] as const)
    .filter((kind) => byKind[kind].length > 0)
    .map((kind) => ({
      id: kind,
      title: SECTION_TITLES[kind],
      editions: bucketByEdition(byKind[kind], kind),
    }))
}

export function groupByEditionAndVersion(
  items: ClassifiedRelease[],
  kind: ReleaseKind,
): EditionBucket[] {
  return bucketByEdition(items, kind)
}

export function groupByVersion(items: ClassifiedRelease[], kind: ReleaseKind): VersionBucket[] {
  const byVersion = new Map<string, ClassifiedRelease[]>()
  for (const item of sortClassified(items, kind)) {
    const versionKey = item.parsed.version || ''
    const list = byVersion.get(versionKey)
    if (list) list.push(item)
    else byVersion.set(versionKey, [item])
  }
  return [...byVersion.entries()]
    .map(([versionKey, versionItems]) => ({
      version: versionKey || null,
      items: versionItems,
    }))
    .sort((a, b) => compareVersions(a.version, b.version))
}

export interface EditionReleaseCluster {
  key: string
  title: string
  isNamedEdition: boolean
  isDlc: boolean
  isOther: boolean
  releases: ClassifiedRelease[]
  updates: ClassifiedRelease[]
}

export function groupReleasesByEdition(
  releases: ServerProwlarrRelease[],
  searchHint?: string,
): EditionReleaseCluster[] {
  const buckets = new Map<string, EditionReleaseCluster>()

  const ensure = (key: string, title: string, flags: Partial<Pick<EditionReleaseCluster, 'isNamedEdition' | 'isDlc' | 'isOther'>>) => {
    const existing = buckets.get(key)
    if (existing) return existing
    const created: EditionReleaseCluster = {
      key,
      title,
      isNamedEdition: Boolean(flags.isNamedEdition),
      isDlc: Boolean(flags.isDlc),
      isOther: Boolean(flags.isOther),
      releases: [],
      updates: [],
    }
    buckets.set(key, created)
    return created
  }

  for (const release of releases) {
    const parsed = parseReleaseTitle(release.title, searchHint)
    const classified: ClassifiedRelease = { release, parsed }
    if (searchHint && !parsed.matchedQuery) {
      ensure('other', 'Other results', { isOther: true }).releases.push(classified)
      continue
    }
    if (parsed.kind === 'dlc') {
      const cluster = ensure(
        `dlc:${parsed.editionKey}`,
        parsed.editionKey === STANDARD_EDITION.key ? 'DLC' : parsed.editionLabel,
        { isDlc: true },
      )
      cluster.releases.push(classified)
      continue
    }
    const named = parsed.editionKey !== STANDARD_EDITION.key
    const cluster = ensure(
      parsed.editionKey,
      named ? parsed.editionLabel : 'Release',
      { isNamedEdition: named },
    )
    if (parsed.kind === 'update') cluster.updates.push(classified)
    else cluster.releases.push(classified)
  }

  return [...buckets.values()]
    .map((cluster) => ({
      ...cluster,
      releases: sortClassified(cluster.releases, cluster.isDlc ? 'dlc' : 'game'),
      updates: sortClassified(cluster.updates, 'update'),
    }))
    .sort((a, b) => {
      const rank = (cluster: EditionReleaseCluster) => {
        if (cluster.isOther) return 3
        if (cluster.isDlc) return 2
        if (cluster.isNamedEdition) return 0
        return 1
      }
      const rankDiff = rank(a) - rank(b)
      if (rankDiff !== 0) return rankDiff
      const aSize = Math.max(0, ...a.releases.map((item) => item.release.size || 0))
      const bSize = Math.max(0, ...b.releases.map((item) => item.release.size || 0))
      if (aSize !== bSize) return bSize - aSize
      return a.title.localeCompare(b.title)
    })
}

export function editionClusterCounts(cluster: EditionReleaseCluster) {
  return {
    releases: cluster.releases.length,
    updates: cluster.updates.length,
    total: cluster.releases.length + cluster.updates.length,
  }
}

export interface GameReleaseCluster {
  key: string
  title: string
  games: ClassifiedRelease[]
  updates: ClassifiedRelease[]
  dlc: ClassifiedRelease[]
  other: ClassifiedRelease[]
}

export function groupReleasesByGame(
  releases: ServerProwlarrRelease[],
  searchHint?: string,
): GameReleaseCluster[] {
  if (releases.length === 0) return []

  const hint = hintKey(searchHint)
  const displayTitle = searchHint?.trim() || 'Results'
  const cluster: GameReleaseCluster = {
    key: hint || 'results',
    title: displayTitle,
    games: [],
    updates: [],
    dlc: [],
    other: [],
  }

  for (const release of releases) {
    const parsed = parseReleaseTitle(release.title, searchHint)
    const classified: ClassifiedRelease = { release, parsed }
    if (searchHint && !parsed.matchedQuery) cluster.other.push(classified)
    else if (parsed.kind === 'update') cluster.updates.push(classified)
    else if (parsed.kind === 'dlc') cluster.dlc.push(classified)
    else cluster.games.push(classified)
  }

  cluster.games = sortClassified(cluster.games, 'game')
  cluster.updates = sortClassified(cluster.updates, 'update')
  cluster.dlc = sortClassified(cluster.dlc, 'dlc')
  cluster.other = sortClassified(cluster.other, 'other')
  return [cluster]
}

export function clusterCounts(cluster: GameReleaseCluster) {
  return {
    games: cluster.games.length,
    updates: cluster.updates.length,
    dlc: cluster.dlc.length,
    total:
      cluster.games.length + cluster.updates.length + cluster.dlc.length + cluster.other.length,
  }
}

export function sectionItemCount(section: ReleaseSection): number {
  return section.editions.reduce(
    (sum, edition) => sum + edition.versions.reduce((inner, bucket) => inner + bucket.items.length, 0),
    0,
  )
}

export function mapReleaseSection(
  section: ReleaseSection,
  mapItems: (items: ClassifiedRelease[]) => ClassifiedRelease[],
): ReleaseSection | null {
  const editions = section.editions
    .map((edition) => {
      const versions = edition.versions
        .map((bucket) => ({ ...bucket, items: mapItems(bucket.items) }))
        .filter((bucket) => bucket.items.length > 0)
      return { ...edition, versions }
    })
    .filter((edition) => edition.versions.length > 0)
  if (editions.length === 0) return null
  return { ...section, editions }
}
