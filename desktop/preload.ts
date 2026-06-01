import { contextBridge, ipcRenderer } from 'electron';
import type { DetectedGame } from './scanner';

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  scanPaths: (paths: string[], isoPaths: string[]) => ipcRenderer.invoke('scanner:scan-paths', paths, isoPaths),
  scanLaunchers: () => ipcRenderer.invoke('scanner:scan-launchers'),
  launchGame: (game: DetectedGame) => ipcRenderer.invoke('launcher:launch-game', game),
  selectIso: () => ipcRenderer.invoke('installer:select-iso'),
  mountIso: (isoPath: string) => ipcRenderer.invoke('installer:mount-iso', isoPath),
  dismountIso: (isoPath: string) => ipcRenderer.invoke('installer:dismount-iso', isoPath),
  applyCrack: (crackPath: string, targetDir: string) => ipcRenderer.invoke('installer:apply-crack', crackPath, targetDir),
  getUpdatesForIso: (isoPath: string) => ipcRenderer.invoke('installer:get-updates', isoPath),
  previewOrganization: (directory: string, regexPattern: string, isoTemplate: string, updateTemplate: string) =>
    ipcRenderer.invoke('installer:preview-organization', directory, regexPattern, isoTemplate, updateTemplate),
  executeOrganization: (items: { sourcePath: string; targetPath: string }[]) =>
    ipcRenderer.invoke('installer:execute-organization', items),
  launchSetup: (setupPath: string) => ipcRenderer.invoke('installer:launch-setup', setupPath),
  onScannerProgress: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('scanner:progress', subscription);
    return () => {
      ipcRenderer.removeListener('scanner:progress', subscription);
    };
  },
  getScannedGames: () => ipcRenderer.invoke('scanner:get-scanned-games'),
  saveScannedGames: (games: any[]) => ipcRenderer.invoke('scanner:save-scanned-games', games),
  getScanPaths: () => ipcRenderer.invoke('scanner:get-scan-paths'),
  saveScanPaths: (paths: any[]) => ipcRenderer.invoke('scanner:save-scan-paths', paths),
  getLocalGamesMap: () => ipcRenderer.invoke('scanner:get-local-games-map'),
  saveLocalGamesMapEntry: (mediaId: string, game: any | null) => ipcRenderer.invoke('scanner:save-local-games-map-entry', mediaId, game),

  // Game detection
  getRunningGame: () => ipcRenderer.invoke('game:get-running-single'),
  getRecentSessions: () => ipcRenderer.invoke('game:get-recent-sessions'),
  setLibrary: (games: DetectedGame[]) => ipcRenderer.invoke('game:set-library', games),
  stopTracking: (gameId: string) => ipcRenderer.invoke('game:stop-tracking', gameId),
  getRunningProcesses: () => ipcRenderer.invoke('game:get-running-processes'),
  addMapping: (processName: string, gameId: string, gameTitle: string) =>
    ipcRenderer.invoke('game:add-mapping', processName, gameId, gameTitle),
  removeMapping: (processName: string) => ipcRenderer.invoke('game:remove-mapping', processName),
  getMappings: () => ipcRenderer.invoke('game:get-mappings'),
  getLibrary: () => ipcRenderer.invoke('game:get-library'),
  onGameStarted: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('game:started', handler);
    return () => ipcRenderer.removeListener('game:started', handler);
  },
  onGameEnded: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('game:ended', handler);
    return () => ipcRenderer.removeListener('game:ended', handler);
  },

  // Downloads
  downloadsGetConfig: (userId: string) => ipcRenderer.invoke('downloads:get-config', userId),
  downloadsSaveConfig: (config: any) => ipcRenderer.invoke('downloads:save-config', config),
  downloadsSearch: (query: string, apiKey: string) => ipcRenderer.invoke('downloads:search', query, apiKey),
  downloadsScanWishlist: (userId: string, wishlistGames: { id: string; title: string }[]) =>
    ipcRenderer.invoke('downloads:scan-wishlist', userId, wishlistGames),
  downloadsSearchAndDownload: (userId: string, mediaItemId: string | null, gameName: string) =>
    ipcRenderer.invoke('downloads:search-and-download', userId, mediaItemId, gameName),
  downloadsFilterResults: (results: any[]) => ipcRenderer.invoke('downloads:filter-results', results),
  downloadsAutoPick: (results: any[]) => ipcRenderer.invoke('downloads:auto-pick', results),
  downloadsGetDownload: (id: string) => ipcRenderer.invoke('downloads:get-download', id),
  downloadsGetUserDownloads: (userId: string) => ipcRenderer.invoke('downloads:get-user-downloads', userId),
  downloadsDelete: (id: string) => ipcRenderer.invoke('downloads:delete', id),
  downloadsPollQueue: (userId: string) => ipcRenderer.invoke('downloads:poll-queue', userId),
  downloadsTestSabnzbd: (host: string, port: number, apiKey: string, useSsl: boolean) =>
    ipcRenderer.invoke('downloads:test-sabnzbd', host, port, apiKey, useSsl),
  downloadsTestNzbplanet: (apiKey: string) => ipcRenderer.invoke('downloads:test-nzbplanet', apiKey),
  downloadsGetWishlistTracking: (userId: string) => ipcRenderer.invoke('downloads:get-wishlist-tracking', userId),
  downloadsSkipWishlistItem: (userId: string, mediaItemId: string) =>
    ipcRenderer.invoke('downloads:skip-wishlist-item', userId, mediaItemId),
  downloadsPostProcess: (downloadId: string, configId: string, fallbackSource?: string, fallbackDest?: string) =>
    ipcRenderer.invoke('downloads:post-process', downloadId, configId, fallbackSource, fallbackDest),
  downloadsGetPathMappings: (configId: string) => ipcRenderer.invoke('downloads:get-path-mappings', configId),
  downloadsAddPathMapping: (configId: string, sourcePath: string, destPath: string) =>
    ipcRenderer.invoke('downloads:add-path-mapping', configId, sourcePath, destPath),
  downloadsRemovePathMapping: (id: string) => ipcRenderer.invoke('downloads:remove-path-mapping', id),
});
