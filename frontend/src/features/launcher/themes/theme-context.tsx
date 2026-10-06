import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react"

export type LauncherThemeId =
  | "classic"
  | "modern"
  | "steam"
  | "playstation"
  | "xbox"
  | "switch"
  | "retro"
  | "minimal"
  | "forge"
  | "glass"

export interface LauncherThemeMeta {
  id: LauncherThemeId
  version: string
  name: string
  subtitle: string
  description: string
  badgeColor: string
  accentColor: string
  icon: "layout-grid" | "sparkles" | "gamepad" | "tv" | "box" | "disc" | "terminal" | "feather" | "flame" | "layers"
  isBeta?: boolean
}

export const LAUNCHER_THEMES: LauncherThemeMeta[] = [
  {
    id: "classic",
    version: "V1",
    name: "Classic",
    subtitle: "Original Otix Rail",
    description: "Floating left rail with 3D tilted game hero, shelf tabs, and system footer.",
    badgeColor: "bg-white/10 text-white/70 border-white/15",
    accentColor: "#3b82f6",
    icon: "layout-grid",
    isBeta: true,
  },
  {
    id: "modern",
    version: "V2",
    name: "Modern",
    subtitle: "Cinematic Deck",
    description: "Next-gen action deck with Quick Resume hero, Jump Back In reel, versatile library, and running game session bar.",
    badgeColor: "bg-[oklch(0.705_0.213_47.604)] text-white border-white/20",
    accentColor: "oklch(0.705 0.213 47.604)",
    icon: "sparkles",
    isBeta: true,
  },
  {
    id: "steam",
    version: "V3",
    name: "Deck",
    subtitle: "Console Layout",
    description: "Slate-navy console deck layout with categorized sidebar and high-impact action controls.",
    badgeColor: "bg-[#66c0f4]/20 text-[#66c0f4] border-[#66c0f4]/40",
    accentColor: "#66c0f4",
    icon: "gamepad",
    isBeta: true,
  },
  {
    id: "playstation",
    version: "V4",
    name: "CrossBar",
    subtitle: "Console Ribbon",
    description: "Horizontal cinematic ribbon with full-bleed dynamic backgrounds, trophy progress, and audio ambiance.",
    badgeColor: "bg-blue-600/20 text-blue-400 border-blue-500/40",
    accentColor: "#2563eb",
    icon: "tv",
    isBeta: true,
  },
  {
    id: "xbox",
    version: "V5",
    name: "Blade",
    subtitle: "Metro Matrix",
    description: "Live responsive bento tiles, high-energy green accents, gamertag ribbon, and quick jump-in spotlight.",
    badgeColor: "bg-emerald-600/20 text-emerald-400 border-emerald-500/40",
    accentColor: "#107c10",
    icon: "box",
    isBeta: true,
  },
  {
    id: "switch",
    version: "V6",
    name: "Arcade",
    subtitle: "Handheld Carousel",
    description: "Vibrant big-tile horizontal carousel with playful card physics, quick system dock, and instant launch.",
    badgeColor: "bg-rose-600/20 text-rose-400 border-rose-500/40",
    accentColor: "#e60012",
    icon: "disc",
    isBeta: true,
  },
  {
    id: "retro",
    version: "V7",
    name: "Cyberpunk",
    subtitle: "Terminal Netrunner",
    description: "Monochrome & neon CRT monitor with scanlines, live hardware telemetry, hacker terminal aesthetic.",
    badgeColor: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    accentColor: "#f59e0b",
    icon: "terminal",
    isBeta: true,
  },
  {
    id: "minimal",
    version: "V8",
    name: "Minimal",
    subtitle: "Gallery Zen",
    description: "Editorial museum gallery with generous whitespace, clean typography, and full-height art posters.",
    badgeColor: "bg-neutral-800 text-neutral-300 border-neutral-700",
    accentColor: "#ffffff",
    icon: "feather",
    isBeta: true,
  },
  {
    id: "forge",
    version: "V9",
    name: "Forge",
    subtitle: "Storefront Client",
    description: "Modern battle/storefront launcher with wide hero banners, patch notes feed, and quick friend list.",
    badgeColor: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40",
    accentColor: "#06b6d4",
    icon: "flame",
    isBeta: true,
  },
  {
    id: "glass",
    version: "V10",
    name: "Spatial Glass",
    subtitle: "Aero Prism",
    description: "Ultra-modern translucent glassmorphism with dynamic mesh gradient orbs and luminous blur effects.",
    badgeColor: "bg-purple-500/20 text-purple-300 border-purple-400/40",
    accentColor: "#a855f7",
    icon: "layers",
    isBeta: true,
  },
]

const STORAGE_KEY = "otix:launcher-theme"
const DEFAULT_THEME: LauncherThemeId = "modern"

interface LauncherThemeContextType {
  currentTheme: LauncherThemeId
  setTheme: (theme: LauncherThemeId) => void
  cycleTheme: () => void
  themeMeta: LauncherThemeMeta
  availableThemes: LauncherThemeMeta[]
}

const LauncherThemeContext = createContext<LauncherThemeContextType | null>(null)

export const LauncherThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentTheme, setCurrentThemeState] = useState<LauncherThemeId>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as LauncherThemeId | null
      if (stored && LAUNCHER_THEMES.some((t) => t.id === stored)) {
        return stored
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
        if (stored && LAUNCHER_THEMES.some((t) => t.id === stored)) {
          setCurrentThemeState(stored)
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
    setCurrentThemeState(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
      window.dispatchEvent(new Event('storage'))
    } catch {
      // ignore
    }
  }, [])

  const cycleTheme = useCallback(() => {
    setCurrentThemeState((prev) => {
      const idx = LAUNCHER_THEMES.findIndex((t) => t.id === prev)
      const nextIdx = (idx + 1) % LAUNCHER_THEMES.length
      const nextTheme = LAUNCHER_THEMES[nextIdx].id
      try {
        localStorage.setItem(STORAGE_KEY, nextTheme)
      } catch {
        // ignore
      }
      return nextTheme
    })
  }, [])

  const themeMeta = useMemo(() => {
    return LAUNCHER_THEMES.find((t) => t.id === currentTheme) || LAUNCHER_THEMES[1]
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

export const useLauncherTheme = () => {
  const ctx = useContext(LauncherThemeContext)
  if (!ctx) {
    throw new Error("useLauncherTheme must be used within a LauncherThemeProvider")
  }
  return ctx
}
