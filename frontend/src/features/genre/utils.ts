import { languageName } from '@media'
import type { DkDropdownOption } from '@ui/atoms/dropdown'
import type { GenreMediaType } from './types'

/** Sentinel search value meaning "do not filter by language". */
export const LANGUAGE_ALL = 'all'

const COMMON_LANGUAGE_CODES = [
  'en',
  'ja',
  'ko',
  'zh',
  'fr',
  'es',
  'de',
  'hi',
  'pt',
  'it',
  'ru',
  'th',
  'ar',
  'sv',
  'nl',
  'pl',
  'tr',
  'id',
  'vi',
  'da',
  'fi',
  'no',
  'cs',
  'hu',
  'ro',
  'uk',
] as const

export function formatTitleCase(str: string): string {
  return str
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function parseMediaType(value: unknown): GenreMediaType | undefined {
  if (value === 'movie' || value === 'show' || value === 'game') return value
  return undefined
}

export function parseAnimeFilter(value: unknown): boolean | undefined {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return undefined
}

export function animeFilterValue(isAnime: boolean | undefined): string {
  if (isAnime === true) return 'true'
  if (isAnime === false) return 'false'
  return ''
}

/** Normalize a BCP-47 / ISO code down to a 2–3 letter language tag. */
export function normalizeLanguageCode(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const code = value.trim().toLowerCase().split(/[-_]/)[0]
  return code || undefined
}

/**
 * Resolve the user's preferred content language.
 * Prefers account `preferredLanguages`, then the browser locale, then English.
 */
export function resolveUserLanguage(
  preferredLanguages?: string[] | null,
  browserLanguage?: string | null,
): string {
  const fromPrefs = normalizeLanguageCode(preferredLanguages?.[0])
  if (fromPrefs) return fromPrefs
  const fromBrowser = normalizeLanguageCode(browserLanguage ?? undefined)
  if (fromBrowser) return fromBrowser
  return 'en'
}

/**
 * Effective API language filter from the search param + user default.
 * - missing param → user's language (auto-selected)
 * - `all` → no language filter
 * - otherwise → that language code
 */
export function resolveGenreLanguageFilter(
  searchLanguage: string | undefined,
  userLanguage: string,
): string | undefined {
  if (searchLanguage === LANGUAGE_ALL) return undefined
  if (searchLanguage) return normalizeLanguageCode(searchLanguage)
  return userLanguage
}

export function genreLanguageDropdownValue(
  searchLanguage: string | undefined,
  userLanguage: string,
): string {
  if (searchLanguage === LANGUAGE_ALL) return LANGUAGE_ALL
  if (searchLanguage) return normalizeLanguageCode(searchLanguage) || userLanguage
  return userLanguage
}

export function buildLanguageOptions(preferredLanguages?: string[] | null): readonly DkDropdownOption[] {
  const seen = new Set<string>()
  const options: DkDropdownOption[] = [
    { value: LANGUAGE_ALL, label: 'All languages' },
  ]

  const add = (code: string) => {
    const normalized = normalizeLanguageCode(code)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    options.push({ value: normalized, label: languageName(normalized) })
  }

  for (const code of preferredLanguages ?? []) add(code)
  for (const code of COMMON_LANGUAGE_CODES) add(code)

  return options
}

/** Parse a comma-separated genre slug list into unique, lowercased slugs. */
export function parseGenreSlugs(value: string | undefined | null): string[] {
  if (!value) return []
  const seen = new Set<string>()
  const slugs: string[] = []
  for (const part of value.split(',')) {
    const slug = part.trim().toLowerCase()
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    slugs.push(slug)
  }
  return slugs
}

/**
 * Resolve the active multi-select genre set.
 * Uses ``search.genres`` when present; otherwise the path genre alone.
 */
export function resolveSelectedGenres(
  pathGenreId: string,
  searchGenres: string | undefined,
): string[] {
  const fromSearch = parseGenreSlugs(searchGenres)
  if (fromSearch.length > 0) return fromSearch
  const path = pathGenreId.trim().toLowerCase()
  return path ? [path] : []
}

/** Toggle a genre slug in/out of the selected set (additive multi-select). */
export function toggleGenreSelection(selected: string[], slug: string): string[] {
  const target = slug.trim().toLowerCase()
  if (!target) return selected
  if (selected.includes(target)) {
    return selected.filter((s) => s !== target)
  }
  return [...selected, target]
}

export function serializeGenreSlugs(slugs: string[]): string | undefined {
  if (slugs.length <= 1) return undefined
  return slugs.join(',')
}
