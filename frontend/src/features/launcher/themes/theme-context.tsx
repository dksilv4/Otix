import React, { createContext, useState, useEffect, useCallback, useMemo } from "react"
import type {
  LauncherThemeId,
  LauncherThemeMeta,
  LauncherThemeContextType,
} from "./types"
export type {
  LauncherThemeId,
  LauncherThemeMeta,
  LauncherThemeContextType,
} from "./types"

import {
  ACTIVE_LAUNCHER_THEME_ID,
  LAUNCHER_THEMES,
  AVAILABLE_LAUNCHER_THEMES,
  LAUNCHER_THEME_STORAGE_KEY as STORAGE_KEY,
  DEFAULT_LAUNCHER_THEME as DEFAULT_THEME,
} from "@/features/launcher/utils/theme-constants"

export {
  ACTIVE_LAUNCHER_THEME_ID,
  LAUNCHER_THEMES,
  AVAILABLE_LAUNCHER_THEMES,
}

export const LauncherThemeContext = createContext<LauncherThemeContextType | null>(null)

export const LauncherThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentTheme, setCurrentThemeState] = useState<LauncherThemeId>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as LauncherThemeId | null
      const matched = LAUNCHER_THEMES.find((t) => t.id === stored)
      if (matched && matched.isEnabled !== false) {
        return matched.id
      }
    } catch {
      // localStorage may fail in some environments
    }
    return DEFAULT_THEME
  })

  useEffect(() => {
    const handleSync = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY) as LauncherThemeId | null
        const matched = LAUNCHER_THEMES.find((t) => t.id === stored)
        if (matched && matched.isEnabled !== false) {
          setCurrentThemeState(matched.id)
        } else {
          setCurrentThemeState(DEFAULT_THEME)
        }
      } catch {
        // LocalStorage access not available
      }
    }

    window.addEventListener('storage', handleSync)
    return () => {
      window.removeEventListener('storage', handleSync)
    }
  }, [])

  const setTheme = useCallback((theme: LauncherThemeId) => {
    const target = LAUNCHER_THEMES.find((t) => t.id === theme)
    if (!target || target.isEnabled === false) return
    setCurrentThemeState(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
      window.dispatchEvent(new Event('storage'))
    } catch {
      // ignore
    }
  }, [])

  const cycleTheme = useCallback(() => {
    const enabledThemes = LAUNCHER_THEMES.filter((t) => t.isEnabled !== false)
    if (enabledThemes.length <= 1) {
      if (enabledThemes.length === 1) {
        setCurrentThemeState(enabledThemes[0].id)
      }
      return
    }
    setCurrentThemeState((prev) => {
      const idx = enabledThemes.findIndex((t) => t.id === prev)
      const nextIdx = idx === -1 ? 0 : (idx + 1) % enabledThemes.length
      const nextTheme = enabledThemes[nextIdx].id
      try {
        localStorage.setItem(STORAGE_KEY, nextTheme)
        window.dispatchEvent(new Event('storage'))
      } catch {
        // ignore
      }
      return nextTheme
    })
  }, [])

  const themeMeta = useMemo(() => {
    return LAUNCHER_THEMES.find((t) => t.id === currentTheme) || LAUNCHER_THEMES[0]
  }, [currentTheme])

  const value = useMemo(
    () => ({
      currentTheme,
      setTheme,
      cycleTheme,
      themeMeta,
      availableThemes: LAUNCHER_THEMES,
    }),
    [currentTheme, setTheme, cycleTheme, themeMeta],
  )

  return <LauncherThemeContext.Provider value={value}>{children}</LauncherThemeContext.Provider>
};

export { useLauncherTheme } from '../hooks/use-launcher-theme'
