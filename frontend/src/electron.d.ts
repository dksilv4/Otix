interface LiveFpsSnapshot {
  currentFps: number
  frameCount: number
  captureDurationMs: number
  gameId: string
}

interface FpsStats {
  avgFps: number
  onePercentLow: number
  zeroPointOnePercentLow: number
  maxFps: number
  minFps: number
  totalFrames: number
  captureDurationMs: number
}

/** Desktop IPC API exposed via preload script */
interface DesktopAPI {
  platform: string
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
  launchGame(game: Record<string, unknown>): Promise<void>
  launchSetup(path: string): Promise<void>
  selectDirectory(): Promise<string | null>
  selectIso(): Promise<string | null>
  mountIso(path: string): Promise<{ setupPath?: string }>
  dismountIso(path: string): Promise<void>
  applyCrack(...args: unknown[]): Promise<void>
  onGamesUpdated(callback: () => void): () => void
  onGameStarted(callback: (data: Record<string, unknown>) => void): () => void
  onGameEnded(callback: (data: Record<string, unknown>) => void): () => void
  onFpsUpdate(callback: (data: LiveFpsSnapshot) => void): () => void
  onCleanQuit(callback: () => void): () => void
  saveScanPaths(paths: string[]): Promise<void>
  saveScannedGames(games: Record<string, unknown>[]): Promise<void>
  saveLocalGamesMapEntry(mediaId: string, game: Record<string, unknown>): Promise<void>
  updateGamePath(oldExePath: string, newExePath: string, newInstallDir?: string): Promise<void>
  saveGetCloudSettings(gameId: string): Promise<{ gameId: string; autoSync: boolean; lastSyncAt: string | null; isPathConfirmed: boolean; confirmedPath: string | null }>
  saveSetCloudSettings(gameId: string, autoSync: boolean): Promise<void>
  saveSyncCloud(gameId: string, gameTitle: string, profileId: string, apiBaseUrl: string, authToken: string): Promise<{ success: boolean; message: string }>
  saveConfirmPath(gameId: string, absolutePath: string, apiBaseUrl: string, authToken: string): Promise<void>
  saveResolvePathPatterns(patterns: string[]): Promise<string[]>
  saveDiscoverForGame(gameId: string, gameTitle: string): Promise<{ gameId: string; gameTitle: string; detectedPaths: string[]; filesFound: number; vaultProfileId: string | null }>
  saveGetOverride(gameId: string): Promise<{ gameId: string; userPath: string } | null>
  saveSetOverride(gameId: string, userPath: string): Promise<void>
  saveClearOverride(gameId: string): Promise<void>
  saveSelectOverridePath(): Promise<string | null>
  getPlaytimeForGame(gameId: string): Promise<{ totalMinutes: number; sessionCount: number; lastPlayed: number | null; lastFpsStats: FpsStats | null }>
}

interface Window {
  desktopAPI?: DesktopAPI
}
