import { dialog, ipcMain } from 'electron';
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
  // Scan game in paths
  ipcMain.handle('scanner:scan-paths', async (event, paths: string[], isoPaths: string[]) => {
    // ── Save paths to local-files plugin config ──
    try {
      if (_pluginManager) {
        _pluginManager.setConfig('local-files', 'scanDirectories', paths);
        _pluginManager.setConfig('local-files', 'isoDirectories', isoPaths);
      }
    } catch (err) {
      console.warn('[scanner:scan-paths] Could not save to plugin config:', err);
    }

    // ── Scan via plugin if available ──
    let games: any[] = [];
    try {
      if (_pluginManager) {
        const result = await _pluginManager.callPluginData('local-files', 'scan');
        games = (result as { games?: any[] })?.games || (result as any[]) || [];
      }
    } catch (err: any) {
      console.warn('[scanner:scan-paths] Plugin scan failed:', err.message);
    }

    // Feed scanned game into detector for external process matching
    gameDetector?.setLibrary(games as LocalGame[]);
    gameDetector?.startPeriodicScan();
    // Persist to local DB (source of truth)
    if (games.length > 0) {
      gameService.upsertGames(games);
      gameService.notifyGamesChanged();
    }

    // Match directory games through the same pipeline as plugin games
    if (_orchestrator && games.length > 0) {
      const scanned: ScannedGame[] = games.map((g: any) => ({
        id: typeof g.id === 'string' ? g.id.replace('pc_', '') : g.id,
        title: g.title,
        platform: 'pc',
        externalIds: [{ source: 'pc', id: typeof g.id === 'string' ? g.id.replace('pc_', '') : g.id }],
        exePath: g.exePath,
        installPath: g.installDir,
        posterUrl: g.posterUrl,
      }));
      // Games saved to DB above — matching handled by scanPlugin when user clicks Scan
      // from the Library page. No fire-and-forget match here anymore.
    }

    return games;
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
