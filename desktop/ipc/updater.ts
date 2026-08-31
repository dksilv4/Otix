import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateStatePayload {
  status: UpdateStatus;
  version?: string;
  releaseNotes?: string | null;
  progress?: {
    percent: number;
    bytesPerSecond: number;
    transferred: number;
    total: number;
  };
  error?: string;
}

let mainWindowRef: BrowserWindow | null = null;
let currentStatus: UpdateStatus = 'idle';

function notifyRenderer(payload: UpdateStatePayload): void {
  currentStatus = payload.status;
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('updater:status-changed', payload);
  }
}

export function registerUpdaterIPC(win: BrowserWindow | null): void {
  mainWindowRef = win;

  // Configure autoUpdater
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    notifyRenderer({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    notifyRenderer({
      status: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    notifyRenderer({
      status: 'not-available',
      version: info.version,
    });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    notifyRenderer({
      status: 'downloading',
      progress: {
        percent: progressObj.percent,
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total,
      },
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    notifyRenderer({
      status: 'downloaded',
      version: info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    notifyRenderer({
      status: 'error',
      error: err == null ? 'Unknown update error' : (err.message || String(err)),
    });
  });

  // Handle IPC calls from renderer
  ipcMain.handle('updater:check-for-updates', async () => {
    if (!app.isPackaged) {
      return { status: 'not-available', reason: 'Development mode' };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return { status: 'checking', updateInfo: result?.updateInfo };
    } catch (err: any) {
      return { status: 'error', error: err?.message || String(err) };
    }
  });

  ipcMain.handle('updater:install-update', () => {
    if (currentStatus === 'downloaded') {
      autoUpdater.quitAndInstall();
      return true;
    }
    return false;
  });

  ipcMain.handle('updater:get-version', () => {
    return app.getVersion();
  });
}

export function checkForUpdatesOnStartup(): void {
  if (app.isPackaged) {
    // Delay check slightly to let app initialize smoothly
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.warn('[updater] Background update check error:', err?.message || err);
      });
    }, 5000);
  }
}
