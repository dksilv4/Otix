/** Desktop IPC API exposed via preload script */
interface DesktopAPI {
  platform: string
  downloadsGetConfig(userId: string): Promise<any>
  downloadsSaveConfig(cfg: any): Promise<any>
  downloadsSearch(query: string, apiKey: string): Promise<any[]>
  downloadsAutoPick(results: any[], allowHypervisor?: boolean): Promise<any>
  downloadsGetUserDownloads(userId: string): Promise<any[]>
  downloadsSearchAndDownload(uid: string, mediaItemId: string | null, gameName: string, allowHypervisor?: boolean): Promise<any>
  downloadsPollQueue(userId: string): Promise<void>
  downloadsDelete(id: string): Promise<void>
  downloadsGetWishlistTracking(userId: string): Promise<any[]>
  downloadsScanWishlist(userId: string, games: { id: string; title: string }[]): Promise<any[]>
  downloadsSkipWishlistItem(userId: string, mediaItemId: string): Promise<void>
  downloadsTestSabnzbd(host: string, port: number, apiKey: string, useSsl: boolean): Promise<boolean>
  downloadsTestNzbplanet(apiKey: string): Promise<boolean>
  downloadsPostProcess(...args: any[]): Promise<void>
  downloadsGetPathMappings(configId: string): Promise<any[]>
  downloadsAddPathMapping(configId: string, sourcePath: string, destPath: string): Promise<any>
  downloadsRemovePathMapping(id: string): Promise<void>
  downloadsPreviewNamingTemplate(template: string, title: string): Promise<{ valid: boolean; result?: string }>
  launchGame(game: any): Promise<void>
  launchSetup(path: string): Promise<void>
  selectDirectory(): Promise<string | null>
  selectIso(): Promise<string | null>
  mountIso(path: string): Promise<{ setupPath?: string }>
  dismountIso(path: string): Promise<void>
  applyCrack(...args: any[]): Promise<void>
  onGamesUpdated(callback: () => void): () => void
  onGameStarted(callback: (data: any) => void): () => void
  onGameEnded(callback: (data: any) => void): () => void
  saveScanPaths(paths: string[]): Promise<void>
  saveScannedGames(games: any[]): Promise<void>
  saveLocalGamesMapEntry(mediaId: string, game: any): Promise<void>
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
}

interface Window {
  desktopAPI?: DesktopAPI
}
