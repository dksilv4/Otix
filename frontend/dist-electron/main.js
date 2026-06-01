"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const scanner_1 = require("./scanner");
const launchers_1 = require("./launchers");
const installer_1 = require("./installer");
const game_detector_1 = require("./game-detector");
const downloads_1 = require("./downloads");
let mainWindow = null;
let gameDetector = null;
const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        title: 'Otix',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            partition: 'persist:main',
        },
    });
    if (isDev) {
        mainWindow.loadURL('http://127.0.0.1:5173/');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadURL(`file://${path.join(__dirname, '../dist/index.html')}`);
    }
    mainWindow.on('closed', () => {
        gameDetector?.stopAll();
        mainWindow = null;
    });
}
electron_1.app.on('ready', () => {
    gameDetector = new game_detector_1.GameDetector(electron_1.app.getPath('userData'));
    // Forward game detection events to renderer
    gameDetector.on('game:started', (runningGame) => {
        mainWindow?.webContents.send('game:started', runningGame);
    });
    gameDetector.on('game:ended', (session) => {
        mainWindow?.webContents.send('game:ended', session);
    });
    // IPC communication test handler
    electron_1.ipcMain.handle('ping', () => 'pong');
    // Directory selection dialog
    electron_1.ipcMain.handle('dialog:select-directory', async () => {
        const result = await electron_1.dialog.showOpenDialog({
            title: 'Select Game Directory or Steam Library Folder',
            properties: ['openDirectory'],
        });
        if (result.canceled)
            return null;
        return result.filePaths[0];
    });
    // Scan games in paths
    electron_1.ipcMain.handle('scanner:scan-paths', async (event, paths, isoPaths) => {
        const games = await (0, scanner_1.scanPaths)(paths, isoPaths, (progressData) => {
            event.sender.send('scanner:progress', progressData);
        });
        // Feed scanned games into detector for external process matching
        gameDetector?.setLibrary(games);
        gameDetector?.startPeriodicScan();
        return games;
    });
    // Scan installed launcher libraries (Epic, GOG, Battle.net, Ubisoft, EA, Riot, Xbox, Itch)
    electron_1.ipcMain.handle('scanner:scan-launchers', async () => {
        const results = await (0, launchers_1.scanAllLaunchers)();
        const allGames = [];
        for (const result of results) {
            allGames.push(...result.games);
        }
        gameDetector?.setLibrary(allGames);
        gameDetector?.startPeriodicScan();
        return results;
    });
    // Launch game — now accepts full DetectedGame for tracking
    electron_1.ipcMain.handle('launcher:launch-game', async (_, game) => {
        try {
            if (game.exePath.startsWith('steam://')) {
                await electron_1.shell.openExternal(game.exePath);
                gameDetector?.startTracking(game); // no PID for Steam, scan will confirm
                return true;
            }
            else {
                const gameDir = path.dirname(game.exePath);
                const child = (0, child_process_1.spawn)(game.exePath, [], {
                    cwd: gameDir,
                    detached: true,
                    stdio: 'ignore',
                });
                gameDetector?.startTracking(game, child.pid);
                child.unref();
                return true;
            }
        }
        catch (err) {
            console.error('Failed to launch game', game.exePath, err);
            throw err;
        }
    });
    // ── Game detection IPC ──
    electron_1.ipcMain.handle('game:get-running', () => {
        return gameDetector?.getRunningGames() ?? [];
    });
    electron_1.ipcMain.handle('game:get-running-single', () => {
        return gameDetector?.getRunningGame() ?? null;
    });
    electron_1.ipcMain.handle('game:get-recent-sessions', () => {
        return gameDetector?.getRecentSessions() ?? [];
    });
    electron_1.ipcMain.handle('game:set-library', (_, games) => {
        gameDetector?.setLibrary(games);
        gameDetector?.startPeriodicScan();
        return true;
    });
    electron_1.ipcMain.handle('game:stop-tracking', (_, gameId) => {
        gameDetector?.stopTracking(gameId);
        return true;
    });
    // ── Manual mapping IPC ──
    electron_1.ipcMain.handle('game:get-running-processes', async () => {
        return gameDetector?.getRunningProcesses() ?? [];
    });
    electron_1.ipcMain.handle('game:add-mapping', (_, processName, gameId, gameTitle) => {
        gameDetector?.addMapping(processName, gameId, gameTitle);
        return true;
    });
    electron_1.ipcMain.handle('game:remove-mapping', (_, processName) => {
        gameDetector?.removeMapping(processName);
        return true;
    });
    electron_1.ipcMain.handle('game:get-mappings', () => {
        return gameDetector?.getMappings() ?? [];
    });
    electron_1.ipcMain.handle('game:get-library', () => {
        return gameDetector?.getLibrary() ?? [];
    });
    // Select ISO dialog
    electron_1.ipcMain.handle('installer:select-iso', async () => {
        const result = await electron_1.dialog.showOpenDialog({
            title: 'Select Game ISO File',
            filters: [{ name: 'Disk Images', extensions: ['iso'] }],
            properties: ['openFile'],
        });
        if (result.canceled)
            return null;
        return result.filePaths[0];
    });
    // Mount ISO
    electron_1.ipcMain.handle('installer:mount-iso', async (_, isoPath) => {
        return await (0, installer_1.mountIso)(isoPath);
    });
    // Dismount ISO
    electron_1.ipcMain.handle('installer:dismount-iso', async (_, isoPath) => {
        return await (0, installer_1.dismountIso)(isoPath);
    });
    // Apply Crack
    electron_1.ipcMain.handle('installer:apply-crack', async (_, crackPath, targetDir) => {
        return await (0, installer_1.applyCrack)(crackPath, targetDir);
    });
    // Find updates for ISO
    electron_1.ipcMain.handle('installer:get-updates', async (_, isoPath) => {
        return await (0, scanner_1.findUpdateFilesForIso)(isoPath);
    });
    // Preview ISO Folder Reorganization
    electron_1.ipcMain.handle('installer:preview-organization', async (_, directory, regexPattern, isoTemplate, updateTemplate) => {
        return await (0, installer_1.previewOrganization)(directory, regexPattern, isoTemplate, updateTemplate);
    });
    // Execute ISO Folder Reorganization
    electron_1.ipcMain.handle('installer:execute-organization', async (_, items) => {
        return await (0, installer_1.executeOrganization)(items);
    });
    electron_1.ipcMain.handle('installer:launch-setup', async (_, setupPath) => {
        try {
            return await (0, installer_1.launchSetup)(setupPath);
        }
        catch (err) {
            console.error('Failed to launch installer:', setupPath, err);
            throw err;
        }
    });
    // ── Database storage for scans ──
    electron_1.ipcMain.handle('scanner:get-scanned-games', () => {
        return (0, downloads_1.getScannedGamesFromDb)();
    });
    electron_1.ipcMain.handle('scanner:save-scanned-games', (_, games) => {
        return (0, downloads_1.saveScannedGamesToDb)(games);
    });
    electron_1.ipcMain.handle('scanner:get-scan-paths', () => {
        return (0, downloads_1.getScanPathsFromDb)();
    });
    electron_1.ipcMain.handle('scanner:save-scan-paths', (_, paths) => {
        return (0, downloads_1.saveScanPathsToDb)(paths);
    });
    electron_1.ipcMain.handle('scanner:get-local-games-map', () => {
        return (0, downloads_1.getLocalGamesMapFromDb)();
    });
    electron_1.ipcMain.handle('scanner:save-local-games-map-entry', (_, mediaId, game) => {
        return (0, downloads_1.saveLocalGamesMapEntryToDb)(mediaId, game);
    });
    // ── Downloads IPC ──
    electron_1.ipcMain.handle('downloads:get-config', (_, userId) => {
        return (0, downloads_1.getConfig)(userId);
    });
    electron_1.ipcMain.handle('downloads:save-config', (_, config) => {
        return (0, downloads_1.saveConfig)(config);
    });
    electron_1.ipcMain.handle('downloads:search', async (_, query, apiKey) => {
        return await (0, downloads_1.searchNzbPlanet)(query, apiKey);
    });
    electron_1.ipcMain.handle('downloads:scan-wishlist', async (_, userId, wishlistGames) => {
        const config = (0, downloads_1.getConfig)(userId);
        if (!config)
            return { error: 'No download config' };
        const results = [];
        for (const game of wishlistGames) {
            const result = await (0, downloads_1.searchAndDownload)(userId, game.id, game.title);
            if ('download' in result) {
                results.push({ mediaItemId: game.id, success: true, downloadId: result.download.id });
            }
            else {
                results.push({ mediaItemId: game.id, success: false, error: result.error });
            }
        }
        return results;
    });
    electron_1.ipcMain.handle('downloads:search-and-download', async (_, userId, mediaItemId, gameName) => {
        return await (0, downloads_1.searchAndDownload)(userId, mediaItemId, gameName);
    });
    electron_1.ipcMain.handle('downloads:filter-results', (_, results) => {
        return (0, downloads_1.filterQualityResults)(results);
    });
    electron_1.ipcMain.handle('downloads:auto-pick', (_, results) => {
        return (0, downloads_1.autoPickBest)(results);
    });
    electron_1.ipcMain.handle('downloads:get-download', (_, id) => {
        return (0, downloads_1.getDownload)(id);
    });
    electron_1.ipcMain.handle('downloads:get-user-downloads', (_, userId) => {
        return (0, downloads_1.getUserDownloads)(userId);
    });
    electron_1.ipcMain.handle('downloads:delete', (_, id) => {
        return (0, downloads_1.deleteDownload)(id);
    });
    electron_1.ipcMain.handle('downloads:poll-queue', async (_, userId) => {
        return await (0, downloads_1.pollAndUpdateDownloads)(userId);
    });
    electron_1.ipcMain.handle('downloads:test-sabnzbd', async (_, host, port, apiKey, useSsl) => {
        return await (0, downloads_1.testSabnzbdConnection)(host, port, apiKey, useSsl);
    });
    electron_1.ipcMain.handle('downloads:test-nzbplanet', async (_, apiKey) => {
        console.log('[IPC] downloads:test-nzbplanet called, key length:', apiKey?.length ?? 0);
        const result = await (0, downloads_1.testNzbPlanetConnection)(apiKey);
        console.log('[IPC] downloads:test-nzbplanet result:', result);
        return result;
    });
    electron_1.ipcMain.handle('downloads:get-wishlist-tracking', (_, userId) => {
        return (0, downloads_1.getWishlistTracking)(userId);
    });
    electron_1.ipcMain.handle('downloads:skip-wishlist-item', (_, userId, mediaItemId) => {
        return (0, downloads_1.skipWishlistItem)(userId, mediaItemId);
    });
    electron_1.ipcMain.handle('downloads:post-process', (_, downloadId, configId, fallbackSource, fallbackDest) => {
        return (0, downloads_1.postProcessDownload)(downloadId, configId, fallbackSource, fallbackDest);
    });
    electron_1.ipcMain.handle('downloads:get-path-mappings', async (_, configId) => {
        return await (0, downloads_1.getPathMappings)(configId);
    });
    electron_1.ipcMain.handle('downloads:add-path-mapping', async (_, configId, sourcePath, destPath) => {
        return await (0, downloads_1.addPathMapping)(configId, sourcePath, destPath);
    });
    electron_1.ipcMain.handle('downloads:remove-path-mapping', async (_, id) => {
        return await (0, downloads_1.removePathMapping)(id);
    });
    createWindow();
});
electron_1.app.on('window-all-closed', () => {
    gameDetector?.stopAll();
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
