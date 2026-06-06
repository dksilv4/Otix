import { ipcMain, BrowserWindow, Tray } from 'electron';
import {
  getSettings,
  saveDesktopSettings,
  applyDesktopSettings,
  type DesktopSettings,
} from '../desktop-settings';

export function registerDesktopSettingsIPC(
  mainWindow: BrowserWindow,
  tray: Tray | null,
): void {
  ipcMain.handle('desktop-settings:get', (): DesktopSettings => {
    return getSettings();
  });

  ipcMain.handle(
    'desktop-settings:set',
    (_event, partial: Partial<DesktopSettings>): DesktopSettings => {
      const current = getSettings();
      const merged: DesktopSettings = { ...current, ...partial };
      saveDesktopSettings(merged);
      applyDesktopSettings(merged, mainWindow, tray);
      return merged;
    },
  );
}
