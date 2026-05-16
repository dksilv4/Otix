import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'
export type ThemeSetting = Theme | 'system'

const ThemeContext = createContext<{
  theme: ThemeSetting
  resolvedTheme: Theme
  setTheme: (theme: ThemeSetting) => void
}>({
  theme: 'system',
  resolvedTheme: 'dark',
  setTheme: () => {},
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

function resolveTheme(setting: ThemeSetting): Theme {
  if (setting === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return setting
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeSetting>(getInitialTheme)
  const [resolvedTheme, setResolvedTheme] = useState<Theme>(() => resolveTheme(theme))

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

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
