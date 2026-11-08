import { ipcMain, BrowserWindow } from 'electron';
import { getSettings } from '../desktop-settings';

let mainWindow: BrowserWindow | null = null;

const WINDOW_IPC_CHANNELS = [
  'window:minimize',
  'window:maximize',
  'window:unmaximize',
  'window:close',
  'window:is-maximized',
  'window:set-always-on-top',
  'window:get-always-on-top',
];

export function registerWindowIPC(win: BrowserWindow): void {
  mainWindow = win;

  for (const channel of WINDOW_IPC_CHANNELS) {
    try {
      ipcMain.removeHandler(channel);
    } catch {}
  }

  ipcMain.handle('window:minimize', () => {
    const s = getSettings();
    if (s.minimizeToTray && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    } else {
      mainWindow?.minimize();
    }
  });

  ipcMain.handle('window:maximize', () => {
    mainWindow?.maximize();
  });

  ipcMain.handle('window:unmaximize', () => {
    mainWindow?.unmaximize();
  });

  ipcMain.handle('window:close', () => {
    mainWindow?.close();
  });

  ipcMain.handle('window:is-maximized', (): boolean => {
    return mainWindow?.isMaximized() ?? false;
  });

  ipcMain.handle('window:set-always-on-top', (_event, value: boolean) => {
    mainWindow?.setAlwaysOnTop(value);
  });

  ipcMain.handle('window:get-always-on-top', (): boolean => {
    return mainWindow?.isAlwaysOnTop() ?? false;
  });
}

/** Send a maximized-changed event to the renderer */
export function notifyMaximizedChange(maximized: boolean): void {
  mainWindow?.webContents.send('window:maximized-changed', maximized);
}
