/* ── Typed Desktop API — strongly-typed wrapper around window.desktopAPI ── */

import type { LocalGame, GamesFilter } from '@/features/launcher/types'

// ── API types ────────────────────────────────────────────────────────

export type AiModelStatus = 'not_available' | 'downloading' | 'loading' | 'ready' | 'error';

export interface DesktopSettingsData {
  launchOnStartup: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
  alwaysOnTop: boolean;
  startMinimized: boolean;
  aiAddonEnabled: boolean;
  aiModelStatus: AiModelStatus;
  aiSystemPrompt: string;
  gamesDownloadPath?: string;
}

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

export interface LiveFpsSnapshot {
  currentFps: number
  frameCount: number
  captureDurationMs: number
  gameId: string
}

export interface FpsStatsData {
  avgFps: number
  onePercentLow: number
  zeroPointOnePercentLow: number
  maxFps: number
  minFps: number
  totalFrames: number
  captureDurationMs: number
}

export interface PlaytimeInfo {
  totalMinutes: number
  sessionCount: number
  lastPlayed: number | null
  lastFpsStats: FpsStatsData | null
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

export interface RemoteDownloadProgress {
  id: string
  status: 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled'
  gameTitle: string
  filename: string
  bytesDownloaded: number
  totalBytes: number
  percentage: number
  speedBytesPerSec: number
  etaSeconds: number
  isoPath?: string | null
  error?: string | null
  serverUrl: string
  fileId: string
}

export interface RemoteDownloadOptions {
  id?: string
  userId?: string
  serverUrl: string
  fileId: string
  filename: string
  filesize: number
  gameTitle: string
  mediaItemId?: string | null
  authToken?: string | null
  destDir?: string | null
}

// ── Desktop API interface ────────────────────────────────────────────

export interface DesktopAPI {
  readonly platform: string | undefined

  // Query cache persistence
  cacheLoad: () => Promise<unknown>
  cacheSave: (data: unknown) => Promise<void>

  // Game scanning & detection
  scanPaths(scanPaths: string[], isoPaths: string[]): Promise<LocalGame[]>
  getScanPaths(): Promise<{ path: string; type: 'game' | 'iso' }[]>
  saveScanPaths(paths: { path: string; type: 'game' | 'iso' }[]): Promise<void>
  resetGameData(): Promise<void>
  getLocalGames(filter?: GamesFilter): Promise<LocalGame[]>
  saveScannedGames(games: LocalGame[]): Promise<void>
  getLocalGamesMap(): Promise<Record<string, LocalGame>>
  saveLocalGamesMapEntry(mediaId: string, game: LocalGame | null): Promise<void>
  onGamesUpdated(cb: () => void): () => void
  getGameById(id: string): Promise<LocalGame | null>
  getGameCount(filter?: GamesFilter): Promise<number>
  acceptSuggestion(gameId: string, suggestion: Record<string, unknown>): Promise<void>
  rejectSuggestion(gameId: string, suggestionMediaId: string): Promise<void>
  onGamesDbChanged(cb: () => void): () => void
  getRunningGame(): Promise<RunningGameData | null>

  // Game launching
  launchGame(game: LocalGame): Promise<void>
  showItemInFolder(path: string): Promise<void>
  pickExecutable(dir?: string): Promise<string | null>
  updateGamePath(id: string, exePath: string, installDir?: string): Promise<void>

  // Disk
  getDiskSpace(): Promise<DiskInfo[]>

  // Notifications
  showNotification?: (opts: {
    title: string
    body?: string
    icon?: string
    type: string
    metadata?: Record<string, unknown>
  }) => Promise<void>

  // Sessions & playtime
  getRecentSessions(): Promise<RecentSession[]>
  getPlaytimeForGame(gameId: string): Promise<PlaytimeInfo | null>

  // Game lifecycle events — returns unsubscribe function
  onGameStarted(cb: (data: RunningGameData) => void): () => void
  onGameEnded(cb: (data: { gameId?: string; gameTitle?: string }) => void): () => void
  onFpsUpdate(cb: (data: LiveFpsSnapshot) => void): () => void
  fixFpsPermissions: () => Promise<{ success: boolean; needRestart?: boolean; error?: string }>
  onFpsPermissionNeeded: (cb: () => void) => () => void
  onCleanQuit: (cb: () => void) => () => void

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

  // ── Legacy Electron IPC methods ──────────────────────────────────────

  // Download management (legacy naming)
  downloadsGetConfig(userId: string): Promise<Record<string, unknown>>
  downloadsSaveConfig(cfg: Record<string, unknown>): Promise<Record<string, unknown>>
  downloadsSearch(query: string, apiKey: string): Promise<Record<string, unknown>[]>
  downloadsAutoPick(results: Record<string, unknown>[], allowHypervisor?: boolean): Promise<Record<string, unknown>>
  downloadsGetUserDownloads(userId: string): Promise<Record<string, unknown>[]>
  downloadsSearchAndDownload(uid: string, mediaItemId: string | null, gameName: string, allowHypervisor?: boolean): Promise<Record<string, unknown>>
  downloadsPollQueue(userId: string): Promise<void>
  downloadsDelete(id: string): Promise<void>
  downloadsGetWishlistTracking(userId: string): Promise<Record<string, unknown>[]>
  downloadsScanWishlist(userId: string, games: { id: string; title: string }[]): Promise<Record<string, unknown>[]>
  downloadsSkipWishlistItem(userId: string, mediaItemId: string): Promise<void>
  downloadsTestSabnzbd(host: string, port: number, apiKey: string, useSsl: boolean): Promise<boolean>
  downloadsTestNzbplanet(apiKey: string): Promise<boolean>
  downloadsPostProcess(...args: unknown[]): Promise<void>
  downloadsGetPathMappings(configId: string): Promise<Record<string, unknown>[]>
  downloadsAddPathMapping(configId: string, sourcePath: string, destPath: string): Promise<Record<string, unknown>>
  downloadsRemovePathMapping(id: string): Promise<void>
  downloadsPreviewNamingTemplate(template: string, title: string): Promise<{ valid: boolean; result?: string }>

  // Remote Server Downloads (Plex-for-games)
  downloadsRemoteStart(options: RemoteDownloadOptions): Promise<string>
  downloadsRemotePause(downloadId: string): Promise<boolean>
  downloadsRemoteResume(downloadId: string): Promise<boolean>
  downloadsRemoteCancel(downloadId: string): Promise<boolean>
  downloadsRemoteGetActive(): Promise<RemoteDownloadProgress[]>
  onRemoteDownloadProgress(cb: (progress: RemoteDownloadProgress) => void): () => void
  onRemoteDownloadCompleted(cb: (data: { downloadId: string; finalPath: string; gameTitle: string }) => void): () => void

  // ISO install (legacy)
  installGame(isoPath: string, targetDir: string, gameTitle: string): Promise<Record<string, unknown>>
  selectDirectory(): Promise<string | null>
  selectIso(): Promise<string | null>
  mountIso(path: string): Promise<{ setupPath?: string }>
  dismountIso(path: string): Promise<void>
  applyCrack(...args: unknown[]): Promise<void>
  launchSetup(path: string): Promise<void>

  // Plugin system (subset — full API has many more methods)
  plugin?: Record<string, (...args: unknown[]) => Promise<unknown>>

  // AI model management (IPC handlers removed — methods absent at runtime.
  // intelligence.tsx guards with null checks. Restore handlers to re-enable.)
  aiGetStatus?: () => Promise<AiModelStatus>
  aiGetDownloadProgress?: () => Promise<number | null>
  aiGetLoadingProgress?: () => Promise<number | null>
  aiDownloadModel?: () => Promise<void>
  aiDeleteModel?: () => Promise<void>
  aiChat?: (messages: { role: 'user' | 'model'; content: string }[]) => Promise<string | null>
  aiGetSystemPrompt?: () => Promise<string>
  aiSetSystemPrompt?: (prompt: string) => Promise<void>
  onAiDownloadProgress?: (cb: (progress: number) => void) => () => void
  onAiLoadingProgress?: (cb: (progress: number) => void) => () => void
  onAiStatusChanged?: (cb: (status: AiModelStatus) => void) => () => void
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
