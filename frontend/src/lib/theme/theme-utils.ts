export type Theme = 'light' | 'dark'
export type ThemeSetting = Theme | 'system'

export const THEME_STORAGE_KEY = 'otix-theme'
export const LAYOUT_STORAGE_KEY = 'otix-layout-theme'

export const getInitialTheme = (): ThemeSetting => {
  if (typeof window === 'undefined') return 'system'
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'system'
}

export const getInitialLayoutTheme = (): string => {
  if (typeof window === 'undefined') return 'default'
  return localStorage.getItem(LAYOUT_STORAGE_KEY) ?? 'default'
}

export const resolveTheme = (setting: ThemeSetting): Theme => {
  if (setting === 'system') {
    if (typeof window === 'undefined') return 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return setting
}
