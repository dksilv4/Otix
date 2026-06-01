"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    ping: () => electron_1.ipcRenderer.invoke('ping'),
    selectDirectory: () => electron_1.ipcRenderer.invoke('dialog:select-directory'),
    scanPaths: (paths, isoPaths) => electron_1.ipcRenderer.invoke('scanner:scan-paths', paths, isoPaths),
    scanLaunchers: () => electron_1.ipcRenderer.invoke('scanner:scan-launchers'),
    launchGame: (game) => electron_1.ipcRenderer.invoke('launcher:launch-game', game),
    selectIso: () => electron_1.ipcRenderer.invoke('installer:select-iso'),
    mountIso: (isoPath) => electron_1.ipcRenderer.invoke('installer:mount-iso', isoPath),
    dismountIso: (isoPath) => electron_1.ipcRenderer.invoke('installer:dismount-iso', isoPath),
    applyCrack: (crackPath, targetDir) => electron_1.ipcRenderer.invoke('installer:apply-crack', crackPath, targetDir),
    getUpdatesForIso: (isoPath) => electron_1.ipcRenderer.invoke('installer:get-updates', isoPath),
    previewOrganization: (directory, regexPattern, isoTemplate, updateTemplate) => electron_1.ipcRenderer.invoke('installer:preview-organization', directory, regexPattern, isoTemplate, updateTemplate),
    executeOrganization: (items) => electron_1.ipcRenderer.invoke('installer:execute-organization', items),
    launchSetup: (setupPath) => electron_1.ipcRenderer.invoke('installer:launch-setup', setupPath),
    onScannerProgress: (callback) => {
        const subscription = (_event, data) => callback(data);
        electron_1.ipcRenderer.on('scanner:progress', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('scanner:progress', subscription);
        };
    },
    getScannedGames: () => electron_1.ipcRenderer.invoke('scanner:get-scanned-games'),
    saveScannedGames: (games) => electron_1.ipcRenderer.invoke('scanner:save-scanned-games', games),
    getScanPaths: () => electron_1.ipcRenderer.invoke('scanner:get-scan-paths'),
    saveScanPaths: (paths) => electron_1.ipcRenderer.invoke('scanner:save-scan-paths', paths),
    getLocalGamesMap: () => electron_1.ipcRenderer.invoke('scanner:get-local-games-map'),
    saveLocalGamesMapEntry: (mediaId, game) => electron_1.ipcRenderer.invoke('scanner:save-local-games-map-entry', mediaId, game),
    // Game detection
    getRunningGame: () => electron_1.ipcRenderer.invoke('game:get-running-single'),
    getRecentSessions: () => electron_1.ipcRenderer.invoke('game:get-recent-sessions'),
    setLibrary: (games) => electron_1.ipcRenderer.invoke('game:set-library', games),
    stopTracking: (gameId) => electron_1.ipcRenderer.invoke('game:stop-tracking', gameId),
    getRunningProcesses: () => electron_1.ipcRenderer.invoke('game:get-running-processes'),
    addMapping: (processName, gameId, gameTitle) => electron_1.ipcRenderer.invoke('game:add-mapping', processName, gameId, gameTitle),
    removeMapping: (processName) => electron_1.ipcRenderer.invoke('game:remove-mapping', processName),
    getMappings: () => electron_1.ipcRenderer.invoke('game:get-mappings'),
    getLibrary: () => electron_1.ipcRenderer.invoke('game:get-library'),
    onGameStarted: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on('game:started', handler);
        return () => electron_1.ipcRenderer.removeListener('game:started', handler);
    },
    onGameEnded: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on('game:ended', handler);
        return () => electron_1.ipcRenderer.removeListener('game:ended', handler);
    },
    // Downloads
    downloadsGetConfig: (userId) => electron_1.ipcRenderer.invoke('downloads:get-config', userId),
    downloadsSaveConfig: (config) => electron_1.ipcRenderer.invoke('downloads:save-config', config),
    downloadsSearch: (query, apiKey) => electron_1.ipcRenderer.invoke('downloads:search', query, apiKey),
    downloadsScanWishlist: (userId, wishlistGames) => electron_1.ipcRenderer.invoke('downloads:scan-wishlist', userId, wishlistGames),
    downloadsSearchAndDownload: (userId, mediaItemId, gameName) => electron_1.ipcRenderer.invoke('downloads:search-and-download', userId, mediaItemId, gameName),
    downloadsFilterResults: (results) => electron_1.ipcRenderer.invoke('downloads:filter-results', results),
    downloadsAutoPick: (results) => electron_1.ipcRenderer.invoke('downloads:auto-pick', results),
    downloadsGetDownload: (id) => electron_1.ipcRenderer.invoke('downloads:get-download', id),
    downloadsGetUserDownloads: (userId) => electron_1.ipcRenderer.invoke('downloads:get-user-downloads', userId),
    downloadsDelete: (id) => electron_1.ipcRenderer.invoke('downloads:delete', id),
    downloadsPollQueue: (userId) => electron_1.ipcRenderer.invoke('downloads:poll-queue', userId),
    downloadsTestSabnzbd: (host, port, apiKey, useSsl) => electron_1.ipcRenderer.invoke('downloads:test-sabnzbd', host, port, apiKey, useSsl),
    downloadsTestNzbplanet: (apiKey) => electron_1.ipcRenderer.invoke('downloads:test-nzbplanet', apiKey),
    downloadsGetWishlistTracking: (userId) => electron_1.ipcRenderer.invoke('downloads:get-wishlist-tracking', userId),
    downloadsSkipWishlistItem: (userId, mediaItemId) => electron_1.ipcRenderer.invoke('downloads:skip-wishlist-item', userId, mediaItemId),
    downloadsPostProcess: (downloadId, configId, fallbackSource, fallbackDest) => electron_1.ipcRenderer.invoke('downloads:post-process', downloadId, configId, fallbackSource, fallbackDest),
    downloadsGetPathMappings: (configId) => electron_1.ipcRenderer.invoke('downloads:get-path-mappings', configId),
    downloadsAddPathMapping: (configId, sourcePath, destPath) => electron_1.ipcRenderer.invoke('downloads:add-path-mapping', configId, sourcePath, destPath),
    downloadsRemovePathMapping: (id) => electron_1.ipcRenderer.invoke('downloads:remove-path-mapping', id),
});
