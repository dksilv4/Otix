import { ipcMain } from 'electron';
import { scanPaths } from '../scanner';
import { scanAllLaunchers } from '../launchers';
import {
  getScannedGamesFromDb,
  saveScannedGamesToDb,
  getScanPathsFromDb,
  saveScanPathsToDb,
  getLocalGamesMapFromDb,
  saveLocalGamesMapEntryToDb,
  batchCheckMatchCache,
  saveMatchCache,
} from '../downloads';
import { GameDetector } from '../game-detector';

export function registerScannerIPC(gameDetector: GameDetector | null): void {
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

  // Scan installed launcher libraries
  ipcMain.handle('scanner:scan-launchers', async () => {
    const results = await scanAllLaunchers();
    const allGames: any[] = [];
    for (const result of results) {
      allGames.push(...result.games);
    }
    gameDetector?.setLibrary(allGames);
    gameDetector?.startPeriodicScan();
    return results;
  });

  // Database storage for scans
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

  // ISO match cache
  ipcMain.handle('scanner:batch-check-match-cache', (_, isoPaths: string[]) => {
    return batchCheckMatchCache(isoPaths);
  });

  ipcMain.handle('scanner:save-match-cache', (_, entries: any[]) => {
    return saveMatchCache(entries);
  });
}
