import { ipcMain, BrowserWindow, Tray } from 'electron';
import {
  getSettings,
  saveDesktopSettings,
  applyDesktopSettings,
  type DesktopSettings,
} from '../desktop-settings';

import type { NodeDaemonManager } from '../node-daemon';

export function registerDesktopSettingsIPC(
  mainWindow: BrowserWindow,
  tray: Tray | null,
  nodeDaemon?: NodeDaemonManager | null,
): void {
  ipcMain.handle('desktop-settings:get', (): DesktopSettings => {
    return getSettings();
  });

  ipcMain.handle(
    'desktop-settings:set',
    async (_event, partial: Partial<DesktopSettings>): Promise<DesktopSettings> => {
      const current = getSettings();
      const merged: DesktopSettings = { ...current, ...partial };
      saveDesktopSettings(merged);
      applyDesktopSettings(merged, mainWindow, tray);

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
