import { ipcMain, shell } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import { GameDetector, type RunningGame } from '../game/detector';
import type { Cs2GsiManager } from '../game/cs2-gsi';
import type { PluginManager } from '../plugin-runtime/manager';
import type { FpsCaptureService } from '../game/fps-capture';
import type { LocalGame } from '../preload-api';
import {
  isRomGame,
  resolveEmulatorLaunch,
  detectAllEmulators,
  getAmbiguousCandidates,
} from '../game/emulators';
import { getSettings } from '../desktop-settings';
import { updateGamePlatform } from '../game/storage';
import { httpPostJson, httpGetJson } from '../game/node-hardware';

async function getRunningGamesMerged(gameDetector: GameDetector | null): Promise<RunningGame[]> {
  const local = gameDetector?.getRunningGames() ?? [];
  try {
    const port = getSettings().embeddedNodePort || 8090;
    const nodeData = await httpGetJson<{ running?: boolean; games?: any[]; game?: any }>(
      `http://127.0.0.1:${port}/api/v1/games/running`,
      500
    );
    if (nodeData && nodeData.running) {
      const rawList: any[] = Array.isArray(nodeData.games) && nodeData.games.length > 0
        ? nodeData.games
        : (nodeData.game ? [nodeData.game] : []);

      const normalizeId = (id: string) => id.replace(/^(pc_|file_|iso_|steam_)+/, '');
      const merged = [...local];
      for (const g of rawList) {
        const gameId = g.id || g.game_id || '';
        const normGId = normalizeId(gameId);
        const match = merged.find((lg) => {
          if (g.pid && lg.pid && lg.pid === g.pid) return true;
          if (lg.game.id === gameId) return true;
          if (normGId && normalizeId(lg.game.id) === normGId) return true;
          return false;
        });
        const rawFps = g.fps_snapshot || g.fpsSnapshot;
        const fpsSnapshot = rawFps ? {
          currentFps: rawFps.fps ?? rawFps.current_fps ?? rawFps.currentFps ?? 0,
          frameCount: rawFps.frame_count ?? rawFps.frameCount ?? 0,
          captureDurationMs: 0,
          gameId,
        } : null;

        if (match) {
          if (!match.pid && g.pid) match.pid = g.pid;
          if (fpsSnapshot) match.fpsSnapshot = fpsSnapshot;
          if (g.fps_available != null) match.fpsAvailable = Boolean(g.fps_available);
        } else {
          const rawStart = new Date(g.start_time || g.startTime || g.startedAt).getTime();
          const duration = g.current_duration_seconds ?? g.currentDurationSeconds ?? 0;
          const elapsedFallback = Date.now() - (duration * 1000);
          const startTime = isNaN(rawStart) || rawStart <= 0 ? elapsedFallback : rawStart;
          const synth: RunningGame = {
            game: {
              id: gameId,
              title: g.title || g.game_title || '',
              platform: (g.platform as any) || 'pc',
              exePath: g.exe_path || g.exePath || '',
              installDir: '',
              otixMediaId: g.otix_media_id ?? g.otixMediaId,
              posterUrl: g.poster_url || g.posterUrl,
              otixPosterUrl: g.poster_url || g.posterUrl,
            },
            startTime,
            launchedByOtix: Boolean(g.launched_by_otix ?? g.launchedByOtix),
            pid: g.pid,
            fpsAvailable: Boolean(g.fps_available ?? g.fpsAvailable),
            fpsSnapshot,
          };
          merged.push(synth);
          if (gameDetector && gameId) {
            gameDetector.addOrUpdateRunningGame(gameId, synth);
          }
        }
      }
      // Strictly deduplicate by PID and normalized ID
      const deduped: RunningGame[] = [];
      const seenPids = new Set<number>();
      const seenIds = new Set<string>();
      for (const item of merged) {
        if (item.pid && seenPids.has(item.pid)) continue;
        const normId = normalizeId(item.game.id);
        if (normId && seenIds.has(normId)) continue;
        if (item.pid) seenPids.add(item.pid);
        if (normId) seenIds.add(normId);
        deduped.push(item);
      }
      return deduped;
    }
  } catch {
    // node daemon unavailable or timed out
  }
  return local;
}

export function registerGameDetectorIPC(
  gameDetector: GameDetector | null,
  pluginManager?: PluginManager | FpsCaptureService | null,
  cs2GsiManager?: Cs2GsiManager,
  fpsCaptureService?: FpsCaptureService | null,
): void {
  const getServiceRegistry = () => {
    return (pluginManager && 'serviceRegistry' in pluginManager) ? (pluginManager as PluginManager).serviceRegistry : undefined;
  };

  // Launch game — accepts full LocalGame for tracking
  ipcMain.handle('launcher:launch-game', async (_, game: LocalGame) => {
    try {
      if (isRomGame(game)) {
        const settings = getSettings();
        const launch = resolveEmulatorLaunch(game, getServiceRegistry(), settings);
        const child = spawn(launch.executablePath, launch.args, {
          cwd: launch.workingDir,
          detached: true,
          stdio: 'ignore',
        });
        child.on('error', (err) => console.warn('[launcher] Child error:', err));
        gameDetector?.startTracking(game, child.pid);
        child.unref();
        return true;
      } else if (game.exePath.includes('://')) {
        await shell.openExternal(game.exePath);
        gameDetector?.startTracking(game); // no PID for protocol launches, scan will confirm
        return true;
      } else {
        const gameDir = (game as any).workingDirectory || path.dirname(game.exePath);
        const rawArgs = (game as any).launchArguments;
        const args = typeof rawArgs === 'string' && rawArgs.trim().length > 0 ? rawArgs.trim().split(/\s+/) : [];
        const child = spawn(game.exePath, args, {
          cwd: gameDir,
          detached: true,
          stdio: 'ignore',
        });
        child.on('error', (err) => console.warn('[launcher] Child error:', err));
        gameDetector?.startTracking(game, child.pid);
        child.unref();
        return true;
      }
    } catch (err) {
      console.error('Failed to launch game', game.exePath, err);
      throw err;
    }
  });

  // Emulator management IPC
  ipcMain.handle('emulators:get-all', async () => {
    const settings = getSettings();
    return detectAllEmulators(getServiceRegistry(), settings.emulatorPaths);
  });

  ipcMain.handle('emulators:get-ambiguous-candidates', async (_, filePathOrGame: string | LocalGame) => {
    return getAmbiguousCandidates(filePathOrGame);
  });

  ipcMain.handle('emulators:set-game-platform', async (_, gameId: string, platform: string) => {
    updateGamePlatform(gameId, platform);
    return true;
  });

  ipcMain.handle('game:get-running', async () => {
    return getRunningGamesMerged(gameDetector);
  });

  ipcMain.handle('game:get-running-single', async () => {
    const games = await getRunningGamesMerged(gameDetector);
    return games.length > 0 ? games[0] : null;
  });

  ipcMain.handle('game:cycle-active', async () => {
    try {
      const port = getSettings().embeddedNodePort || 8090;
      await httpPostJson(`http://127.0.0.1:${port}/api/v1/games/active`, { action: 'cycle' });
    } catch {
      // fallback if node daemon is unlinked
    }
    return gameDetector?.cycleActiveGame() ?? null;
  });

  ipcMain.handle('game:set-active', async (_, gameId: string) => {
    try {
      const port = getSettings().embeddedNodePort || 8090;
      await httpPostJson(`http://127.0.0.1:${port}/api/v1/games/active`, { game_id: gameId });
    } catch {
      // fallback if node daemon is unlinked
    }
    return gameDetector?.setActiveGame(gameId) ?? null;
  });

  ipcMain.handle('game:get-recent-sessions', async () => {
    const detectorSessions = gameDetector?.getRecentSessions() ?? [];
    const fpsService = (fpsCaptureService || (pluginManager && 'getRecentSessions' in pluginManager ? pluginManager : null)) as FpsCaptureService | null;
    if (fpsService) {
      try {
        const fpsSessions = fpsService.getRecentSessions(20);
        if (Array.isArray(fpsSessions) && fpsSessions.length > 0) {
          const map = new Map<string, any>();
          for (const s of detectorSessions) {
            const key = (s as any).id || `${s.gameId}-${s.startTime}`;
            map.set(key, s);
          }
          for (const s of fpsSessions) {
            const key = (s as any).id || `${s.gameId}-${s.startTime}`;
            map.set(key, { ...(map.get(key) || {}), ...s });
          }
          return Array.from(map.values()).slice(-20);
        }
      } catch {
        /* fall back to detector */
      }
    }
    return detectorSessions;
  });

  ipcMain.handle('game:get-playtime', async (_event, gameId: string) => {
    const fpsService = (fpsCaptureService || (pluginManager && 'getPlaytimeForGame' in pluginManager ? pluginManager : null)) as FpsCaptureService | null;
    if (fpsService) {
      try {
        return fpsService.getPlaytimeForGame(gameId);
      } catch {
        /* fall back to detector */
      }
    }
    return gameDetector?.getPlaytimeForGame(gameId) ?? { totalMinutes: 0, sessionCount: 0, lastPlayed: null, lastFpsStats: null };
  });

  ipcMain.handle('game:set-library', (_, games: LocalGame[]) => {
    gameDetector?.setLibrary(games);
    gameDetector?.startPeriodicScan();
    return true;
  });

  ipcMain.handle('game:stop-tracking', (_, gameId: string) => {
    gameDetector?.stopTracking(gameId);
    return true;
  });

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

  ipcMain.handle('game:get-cs2-state', () => {
    return cs2GsiManager?.getState() ?? null;
  });

  ipcMain.handle('game:setup-cs2-gsi', () => {
    return cs2GsiManager?.setupCs2GsiConfig() ?? { success: false, message: 'CS2 GSI manager not initialized' };
  });
}
