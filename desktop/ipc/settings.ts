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
import { getHostNodeAndHardware, httpGetJson } from '../game/node-hardware';

export function registerDesktopSettingsIPC(
  mainWindow: BrowserWindow,
  tray: Tray | null,
  nodeDaemon?: NodeDaemonManager | null,
): void {
  ipcMain.handle('desktop-settings:get', (): DesktopSettings => {
    return getSettings();
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

      return merged;
    },
  );
}
