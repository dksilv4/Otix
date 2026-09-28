import { describe, expect, it } from 'vitest'
import {
  LANGUAGE_ALL,
  buildLanguageOptions,
  genreLanguageDropdownValue,
  resolveGenreLanguageFilter,
  resolveSelectedGenres,
  resolveUserLanguage,
  serializeGenreSlugs,
  toggleGenreSelection,
} from '../utils'

describe('resolveUserLanguage', () => {
  it('prefers the first preferred language', () => {
    expect(resolveUserLanguage(['ja', 'en'], 'en-US')).toBe('ja')
  })

  it('falls back to the browser locale', () => {
    expect(resolveUserLanguage([], 'sv-SE')).toBe('sv')
  })

  it('falls back to English', () => {
    expect(resolveUserLanguage(null, null)).toBe('en')
  })
})

describe('resolveGenreLanguageFilter', () => {
  it('auto-selects the user language when search omits language', () => {
    expect(resolveGenreLanguageFilter(undefined, 'en')).toBe('en')
  })

  it('disables filtering for the all sentinel', () => {
    expect(resolveGenreLanguageFilter(LANGUAGE_ALL, 'en')).toBeUndefined()
  })

  it('uses an explicit search language', () => {
    expect(resolveGenreLanguageFilter('ko', 'en')).toBe('ko')
  })
})

describe('genreLanguageDropdownValue', () => {
  it('shows the user language by default', () => {
    expect(genreLanguageDropdownValue(undefined, 'fr')).toBe('fr')
  })

  it('preserves the all sentinel', () => {
    expect(genreLanguageDropdownValue(LANGUAGE_ALL, 'fr')).toBe(LANGUAGE_ALL)
  })
})

describe('buildLanguageOptions', () => {
  it('puts all-languages first and preferred languages next', () => {
    const options = buildLanguageOptions(['ko'])
    expect(options[0]).toEqual({ value: LANGUAGE_ALL, label: 'All languages' })
    expect(options[1]?.value).toBe('ko')
    expect(options.some((o) => o.value === 'en')).toBe(true)
  })
})

describe('multi-select genres', () => {
  it('defaults to the path genre', () => {
    expect(resolveSelectedGenres('action', undefined)).toEqual(['action'])
  })

  it('uses the search genres list when present', () => {
    expect(resolveSelectedGenres('action', 'action,comedy')).toEqual(['action', 'comedy'])
  })

  it('toggles genres additively', () => {
    expect(toggleGenreSelection(['action'], 'comedy')).toEqual(['action', 'comedy'])
    expect(toggleGenreSelection(['action', 'comedy'], 'action')).toEqual(['comedy'])
  })

  it('only serializes multi-select lists', () => {
    expect(serializeGenreSlugs(['action'])).toBeUndefined()
    expect(serializeGenreSlugs(['action', 'comedy'])).toBe('action,comedy')
  })
})
