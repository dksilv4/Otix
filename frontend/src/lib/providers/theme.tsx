import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { applyAccentColor } from '@/lib/theme/accent'
import {
  type Theme,
  type ThemeSetting,
  THEME_STORAGE_KEY,
  LAYOUT_STORAGE_KEY,
  getInitialTheme,
  getInitialLayoutTheme,
  resolveTheme,
} from '@/lib/theme/theme-utils'

export type { Theme, ThemeSetting }

const ThemeContext = createContext<{
  theme: ThemeSetting
  resolvedTheme: Theme
  setTheme: (theme: ThemeSetting) => void
  layoutTheme: string
  setLayoutTheme: (id: string) => void
}>({
  theme: 'system',
  resolvedTheme: 'dark',
  setTheme: () => {},
  layoutTheme: 'default',
  setLayoutTheme: () => {},
})

export const useTheme = () => {
  return useContext(ThemeContext)
}

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<ThemeSetting>(getInitialTheme)
  const [resolvedTheme, setResolvedTheme] = useState<Theme>(() => resolveTheme(theme))
  const [layoutTheme, setLayoutThemeState] = useState<string>(getInitialLayoutTheme)

  /* ── Load saved accent color on startup (includes on-accent foreground) ── */
  useEffect(() => {
    const saved = localStorage.getItem('otix-accent')
    if (saved) applyAccentColor(saved)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme)
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme, resolvedTheme])

  useEffect(() => {
    setResolvedTheme(resolveTheme(theme))

    if (theme !== 'system') return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => setResolvedTheme(resolveTheme('system'))
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  /* ── Layout theme (dual-axis theming) ── */

  useEffect(() => {
    document.documentElement.setAttribute('data-layout-theme', layoutTheme)
    localStorage.setItem(LAYOUT_STORAGE_KEY, layoutTheme)
  }, [layoutTheme])

  const setLayoutTheme = (id: string) => {
    setLayoutThemeState(id)
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, layoutTheme, setLayoutTheme }}>
      {children}
    </ThemeContext.Provider>
  )
};
