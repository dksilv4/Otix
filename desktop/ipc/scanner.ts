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
      const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
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
  if (
    f.format_category === 'update' ||
    (f as any).isUpdate ||
    isUpdateFile(filename, filepath) ||
    isDlcFile(filename, filepath)
  ) {
    return { game: null, isNew: false };
  }
  const fileId = f.id || `node_${f.filename}`;
  const plat = f.platform || (f.format_category === 'iso' ? 'iso' : (f.format_category === 'rom' ? 'rom' : (f.format_category === 'steam' ? 'steam' : 'pc')));
  const knownPrefixes = ['pc_', 'steam_', 'iso_', 'rom_', 'ps1_', 'ps2_', 'ps3_', 'ps4_', 'ps5_', 'psp_', 'psvita_', 'xbox_', 'xbox360_', 'switch_', 'wii_', 'wiiu_'];
  const alreadyPrefixed = knownPrefixes.some((p) => fileId.startsWith(p));
  const fullId = alreadyPrefixed ? fileId : `${plat}_${fileId}`;
  const existing = existingGamesById.get(fullId) || existingGamesById.get(fileId);
  const match = matchesByKey.get(`${plat}:${fileId}`) || matchesByKey.get(`local:${fileId}`);

  const poster = existing?.posterUrl || (existing as any)?.otixPosterUrl || f.otix_images?.poster?.url || f.catalog_item?.poster_url || match?.otixPosterUrl;
  const backdrop = (existing as any)?.backdropUrl || (existing as any)?.otixBackdropUrl || f.otix_images?.backdrop?.url || f.catalog_item?.backdrop_url || match?.otixBackdropUrl;
  const logo = (existing as any)?.logoUrl || (existing as any)?.otixLogoUrl || f.otix_images?.logo?.url || f.catalog_item?.logo_url;
  const icon = existing?.iconUrl || (existing as any)?.otixIconUrl || f.otix_images?.icon?.url || f.catalog_item?.icon_url || match?.otixIconUrl;
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

  let fileTarget = resolvedExe && !resolvedExe.startsWith('steam://') && fs.existsSync(resolvedExe) ? resolvedExe : null;
  const dirTarget = resolvedDir && fs.existsSync(resolvedDir) ? resolvedDir : null;

  let resolvedLocalExe = (f as any).local_exe_path || (f as any).localExePath || existing?.localExePath;
  if ((!fileTarget || (fileTarget && fs.statSync(fileTarget).isDirectory())) && dirTarget) {
    const foundExe = gameService.findMainExecutableInFolder(dirTarget);
    if (foundExe) {
      fileTarget = foundExe;
      if (!resolvedLocalExe) resolvedLocalExe = foundExe;
    }
  }

  if (!fileModifiedAt) {
    const probe = fileTarget || dirTarget;
    if (probe) {
      try {
        const st = fs.statSync(probe);
        if (st.mtime) fileModifiedAt = st.mtime.toISOString();
      } catch {}
    }
  }

  if (!calculatedSize) {
    if (dirTarget) {
      const dirSize = gameService.calculateDirectorySize(dirTarget);
      if (dirSize > 0) calculatedSize = dirSize;
    }
    if (!calculatedSize && fileTarget) {
      try {
        const st = fs.statSync(fileTarget);
        if (st.size > 0) calculatedSize = st.size;
      } catch {}
    }
  }

  let calculatedVersion =
    (f as any).version ||
    (f as any).game_version ||
    (f as any).gameVersion ||
    existing?.version ||
    (existing?.data as any)?.version ||
    (existing?.data as any)?.gameVersion ||
    undefined;

  if (!calculatedVersion && fileTarget && fileTarget.toLowerCase().endsWith('.exe')) {
    const peVer = gameService.getPeVersion(fileTarget);
    if (peVer) calculatedVersion = peVer;
  }

  const finalExePath =
    (f.filepath && path.extname(f.filepath) ? f.filepath : null) ||
    (existing?.localExePath && path.extname(existing.localExePath) ? existing.localExePath : null) ||
    (existing?.exePath && path.extname(existing.exePath) ? existing.exePath : null) ||
    fileTarget ||
    f.filepath ||
    existing?.exePath ||
    '';

  const game: LocalGame = {
    id: fullId,
    title: existing?.title || f.game_title || f.filename,
    exePath: finalExePath,
    localExePath: resolvedLocalExe || (fileTarget || undefined),
    installDir: resolvedDir,
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

    // Synchronize configured paths to node libraries.
    // If paths are passed explicitly from the client, treat them as the current active list
    // instead of unioning with stale database paths.
    const hasClientPaths = (paths && paths.length > 0) || (isoPaths && isoPaths.length > 0);
    const allPathsMap = new Map<string, 'game' | 'iso'>();
    if (hasClientPaths) {
      for (const p of paths || []) {
        allPathsMap.set(p, 'game');
      }
      for (const ip of isoPaths || []) {
        allPathsMap.set(ip, 'iso');
      }
    } else {
      let configuredPaths = gameService.getScanPaths();
      if (configuredPaths.length === 0 && nodeDaemon) {
        try {
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
            configuredPaths = recovered;
          }
        } catch {
          // ignore node library fetch error
        }
      }
      for (const cp of configuredPaths) {
        allPathsMap.set(cp.path, cp.type === 'iso' || (cp.type as any) === 'provider' ? 'iso' : 'game');
      }
    }

    // Deduplicate paths and prune nested subfolders so directories are not walked multiple times
    const sortedPaths = Array.from(allPathsMap.entries()).sort((a, b) => a[0].length - b[0].length);
    const prunedPathsMap = new Map<string, 'game' | 'iso'>();
    for (const [p, type] of sortedPaths) {
      const normP = path.resolve(p).toLowerCase();
      let isChild = false;
      for (const [parentP] of prunedPathsMap.entries()) {
        const normParent = path.resolve(parentP).toLowerCase();
        if (normP !== normParent && normP.startsWith(normParent + path.sep.toLowerCase())) {
          isChild = true;
          break;
        }
      }
      if (!isChild) {
        prunedPathsMap.set(p, type);
      }
    }
    allPathsMap.clear();
    for (const [k, v] of prunedPathsMap) {
      allPathsMap.set(k, v);
    }

    if (nodeDaemon && allPathsMap.size > 0) {
      const scanItems = Array.from(allPathsMap.entries()).map(([p, t]) => ({ path: p, type: t }));
      // Sync libraries to node with ?no_scan=true so it skips autonomous ScanAll() before explicit scan
      try {
        await new Promise<void>((resolve) => {
          const body = JSON.stringify({
            libraries: scanItems.map((item) => ({
              name: path.basename(item.path) || item.type,
              path: resolveUncPath(item.path),
              kind: item.type,
            })),
          });
          const sHeaders: Record<string, string> = {
            ...authHeaders,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body).toString(),
          };
          const sreq = http.request(
            `http://127.0.0.1:${port}/api/v1/libraries?no_scan=true`,
            { method: 'PUT', headers: sHeaders, timeout: 5000 },
            (res) => {
              res.resume();
              res.on('end', () => resolve());
            }
          );
          sreq.on('error', () => resolve());
          sreq.on('timeout', () => { sreq.destroy(); resolve(); });
          sreq.write(body);
          sreq.end();
        });
      } catch {
        await nodeDaemon.syncLibraries(scanItems);
      }
    }

    sendSafeProgress('Indexing library files...', 30);

    // ── Real-Time File Discovery Setup ──
    const allExistingGames = gameService.getAllGames();
    const existingGamesById = new Map<string, (typeof allExistingGames)[0]>();
    for (const eg of allExistingGames) {
      existingGamesById.set(eg.id, eg);
    }
    const existingExes = new Set<string>();
    const existingDirs = new Set<string>();
    for (const eg of allExistingGames) {
      if (eg.exePath) existingExes.add(path.resolve(eg.exePath).toLowerCase());
      if (eg.localExePath) existingExes.add(path.resolve(eg.localExePath).toLowerCase());
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
        gameService.flushNotifyGamesChanged();
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

    const fetchCurrentFiles = (): Promise<any[]> => {
      return new Promise((resolve) => {
        const req = http.get(
          `http://127.0.0.1:${port}/api/v1/files`,
          { headers: authHeaders, timeout: 3000 },
          (res) => {
            if (res.statusCode !== 200) {
              res.resume();
              resolve([]);
              return;
            }
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
          }
        );
        req.on('error', () => resolve([]));
        req.on('timeout', () => { req.destroy(); resolve([]); });
      });
    };

    // Connect to real-time scan progress stream (SSE)
    let sseReq: http.ClientRequest | null = null;
    try {
      sseReq = http.get(
        `http://127.0.0.1:${port}/api/v1/scan/progress`,
        { headers: authHeaders, timeout: 180000 },
        (res) => {
          let sseBuffer = '';
          res.on('data', (chunk: Buffer) => {
            sseBuffer += chunk.toString('utf8');
            const blocks = sseBuffer.split('\n\n');
            sseBuffer = blocks.pop() || '';
            const realTimeBatch: LocalGame[] = [];
            for (const block of blocks) {
              const eventMatch = block.match(/^event:\s*([^\r\n]+)/m);
              const dataMatch = block.match(/^data:\s*([^\r\n]+)/m);
              if (eventMatch && dataMatch) {
                const eventName = eventMatch[1].trim();
                if (eventName === 'game_found' || eventName === 'file_indexed') {
                  try {
                    const parsedFile = JSON.parse(dataMatch[1].trim());
                    const g = ingestFile(parsedFile);
                    if (g) realTimeBatch.push(g);
                  } catch {}
                }
              }
            }
            if (realTimeBatch.length > 0) {
              handleDiscoveredBatch(realTimeBatch);
            }
          });
          res.on('error', () => {});
        }
      );
      sseReq.on('error', () => {});
    } catch {}

    // Trigger node scan with progress polling
    let scanDone = false;
    let isPollingFiles = false;
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
          sendSafeProgress(
            `Scanning ${displayDir} (${scanned} files)...`,
            Math.min(85, 30 + Math.floor(scanned / 50)),
          );
        }

        if (!isPollingFiles) {
          isPollingFiles = true;
          fetchCurrentFiles()
            .then((current) => {
              if (Array.isArray(current) && current.length > 0) {
                const pollBatch: LocalGame[] = [];
                for (const f of current) {
                  const g = ingestFile(f);
                  if (g) pollBatch.push(g);
                }
                if (pollBatch.length > 0) {
                  handleDiscoveredBatch(pollBatch);
                }
              }
            })
            .catch(() => {})
            .finally(() => {
              isPollingFiles = false;
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
          (res) => {
            let buf = '';
            res.on('data', (c) => { buf += c; });
            res.on('end', () => {
              if (res.statusCode && res.statusCode >= 400) {
                console.warn(`[scanner:scan-paths] Node scan returned HTTP ${res.statusCode}: ${buf}`);
              }
              resolve();
            });
          }
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
      if (sseReq) {
        try { sseReq.destroy(); } catch {}
      }
    }

    sendSafeProgress('Fetching indexed games...', 88);

    // Fetch hosted files from node with streaming JSON parse to avoid buffering a massive string
    let nodeFiles: any[] = [];
    try {
      nodeFiles = await new Promise((resolve) => {
        let resolved = false;
        const safeResolve = (val: any[]) => {
          if (!resolved) {
            resolved = true;
            resolve(val);
          }
        };

        const chunks: Buffer[] = [];
        let totalBytes = 0;
        let lastProgressReportTime = Date.now();
        const MAX_RESPONSE_BYTES = 100 * 1024 * 1024; // 100MB safety limit
        const req = http.get(`http://127.0.0.1:${port}/api/v1/files`, { headers: authHeaders, timeout: 10000 }, (res) => {
          res.on('error', (err) => {
            req.destroy();
            console.warn('[scanner:scan-paths] Node files response stream error:', err.message);
            safeResolve([]);
          });
          res.on('close', () => {
            if (!resolved) {
              safeResolve([]);
            }
          });

          if (res.statusCode !== 200) {
            let buf = '';
            res.on('data', (c) => { buf += c; });
            res.on('end', () => {
              console.warn(`[scanner:scan-paths] Node files returned HTTP ${res.statusCode}: ${buf}`);
              safeResolve([]);
            });
            return;
          }
          res.on('data', (chunk: Buffer) => {
            totalBytes += chunk.length;
            if (totalBytes > MAX_RESPONSE_BYTES) {
              req.destroy();
              console.warn('[scanner:scan-paths] Node files response exceeded 100MB, aborting');
              safeResolve([]);
              return;
            }
            chunks.push(chunk);
            const now = Date.now();
            if (now - lastProgressReportTime > 300) {
              lastProgressReportTime = now;
              const mb = (totalBytes / (1024 * 1024)).toFixed(1);
              sendSafeProgress(`Fetching indexed games (${mb} MB)...`, 89);
            }
          });
          res.on('end', async () => {
            try {
              sendSafeProgress('Processing indexed games...', 91);
              if (chunks.length === 0 || totalBytes === 0) {
                safeResolve([]);
                return;
              }
              // Yield to event loop so renderer updates can flush
              await new Promise<void>((r) => setImmediate(r));
              const rawString = chunks.length === 1 ? chunks[0].toString('utf8') : Buffer.concat(chunks, totalBytes).toString('utf8');
              chunks.length = 0;
              const parsed = JSON.parse(rawString);
              const result = Array.isArray(parsed) ? parsed : [];
              sendSafeProgress(`Loaded ${result.length} indexed files`, 93);
              safeResolve(result);
            } catch (parseErr: any) {
              console.warn('[scanner:scan-paths] Failed to parse node files response:', parseErr.message);
              safeResolve([]);
            }
          });
        });
        req.on('error', (e) => {
          console.warn('[scanner:scan-paths] Node files fetch error:', e.message);
          safeResolve([]);
        });
        req.on('timeout', () => {
          req.destroy();
          console.warn('[scanner:scan-paths] Node files fetch timed out after 10s');
          safeResolve([]);
        });
      });
    } catch (fetchErr: any) {
      console.warn('[scanner:scan-paths] Node files fetch exception:', fetchErr);
      nodeFiles = [];
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

    // Fallback: if node returned 0 files or is offline, scan via native local-scanner
    if (games.length === 0 && (!nodeFiles || nodeFiles.length === 0)) {
      sendSafeProgress('Scanning local directories...', 40);
      console.log('[scanner:scan-paths] Running native local file scanner...');
      try {
        const scanDirs = Array.from(allPathsMap.entries()).filter(([_, t]) => t === 'game' || (t as string) === 'installed').map(([p]) => p);
        const isoDirs = Array.from(allPathsMap.entries()).filter(([_, t]) => t === 'iso' || (t as string) === 'provider').map(([p]) => p);
        const localScanResult = await scanLocalFiles({
          scanDirectories: scanDirs,
          isoDirectories: isoDirs,
          onProgress: (dir, progress) => {
            const displayDir = path.basename(dir) || 'folders';
            sendSafeProgress(`Scanning ${displayDir}...`, Math.min(85, 40 + Math.floor(progress * 0.45)));
          },
        });
        const rawFallback = localScanResult.games || [];
        if (rawFallback.length > 0) {
          console.log(`[scanner:scan-paths] Native local scanner discovered ${rawFallback.length} games`);
          const fallbackBatch: LocalGame[] = [];
          for (const g of rawFallback) {
            const isIsoOrRom = g.platform !== 'pc' && g.platform !== 'steam';
            const formatCategory = g.platform === 'steam' ? 'steam' : isIsoOrRom ? (g.platform === 'iso' ? 'iso' : 'rom') : 'pc';
            const mapped = ingestFile({
              id: g.id,
              filename: path.basename(g.exePath || g.installDir || g.title),
              filepath: g.exePath || g.installDir,
              game_title: g.title,
              format_category: formatCategory,
              platform: g.platform,
              root_dir: g.installDir,
              update_files: g.updateFiles,
              isDlc: g.isDlc,
              local_exe_path: g.localExePath,
            });
            if (mapped) fallbackBatch.push(mapped);
          }
          if (fallbackBatch.length > 0) {
            handleDiscoveredBatch(fallbackBatch);
          }
        }
      } catch (fbErr: any) {
        console.warn('[scanner:scan-paths] Native local scanner error:', fbErr.message);
      }
    } else {
      // Augment Steam libraries natively so appmanifests are recognized as Steam titles
      try {
        const scanDirs = Array.from(allPathsMap.entries()).filter(([_, t]) => t === 'game' || (t as string) === 'installed').map(([p]) => p);
        const steamDirs = scanDirs.filter((d) => {
          try {
            const lower = d.toLowerCase();
            if (lower.endsWith('steamapps') || path.basename(lower) === 'steam') return true;
            if (fs.existsSync(d) && fs.statSync(d).isDirectory()) {
              const entries = fs.readdirSync(d);
              return entries.some((e) => e.toLowerCase() === 'steamapps');
            }
            return false;
          } catch {
            return false;
          }
        });

        if (steamDirs.length > 0) {
          const steamResult = await scanLocalFiles({
            scanDirectories: steamDirs,
            isoDirectories: [],
          });
          const steamGames = (steamResult.games || []).filter((g) => g.platform === 'steam');
          if (steamGames.length > 0) {
            const steamBatch: LocalGame[] = [];
            for (const sg of steamGames) {
              const mapped = ingestFile({
                id: sg.id,
                filename: path.basename(sg.exePath || sg.installDir || sg.title),
                filepath: sg.exePath || sg.installDir,
                game_title: sg.title,
                format_category: 'steam',
                platform: 'steam',
                root_dir: sg.installDir,
                update_files: sg.updateFiles,
                isDlc: sg.isDlc,
                local_exe_path: sg.localExePath,
              });
              if (mapped) steamBatch.push(mapped);
            }
            if (steamBatch.length > 0) {
              handleDiscoveredBatch(steamBatch);
            }
          }
        }
      } catch (steamErr: any) {
        console.warn('[scanner:scan-paths] Native Steam library scan augmentation error:', steamErr.message);
      }
    }

    // Update detector state with newly indexed games (isolated from scan return)
    try {
      gameDetector?.setLibrary(games);
      gameDetector?.startPeriodicScan();
    } catch (detErr) {
      console.warn('[scanner:scan-paths] Detector update error:', detErr);
    }

    // Commit 100% of discovered games into SQLite immediately in atomic transaction
    if (games.length > 0) {
      sendSafeProgress(`Saving ${games.length} games to library...`, 96);
      const scope = hasClientPaths ? Array.from(allPathsMap.keys()) : undefined;
      gameService.upsertGames(games as any[], scope);
      // Flush change notification immediately so renderer hydrates cards without debounce delay
      gameService.flushNotifyGamesChanged();
    }
    // Prune missing games asynchronously to avoid blocking the main thread with fs.existsSync
    try {
      gameService.pruneMissingGamesAsync().catch((err: any) => {
        console.warn('[scanner:scan-paths] Async prune error:', err);
      });
    } catch (pruneErr) {
      console.warn('[scanner:scan-paths] Synchronous prune invocation error:', pruneErr);
    }

    // Discovery is complete: notify frontend scanner widget
    sendSafeProgress('Scan complete', 100);

    // ── Phase 2: Autonomous Background Matching (Fire-and-forget, non-blocking) ──
    if (_orchestrator) {
      if (typeof (_orchestrator as any).startBackgroundMatching === 'function') {
        (_orchestrator as any).startBackgroundMatching().catch((matchErr: any) => {
          console.warn('[scanner:scan-paths] Background matching error:', matchErr);
        });
      } else if (typeof (_orchestrator as any).startMatching === 'function') {
        (_orchestrator as any).startMatching().catch((matchErr: any) => {
          console.warn('[scanner:scan-paths] Background matching error:', matchErr);
        });
      } else if (typeof _orchestrator.matchGames === 'function') {
        const scannedForMatch: ScannedGame[] = games
          .filter((g) => !g.isDlc && !g.isApp)
          .map((g) => ({
            id: g.id,
            title: cleanGameTitle(g.title) || g.title,
            platform: g.platform,
            installPath: g.installDir,
            exePath: g.exePath,
            isDlc: g.isDlc,
          }));
        _orchestrator.matchGames(scannedForMatch, 'local').catch((matchErr: any) => {
          console.warn('[scanner:scan-paths] Background matchGames fallback error:', matchErr);
        });
      }
    }

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
  ipcMain.handle('scanner:accept-suggestion', (_event, gameId: string, suggestion: any) => {
    gameService.acceptSuggestion(gameId, suggestion ?? undefined);
    console.log('[scanner] acceptSuggestion:', gameId, '->', suggestion?.id || 'no-suggestion');
    if (suggestion) {
      const hyd = suggestion.hydrated || suggestion;
      gameService.hydrateGame(
        gameId,
        suggestion.title || hyd.title || '',
        suggestion.iconUrl || suggestion.icon_url || hyd.icon_url || hyd.iconUrl || null,
        suggestion.posterUrl || suggestion.poster_url || hyd.poster_url || hyd.posterUrl || null,
        hyd,
        suggestion.confidence ?? 1.0,
        suggestion.id || suggestion.mediaId || hyd.id || null,
        suggestion.backdropUrl || suggestion.backdrop_url || hyd.backdrop_url || hyd.backdropUrl || null,
      );
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
          const url = `${baseUrl}/api/v1/media/game/${game.otix_media_id}`
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
          } catch (writeErr) {
            console.warn(`[games:hydrate-matched] Write error for ${batch[j].id}:`, writeErr)
            failed++
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
      if (typeof (_orchestrator as any).startBackgroundMatching === 'function') {
        void (_orchestrator as any).startBackgroundMatching(options).catch((err: any) => {
          console.error('[matching:start] Error in startBackgroundMatching:', err);
        });
        return { success: true, isMatching: true };
      }

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
