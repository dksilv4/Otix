import { contextBridge, ipcRenderer } from 'electron';
import type { DetectedGame } from './preload-api';

// Resolves once the main process has registered all IPC handlers.
let _resolveIpcReady: (() => void) | null = null;
const _ipcReady = new Promise<void>((resolve) => { _resolveIpcReady = resolve; });
ipcRenderer.on('main:ipc-ready', () => _resolveIpcReady?.());

contextBridge.exposeInMainWorld('desktopAPI', {
  /** Wait for the main process to finish registering all IPC handlers. */
  onMainIpcReady: () => _ipcReady,

  // ── Platform info ──
  platform: process.platform,

  // ── Desktop settings ──
  getDesktopSettings: () => ipcRenderer.invoke('desktop-settings:get'),
  setDesktopSettings: (settings: any) =>
    ipcRenderer.invoke('desktop-settings:set', settings),

  // ── Window controls ──
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  unmaximizeWindow: () => ipcRenderer.invoke('window:unmaximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  setAlwaysOnTop: (value: boolean) =>
    ipcRenderer.invoke('window:set-always-on-top', value),
  getAlwaysOnTop: () => ipcRenderer.invoke('window:get-always-on-top'),
  onMaximizedChanged: (callback: (maximized: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, maximized: boolean) =>
      callback(maximized);
    ipcRenderer.on('window:maximized-changed', handler);
    return () => ipcRenderer.removeListener('window:maximized-changed', handler);
  },

  // ── General ──
  openPath: (filePath: string) => ipcRenderer.invoke('shell:open-path', filePath),
  ping: () => ipcRenderer.invoke('ping'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),

  // ── Deep link (OAuth return) ──
  onDeepLink: (callback: (data: { action: string; params: Record<string, string> }) => void) => {
    const handler = (_event: any, data: { action: string; params: Record<string, string> }) => callback(data);
    ipcRenderer.on('deep-link', handler);
    return () => ipcRenderer.removeListener('deep-link', handler);
  },
  scanPaths: (paths: string[], isoPaths: string[]) => ipcRenderer.invoke('scanner:scan-paths', paths, isoPaths),
  scanLaunchers: () => ipcRenderer.invoke('scanner:scan-launchers'),
  launchGame: (game: DetectedGame) => ipcRenderer.invoke('launcher:launch-game', game),
  selectIso: () => ipcRenderer.invoke('installer:select-iso'),
  mountIso: (isoPath: string) => ipcRenderer.invoke('installer:mount-iso', isoPath),
  dismountIso: (isoPath: string) => ipcRenderer.invoke('installer:dismount-iso', isoPath),
  applyCrack: (crackPath: string, targetDir: string) => ipcRenderer.invoke('installer:apply-crack', crackPath, targetDir),
  getUpdatesForIso: (isoPath: string) => ipcRenderer.invoke('installer:get-updates', isoPath),
  previewOrganization: (directory: string, regexPattern: string, isoTemplate: string, updateTemplate: string, separator?: string) =>
    ipcRenderer.invoke('installer:preview-organization', directory, regexPattern, isoTemplate, updateTemplate, separator),
  executeOrganization: (items: { sourcePath: string; targetPath: string }[]) =>
    ipcRenderer.invoke('installer:execute-organization', items),
  launchSetup: (setupPath: string) => ipcRenderer.invoke('installer:launch-setup', setupPath),
  batchOrganize: (directory: string, namingTemplate?: string) => ipcRenderer.invoke('installer:batch-organize', directory, namingTemplate),
  smartOrganizePreview: (directory: string, namingTemplate: string, separator?: string) => ipcRenderer.invoke('installer:smart-preview', directory, namingTemplate, separator),
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
  batchCheckMatchCache: (isoPaths: string[]) => ipcRenderer.invoke('scanner:batch-check-match-cache', isoPaths),
  saveMatchCache: (entries: any[]) => ipcRenderer.invoke('scanner:save-match-cache', entries),

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
  downloadsSearchAndDownload: (userId: string, mediaItemId: string | null, gameName: string, allowHypervisor?: boolean) =>
    ipcRenderer.invoke('downloads:search-and-download', userId, mediaItemId, gameName, allowHypervisor),
  downloadsFilterResults: (results: any[]) => ipcRenderer.invoke('downloads:filter-results', results),
  downloadsAutoPick: (results: any[], allowHypervisor?: boolean) => ipcRenderer.invoke('downloads:auto-pick', results, allowHypervisor),
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

  // Update tracking
  downloadsGetTrackedGames: () => ipcRenderer.invoke('downloads:get-tracked-games'),
  downloadsCheckUpdates: () => ipcRenderer.invoke('downloads:check-updates'),

  // Organizer
  downloadsPreviewNamingTemplate: (template: string, sampleName: string) =>
    ipcRenderer.invoke('downloads:preview-naming-template', template, sampleName),
  downloadsValidateNamingTemplate: (template: string) =>
    ipcRenderer.invoke('downloads:validate-naming-template', template),

  // ── Save Management ──
  saveGetKnownLocations: () => ipcRenderer.invoke('save:get-known-locations'),
  saveDiscoverForGame: (gameId: string, gameTitle: string) =>
    ipcRenderer.invoke('save:discover-for-game', gameId, gameTitle),
  saveBackupToVault: (gameId: string, originPaths: string[]) =>
    ipcRenderer.invoke('save:backup-to-vault', gameId, originPaths),
  saveRestoreFromVault: (gameId: string, options: any) =>
    ipcRenderer.invoke('save:restore-from-vault', gameId, options),
  saveGetProfiles: (gameId: string) => ipcRenderer.invoke('save:get-profiles', gameId),
  saveCreateProfile: (gameId: string, name: string) =>
    ipcRenderer.invoke('save:create-profile', gameId, name),
  saveDeleteProfile: (profileId: string) => ipcRenderer.invoke('save:delete-profile', profileId),
  saveSetActiveProfile: (profileId: string) =>
    ipcRenderer.invoke('save:set-active-profile', profileId),
  saveGetSnapshots: (profileId: string) => ipcRenderer.invoke('save:get-snapshots', profileId),
  saveCreateSnapshot: (profileId: string, name?: string) =>
    ipcRenderer.invoke('save:create-snapshot', profileId, name),
  saveDeleteSnapshot: (snapshotId: string) => ipcRenderer.invoke('save:delete-snapshot', snapshotId),
  saveGetOverride: (gameId: string) => ipcRenderer.invoke('save:get-override', gameId),
  saveSetOverride: (gameId: string, userPath: string) =>
    ipcRenderer.invoke('save:set-override', gameId, userPath),
  saveClearOverride: (gameId: string) => ipcRenderer.invoke('save:clear-override', gameId),
  saveGetVaultStatus: () => ipcRenderer.invoke('save:get-vault-status'),
  saveExportSaves: (gameId: string, targetDir: string) =>
    ipcRenderer.invoke('save:export-saves', gameId, targetDir),
  saveImportSaves: (gameId: string, sourceDir: string) =>
    ipcRenderer.invoke('save:import-saves', gameId, sourceDir),
  saveGetVaultPath: () => ipcRenderer.invoke('save:get-vault-path'),
  saveSetVaultPath: (newPath: string) => ipcRenderer.invoke('save:set-vault-path', newPath),
  saveSelectExportDir: () => ipcRenderer.invoke('save:select-export-dir'),
  saveSelectImportDir: () => ipcRenderer.invoke('save:select-import-dir'),
  saveSelectOverridePath: () => ipcRenderer.invoke('save:select-override-path'),

  // ── Storage ──
  getDiskSpace: () => ipcRenderer.invoke('get-disk-space'),
});
