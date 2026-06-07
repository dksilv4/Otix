import { ipcMain } from 'electron';
import { scanPaths } from '../scanner';
import { scanAllLaunchers } from '../launchers';
import {
  getScannedGamesFromDb,
  saveScannedGamesToDb,
  updateGamePathInDb,
  getScanPathsFromDb,
  saveScanPathsToDb,
  getLocalGamesMapFromDb,
  saveLocalGamesMapEntryToDb,
  batchCheckMatchCache,
  saveMatchCache,
  getUnseededGames,
  markGamesAsSeeded,
} from '../downloads';
import { GameDetector } from '../game-detector';
import http from 'http';

const BACKEND_BASE = process.env.OTIX_BACKEND_URL || 'http://127.0.0.1:8000';

/**
 * Fire-and-forget: send UNSEEDED game titles to backend for IGDB seeding.
 *
 * The local SQLite DB is the source of truth — only titles where
 * `seeded = 0` are sent. On a successful response the titles are
 * marked as seeded so they are never re-sent.
 *
 * This is the ONLY place that calls POST /api/media/seed-from-titles.
 * Frontend components MUST NOT call it independently (avoids HTTP/1.1
 * connection pool exhaustion in the renderer).
 */
function seedTitlesOnBackend(): void {
  const games = getUnseededGames();
  if (!games.length) {
    console.log('[seedTitlesOnBackend] no unseeded games — skipping');
    return;
  }
  const steamCount = games.filter(g => g.steam_app_id !== null).length;
  console.log(
    '[seedTitlesOnBackend] sending', games.length, 'unseeded games',
    `(${steamCount} with Steam App ID)`,
  );
  try {
    const url = new URL('/api/media/seed-from-titles', BACKEND_BASE);
    const body = JSON.stringify({ games });
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10_000,
    });
    req.on('response', (res) => {
      let data = '';
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => {
        console.log('[seedTitlesOnBackend] response', res.statusCode, data);
        if (res.statusCode === 200) {
          markGamesAsSeeded(games);
          console.log('[seedTitlesOnBackend] marked', games.length, 'games as seeded');
        }
      });
    });
    req.on('error', (err) => {
      console.error('[seedTitlesOnBackend] error:', err.message);
      // Don't mark as seeded on error — will retry next scan
    });
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
    // Persist to local DB (source of truth), then seed unseeded titles
    saveScannedGamesToDb(games);
    seedTitlesOnBackend();
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
    // Persist to local DB and seed any newly discovered titles
    if (allGames.length > 0) {
      saveScannedGamesToDb(allGames);
      seedTitlesOnBackend();
    }
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

  // Update game path after file move (move-to-library)
  ipcMain.handle('scanner:update-game-path', (_, oldExePath: string, newExePath: string, newInstallDir?: string) => {
    updateGamePathInDb(oldExePath, newExePath, newInstallDir);
  });
}
