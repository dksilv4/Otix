import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import { spawn } from 'child_process';
import { scanPaths, findUpdateFilesForIso, DetectedGame } from './scanner';
import { scanAllLaunchers } from './launchers';
import { mountIso, dismountIso, applyCrack, previewOrganization, executeOrganization, launchSetup } from './installer';
import { GameDetector } from './game-detector';
import {
  getConfig, saveConfig, getDownload, getUserDownloads, deleteDownload,
  searchNzbPlanet, testNzbPlanetConnection, testSabnzbdConnection,
  searchAndDownload, pollAndUpdateDownloads, postProcessDownload,
  filterQualityResults, autoPickBest,
  getWishlistTracking, skipWishlistItem,
  getPathMappings, addPathMapping, removePathMapping,
  getScannedGamesFromDb, saveScannedGamesToDb,
  getScanPathsFromDb, saveScanPathsToDb,
  getLocalGamesMapFromDb, saveLocalGamesMapEntryToDb,
} from './downloads';

let mainWindow: BrowserWindow | null = null;
let gameDetector: GameDetector | null = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
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
  } else {
    mainWindow.loadURL(`file://${path.join(__dirname, '../dist/index.html')}`);
  }

  mainWindow.on('closed', () => {
    gameDetector?.stopAll();
    mainWindow = null;
  });
}

app.on('ready', () => {
  gameDetector = new GameDetector(app.getPath('userData'));

  // Forward game detection events to renderer
  gameDetector.on('game:started', (runningGame) => {
    mainWindow?.webContents.send('game:started', runningGame);
  });
  gameDetector.on('game:ended', (session) => {
    mainWindow?.webContents.send('game:ended', session);
  });

  // IPC communication test handler
  ipcMain.handle('ping', () => 'pong');

  // Directory selection dialog
  ipcMain.handle('dialog:select-directory', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Game Directory or Steam Library Folder',
      properties: ['openDirectory'],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // Scan games in paths
  ipcMain.handle('scanner:scan-paths', async (event, paths: string[], isoPaths: string[]) => {
    const games = await scanPaths(paths, isoPaths, (progressData) => {
      event.sender.send('scanner:progress', progressData);
    });
    // Feed scanned games into detector for external process matching
    gameDetector?.setLibrary(games);
    gameDetector?.startPeriodicScan();
    return games;
  });

  // Scan installed launcher libraries (Epic, GOG, Battle.net, Ubisoft, EA, Riot, Xbox, Itch)
  ipcMain.handle('scanner:scan-launchers', async () => {
    const results = await scanAllLaunchers();
    const allGames: DetectedGame[] = [];
    for (const result of results) {
      allGames.push(...result.games);
    }
    gameDetector?.setLibrary(allGames);
    gameDetector?.startPeriodicScan();
    return results;
  });

  // Launch game — now accepts full DetectedGame for tracking
  ipcMain.handle('launcher:launch-game', async (_, game: DetectedGame) => {
    try {
      if (game.exePath.startsWith('steam://')) {
        await shell.openExternal(game.exePath);
        gameDetector?.startTracking(game); // no PID for Steam, scan will confirm
        return true;
      } else {
        const gameDir = path.dirname(game.exePath);
        const child = spawn(game.exePath, [], {
          cwd: gameDir,
          detached: true,
          stdio: 'ignore',
        });
        gameDetector?.startTracking(game, child.pid);
        child.unref();
        return true;
      }
    } catch (err) {
      console.error('Failed to launch game', game.exePath, err);
      throw err;
    }
  });

  // ── Game detection IPC ──

  ipcMain.handle('game:get-running', () => {
    return gameDetector?.getRunningGames() ?? [];
  });

  ipcMain.handle('game:get-running-single', () => {
    return gameDetector?.getRunningGame() ?? null;
  });

  ipcMain.handle('game:get-recent-sessions', () => {
    return gameDetector?.getRecentSessions() ?? [];
  });

  ipcMain.handle('game:set-library', (_, games: DetectedGame[]) => {
    gameDetector?.setLibrary(games);
    gameDetector?.startPeriodicScan();
    return true;
  });

  ipcMain.handle('game:stop-tracking', (_, gameId: string) => {
    gameDetector?.stopTracking(gameId);
    return true;
  });

  // ── Manual mapping IPC ──

  ipcMain.handle('game:get-running-processes', async () => {
    return gameDetector?.getRunningProcesses() ?? [];
  });

  ipcMain.handle('game:add-mapping', (_, processName: string, gameId: string, gameTitle: string) => {
    gameDetector?.addMapping(processName, gameId, gameTitle);
    return true;
  });

  ipcMain.handle('game:remove-mapping', (_, processName: string) => {
    gameDetector?.removeMapping(processName);
    return true;
  });

  ipcMain.handle('game:get-mappings', () => {
    return gameDetector?.getMappings() ?? [];
  });

  ipcMain.handle('game:get-library', () => {
    return gameDetector?.getLibrary() ?? [];
  });

  // Select ISO dialog
  ipcMain.handle('installer:select-iso', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Game ISO File',
      filters: [{ name: 'Disk Images', extensions: ['iso'] }],
      properties: ['openFile'],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // Mount ISO
  ipcMain.handle('installer:mount-iso', async (_, isoPath: string) => {
    return await mountIso(isoPath);
  });

  // Dismount ISO
  ipcMain.handle('installer:dismount-iso', async (_, isoPath: string) => {
    return await dismountIso(isoPath);
  });

  // Apply Crack
  ipcMain.handle('installer:apply-crack', async (_, crackPath: string, targetDir: string) => {
    return await applyCrack(crackPath, targetDir);
  });

  // Find updates for ISO
  ipcMain.handle('installer:get-updates', async (_, isoPath: string) => {
    return await findUpdateFilesForIso(isoPath);
  });

  // Preview ISO Folder Reorganization
  ipcMain.handle('installer:preview-organization', async (_, directory: string, regexPattern: string, isoTemplate: string, updateTemplate: string) => {
    return await previewOrganization(directory, regexPattern, isoTemplate, updateTemplate);
  });

  // Execute ISO Folder Reorganization
  ipcMain.handle('installer:execute-organization', async (_, items: { sourcePath: string; targetPath: string }[]) => {
    return await executeOrganization(items);
  });

  ipcMain.handle('installer:launch-setup', async (_, setupPath: string) => {
    try {
      return await launchSetup(setupPath);
    } catch (err) {
      console.error('Failed to launch installer:', setupPath, err);
      throw err;
    }
  });

  // ── Database storage for scans ──
  ipcMain.handle('scanner:get-scanned-games', () => {
    return getScannedGamesFromDb();
  });
  ipcMain.handle('scanner:save-scanned-games', (_, games: any[]) => {
    return saveScannedGamesToDb(games);
  });
  ipcMain.handle('scanner:get-scan-paths', () => {
    return getScanPathsFromDb();
  });
  ipcMain.handle('scanner:save-scan-paths', (_, paths: any[]) => {
    return saveScanPathsToDb(paths);
  });
  ipcMain.handle('scanner:get-local-games-map', () => {
    return getLocalGamesMapFromDb();
  });
  ipcMain.handle('scanner:save-local-games-map-entry', (_, mediaId: string, game: any | null) => {
    return saveLocalGamesMapEntryToDb(mediaId, game);
  });

  // ── Downloads IPC ──

  ipcMain.handle('downloads:get-config', (_, userId: string) => {
    return getConfig(userId);
  });

  ipcMain.handle('downloads:save-config', (_, config: any) => {
    return saveConfig(config);
  });

  ipcMain.handle('downloads:search', async (_, query: string, apiKey: string) => {
    return await searchNzbPlanet(query, apiKey);
  });

  ipcMain.handle('downloads:scan-wishlist', async (_, userId: string, wishlistGames: { id: string; title: string }[]) => {
    const config = getConfig(userId);
    if (!config) return { error: 'No download config' };

    const results: { mediaItemId: string; success: boolean; downloadId?: string; error?: string }[] = [];
    for (const game of wishlistGames) {
      const result = await searchAndDownload(userId, game.id, game.title);
      if ('download' in result) {
        results.push({ mediaItemId: game.id, success: true, downloadId: result.download.id });
      } else {
        results.push({ mediaItemId: game.id, success: false, error: result.error });
      }
    }
    return results;
  });

  ipcMain.handle('downloads:search-and-download', async (_, userId: string, mediaItemId: string | null, gameName: string) => {
    return await searchAndDownload(userId, mediaItemId, gameName);
  });

  ipcMain.handle('downloads:filter-results', (_, results: any[]) => {
    return filterQualityResults(results);
  });

  ipcMain.handle('downloads:auto-pick', (_, results: any[]) => {
    return autoPickBest(results);
  });

  ipcMain.handle('downloads:get-download', (_, id: string) => {
    return getDownload(id);
  });

  ipcMain.handle('downloads:get-user-downloads', (_, userId: string) => {
    return getUserDownloads(userId);
  });

  ipcMain.handle('downloads:delete', (_, id: string) => {
    return deleteDownload(id);
  });

  ipcMain.handle('downloads:poll-queue', async (_, userId: string) => {
    return await pollAndUpdateDownloads(userId);
  });

  ipcMain.handle('downloads:test-sabnzbd', async (_, host: string, port: number, apiKey: string, useSsl: boolean) => {
    return await testSabnzbdConnection(host, port, apiKey, useSsl);
  });

  ipcMain.handle('downloads:test-nzbplanet', async (_, apiKey: string) => {
    console.log('[IPC] downloads:test-nzbplanet called, key length:', apiKey?.length ?? 0);
    const result = await testNzbPlanetConnection(apiKey);
    console.log('[IPC] downloads:test-nzbplanet result:', result);
    return result;
  });

  ipcMain.handle('downloads:get-wishlist-tracking', (_, userId: string) => {
    return getWishlistTracking(userId);
  });

  ipcMain.handle('downloads:skip-wishlist-item', (_, userId: string, mediaItemId: string) => {
    return skipWishlistItem(userId, mediaItemId);
  });

  ipcMain.handle('downloads:post-process', (_, downloadId: string, configId: string, fallbackSource?: string, fallbackDest?: string) => {
    return postProcessDownload(downloadId, configId, fallbackSource, fallbackDest);
  });

  ipcMain.handle('downloads:get-path-mappings', async (_, configId: string) => {
    return await getPathMappings(configId);
  });

  ipcMain.handle('downloads:add-path-mapping', async (_, configId: string, sourcePath: string, destPath: string) => {
    return await addPathMapping(configId, sourcePath, destPath);
  });

  ipcMain.handle('downloads:remove-path-mapping', async (_, id: string) => {
    return await removePathMapping(id);
  });

  createWindow();
});

app.on('window-all-closed', () => {
  gameDetector?.stopAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
