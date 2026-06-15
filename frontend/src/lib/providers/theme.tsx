// TODO: Review this file
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'
export type ThemeSetting = Theme | 'system'

const LAYOUT_STORAGE_KEY = 'otix-layout-theme'

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

export function useTheme() {
  return useContext(ThemeContext)
}

const STORAGE_KEY = 'otix-theme'

function getInitialTheme(): ThemeSetting {
  if (typeof window === 'undefined') return 'system'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'system'
}

function getInitialLayoutTheme(): string {
  if (typeof window === 'undefined') return 'default'
  return localStorage.getItem(LAYOUT_STORAGE_KEY) ?? 'default'
}

function resolveTheme(setting: ThemeSetting): Theme {
  if (setting === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return setting
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeSetting>(getInitialTheme)
  const [resolvedTheme, setResolvedTheme] = useState<Theme>(() => resolveTheme(theme))
  const [layoutTheme, setLayoutThemeState] = useState<string>(getInitialLayoutTheme)

  /* ── Load saved accent color on startup ── */
  useEffect(() => {
    const saved = localStorage.getItem('otix-accent')
    if (saved) {
      const root = document.documentElement
      root.style.setProperty('--primary', saved)
      root.style.setProperty('--ring', saved)
      root.style.setProperty('--sidebar-primary', saved)
      root.style.setProperty('--sidebar-ring', saved)
    }
  }, [])
  // Track the stable setLayoutTheme to avoid unnecessary re-renders of consumers
  const layoutThemeRef = useRef(layoutTheme)
  layoutThemeRef.current = layoutTheme

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme)
    localStorage.setItem(STORAGE_KEY, theme)
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
}
