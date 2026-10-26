import * as http from 'http';
import { BrowserWindow, dialog, ipcMain } from 'electron';
import * as gameService from '../game/storage';
import type { LocalGame } from '../preload-api';
import type { GameScanOrchestrator, ScannedGame } from '../game/orchestrator';
import type { PluginManager } from '../plugin-runtime/manager';
import {
  batchCheckMatchCache,
  saveMatchCache,
  type MatchCacheEntry,
} from '../downloads';
import { GameDetector } from '../game/detector';

let _orchestrator: GameScanOrchestrator | null = null;
let _pluginManager: PluginManager | null = null;

export function setScanOrchestrator(o: GameScanOrchestrator): void {
  _orchestrator = o;
}

export function setPluginManager(pm: PluginManager): void {
  _pluginManager = pm;
}

export function registerScannerIPC(gameDetector: GameDetector | null, nodeDaemon?: import('../node-daemon').NodeDaemonManager | null): void {
  // Scan game in paths via Otix Node engine
  ipcMain.handle('scanner:scan-paths', async (event, paths: string[], isoPaths: string[]) => {
    event.sender.send('scanner:progress', { currentDir: 'Scanning library folders via Otix Node...', progress: 10 });

    try {
      const port = (nodeDaemon as any)?.currentPort || 8090;
      const nodeToken = (nodeDaemon as any)?.getNodeAuthToken ? (nodeDaemon as any).getNodeAuthToken() : '';
      const authHeaders: Record<string, string> = nodeToken ? { Authorization: `Bearer ${nodeToken}` } : {};

      // If paths are provided, synchronize them to node libraries first
      if ((paths && paths.length > 0) || (isoPaths && isoPaths.length > 0)) {
        const scanItems: { path: string; type: 'game' | 'iso' }[] = [
          ...(paths || []).map((p) => ({ path: p, type: 'game' as const })),
          ...(isoPaths || []).map((p) => ({ path: p, type: 'iso' as const })),
        ];
        if (nodeDaemon) {
          await nodeDaemon.syncLibraries(scanItems);
        }
      }

      event.sender.send('scanner:progress', { currentDir: 'Indexing library files...', progress: 30 });

      // Trigger node scan with progress polling
      let scanDone = false;
      const progressTimer = setInterval(async () => {
        if (scanDone) return;
        try {
          const status: any = await new Promise((resolve) => {
            const sreq = http.get(
              `http://127.0.0.1:${port}/api/v1/scan/status`,
              { headers: authHeaders, timeout: 2000 },
              (res) => {
                let buf = '';
                res.on('data', (c) => { buf += c; });
                res.on('end', () => {
                  try { resolve(JSON.parse(buf)); } catch { resolve(null); }
                });
              }
            );
            sreq.on('error', () => resolve(null));
            sreq.on('timeout', () => { sreq.destroy(); resolve(null); });
          });
          if (status && status.phase === 'scanning') {
            const scanned = status.files_scanned || 0;
            const dirParts = (status.current_directory || '').split(/[\\/]/).filter(Boolean);
            const displayDir = dirParts.length > 0 ? dirParts[dirParts.length - 1] : 'libraries';
            event.sender.send('scanner:progress', {
              currentDir: `Scanning ${displayDir} (${scanned} files)...`,
              progress: Math.min(85, 30 + Math.floor(scanned / 50)),
            });
          }
        } catch {
          // ignore
        }
      }, 500);

      try {
        await new Promise<void>((resolve) => {
          const req = http.request(
            `http://127.0.0.1:${port}/api/v1/scan?wait=1`,
            { method: 'POST', headers: authHeaders, timeout: 120000 },
            () => resolve()
          );
          req.on('error', (e) => {
            console.warn('[scanner:scan-paths] Node scan request error:', e.message);
            resolve();
          });
          req.on('timeout', () => {
            req.destroy();
            resolve();
          });
          req.end();
        });
      } finally {
        scanDone = true;
        clearInterval(progressTimer);
      }

      event.sender.send('scanner:progress', { currentDir: 'Fetching indexed games...', progress: 88 });

      // Fetch hosted files from node
      const nodeFiles: any[] = await new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${port}/api/v1/files`, { headers: authHeaders, timeout: 30000 }, (res) => {
          let buf = '';
          res.on('data', (c) => { buf += c; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(buf);
              resolve(Array.isArray(parsed) ? parsed : []);
            } catch {
              resolve([]);
            }
          });
        });
        req.on('error', (e) => {
          console.warn('[scanner:scan-paths] Node files fetch error:', e.message);
          resolve([]);
        });
        req.on('timeout', () => {
          req.destroy();
          resolve([]);
        });
      });

      const games: LocalGame[] = (nodeFiles || []).map((f: any) => ({
        id: f.id || `node_${f.filename}`,
        title: f.game_title || f.filename,
        exePath: f.filepath,
        installDir: f.filepath ? f.filepath.substring(0, Math.max(f.filepath.lastIndexOf('/'), f.filepath.lastIndexOf('\\'))) : '',
        platform: f.format_category === 'iso' ? 'iso' : (f.format_category === 'rom' ? 'rom' : 'pc'),
        isDlc: f.format_category === 'dlc' || f.format_category === 'update',
        otixMediaId: f.otix_media_id,
        otixMediaTitle: f.otix_title,
        otixConfidence: f.otix_confidence,
      }));

      gameDetector?.setLibrary(games);
      gameDetector?.startPeriodicScan();
      if (games.length > 0) {
        gameService.upsertGames(games as any[]);
        gameService.notifyGamesChanged();
      }

      event.sender.send('scanner:progress', { currentDir: 'Scan complete', progress: 100 });
      return games;
    } catch (err: any) {
      console.warn('[scanner:scan-paths] Node scan failed:', err);
      event.sender.send('scanner:progress', { currentDir: 'Scan error', progress: 100 });
      return [];
    }
  });

  // Native folder picker dialogs
  ipcMain.handle('dialog:open-directory', async (event, defaultPath?: string) => {
    const win = (event?.sender ? BrowserWindow.fromWebContents(event.sender) : null) || BrowserWindow.getFocusedWindow();
    const opts = {
      title: 'Select Folder',
      defaultPath,
      properties: ['openDirectory' as const, 'createDirectory' as const],
    };
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('scanner:pick-folder', async (event, defaultPath?: string) => {
    const win = (event?.sender ? BrowserWindow.fromWebContents(event.sender) : null) || BrowserWindow.getFocusedWindow();
    const opts = {
      title: 'Select Folder',
      defaultPath,
      properties: ['openDirectory' as const, 'createDirectory' as const],
    };
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return result.canceled ? null : result.filePaths[0];
  });

  // Scan installed launcher libraries (now handled by matching:scan plugins)
  ipcMain.handle('scanner:scan-launchers', async () => {
    if (_orchestrator) {
      return await _orchestrator.scanAll();
    }
    return [];
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
    if (nodeDaemon) {
      void nodeDaemon.syncLibraries(paths);
    }
  });
  ipcMain.handle('scanner:update-game-path', (_event, id: string, exePath: string, installDir?: string) => {
    gameService.updateGamePath(id, exePath, installDir);
    gameService.notifyGamesChanged();
  });
  ipcMain.handle('scanner:accept-suggestion', (_event, gameId: string, suggestion: any) => {
    gameService.acceptSuggestion(gameId, suggestion ?? undefined);
    console.log('[scanner] acceptSuggestion:', gameId, '->', suggestion?.id || 'no-suggestion');
    // If SSE provided hydrated catalog data, store it
    if (suggestion?.hydrated) {
      gameService.hydrateGame(
        gameId,
        suggestion.title || suggestion.hydrated.title || '',
        suggestion.hydrated.icon_url || suggestion.hydrated.iconUrl || null,
        suggestion.hydrated.poster_url || suggestion.hydrated.posterUrl || suggestion.posterUrl || null,
        suggestion.hydrated,
        suggestion.confidence ?? null,
        suggestion.id || suggestion.hydrated.id || null,
      );
    }
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

  // ── Full hydration from Otix API ──────────────────────────
  ipcMain.handle('games:hydrate-matched', async () => {
    const matched = gameService.getMatchedGames()
    if (!matched.length) return { updated: 0, failed: 0, total: 0 }

    const { getApiBaseUrl } = require('../config')
    const store = require('electron-store')
    const appStore = new store({ name: 'otix-desktop' })
    const token = appStore.get('auth.access_token') as string | undefined
    const baseUrl = getApiBaseUrl()

    let updated = 0, failed = 0
    const concurrency = 6

    // Fetch full catalog data for every matched game, store in local DB
    for (let i = 0; i < matched.length; i += concurrency) {
      const batch = matched.slice(i, i + concurrency)
      const results = await Promise.allSettled(
        batch.map(async (game) => {
          const url = `${baseUrl}/api/v1/media/game/${game.otix_media_id}`
          const res = await fetch(url, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        }),
      )
      for (let j = 0; j < batch.length; j++) {
        const result = results[j]
        if (result.status === 'fulfilled') {
          const data = result.value
          gameService.hydrateGame(
            batch[j].id,
            data.title || batch[j].title,
            data.iconUrl || null,
            data.posterUrl || null,
            data,
            data.confidence ?? null,
            batch[j].otix_media_id,
          )
          updated++
        } else {
          failed++
        }
      }
    }
    return { updated, failed, total: matched.length }
  });

  // Reset scanned games for specific platforms only
  ipcMain.handle('scanner:reset-platform-games', (_event, platforms: string[]) => {
    gameService.deleteGamesByPlatforms(platforms);
    gameService.notifyGamesChanged();
  });

  // Delete games whose installDir starts with the given prefix
  ipcMain.handle('scanner:delete-games-by-dir', (_event, dirPrefix: string) => {
    gameService.deleteGamesByDirectory(dirPrefix);
    gameService.notifyGamesChanged();
  });

  // Reset all scanned game data and match records
  ipcMain.handle('scanner:reset-game-data', () => {
    gameService.resetGameData();
  });

  // Pick an executable via native file dialog
  ipcMain.handle('scanner:pick-executable', async (event, defaultPath?: string) => {
    const win = (event?.sender ? BrowserWindow.fromWebContents(event.sender) : null) || BrowserWindow.getFocusedWindow();
    const opts = {
      title: 'Select Game Executable',
      defaultPath,
      filters: [{ name: 'Executables', extensions: ['exe'] }],
      properties: ['openFile' as const],
    };
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return result.canceled ? null : result.filePaths[0];
  });
}

// ── Plugin scan IPC handlers ──

export function registerPluginScanIPC(): void {
  if (!_orchestrator) {
    console.warn('[registerPluginScanIPC] Orchestrator not set — skipping');
    return;
  }

  ipcMain.handle('scanner:scan-all-plugins', async () => {
    try {
      return await _orchestrator!.scanAll();
    } catch (err: any) {
      console.error('[scanner:scan-all-plugins]', err.message);
      throw err;
    }
  });

  ipcMain.handle('scanner:scan-plugin', async (_event, pluginId: string) => {
    try {
      return await _orchestrator!.scanPlugin({ pluginId, mediaType: 'game' });
    } catch (err: any) {
      console.error('[scanner:scan-plugin]', err.message);
      throw err;
    }
  });

  ipcMain.handle('scanner:cancel-scan', async (_event, pluginId?: string) => {
    _orchestrator!.cancelScan(pluginId);
  });
}
