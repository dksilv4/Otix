import { contextBridge, ipcRenderer } from 'electron';
import type { LocalGame } from './preload-api';

// Resolves once the main process has registered all IPC handlers.
let _resolveIpcReady: (() => void) | null = null;
const _ipcReady = new Promise<void>((resolve) => { _resolveIpcReady = resolve; });
ipcRenderer.on('main:ipc-ready', () => _resolveIpcReady?.());

contextBridge.exposeInMainWorld('desktopAPI', {
  /** Wait for the main process to finish registering all IPC handlers. */
  onMainIpcReady: () => _ipcReady,

  // ── Platform info ──
  platform: process.platform,

  // ── Query cache persistence ──
  cacheLoad: () => ipcRenderer.invoke('cache:load'),
  cacheSave: (data: unknown) => ipcRenderer.invoke('cache:save', data),

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
  openSessionWindow: (url: string) => ipcRenderer.invoke('shell:open-session-window', url),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),

  // ── Deep link (OAuth return) ──
  onDeepLink: (callback: (data: { action: string; params: Record<string, string> }) => void) => {
    const handler = (_event: any, data: { action: string; params: Record<string, string> }) => callback(data);
    ipcRenderer.on('deep-link', handler);
    return () => ipcRenderer.removeListener('deep-link', handler);
  },

  // ── Notifications ──
  showNotification: (opts: { title: string; body?: string; icon?: string; type: string; metadata?: Record<string, unknown> }) =>
    ipcRenderer.invoke('notifications:show', opts),
  scanPaths: (paths: string[], isoPaths: string[]) => ipcRenderer.invoke('scanner:scan-paths', paths, isoPaths),
  scanLaunchers: () => ipcRenderer.invoke('scanner:scan-launchers'),
  launchGame: (game: LocalGame) => ipcRenderer.invoke('launcher:launch-game', game),
  getEmulators: () => ipcRenderer.invoke('emulators:get-all'),
  getAmbiguousCandidates: (filePathOrGame: string | LocalGame) => ipcRenderer.invoke('emulators:get-ambiguous-candidates', filePathOrGame),
  setGamePlatform: (gameId: string, platform: string) => ipcRenderer.invoke('emulators:set-game-platform', gameId, platform),
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
  onGamesUpdated: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on('scanner:game-updated', subscription);
    return () => {
      ipcRenderer.removeListener('scanner:game-updated', subscription);
    };
  },
  hydrateMatchedGames: () => ipcRenderer.invoke('games:hydrate-matched'),
  getLocalGames: (filter?: import('./preload-api').GameFilter) => ipcRenderer.invoke('scanner:get-scanned-games-filtered', filter ?? {}),
  getGameById: (id: string) => ipcRenderer.invoke('scanner:get-game-by-id', id),
  getGameCount: (filter: unknown) => ipcRenderer.invoke('scanner:get-game-count', filter),
  saveScannedGames: (games: unknown[]) => ipcRenderer.invoke('scanner:save-scanned-game', games),
  pickExecutable: (defaultPath?: string) => ipcRenderer.invoke('scanner:pick-executable', defaultPath),
  getScanPaths: () => ipcRenderer.invoke('scanner:get-scan-paths'),
  resetGameData: () => ipcRenderer.invoke('scanner:reset-game-data'),
  saveScanPaths: (paths: unknown[]) => ipcRenderer.invoke('scanner:save-scan-paths', paths),
  getLocalGamesMap: () => ipcRenderer.invoke('scanner:get-local-game-map'),
  saveLocalGamesMapEntry: (mediaId: string, game: unknown) => ipcRenderer.invoke('scanner:save-local-game-map-entry', mediaId, game),
  batchCheckMatchCache: (isoPaths: string[]) => ipcRenderer.invoke('scanner:batch-check-match-cache', isoPaths),
  saveMatchCache: (entries: unknown[]) => ipcRenderer.invoke('scanner:save-match-cache', entries),
  updateGamePath: (id: string, exePath: string, installDir?: string) =>
    ipcRenderer.invoke('scanner:update-game-path', id, exePath, installDir),
  acceptSuggestion: (gameId: string, suggestion: unknown) => ipcRenderer.invoke('scanner:accept-suggestion', gameId, suggestion),
  unmatchGame: (gameId: string) => ipcRenderer.invoke('scanner:unmatch-game', gameId),
  rejectSuggestion: (gameId: string, suggestionMediaId: string) => ipcRenderer.invoke('scanner:reject-suggestion', gameId, suggestionMediaId),
  resetPlatformGames: (platforms: string[]) => ipcRenderer.invoke('scanner:reset-platform-games', platforms),
  deleteGamesByDirectory: (dirPrefix: string) => ipcRenderer.invoke('scanner:delete-games-by-dir', dirPrefix),
  onGamesDbChanged: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('games-db:changed', handler);
    return () => ipcRenderer.removeListener('games-db:changed', handler);
  },

  // Game detection
  getRunningGame: () => ipcRenderer.invoke('game:get-running-single'),
  getRunningGames: () => ipcRenderer.invoke('game:get-running'),
  getRecentSessions: () => ipcRenderer.invoke('game:get-recent-sessions'),
  getPlaytimeForGame: (gameId: string) => ipcRenderer.invoke('game:get-playtime', gameId),
  setLibrary: (games: LocalGame[]) => ipcRenderer.invoke('game:set-library', games),
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
  onFpsUpdate: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('game:fps', handler);
    return () => ipcRenderer.removeListener('game:fps', handler);
  },
  onFpsStats: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('game:fps-stats', handler);
    return () => ipcRenderer.removeListener('game:fps-stats', handler);
  },
  onSessionsUpdated: (callback: (data?: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('game:sessions-updated', handler);
    return () => ipcRenderer.removeListener('game:sessions-updated', handler);
  },
  getCs2GameState: () => ipcRenderer.invoke('game:get-cs2-state'),
  setupCs2Gsi: () => ipcRenderer.invoke('game:setup-cs2-gsi'),
  onCs2StateUpdate: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('game:cs2-gsi-update', handler);
    return () => ipcRenderer.removeListener('game:cs2-gsi-update', handler);
  },
  fixFpsPermissions: () => ipcRenderer.invoke('fps:fix-permissions'),
  onFpsPermissionNeeded: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('fps:permission-needed', handler);
    return () => ipcRenderer.removeListener('fps:permission-needed', handler);
  },
  onCleanQuit: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('app:clean-quit', handler);
    return () => ipcRenderer.removeListener('app:clean-quit', handler);
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
  downloadsGetTrackedGames: () => ipcRenderer.invoke('downloads:get-tracked-game'),
  downloadsCheckUpdates: () => ipcRenderer.invoke('downloads:check-updates'),

  // Organizer
  downloadsPreviewNamingTemplate: (template: string, sampleName: string) =>
    ipcRenderer.invoke('downloads:preview-naming-template', template, sampleName),
  downloadsValidateNamingTemplate: (template: string) =>
    ipcRenderer.invoke('downloads:validate-naming-template', template),

  // Remote Server Downloads (Plex-for-Games)
  downloadsRemoteStart: (options: any) => ipcRenderer.invoke('downloads:remote:start', options),
  downloadsRemotePause: (downloadId: string) => ipcRenderer.invoke('downloads:remote:pause', downloadId),
  downloadsRemoteResume: (downloadId: string) => ipcRenderer.invoke('downloads:remote:resume', downloadId),
  downloadsRemoteCancel: (downloadId: string) => ipcRenderer.invoke('downloads:remote:cancel', downloadId),
  downloadsRemoteGetActive: () => ipcRenderer.invoke('downloads:remote:get-active'),
  onRemoteDownloadProgress: (callback: (progress: any) => void) => {
    const handler = (_event: any, progress: any) => callback(progress);
    ipcRenderer.on('downloads:remote:progress', handler);
    return () => ipcRenderer.removeListener('downloads:remote:progress', handler);
  },
  onRemoteDownloadCompleted: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('downloads:remote:completed', handler);
    return () => ipcRenderer.removeListener('downloads:remote:completed', handler);
  },

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
  saveGetCloudSettings: (gameId: string) => ipcRenderer.invoke('save:get-cloud-settings', gameId),
  saveSetCloudSettings: (gameId: string, autoSync: boolean) => ipcRenderer.invoke('save:set-cloud-settings', gameId, autoSync),
  saveSyncCloud: (gameId: string, gameTitle: string, profileId: string, apiBaseUrl: string, authToken: string) =>
    ipcRenderer.invoke('save:sync-cloud', gameId, gameTitle, profileId, apiBaseUrl, authToken),
  saveConfirmPath: (gameId: string, absolutePath: string, apiBaseUrl: string, authToken: string) =>
    ipcRenderer.invoke('save:confirm-path', gameId, absolutePath, apiBaseUrl, authToken),
  saveResolvePathPatterns: (patterns: string[]) =>
    ipcRenderer.invoke('save:resolve-path-patterns', patterns),

  // ── Auto Updater ──
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
    installUpdate: () => ipcRenderer.invoke('updater:install-update'),
    getVersion: () => ipcRenderer.invoke('updater:get-version'),
    onStatusChanged: (callback: (state: any) => void) => {
      const handler = (_event: any, state: any) => callback(state);
      ipcRenderer.on('updater:status-changed', handler);
      return () => ipcRenderer.removeListener('updater:status-changed', handler);
    },
  },

  // ── Storage ──
  getDiskSpace: () => ipcRenderer.invoke('get-disk-space'),

  // ── Auto Install ──
  installGame: (isoPath: string, targetDir: string, gameTitle?: string) =>
    ipcRenderer.invoke('installer:install-game', isoPath, targetDir, gameTitle),
  cancelInstall: (installId?: string) => ipcRenderer.invoke('installer:cancel-install', installId),
  getActiveInstalls: () => ipcRenderer.invoke('installer:get-active-installs'),
  checkInstallDir: (installDir: string) => ipcRenderer.invoke('installer:check-install-dir', installDir),
  onInstallProgress: (callback: (progress: any) => void) => {
    const handler = (_event: any, progress: any) => callback(progress);
    ipcRenderer.on('installer:install-progress', handler);
    return () => ipcRenderer.removeListener('installer:install-progress', handler);
  },

  // ── Plugin system ──
  plugin: {
    list: () => ipcRenderer.invoke('plugin:list'),
    get: (id: string) => ipcRenderer.invoke('plugin:get', id),
    uninstall: (id: string) => ipcRenderer.invoke('plugin:uninstall', id),
    enable: (id: string) => ipcRenderer.invoke('plugin:enable', id),
    disable: (id: string) => ipcRenderer.invoke('plugin:disable', id),
    reload: (id: string) => ipcRenderer.invoke('plugin:reload', id),
    discover: () => ipcRenderer.invoke('plugin:discover'),
    getConfig: (pluginId: string) => ipcRenderer.invoke('plugin:get-config', pluginId),
    setConfig: (pluginId: string, key: string, value: unknown) => ipcRenderer.invoke('plugin:set-config', pluginId, key, value),
    respondToPermission: (requestId: string, response: any) => ipcRenderer.invoke('plugin:respond-permission', requestId, response),
    emitEvent: (eventName: string, payload: unknown) => ipcRenderer.invoke('plugin:emit-event', eventName, payload),
    onPermissionRequest: (callback: (request: any) => void) => {
      const handler = (_event: any, request: any) => callback(request);
      ipcRenderer.on('plugin:permission-request', handler);
      return () => ipcRenderer.removeListener('plugin:permission-request', handler);
    },
    onConfigChanged: (callback: (payload: { pluginId: string; key?: string; config: Record<string, unknown> }) => void) => {
      const handler = (_event: any, payload: any) => callback(payload);
      ipcRenderer.on('plugin:config-changed', handler);
      return () => ipcRenderer.removeListener('plugin:config-changed', handler);
    },
    onStatusChanged: (callback: (payload: { pluginId: string; status: Record<string, unknown> }) => void) => {
      const handler = (_event: any, payload: any) => callback(payload);
      ipcRenderer.on('plugin:status-changed', handler);
      return () => ipcRenderer.removeListener('plugin:status-changed', handler);
    },
    onSlotsChanged: (callback: (payload: { pluginId?: string }) => void) => {
      const handler = (_event: any, payload: any) => callback(payload);
      ipcRenderer.on('plugin:slots-changed', handler);
      return () => ipcRenderer.removeListener('plugin:slots-changed', handler);
    },
    setAuthToken: (token: string) => ipcRenderer.invoke('plugin:set-auth-token', token),
    getApiBaseUrl: () => ipcRenderer.invoke('plugin:get-api-base-url'),
    setApiBaseUrl: (url: string) => ipcRenderer.invoke('plugin:set-api-base-url', url),
    testInstance: (url: string, apiKey: string) => ipcRenderer.invoke('plugin:test-instance', url, apiKey),
    testConfig: (pluginId: string, configDraft: Record<string, unknown>) => ipcRenderer.invoke('plugin:test-config', pluginId, configDraft),
    callData: (pluginId: string, method: string, ...args: unknown[]) =>
      ipcRenderer.invoke('plugin:call-data', pluginId, method, ...args),
    getStatus: (pluginId: string) => ipcRenderer.invoke('plugin:get-status', pluginId),
    openOAuthWindow: (url: string, redirectPattern: string, options?: { tokenExtraction?: { type: string; key?: string } }) => ipcRenderer.invoke('plugin:open-oauth-window', url, redirectPattern, options),
    getSlotData: (location: string, context?: Record<string, unknown>) => ipcRenderer.invoke('plugin:get-slot-data', location, context),
    getPageSlotData: (pageId: string) => ipcRenderer.invoke('plugin:get-page-slot-data', pageId),
    getPluginTabs: () => ipcRenderer.invoke('plugin:get-plugin-tabs'),
    getActivity: () => ipcRenderer.invoke('plugin:get-activity'),
    getFreeGames: () => ipcRenderer.invoke('free-games:get-all'),
    refreshFreeGames: () => ipcRenderer.invoke('free-games:refresh'),
  },

  // ── Plugin game matching ──
  scanAllPlugins: () => ipcRenderer.invoke('scanner:scan-all-plugins'),
  scanPlugin: (pluginId: string) => ipcRenderer.invoke('scanner:scan-plugin', pluginId),
  cancelScan: () => ipcRenderer.invoke('scanner:cancel-scan'),
  onMatchingProgress: (callback: (event: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('game:matching:progress', handler);
    return () => ipcRenderer.removeListener('game:matching:progress', handler);
  },
  onMatchingComplete: (callback: (event: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('game:matching:complete', handler);
    return () => ipcRenderer.removeListener('game:matching:complete', handler);
  },
  onMatchingCancelled: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('game:matching:cancelled', handler);
    return () => ipcRenderer.removeListener('game:matching:cancelled', handler);
  },
});
