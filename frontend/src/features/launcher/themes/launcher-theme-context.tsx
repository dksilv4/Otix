import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
  type ComponentType,
} from 'react'
import type { LauncherTheme, LauncherThemeComponents } from './types'
import { getThemeModule } from './registry'

const STORAGE_KEY = 'otix-launcher-theme'
const DEFAULT_THEME_ID = 'default'

// ── Context shape ────────────────────────────────────────

interface LauncherThemeContextValue {
  theme: LauncherTheme | null
  themeId: string
  setThemeId: (id: string) => void
  component: <K extends keyof LauncherThemeComponents>(
    key: K,
  ) => ComponentType<any> | null
}

const LauncherThemeContext = createContext<LauncherThemeContextValue>({
  theme: null,
  themeId: DEFAULT_THEME_ID,
  setThemeId: () => {},
  component: () => null,
})

// ── Storage helpers ──────────────────────────────────────

function loadThemeId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored || DEFAULT_THEME_ID
  } catch {
    return DEFAULT_THEME_ID
  }
}

function saveThemeId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Storage unavailable — silent fail
  }
}

// ── CSS token injection ──────────────────────────────────

function applyTokens(tokens: Record<string, string> | undefined): () => void {
  if (!tokens) return () => {}

  const root = document.documentElement
  const applied: string[] = []

  for (const [key, value] of Object.entries(tokens)) {
    const prev = root.style.getPropertyValue(key)
    root.style.setProperty(key, value)
    applied.push(key)
    // Store previous value for cleanup
    ;(root.style as Record<string, unknown>)[`__prev_${key}`] = prev
  }

  // Return cleanup function
  return () => {
    for (const key of applied) {
      const prev = (root.style as Record<string, unknown>)[`__prev_${key}`]
      if (prev !== undefined) {
        root.style.setProperty(key, String(prev))
        delete (root.style as Record<string, unknown>)[`__prev_${key}`]
      } else {
        root.style.removeProperty(key)
      }
    }
  }
}

// ── Provider ─────────────────────────────────────────────

export function LauncherThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState(loadThemeId)
  const [theme, setTheme] = useState<LauncherTheme | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  // Load theme module when themeId changes
  useEffect(() => {
    let cancelled = false

    getThemeModule(themeId).then(mod => {
      if (cancelled) return
      setTheme(mod.default)
    })

    return () => {
      cancelled = true
    }
  }, [themeId])

  // Apply/cleanup CSS tokens when theme changes
  useEffect(() => {
    // Run previous cleanup
    cleanupRef.current?.()

    if (theme?.tokens) {
      cleanupRef.current = applyTokens(theme.tokens)
    } else {
      cleanupRef.current = null
    }

    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [theme])

  const setThemeId = useCallback((id: string) => {
    setThemeIdState(id)
    saveThemeId(id)
  }, [])

  const component = useCallback(
    <K extends keyof LauncherThemeComponents>(
      key: K,
    ): ComponentType<any> | null => {
      if (!theme?.components) return null
      return (theme.components as Record<K, ComponentType<any>>)[key] ?? null
    },
    [theme],
  )

  return (
    <LauncherThemeContext.Provider value={{ theme, themeId, setThemeId, component }}>
      {children}
    </LauncherThemeContext.Provider>
  )
}

// ── Hook ─────────────────────────────────────────────────

export function useLauncherTheme(): LauncherThemeContextValue {
  return useContext(LauncherThemeContext)
}
