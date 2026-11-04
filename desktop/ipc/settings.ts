import { ipcMain, BrowserWindow, Tray } from 'electron';
import {
  getSettings,
  saveDesktopSettings,
  applyDesktopSettings,
  type DesktopSettings,
} from '../desktop-settings';
import {
  setAutoDownloadUpdates,
  setAllowPrerelease,
  configureAutoUpdaterFeed,
  startPeriodicUpdateChecks,
  stopPeriodicUpdateChecks,
} from './updater';

import type { NodeDaemonManager } from '../node-daemon';
import { getHostNodeAndHardware, httpGetJson, httpPostJson } from '../game/node-hardware';

export function registerDesktopSettingsIPC(
  mainWindow: BrowserWindow,
  tray: Tray | null,
  nodeDaemon?: NodeDaemonManager | null,
): void {
  ipcMain.handle('desktop-settings:get', async (): Promise<DesktopSettings> => {
    const settings = { ...getSettings() };
    const port = settings.embeddedNodePort || 8090;
    try {
      const monitors = await httpGetJson<any[]>(`http://127.0.0.1:${port}/api/v1/games/overlay/monitors`, 1500);
      if (Array.isArray(monitors)) {
        settings.overlayMonitors = monitors;
      }
    } catch {
      // ignore
    }
    try {
      const nodeOverlay = await httpGetJson<any>(`http://127.0.0.1:${port}/api/v1/games/overlay/settings`, 1500);
      if (nodeOverlay) {
        if (typeof nodeOverlay.enabled === 'boolean') settings.overlayEnabled = nodeOverlay.enabled;
        if (nodeOverlay.corner) settings.overlayCorner = nodeOverlay.corner;
        if (nodeOverlay.monitor) settings.overlayMonitor = nodeOverlay.monitor;
        if (nodeOverlay.hotkey) settings.overlayHotkey = nodeOverlay.hotkey;
        if (typeof nodeOverlay.show_fps === 'boolean') settings.overlayShowFps = nodeOverlay.show_fps;
        if (typeof nodeOverlay.show_percentiles === 'boolean') settings.overlayShowPercentiles = nodeOverlay.show_percentiles;
        if (typeof nodeOverlay.show_playtime === 'boolean') settings.overlayShowPlaytime = nodeOverlay.show_playtime;
        if (typeof nodeOverlay.show_title === 'boolean') settings.overlayShowTitle = nodeOverlay.show_title;
        if (typeof nodeOverlay.opacity === 'number' && nodeOverlay.opacity > 0) settings.overlayOpacity = nodeOverlay.opacity;
      }
    } catch {
      // ignore
    }
    return settings;
  });

  ipcMain.handle('desktop-hardware:get', async (_event, refresh = false) => {
    const port = getSettings().embeddedNodePort || 8090;
    const query = refresh ? '?refresh=true' : '';
    // 1. Try local node daemon
    try {
      const nodeHw =
        (await httpGetJson<any>(`http://127.0.0.1:${port}/api/v1/desktop/hardware${query}`, 1500)) ||
        (await httpGetJson<any>(`http://127.0.0.1:${port}/api/v1/hardware${query}`, 1500));
      if (nodeHw && (nodeHw.cpu || nodeHw.memory || nodeHw.gpus)) {
        return nodeHw;
      }
    } catch {
      // continue to fallback
    }

    // 2. Fallback to hostNodeMatch hardware
    try {
      const match = await getHostNodeAndHardware(refresh);
      if (match?.hardware) {
        return {
          probedAt: new Date().toISOString(),
          cpu: match.hardware.cpu ? { modelName: match.hardware.cpu } : undefined,
          memory: match.hardware.ramBytes ? { totalBytes: match.hardware.ramBytes } : undefined,
          gpus: match.hardware.gpu
            ? [{ name: match.hardware.gpu, isDiscrete: match.hardware.discreteGpu ?? true, isPrimary: true }]
            : [],
          os: match.hardware.os ? { name: match.hardware.os, platform: process.platform } : undefined,
        };
      }
    } catch {
      // ignore
    }
    return null;
  });

  ipcMain.handle(
    'desktop-settings:set',
    async (_event, partial: Partial<DesktopSettings>): Promise<DesktopSettings> => {
      const current = getSettings();
      const merged: DesktopSettings = { ...current, ...partial };
      saveDesktopSettings(merged);
      applyDesktopSettings(merged, mainWindow, tray);

      if (partial.autoDownloadUpdates !== undefined) {
        setAutoDownloadUpdates(partial.autoDownloadUpdates);
      }

      if (partial.allowPrerelease !== undefined) {
        setAllowPrerelease(partial.allowPrerelease);
      }

      if (partial.autoCheckUpdates !== undefined) {
        if (partial.autoCheckUpdates) {
          startPeriodicUpdateChecks();
        } else {
          stopPeriodicUpdateChecks();
        }
      }

      if (partial.githubToken !== undefined) {
        configureAutoUpdaterFeed();
      }

      if (nodeDaemon && partial.embeddedNodeEnabled !== undefined) {
        if (partial.embeddedNodeEnabled) {
          void nodeDaemon.start({ port: merged.embeddedNodePort });
        } else {
          void nodeDaemon.stop();
        }
      }

      // Sync overlay settings to running node daemon
      const hasOverlayProps =
        partial.overlayEnabled !== undefined ||
        partial.overlayCorner !== undefined ||
        partial.overlayMonitor !== undefined ||
        partial.overlayHotkey !== undefined ||
        partial.overlayShowFps !== undefined ||
        partial.overlayShowPercentiles !== undefined ||
        partial.overlayShowPlaytime !== undefined ||
        partial.overlayShowTitle !== undefined ||
        partial.overlayOpacity !== undefined ||
        partial.onlyTrackScannedGames !== undefined;

      if (hasOverlayProps) {
        const port = merged.embeddedNodePort || 8090;
        const payload = {
          enabled: merged.overlayEnabled ?? true,
          corner: merged.overlayCorner ?? 'top-wide',
          monitor: merged.overlayMonitor ?? 'auto',
          hotkey: merged.overlayHotkey ?? 'Ctrl+`',
          show_fps: merged.overlayShowFps ?? true,
          show_percentiles: merged.overlayShowPercentiles ?? true,
          show_playtime: merged.overlayShowPlaytime ?? true,
          show_title: merged.overlayShowTitle ?? true,
          opacity: merged.overlayOpacity ?? 0.92,
          only_track_scanned: merged.onlyTrackScannedGames ?? true,
          scale: 1.0,
        };
        try {
          await httpPostJson(`http://127.0.0.1:${port}/api/v1/games/overlay/settings`, payload, 2000);
        } catch (err) {
          console.warn('[desktop-settings] Failed to sync overlay settings to node:', err);
        }
      }

      return merged;
    },
  );
}
