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
import http from 'http';

const BACKEND_BASE = process.env.OTIX_BACKEND_URL || 'http://127.0.0.1:8000';

/** Fire-and-forget: send scanned game titles to backend for IGDB seeding. */
function seedTitlesOnBackend(titles: string[]): void {
  if (!titles.length) return;
  console.log('[seedTitlesOnBackend] sending', titles.length, 'titles');
  try {
    const url = new URL('/api/media/seed-from-titles', BACKEND_BASE);
    const body = JSON.stringify({ titles });
    console.log('[seedTitlesOnBackend] POST', url.href);
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10_000,
    });
    req.on('response', (res) => {
      let data = '';
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => console.log('[seedTitlesOnBackend] response', res.statusCode, data));
    });
    req.on('error', (err) => console.error('[seedTitlesOnBackend] error:', err.message));
    req.write(body);
    req.end();
  } catch (e) {
    console.error('[seedTitlesOnBackend] exception:', e);
  }
}

export function registerScannerIPC(gameDetector: GameDetector | null): void {
  // Scan games in paths
  ipcMain.handle('scanner:scan-paths', async (event, paths: string[], isoPaths: string[]) => {
    const games = await scanPaths(paths, isoPaths, (progressData) => {
      event.sender.send('scanner:progress', progressData);
    });
    // Feed scanned games into detector for external process matching
    gameDetector?.setLibrary(games);
    gameDetector?.startPeriodicScan();
    // Seed backend with scanned game titles (fire-and-forget)
    seedTitlesOnBackend([...new Set(games.map((g) => g.title))]);
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
