import { dialog, ipcMain } from 'electron';
import { scanPaths } from '../game/scanner';
import { scanAllLaunchers } from '../game/launchers';
import * as gameService from '../game/storage';
import type { LocalGame } from '../preload-api';
import {
  batchCheckMatchCache,
  saveMatchCache,
  getUnseededGames,
  markGamesAsSeeded,
  type MatchCacheEntry,
} from '../downloads';
import { GameDetector } from '../game/detector';
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
    console.log('[seedTitlesOnBackend] no unseeded game — skipping');
    return;
  }
  const steamCount = games.filter(g => g.steam_app_id !== null).length;
  console.log(
    '[seedTitlesOnBackend] sending', games.length, 'unseeded game',
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
          console.log('[seedTitlesOnBackend] marked', games.length, 'game as seeded');
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
  // Scan game in paths
  ipcMain.handle('scanner:scan-paths', async (event, paths: string[], isoPaths: string[]) => {
    const games = await scanPaths(paths, isoPaths, (progressData) => {
      event.sender.send('scanner:progress', progressData);
    });
    // Feed scanned game into detector for external process matching
    gameDetector?.setLibrary(games);
    gameDetector?.startPeriodicScan();
    // Persist to local DB (source of truth), then seed unseeded titles
    gameService.upsertGames(games);
    gameService.notifyGamesChanged();
    seedTitlesOnBackend();
    return games;
  });

  // Scan installed launcher libraries
  ipcMain.handle('scanner:scan-launchers', async () => {
    const results = await scanAllLaunchers();
    const allGames: gameService.GameRow[] = [];
    for (const result of results) {
      allGames.push(...result.games);
    }
    gameDetector?.setLibrary(allGames as LocalGame[]);
    gameDetector?.startPeriodicScan();
    // Persist to local DB and seed any newly discovered titles
    if (allGames.length > 0) {
      gameService.upsertGames(allGames);
      gameService.notifyGamesChanged();
      seedTitlesOnBackend();
    }
    return results;
  });

  // Database storage for scans (via game-storage-service)
  ipcMain.handle('scanner:get-scanned-game', () => {
    return gameService.getAllGames();
  });
  ipcMain.handle('scanner:save-scanned-game', (_, games: gameService.GameRow[]) => {
    gameService.upsertGames(games);
    gameService.notifyGamesChanged();
  });
  ipcMain.handle('scanner:get-scanned-games-filtered', (_event, filter: gameService.GameFilter) => {
    return gameService.getAllGames(filter);
  });
  ipcMain.handle('scanner:get-game-by-id', (_event, id: string) => {
    return gameService.getGameById(id);
  });
  ipcMain.handle('scanner:get-game-count', (_event, filter: gameService.GameFilter) => {
    return gameService.getGameCount(filter);
  });
  ipcMain.handle('scanner:get-scan-paths', () => {
    return gameService.getScanPaths();
  });
  ipcMain.handle('scanner:save-scan-paths', (_event, paths: { path: string; type: 'game' | 'iso' }[]) => {
    gameService.saveScanPaths(paths);
  });
  ipcMain.handle('scanner:update-game-path', (_event, id: string, exePath: string, installDir?: string) => {
    gameService.updateGamePath(id, exePath, installDir);
    gameService.notifyGamesChanged();
  });
  ipcMain.handle('scanner:accept-suggestion', (_event, gameId: string, suggestion: gameService.GameRow['matchSuggestion']) => {
    gameService.acceptSuggestion(gameId, suggestion ?? undefined);
    gameService.notifyGamesChanged();
  });
  ipcMain.handle('scanner:unmatch-game', (_event, gameId: string) => {
    gameService.unmatchGame(gameId);
    gameService.notifyGamesChanged();
  });
  ipcMain.handle('scanner:reject-suggestion', (_event, gameId: string, suggestionMediaId: string) => {
    gameService.rejectSuggestion(gameId, suggestionMediaId);
    gameService.notifyGamesChanged();
  });

  // Keep existing local map, match cache, and seed handlers on downloads.ts
  ipcMain.handle('scanner:get-local-game-map', () => {
    const { getLocalGamesMapFromDb } = require('../downloads');
    return getLocalGamesMapFromDb();
  });
  ipcMain.handle('scanner:save-local-game-map-entry', (_event, mediaId: string, game: unknown) => {
    const { saveLocalGamesMapEntryToDb } = require('../downloads');
    return saveLocalGamesMapEntryToDb(mediaId, game);
  });

  // ISO match cache
  ipcMain.handle('scanner:batch-check-match-cache', (_event, isoPaths: string[]) => {
    return batchCheckMatchCache(isoPaths);
  });

  ipcMain.handle('scanner:save-match-cache', (_event, entries: MatchCacheEntry[]) => {
    return saveMatchCache(entries);
  });

  // Pick an executable via native file dialog
  ipcMain.handle('scanner:pick-executable', async (_event, defaultPath?: string) => {
    const result = await dialog.showOpenDialog({
      title: 'Select Game Executable',
      defaultPath,
      filters: [{ name: 'Executables', extensions: ['exe'] }],
      properties: ['openFile'],
    });
    return result.canceled ? null : result.filePaths[0];
  });
}
