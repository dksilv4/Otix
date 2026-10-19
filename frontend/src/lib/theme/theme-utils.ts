import { ENV } from '@/lib/config/env'

export type Theme = 'light' | 'dark'
export type ThemeSetting = Theme | 'system'

export const THEME_STORAGE_KEY = 'otix-theme'
export const LAYOUT_STORAGE_KEY = 'otix-layout-theme'

export const getInitialTheme = (): ThemeSetting => {
  if (ENV.FORCE_DARK_MODE) return 'dark'
  if (typeof window === 'undefined') return ENV.DEFAULT_THEME
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return ENV.DEFAULT_THEME
}

export const getInitialLayoutTheme = (): string => {
  if (typeof window === 'undefined') return 'default'
  return localStorage.getItem(LAYOUT_STORAGE_KEY) ?? 'default'
}

export const resolveTheme = (setting: ThemeSetting): Theme => {
  if (ENV.FORCE_DARK_MODE) return 'dark'
  if (setting === 'system') {
    if (typeof window === 'undefined') return 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return setting
}

