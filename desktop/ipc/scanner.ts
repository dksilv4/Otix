import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { BrowserWindow, dialog, ipcMain, Notification } from 'electron';
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
import { cleanGameTitle } from '../game/parser';
import { resolveUncPath, unresolveUncPath } from '../unc-resolver';
import { scanLocalFiles, isUpdateFile, isDlcFile } from '../game/local-scanner';
import { downloadAndHydrateGameOffline } from '../game/offline-cache';
import {
  resolveAndSyncScanPaths,
  runNodeScan,
  fetchNodeIndexedFiles,
  runLocalScannerFallback,
  finalizeScanResults,
} from './scanner-pipeline';

let _orchestrator: GameScanOrchestrator | null = null;
let _pluginManager: PluginManager | null = null;
let _gameDetector: GameDetector | null = null;
let _nodeDaemon: import('../node-daemon').NodeDaemonManager | null = null;
let _scannerMainWindow: BrowserWindow | null = null;

export function setScanOrchestrator(o: GameScanOrchestrator): void {
  _orchestrator = o;
}

export function setPluginManager(pm: PluginManager): void {
  _pluginManager = pm;
}

export function setScannerMainWindow(win: BrowserWindow | null): void {
  _scannerMainWindow = win;
}

export function handleNewGamesDetected(newGames: LocalGame[], mainWindow?: BrowserWindow | null): void {
  if (!newGames || newGames.length === 0) return;

  const count = newGames.length;
  const title = count === 1 ? 'New game detected' : 'New games detected';
  const body = count === 1
    ? `${newGames[0].title} was detected and added to your library.`
    : `${count} new games were detected and added to your library.`;

  console.log(`[scanner] ${title}: ${body}`);

  // 1. Native Desktop Notification (Electron Notification)
  try {
    if (typeof Notification !== 'undefined' && typeof Notification.isSupported === 'function' && Notification.isSupported()) {
      const p1 = process.resourcesPath ? path.join(process.resourcesPath, 'assets', 'icon.png') : '';
      const iconPath = p1 && fs.existsSync(p1) ? p1 : path.join(__dirname, '..', '..', 'assets', 'icon.png');
      const notification = new Notification({
        title,
        body,
        icon: fs.existsSync(iconPath) ? iconPath : undefined,
      });

      notification.on('click', () => {
        const win = mainWindow || _scannerMainWindow;
        if (win && !win.isDestroyed()) {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
          win.webContents.send('notifications:navigate', {
            type: 'game_detected',
            metadata: { gameId: newGames[0]?.id },
          });
        }
      });

      notification.show();
    }
  } catch (err) {
    console.warn('[scanner] Failed to show native notification:', err);
  }

  // 2. Dispatch IPC event to renderer window
  try {
    const win = mainWindow || _scannerMainWindow;
    if (win && !win.isDestroyed()) {
      win.webContents.send('scanner:new-games-detected', {
        games: newGames,
      });
    }
  } catch (err) {
    console.warn('[scanner] Failed to dispatch new games event to window:', err);
  }
}

export interface ExecuteScanOptions {
  paths?: string[];
  isoPaths?: string[];
  clientAuthToken?: string;
  gameDetector?: GameDetector | null;
  nodeDaemon?: import('../node-daemon').NodeDaemonManager | null;
  onProgress?: (currentDir: string, progress: number) => void;
  isAutomatic?: boolean;
}

function transformFileToLocalGame(
  f: any,
  existingGamesById: Map<string, LocalGame>,
  existingExes: Set<string>,
  existingDirs: Set<string>,
  matchesByKey: Map<string, any>,
): { game: LocalGame | null; isNew: boolean } {
  const filename = f.filename || (f.filepath ? path.basename(f.filepath) : '');
  const filepath = f.filepath || '';
  const lowerFilepath = filepath.toLowerCase();
  const lowerFilename = filename.toLowerCase();

  if (
    f.format_category === 'update' ||
    (f as any).isUpdate ||
    isUpdateFile(filename, filepath) ||
    isDlcFile(filename, filepath) ||
    lowerFilepath.includes('menu-simulation') ||
    lowerFilepath.includes('/mods/') ||
    lowerFilepath.includes('\\mods\\') ||
    (f.format_category === 'archive' && lowerFilepath.includes('steamapps')) ||
    (f.format_category === 'archive' && (lowerFilepath.includes('factorio') || lowerFilepath.includes('_data'))) ||
    lowerFilename === 'vconsole2.exe' ||
    lowerFilename === 'csgo_legacy_app.exe' ||
    lowerFilename === 'cleaner-btd6.exe' ||
    lowerFilename === 'steam_api64.rne.exe' ||
    lowerFilename === 'sheep.exe'
  ) {
    return { game: null, isNew: false };
  }
  const fileId = f.id || `node_${f.filename}`;
  const rawPlat = (f.platform || (f.format_category === 'iso' ? 'iso' : (f.format_category === 'rom' ? 'rom' : (f.format_category === 'steam' ? 'steam' : 'pc')))).toLowerCase();
  let plat = rawPlat;
  if (lowerFilename.endsWith('.xci') || lowerFilename.endsWith('.nsp') || lowerFilename.endsWith('.nsp.hdf')) {
    plat = 'switch';
  } else if (lowerFilename === 'eboot.bin' || lowerFilepath.includes('ppsa') || lowerFilepath.includes('ps5')) {
    plat = 'ps5';
  } else if (lowerFilepath.includes('cusa') || lowerFilepath.includes('ps4')) {
    plat = 'ps4';
  }
  const knownPrefixes = ['pc_', 'steam_', 'iso_', 'rom_', 'ps1_', 'ps2_', 'ps3_', 'ps4_', 'ps5_', 'psp_', 'psvita_', 'xbox_', 'xbox360_', 'switch_', 'wii_', 'wiiu_'];
  const alreadyPrefixed = knownPrefixes.some((p) => fileId.startsWith(p));
  const fullId = alreadyPrefixed ? fileId : `${plat}_${fileId}`;
  const existing = existingGamesById.get(fullId) || existingGamesById.get(fileId);
  const match = matchesByKey.get(`${plat}:${fileId}`) || matchesByKey.get(`local:${fileId}`);

  const localIcon = (f as any).local_icon_url || (f as any).localIconUrl || existing?.localIconUrl;
  const poster = existing?.posterUrl || (existing as any)?.otixPosterUrl || f.otix_images?.poster?.url || f.catalog_item?.poster_url || match?.otixPosterUrl || (f as any).posterUrl || (f as any).poster_url;
  const backdrop = (existing as any)?.backdropUrl || (existing as any)?.otixBackdropUrl || f.otix_images?.backdrop?.url || f.catalog_item?.backdrop_url || match?.otixBackdropUrl || (f as any).backdropUrl || (f as any).backdrop_url;
  const logo = (existing as any)?.logoUrl || (existing as any)?.otixLogoUrl || f.otix_images?.logo?.url || f.catalog_item?.logo_url;
  const icon = existing?.iconUrl || (existing as any)?.otixIconUrl || f.otix_images?.icon?.url || f.catalog_item?.icon_url || match?.otixIconUrl || (f as any).iconUrl || (f as any).icon_url || localIcon;
  const mediaId = existing?.otixMediaId || match?.otixMediaId || f.otix_media_id || f.catalog_item?.id;
  const mediaTitle = existing?.otixMediaTitle || match?.otixTitle || f.otix_title || f.catalog_item?.title;
  const confidence = existing?.otixConfidence ?? match?.otixConfidence ?? f.otix_confidence ?? (mediaId ? 1.0 : undefined);
  const overview = f.otix_overview || f.catalog_item?.overview || (existing?.data as any)?.overview;
  const slug = f.otix_slug || f.catalog_item?.slug || (existing?.data as any)?.slug;

  const gameData = existing?.data || (mediaId ? {
    id: String(mediaId),
    mediaId: String(mediaId),
    title: mediaTitle || f.game_title || f.filename,
    slug: slug || '',
    overview: overview || '',
    posterUrl: poster,
    backdropUrl: backdrop,
    logoUrl: logo,
    iconUrl: icon,
    sizeBytes: Number(f.filesize || f.size_bytes || (existing?.data as any)?.sizeBytes || (existing as any)?.sizeBytes || 0),
    modifiedAt: f.modified_at || f.modifiedAt || (existing as any)?.modifiedAt || undefined,
  } : undefined);

  let calculatedSize = Number(
    f.filesize ||
    f.size_bytes ||
    f.sizeBytes ||
    f.fileSize ||
    f.file_size ||
    f.size ||
    (existing as any)?.sizeBytes ||
    (existing?.data as any)?.sizeBytes ||
    0
  );

  let fileModifiedAt =
    f.modified_at ||
    f.modifiedAt ||
    f.updated_at ||
    f.updatedAt ||
    f.created_at ||
    f.createdAt ||
    (existing as any)?.modifiedAt ||
    (existing?.data as any)?.modifiedAt ||
    undefined;

  const resolvedExe =
    (f as any).local_exe_path ||
    (f as any).localExePath ||
    existing?.localExePath ||
    f.filepath ||
    existing?.exePath ||
    '';

  const resolvedDir =
    f.root_dir ||
    f.installDir ||
    f.install_dir ||
    existing?.installDir ||
    (resolvedExe && !resolvedExe.startsWith('steam://') ? path.dirname(resolvedExe) : '');

  const fileTarget = resolvedExe && !resolvedExe.startsWith('steam://') ? resolvedExe : null;
  const dirTarget = resolvedDir || null;

  const resolvedLocalExe =
    (f as any).local_exe_path ||
    (f as any).localExePath ||
    existing?.localExePath ||
    fileTarget ||
    undefined;

  const calculatedVersion =
    (f as any).version ||
    (f as any).game_version ||
    (f as any).gameVersion ||
    existing?.version ||
    (existing?.data as any)?.version ||
    (existing?.data as any)?.gameVersion ||
    undefined;

  const finalExePath =
    (f.filepath && path.extname(f.filepath) ? f.filepath : null) ||
    (existing?.localExePath && path.extname(existing.localExePath) ? existing.localExePath : null) ||
    (existing?.exePath && path.extname(existing.exePath) ? existing.exePath : null) ||
    fileTarget ||
    f.filepath ||
    existing?.exePath ||
    '';

  const titleId = (f as any).titleId || (f as any).title_id || (f as any).ps_id || existing?.titleId;

  let resolvedTitle = existing?.title || f.game_title || f.filename;
  if ((resolvedTitle.toLowerCase() === 'app 0' || resolvedTitle.toLowerCase() === 'app0') && filepath) {
    const parentDir = path.basename(path.dirname(filepath));
    if (parentDir.toLowerCase().includes('app0') || /^[a-z]{4}\d{5}/i.test(parentDir)) {
      resolvedTitle = path.basename(path.dirname(path.dirname(filepath)));
    } else {
      resolvedTitle = parentDir;
    }
  }
  resolvedTitle = cleanGameTitle(resolvedTitle);

  const game: LocalGame = {
    id: fullId,
    title: resolvedTitle,
    titleId: titleId || undefined,
    exePath: finalExePath,
    localExePath: resolvedLocalExe || (fileTarget || undefined),
    installDir: resolvedDir,
    localIconUrl: localIcon,
    platform: plat,
    version: calculatedVersion,
    updateFiles: f.update_files || existing?.updateFiles,
    isDlc: f.format_category === 'dlc' || f.format_category === 'update' || f.isDlc,
    otixMediaId: mediaId ? String(mediaId) : undefined,
    otixMediaTitle: mediaTitle,
    otixConfidence: confidence,
    posterUrl: poster,
    backdropUrl: backdrop,
    logoUrl: logo,
    iconUrl: icon,
    overview: overview,
    sizeBytes: calculatedSize,
    modifiedAt: fileModifiedAt,
    data: {
      ...(gameData || {}),
      titleId: titleId || undefined,
      sizeBytes: calculatedSize,
      modifiedAt: fileModifiedAt,
      version: calculatedVersion,
    } as any,
    otixMatchSuggestion: existing?.otixMatchSuggestion || (existing as any)?.matchSuggestion,
  } as LocalGame;

  const isKnownId = existingGamesById.has(game.id);
  const isKnownDir = game.installDir ? existingDirs.has(path.resolve(game.installDir).toLowerCase()) : false;
  const isKnownExe = game.exePath ? existingExes.has(path.resolve(game.exePath).toLowerCase()) : false;
  const isNew = !isKnownId && !isKnownDir && !isKnownExe;

  return { game, isNew };
}

export async function executeScan(
  options: ExecuteScanOptions = {}
): Promise<{ games: LocalGame[]; newGames: LocalGame[] }> {
  const { paths, isoPaths, clientAuthToken } = options;
  const gameDetector = options.gameDetector !== undefined ? options.gameDetector : _gameDetector;
  const nodeDaemon = options.nodeDaemon !== undefined ? options.nodeDaemon : _nodeDaemon;
  const onProgress = options.onProgress || (() => {});

  const sendSafeProgress = (currentDir: string, progress: number) => {
    try {
      onProgress(currentDir, progress);
    } catch {
      // ignore
    }
  };

  sendSafeProgress('Scanning library folders via Otix Node...', 10);

  try {
    const port = (nodeDaemon as any)?.currentPort || 8090;
    const nodeToken = (nodeDaemon as any)?.getNodeAuthToken ? (nodeDaemon as any).getNodeAuthToken() : '';
    const authHeaders: Record<string, string> = nodeToken ? { Authorization: `Bearer ${nodeToken}` } : {};

    if (clientAuthToken && _orchestrator) {
      _orchestrator.setAuthToken(clientAuthToken);
    }

    // Synchronize configured paths to node libraries
    const { allPathsMap, hasClientPaths } = await resolveAndSyncScanPaths(
      paths,
      isoPaths,
      port,
      authHeaders,
      nodeDaemon
    );

    sendSafeProgress('Indexing library files...', 30);

    // ── Real-Time File Discovery Setup ──
    const allExistingGames = gameService.getAllGames();
    const existingGamesById = new Map<string, (typeof allExistingGames)[0]>();
    for (const eg of allExistingGames) {
      existingGamesById.set(eg.id, eg);
    }
    const existingExes = new Set<string>();
    const existingDirs = new Set<string>();
    const mappedExes = new Map<string, { id: string; platform: string }>();
    for (const eg of allExistingGames) {
      if (eg.exePath) {
        const norm = path.resolve(eg.exePath).toLowerCase();
        existingExes.add(norm);
        if (!eg.exePath.startsWith('steam://')) mappedExes.set(norm, { id: eg.id, platform: eg.platform });
      }
      if (eg.localExePath) {
        const norm = path.resolve(eg.localExePath).toLowerCase();
        existingExes.add(norm);
        mappedExes.set(norm, { id: eg.id, platform: eg.platform });
      }
      if (eg.installDir) existingDirs.add(path.resolve(eg.installDir).toLowerCase());
    }

    const allMatches = gameService.getAllGameMatches();
    const matchesByKey = new Map<string, (typeof allMatches)[0]>();
    for (const m of allMatches) {
      matchesByKey.set(`${m.source}:${m.sourceGameId}`, m);
    }

    const games: LocalGame[] = [];
    const newGames: LocalGame[] = [];
    const processedFileIds = new Set<string>();
    const scope = hasClientPaths ? Array.from(allPathsMap.keys()) : undefined;

    const ingestFile = (f: any): LocalGame | null => {
      if (!f) return null;
      const rawId = f.id || `node_${f.filename || (f.filepath ? path.basename(f.filepath) : '')}`;
      if (processedFileIds.has(rawId)) return null;

      const res = transformFileToLocalGame(f, existingGamesById, existingExes, existingDirs, matchesByKey);
      if (!res || !res.game) return null;
      const { game, isNew } = res;
      if (processedFileIds.has(game.id)) return null;

      // Cross-source deduplication:
      const targetExe = (game.localExePath || (game.exePath && !game.exePath.startsWith('steam://') ? game.exePath : '')).trim();
      if (targetExe) {
        const normExe = path.resolve(targetExe).toLowerCase();
        const existingInfo = mappedExes.get(normExe);
        if (existingInfo && existingInfo.id !== game.id) {
          const isExistingPrimary = existingInfo.platform === 'steam' || existingInfo.platform === 'ps5' || existingInfo.platform === 'switch';
          const isIncomingPrimary = game.platform === 'steam' || game.platform === 'ps5' || game.platform === 'switch';

          if (isExistingPrimary && !isIncomingPrimary) {
            return null;
          }
          if (isIncomingPrimary && !isExistingPrimary) {
            const idx = games.findIndex((g) => g.id === existingInfo.id);
            if (idx >= 0) games.splice(idx, 1);
            existingGamesById.delete(existingInfo.id);
            try {
              gameService.deleteGamesByIds([existingInfo.id]);
            } catch {}
          }
        }
        mappedExes.set(normExe, { id: game.id, platform: game.platform });
      }

      processedFileIds.add(rawId);
      processedFileIds.add(game.id);

      games.push(game);
      if (isNew) {
        newGames.push(game);
      }
      existingGamesById.set(game.id, game as any);
      if (game.installDir) existingDirs.add(path.resolve(game.installDir).toLowerCase());
      if (game.exePath) existingExes.add(path.resolve(game.exePath).toLowerCase());
      if (game.localExePath) existingExes.add(path.resolve(game.localExePath).toLowerCase());
      return game;
    };

    const handleDiscoveredBatch = (batch: LocalGame[]) => {
      if (batch.length === 0) return;
      try {
        gameService.upsertGames(batch as any[], scope);
        if (_orchestrator) {
          if (typeof (_orchestrator as any).startBackgroundMatching === 'function') {
            (_orchestrator as any).startBackgroundMatching().catch(() => {});
          } else if (typeof (_orchestrator as any).startMatching === 'function') {
            (_orchestrator as any).startMatching().catch(() => {});
          }
        }
      } catch (err: any) {
        console.warn('[scanner:scan-paths] Real-time batch upsert error:', err);
      }
    };

    // Run node daemon scan with SSE streaming and progress polling
    await runNodeScan({
      port,
      authHeaders,
      nodeDaemon,
      ingestFile,
      handleDiscoveredBatch,
      sendSafeProgress,
    });

    sendSafeProgress('Fetching indexed games...', 88);

    // Fetch hosted files from node with streaming JSON parse
    let nodeFiles: any[] = [];
    if (nodeDaemon) {
      nodeFiles = await fetchNodeIndexedFiles(port, authHeaders, sendSafeProgress);
    }

    // Ingest any remaining files returned by node
    if (nodeFiles && nodeFiles.length > 0) {
      const finalBatch: LocalGame[] = [];
      for (const f of nodeFiles) {
        const g = ingestFile(f);
        if (g) finalBatch.push(g);
      }
      if (finalBatch.length > 0) {
        handleDiscoveredBatch(finalBatch);
      }
    }

    // Fallback & Steam library augmentation
    await runLocalScannerFallback(
      allPathsMap,
      games,
      nodeFiles,
      ingestFile,
      handleDiscoveredBatch,
      sendSafeProgress
    );

    // Finalize: update detector, commit games to SQLite, trigger background matching
    finalizeScanResults({
      games,
      hasClientPaths,
      allPathsMap,
      gameDetector,
      orchestrator: _orchestrator,
      sendSafeProgress,
    });

    // Return discovered games and newly identified games
    return { games, newGames };
  } catch (err: any) {
    console.warn('[scanner:executeScan] Scan failed:', err);
    sendSafeProgress('Scan error', 100);
    return { games: [], newGames: [] };
  }
}

export function registerScannerIPC(
  gameDetector: GameDetector | null,
  nodeDaemon?: import('../node-daemon').NodeDaemonManager | null,
  onPathsChanged?: () => void,
): void {
  _gameDetector = gameDetector;
  _nodeDaemon = nodeDaemon ?? null;

  // Scan game in paths via Otix Node engine
  ipcMain.handle('scanner:scan-paths', async (event, paths: string[], isoPaths: string[], clientAuthToken?: string) => {
    const sendSafeProgress = (currentDir: string, progress: number) => {
      try {
        if (!event.sender.isDestroyed()) {
          event.sender.send('scanner:progress', { currentDir, progress });
        }
      } catch {
        // sender destroyed or IPC channel closed
      }
    };

    try {
      const { games, newGames } = await executeScan({
        paths,
        isoPaths,
        clientAuthToken,
        gameDetector,
        nodeDaemon,
        onProgress: sendSafeProgress,
        isAutomatic: false,
      });

      if (newGames.length > 0) {
        const win = BrowserWindow.fromWebContents(event.sender) || _scannerMainWindow;
        handleNewGamesDetected(newGames, win);
      }

      return games;
    } catch (err: any) {
      console.warn('[scanner:scan-paths] Node scan failed:', err);
      sendSafeProgress('Scan error', 100);
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
  ipcMain.handle('scanner:get-scan-paths', async () => {
    let paths = gameService.getScanPaths();
    if (paths.length === 0 && nodeDaemon) {
      try {
        const port = (nodeDaemon as any)?.currentPort || 8090;
        const nodeToken = (nodeDaemon as any)?.getNodeAuthToken ? (nodeDaemon as any).getNodeAuthToken() : '';
        const authHeaders: Record<string, string> = nodeToken ? { Authorization: `Bearer ${nodeToken}` } : {};
        const nodeLibs: any = await new Promise((resolve) => {
          const req = http.get(
            `http://127.0.0.1:${port}/api/v1/libraries`,
            { headers: authHeaders, timeout: 2000 },
            (res) => {
              let buf = '';
              res.on('data', (c) => { buf += c; });
              res.on('end', () => {
                try { resolve(JSON.parse(buf)); } catch { resolve([]); }
              });
            }
          );
          req.on('error', () => resolve([]));
          req.on('timeout', () => { req.destroy(); resolve([]); });
        });
        if (Array.isArray(nodeLibs) && nodeLibs.length > 0) {
          const recovered = nodeLibs.map((nl: any) => ({
            path: nl.path,
            type: (nl.kind === 'iso' ? 'iso' : 'game') as 'game' | 'iso',
          }));
          gameService.saveScanPaths(recovered);
          paths = recovered;
        }
      } catch {
        // Ignore fallback error
      }
    }
    return paths;
  });
  ipcMain.handle('scanner:save-scan-paths', (_event, paths: { path: string; type: 'game' | 'iso' }[]) => {
    gameService.saveScanPaths(paths);
    if (nodeDaemon) {
      void nodeDaemon.syncLibraries(paths);
    }
    if (onPathsChanged) {
      try {
        onPathsChanged();
      } catch {
        // ignore
      }
    }
  });
  ipcMain.handle('scanner:update-game-path', (_event, id: string, exePath: string, installDir?: string) => {
    gameService.updateGamePath(id, exePath, installDir);
    gameService.notifyGamesChanged();
  });
  ipcMain.handle('scanner:accept-suggestion', async (_event, gameId: string, suggestion: any) => {
    gameService.acceptSuggestion(gameId, suggestion ?? undefined);
    console.log('[scanner] acceptSuggestion:', gameId, '->', suggestion?.id || 'no-suggestion');
    if (suggestion) {
      const hyd = suggestion.hydrated || suggestion;
      const mediaId = suggestion.id || suggestion.mediaId || hyd.id || null;
      gameService.hydrateGame(
        gameId,
        suggestion.title || hyd.title || '',
        suggestion.iconUrl || suggestion.icon_url || hyd.icon_url || hyd.iconUrl || null,
        suggestion.posterUrl || suggestion.poster_url || hyd.poster_url || hyd.posterUrl || null,
        hyd,
        suggestion.confidence ?? 1.0,
        mediaId,
        suggestion.backdropUrl || suggestion.backdrop_url || hyd.backdrop_url || hyd.backdropUrl || null,
      );

      // Download complete metadata and artwork in background to guarantee offline availability
      if (mediaId) {
        void downloadAndHydrateGameOffline(gameId, String(mediaId), suggestion.title || hyd.title).catch((err) => {
          console.warn('[scanner] Background offline download error:', err);
        });
      }
    }
    gameService.flushNotifyGamesChanged();
  });
  ipcMain.handle('scanner:unmatch-game', (_event, gameId: string) => {
    gameService.unmatchGame(gameId);
    gameService.notifyGamesChanged();
  });
  ipcMain.handle('scanner:reject-suggestion', (_event, gameId: string, suggestionMediaId: string) => {
    gameService.rejectSuggestion(gameId, suggestionMediaId);
    gameService.notifyGamesChanged();
  });

  // Catalog search & IGDB import proxy for renderer
  ipcMain.handle('catalog:search', async (_event, query: string) => {
    if (!_orchestrator || typeof (_orchestrator as any).searchCatalog !== 'function') return [];
    return (_orchestrator as any).searchCatalog(query);
  });

  ipcMain.handle('catalog:import-igdb', async (_event, igdbId: string) => {
    if (!_orchestrator || typeof (_orchestrator as any).importCatalogIgdb !== 'function') return null;
    return (_orchestrator as any).importCatalogIgdb(igdbId);
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

  // â”€â”€ Full hydration from Otix API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  ipcMain.handle('games:hydrate-matched', async () => {
    const matched = gameService.getMatchedGames()
    if (!matched.length) return { updated: 0, failed: 0, total: 0 }

    const { getApiBaseUrl } = require('../config')
    const store = require('electron-store')
    const appStore = new store({ name: 'otix-desktop' })
    const token = appStore.get('auth.access_token') as string | undefined
    const baseUrl = getApiBaseUrl()

    let updated = 0, failed = 0
    const concurrency = 4
    const PER_REQUEST_TIMEOUT = 10_000

    for (let i = 0; i < matched.length; i += concurrency) {
      const batch = matched.slice(i, i + concurrency)
      const results = await Promise.allSettled(
        batch.map(async (game) => {
          const cleanMediaId = game.otix_media_id ? String(game.otix_media_id).trim().replace(/\.0+$/, '') : ''
          if (!cleanMediaId || /^(pc_file_|iso[:_]file_|steam_|rom_|ps\d+_|xbox|switch_|file_)/i.test(cleanMediaId)) {
            throw new Error(`Invalid catalog id: ${game.otix_media_id}`)
          }
          const url = `${baseUrl}/api/v1/media/game/${cleanMediaId}`
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), PER_REQUEST_TIMEOUT)
          try {
            const res = await fetch(url, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              signal: controller.signal,
            })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.json()
          } finally {
            clearTimeout(timeoutId)
          }
        }),
      )
      for (let j = 0; j < batch.length; j++) {
        const result = results[j]
        if (result.status === 'fulfilled') {
          const data = result.value
          try {
            await downloadAndHydrateGameOffline(
              batch[j].id,
              batch[j].otix_media_id,
              data.title || batch[j].title,
              { authToken: token, apiBaseUrl: baseUrl },
            );
            updated++;
          } catch (writeErr) {
            console.warn(`[games:hydrate-matched] Write error for ${batch[j].id}:`, writeErr);
            failed++;
          }
        } else {
          failed++
        }
      }
      // Yield to event loop between batches to prevent blocking main thread
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
    gameService.notifyGamesChanged()
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

  // ── Phase 2: Autonomous Background Matching IPC Handlers ──────────────────

  /**
   * matching:start — triggers or resumes autonomous background catalog matching.
   * Runs asynchronously without blocking the IPC return.
   */
  ipcMain.handle('matching:start', async (_event, options?: { rematchAll?: boolean; gameIds?: string[]; forceRematch?: boolean }) => {
    if (!_orchestrator) {
      return { success: false, error: 'Orchestrator not initialized', isMatching: false };
    }

    try {
      if (typeof (_orchestrator as any).startMatching === 'function') {
        void (_orchestrator as any).startMatching(options).catch((err: any) => {
          console.error('[matching:start] Error in startMatching:', err);
        });
        return { success: true, isMatching: true };
      }

      if (typeof _orchestrator.matchGames === 'function') {
        const gamesToMatch = gameService.getAllGames(options?.rematchAll ? {} : { matched: false });
        const scanned: ScannedGame[] = gamesToMatch.map((g) => ({
          id: g.id,
          title: cleanGameTitle(g.title) || g.title,
          platform: g.platform,
          installPath: g.installDir,
          exePath: g.exePath,
          isDlc: g.isDlc,
        }));
        void _orchestrator.matchGames(scanned, 'local').catch((err: any) => {
          console.error('[matching:start] Error in matchGames fallback:', err);
        });
        return { success: true, isMatching: true, count: scanned.length };
      }

      return { success: false, error: 'Matching engine not available on orchestrator', isMatching: false };
    } catch (err: any) {
      console.error('[matching:start] Exception in handler:', err);
      return { success: false, error: err.message || String(err), isMatching: false };
    }
  });

  /**
   * matching:cancel — halts background matching.
   * Preserves 100% of games already persisted or matched in SQLite.
   */
  ipcMain.handle('matching:cancel', async () => {
    if (!_orchestrator) {
      return { success: false, error: 'Orchestrator not initialized' };
    }

    try {
      if (typeof (_orchestrator as any).cancelMatching === 'function') {
        (_orchestrator as any).cancelMatching();
      } else if (typeof _orchestrator.cancelScan === 'function') {
        _orchestrator.cancelScan();
      }
      return { success: true, cancelled: true };
    } catch (err: any) {
      console.error('[matching:cancel] Exception in handler:', err);
      return { success: false, error: err.message || String(err) };
    }
  });

  /**
   * matching:get-status — returns current matching engine state and counts.
   */
  ipcMain.handle('matching:get-status', async () => {
    try {
      if (_orchestrator && typeof (_orchestrator as any).getMatchingStatus === 'function') {
        return (_orchestrator as any).getMatchingStatus();
      }

      const totalInLibrary = gameService.getGameCount();
      const totalUnmatched = gameService.getGameCount({ matched: false });
      const totalMatched = totalInLibrary - totalUnmatched;
      const isMatching = _orchestrator
        ? (Boolean((_orchestrator as any).isMatching) || Boolean((_orchestrator as any).isScanning))
        : false;

      return {
        isMatching,
        totalInLibrary,
        totalUnmatched,
        totalMatched,
        processed: totalMatched,
      };
    } catch (err: any) {
      console.error('[matching:get-status] Error retrieving status:', err);
      return {
        isMatching: false,
        totalInLibrary: 0,
        totalUnmatched: 0,
        totalMatched: 0,
        processed: 0,
        error: err.message || String(err),
      };
    }
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
