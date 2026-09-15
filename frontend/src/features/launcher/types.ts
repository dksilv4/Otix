// ── Shared game types ──────────────────────────────────────────────

export interface InstallResult {
  success: boolean
  gameExe?: string | null
  installDir: string
  crackApplied?: boolean
  error?: string
}

export type InstallPhase = 'mounting' | 'detecting' | 'installing' | 'cracking' | 'finishing' | 'done' | 'error'

export interface InstallProgress {
  phase: InstallPhase
  progress: number
  message: string
}

export interface UpdateFile {
  name: string
  path: string
}

export interface Game {
  id: string
  title: string
  slug?: string
  overview?: string | null
  platform?: LauncherPlatform
  iconUrl?: string
  posterUrl?: string
  textlessPosterUrl?: string | null
  backdropUrl?: string
  logoUrl?: string
  logoColorGuess?: string | null
  releaseDate?: string | null
  genres?: { id: string; name: string; slug: string }[]
  gameModes?: { id: string; gameMode: { id: string; name: string; slug: string } }[]
  involvedCompanies?: {
    id: string
    company: { id: string; name: string; slug: string; logoUrl?: string | null }
    developer: boolean
    publisher: boolean
  }[]
  isFree?: boolean
  hasMultiplayer?: boolean
  confidence?: number
  avgRating?: number | null
  ratingCount?: number
  mediaId?: string
  screenshots?: { url: string; width?: number; height?: number; provider?: string }[]
}

export interface LocalGame {
  id: string
  title: string
  exePath: string
  localExePath?: string
  platform: LauncherPlatform
  installDir: string
  sources?: string[]
  localIconUrl?: string
  iconUrl?: string
  posterUrl?: string
  textlessPosterUrl?: string | null
  logoUrl?: string | null
  updateFiles?: UpdateFile[]
  data?: Game
  matchSuggestion?: Game
  description?: string | null
  otixMediaId?: string | null
  otixMediaTitle?: string | null
  otixMediaSlug?: string | null
  otixConfidence?: number
  otixPosterUrl?: string | null
  otixTextlessPosterUrl?: string | null
  otixLogoUrl?: string | null
  otixBackdropUrl?: string | null
  otixIconUrl?: string | null
  otixMatchSuggestion?: Game | null
  otixMatchVerified?: boolean
  otixClaimed?: boolean
  lastPlayedAt?: string | null
}

export const LAUNCHER_PLATFORMS = [
  'steam', 'pc', 'iso', 'epic', 'gog', 'battlenet',
  'ubisoft', 'origin', 'ea', 'riot', 'xbox', 'itch', 'server', 'unknown',
] as const

export type LauncherPlatform = typeof LAUNCHER_PLATFORMS[number]

// ── Catalog game (from Otix backend API) ─────────────────────────────

export interface CatalogGame {
  id: string
  mediaType: string
  title: string
  slug: string
  posterUrl?: string | null
  textlessPosterUrl?: string | null
  logoUrl?: string | null
  logoColorGuess?: string | null
  iconUrl?: string | null
  backdropUrl?: string | null
  releaseDate?: string | null
  popularity: number
  avgRating?: number | null
  ratingCount: number
  isAdult: boolean
}

export interface CatalogGameDetail extends CatalogGame {
  overview?: string | null
  originalLanguage?: string | null
  genres: { id: string; name: string; slug: string }[]
  involvedCompanies: {
    id: string
    company: { id: string; name: string; slug: string; logoUrl?: string | null }
    developer: boolean
    publisher: boolean
  }[]
  platforms: { id: string; platform: { id: string; name: string; slug: string } }[]
  gameModes: { id: string; gameMode: { id: string; name: string; slug: string } }[]
  releaseStatus?: string | null
  website?: string | null
  steamAppId?: number | null
  steamPlaytimeForever?: number | null
  steamPlaytime2weeks?: number | null
  isFree: boolean
  hasMultiplayer: boolean
  youtubeVideoId?: string | null
  youtubeChannelTitle?: string | null
}

// ── Display game (launcher view) ──────────────────────────────────────

export interface DisplayGame {
  id: string
  title: string
  description?: string
  backdropUrl?: string
  posterUrl: string | null
  localIconUrl?: string
  iconUrl?: string
  logoUrl?: string
  logoColorGuess?: string | null
  badge?: string
  playtime: string
  achievements: string
  isDefault: boolean
  platform: LauncherPlatform
  exePath?: string
  installDir?: string
  isInstalled?: boolean
  otixMediaId?: string
  rawGame?: LocalGame
}

// ── Shelf display ───────────────────────────────────────────────────

export interface ShelfRow {
  id: string
  label: string
  icon: string
  games: LocalGame[]
  catalogGames?: CatalogGame[]
  emptyMessage?: string
}

// ── Tab types ───────────────────────────────────────────────────────

export type GamesTab = "all" | "matched" | "unmatched"

// ── Sort options ───────────────────────────────────────────────────

export type GameSortBy = "popularity" | "rating" | "release_date" | "title"

// ── From install-store ─────────────────────────────────────────────

export interface InstallStoreEntry {
  active: boolean
  isoPath: string
  gameTitle: string | null
  targetDir: string | null
  installId: string | null
  progress: InstallProgress | null
  result: InstallResult | null
  error: string | null
}

// ── From game-queries ──────────────────────────────────────────────

export interface GamesFilter {
  platform?: string[]
  matched?: boolean
  hasSuggestion?: boolean
  search?: string
  installed?: boolean
  limit?: number
  offset?: number
  sortBy?: 'title' | 'platform' | 'updated_at' | 'last_played_at'
  sortDir?: 'asc' | 'desc'
}
