import { net } from 'electron';
import * as path from 'path';
import * as os from 'os';
import { getApiBaseUrl } from '../config';
import { syncMachineMappingsFromBackend } from '../unc-resolver';
import { saveDesktopSettings, getSettings } from '../desktop-settings';
import type { RunningGame, PlaySession } from '../game/detector';
import type { BootContext } from './types';

/**
 * Synchronize currently active or stopped games with the Otix backend.
 */
export async function syncRunningGamesToBackend(ctx: BootContext, games: RunningGame[]): Promise<void> {
  if (!ctx.currentAuthToken) return;
  const apiBase = getApiBaseUrl();
  const url = `${apiBase}/api/v1/library/game-running`;
  const isRunning = games.length > 0;
  const single = games[0];
  const payload = isRunning
    ? {
        running: true,
        game: {
          id: single.game.id,
          title: single.game.title,
          platform: single.game.platform || 'pc',
          exe_path: single.game.exePath || '',
          process_name: single.game.exePath ? path.basename(single.game.exePath) : (single.game as any).processName || '',
          otix_media_id: single.game.otixMediaId,
          poster_url: single.game.posterUrl || single.game.otixPosterUrl,
          backdrop_url: (single.game as any).backdropUrl,
          start_time: single.startTime,
        },
        games: games.map((g) => ({
          id: g.game.id,
          title: g.game.title,
          platform: g.game.platform || 'pc',
          exe_path: g.game.exePath || '',
          process_name: g.game.exePath ? path.basename(g.game.exePath) : (g.game as any).processName || '',
          otix_media_id: g.game.otixMediaId,
          poster_url: g.game.posterUrl || g.game.otixPosterUrl,
          backdrop_url: (g.game as any).backdropUrl,
          start_time: g.startTime,
        })),
      }
    : {
        running: false,
        game: null,
        games: [],
      };

  try {
    await net.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.currentAuthToken}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.debug('[main:sync] Failed to sync running game to backend:', err);
  }
}

/**
 * Push completed game play sessions to the Otix backend for stats tracking.
 */
export async function syncGameSessionToBackend(ctx: BootContext, sessions: PlaySession | PlaySession[]): Promise<void> {
  if (!ctx.currentAuthToken) return;
  const apiBase = getApiBaseUrl();
  const url = `${apiBase}/api/v1/library/game-sessions`;
  const list = Array.isArray(sessions) ? sessions : [sessions];
  if (list.length === 0) return;
  const payload = { sessions: list };

  try {
    await net.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.currentAuthToken}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.debug('[main:sync] Failed to sync game session to backend:', err);
  }
}

/**
 * Push companion daemon heartbeat, node status, and library catalog info to backend.
 */
export async function syncDesktopNodeToBackend(ctx: BootContext, isOnline = true): Promise<void> {
  if (!ctx.currentAuthToken) return;
  const apiBase = getApiBaseUrl();
  const url = `${apiBase}/api/v1/library/nodes/desktop-heartbeat`;
  const deviceId = ctx.fetchBridge?.deviceId || os.hostname();
  const name = os.hostname();
  const runningList = ctx.gameDetector ? ctx.gameDetector.getRunningGames() : [];
  const totalFiles = ctx.gameDetector ? ctx.gameDetector.getLibrary().length : 0;
  const daemonStatus = ctx.nodeDaemon?.getStatus();

  let currentLibraries: Array<{ name: string; path: string; kind: string }> = [];
  try {
    const { getScanPaths } = require('../game/storage');
    const paths = getScanPaths ? getScanPaths() : [];
    currentLibraries = paths.map((p: any) => ({
      name: path.basename(p.path) || p.type,
      path: p.path,
      kind: p.type,
    }));
  } catch {}

  const payload = {
    name,
    device_id: deviceId,
    port: daemonStatus?.port || 8090,
    is_online: isOnline,
    total_files: totalFiles,
    libraries: currentLibraries,
    running_games: runningList.map((g) => ({
      id: g.game.id,
      title: g.game.title,
      platform: g.game.platform || 'pc',
      exe_path: g.game.exePath || '',
      process_name: g.game.exePath ? path.basename(g.game.exePath) : (g.game as any).processName || '',
      otix_media_id: g.game.otixMediaId,
      poster_url: g.game.posterUrl || g.game.otixPosterUrl,
      backdrop_url: (g.game as any).backdropUrl,
      start_time: g.startTime,
    })),
  };

  try {
    const resp = await net.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.currentAuthToken}`,
      },
      body: JSON.stringify(payload),
    });
    if (resp.ok) {
      void syncMachineMappingsFromBackend(apiBase, ctx.currentAuthToken);
      const data = (await resp.json().catch(() => null)) as any;
      if (data && Array.isArray(data.pending_updates) && data.pending_updates.length > 0 && data.id) {
        const updateIds: string[] = [];
        for (const upd of data.pending_updates) {
          updateIds.push(upd.id);
          if (upd.type === 'desktop_settings' && upd.data) {
            try {
              saveDesktopSettings({ ...getSettings(), ...upd.data });
            } catch (e) {
              console.debug('[main:sync] Failed to apply offline desktop settings:', e);
            }
          } else if (upd.type === 'libraries' && upd.data) {
            try {
              const libs = Array.isArray(upd.data.libraries) ? upd.data.libraries : [];
              const scanPaths = libs.map((l: any) => ({
                path: String(l.path || ''),
                type: l.kind === 'iso' ? ('iso' as const) : ('game' as const),
              })).filter((p: any) => p.path);
              const { saveScanPaths } = require('../game/storage');
              saveScanPaths(scanPaths);
              if (ctx.nodeDaemon) {
                void ctx.nodeDaemon.syncLibraries(scanPaths);
              }
            } catch (e) {
              console.debug('[main:sync] Failed to apply offline libraries:', e);
            }
          }
        }
        const ackUrl = `${apiBase}/api/v1/library/nodes/${data.id}/acknowledge-updates`;
        await net.fetch(ackUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ctx.currentAuthToken}`,
          },
          body: JSON.stringify({ update_ids: updateIds }),
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.debug('[main:sync] Failed to sync desktop node heartbeat to backend:', err);
  }
}
