import { ipcMain, BrowserWindow } from 'electron';

let mainWindow: BrowserWindow | null = null;

export function registerWindowIPC(win: BrowserWindow): void {
  mainWindow = win;

  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
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
