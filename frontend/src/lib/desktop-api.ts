/* ── Typed Desktop API — strongly-typed wrapper around window.desktopAPI ── */

import type { LocalGame } from '@/features/game-scanner/types'

// ── API types ────────────────────────────────────────────────────────

export interface DiskInfo {
  drive: string
  total?: number
  used: number
  free: number
}

export interface RecentSession {
  gameId: string
  endTime: number
}

export interface PlaytimeInfo {
  totalMinutes: number
  sessionCount: number
  lastPlayed: number | null
}

export interface RunningGameData {
  game: {
    id: string
    title: string
    platform: string
    iconUrl?: string
    posterUrl?: string | null
    exePath?: string
    installDir?: string
    otixMediaId?: string
    otixMediaTitle?: string
  }
  startTime: number
  launchedByOtix: boolean
  pid?: number
}

export interface CloudSettings {
  gameId: string
  autoSync: boolean
  lastSyncAt: string | null
  isPathConfirmed: boolean
  confirmedPath: string | null
}

export interface InstallCheckResult {
  found: boolean
  gameExe: string | null
}

export interface InstallProgressEvent {
  isoPath?: string
  installId?: string
  phase: string
  progress: number
  message: string
  pct?: number
  waitMin?: number | null
}

export interface ActiveInstallInfo {
  installId: string
  isoPath: string
  targetDir: string
  gameTitle: string
  startTime: number
  phase: string
  progress: number
  message: string
}

export interface SyncResult {
  success: boolean
  message?: string
}

export interface SaveDiscoverResult {
  detectedPaths: string[]
}

export interface SaveOverrideResult {
  userPath?: string | null
}

// ── Desktop API interface ────────────────────────────────────────────

export interface DesktopAPI {
  readonly platform: string | undefined

  // Query cache persistence
  cacheLoad: () => Promise<unknown>
  cacheSave: (data: unknown) => Promise<void>

  // Game hydration
  hydrateMatchedGames: () => Promise<{ updated: number; failed: number; total: number }>

  // Game scanning & detection
  scanPaths(scanPaths: string[], isoPaths: string[]): Promise<LocalGame[]>
  getScanPaths(): Promise<{ path: string; type: 'game' | 'iso' }[]>
  saveScanPaths(paths: { path: string; type: 'game' | 'iso' }[]): Promise<void>
  getScannedGames(): Promise<LocalGame[]>
  saveScannedGames(games: LocalGame[]): Promise<void>
  getLocalGamesMap(): Promise<Record<string, LocalGame>>
  saveLocalGamesMapEntry(mediaId: string, game: LocalGame | null): Promise<void>
  onGamesUpdated(cb: () => void): () => void
  getScannedGamesFiltered(filter: any): Promise<LocalGame[]>
  getGameById(id: string): Promise<LocalGame | null>
  getGameCount(filter: any): Promise<number>
  acceptSuggestion(gameId: string, suggestion: any): Promise<void>
  rejectSuggestion(gameId: string, suggestionMediaId: string): Promise<void>
  onGamesDbChanged(cb: () => void): () => void
  getRunningGame(): Promise<RunningGameData | null>

  // Game launching
  launchGame(game: LocalGame): Promise<void>
  showItemInFolder(path: string): Promise<void>
  pickExecutable(dir?: string): Promise<string | null>

  // Disk
  getDiskSpace(): Promise<DiskInfo[]>

  // Sessions & playtime
  getRecentSessions(): Promise<RecentSession[]>
  getPlaytimeForGame(gameId: string): Promise<PlaytimeInfo | null>

  // Game lifecycle events — returns unsubscribe function
  onGameStarted(cb: (data: RunningGameData) => void): () => void
  onGameEnded(cb: (data: { gameId?: string; gameTitle?: string }) => void): () => void

  // Save sync
  saveDiscoverForGame(gameId: string, title: string): Promise<SaveDiscoverResult>
  saveGetOverride(gameId: string): Promise<SaveOverrideResult | null>
  saveResolvePathPatterns(patterns: string[]): Promise<string[]>
  saveConfirmPath(gameId: string, path: string, apiBaseUrl: string, token: string): Promise<void>
  saveGetCloudSettings(gameId: string): Promise<CloudSettings | null>
  saveSetCloudSettings(gameId: string, autoSync: boolean): Promise<void>
  saveSyncCloud(gameId: string, title: string, mode: string, apiBaseUrl: string, token: string): Promise<SyncResult>
  saveSelectOverridePath(): Promise<string | null>
  saveSetOverride(gameId: string, path: string): Promise<void>
  saveClearOverride(gameId: string): Promise<void>

  // ISO install
  onInstallProgress(cb: (event: InstallProgressEvent) => void): () => void
  getActiveInstalls(): Promise<ActiveInstallInfo[]>
  cancelInstall(isoPath: string): Promise<void>

  // Install verification
  checkInstallDir(dir: string): Promise<InstallCheckResult>
}

// ── Accessor ─────────────────────────────────────────────────────────

declare global {
  interface Window {
    desktopAPI?: DesktopAPI
  }
}

let _cached: DesktopAPI | null | undefined

/** Get typed DesktopAPI reference, or null in web/browser context. */
export function getDesktopAPI(): DesktopAPI | null {
  if (_cached !== undefined) return _cached
  _cached = window.desktopAPI ?? null
  return _cached
}

export function hasDesktopAPI(): boolean {
  return getDesktopAPI() !== null
}

/** SSR-safe check — true when running inside Electron. */
export function isDesktop(): boolean {
  if (typeof window === 'undefined') return false
  return getDesktopAPI() !== null
}

/** Clear cached reference — useful for testing or after Electron reload. */
export function clearDesktopAPICache(): void {
  _cached = undefined
}
