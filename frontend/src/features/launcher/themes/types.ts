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
  isEnabled?: boolean
}

export interface LauncherThemeContextType {
  currentTheme: LauncherThemeId
  setTheme: (theme: LauncherThemeId) => void
  cycleTheme: () => void
  themeMeta: LauncherThemeMeta
  availableThemes: LauncherThemeMeta[]
}
