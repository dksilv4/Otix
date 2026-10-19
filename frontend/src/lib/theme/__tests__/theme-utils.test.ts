import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getInitialTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
} from '../theme-utils'
import * as envModule from '@/lib/config/env'
import { getResolvedTheme } from '@/lib/api/client'

describe('theme-utils', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('defaults to dark mode when no theme is stored', () => {
    expect(getInitialTheme()).toBe('dark')
    expect(resolveTheme(getInitialTheme())).toBe('dark')
    expect(getResolvedTheme()).toBe('dark')
  })

  it('reads stored light theme when not forcing dark mode', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    expect(getInitialTheme()).toBe('light')
    expect(resolveTheme('light')).toBe('light')
  })

  it('resolves system theme according to prefers-color-scheme in dev mode', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('dark'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    expect(resolveTheme('system')).toBe('dark')

    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    expect(resolveTheme('system')).toBe('light')
  })

  it('forces dark mode when FORCE_DARK_MODE is enabled', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    vi.spyOn(envModule, 'ENV', 'get').mockReturnValue({
      ...envModule.ENV,
      FORCE_DARK_MODE: true,
      HIDE_THEME_CHOICE: true,
      DEFAULT_THEME: 'dark',
    })

    expect(getInitialTheme()).toBe('dark')
    expect(resolveTheme('light')).toBe('dark')
    expect(resolveTheme('system')).toBe('dark')
  })
})
