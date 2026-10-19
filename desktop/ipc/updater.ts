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
let isInitialized = false;

let currentPayload: UpdateStatePayload = {
  status: 'idle',
  version: undefined,
  releaseNotes: null,
  progress: undefined,
  error: undefined,
};

function notifyRenderer(payload: Partial<UpdateStatePayload> & { status: UpdateStatus }): void {
  currentPayload = {
    ...currentPayload,
    ...payload,
  };
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('updater:status-changed', currentPayload);
  }
}

export function registerUpdaterIPC(win: BrowserWindow | null): void {
  mainWindowRef = win;

  if (isInitialized) {
    return;
  }
  isInitialized = true;

  // Configure autoUpdater logger
  autoUpdater.logger = {
    info: (...args: any[]) => console.log('[updater]', ...args),
    warn: (...args: any[]) => console.warn('[updater]', ...args),
    error: (...args: any[]) => console.error('[updater]', ...args),
    debug: (...args: any[]) => console.debug('[updater]', ...args),
  };

  // Configure autoUpdater defaults
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    notifyRenderer({ status: 'checking', error: undefined });
  });

  autoUpdater.on('update-available', (info) => {
    let notes: string | null = null;
    if (typeof info.releaseNotes === 'string') {
      notes = info.releaseNotes;
    } else if (Array.isArray(info.releaseNotes)) {
      notes = info.releaseNotes
        .map((r: any) => (typeof r === 'string' ? r : r?.note || ''))
        .filter(Boolean)
        .join('\n');
    }

    notifyRenderer({
      status: 'available',
      version: info.version,
      releaseNotes: notes,
      error: undefined,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    notifyRenderer({
      status: 'not-available',
      version: info.version,
      error: undefined,
    });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    notifyRenderer({
      status: 'downloading',
      progress: {
        percent: Math.round(progressObj.percent * 10) / 10,
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
      error: undefined,
    });
  });

  autoUpdater.on('error', (err) => {
    const errorMsg = err == null ? 'Unknown update error' : (err.message || String(err));
    notifyRenderer({
      status: 'error',
      error: errorMsg,
    });
  });

  // Handle IPC calls from renderer
  ipcMain.handle('updater:get-status', () => {
    return currentPayload;
  });

  ipcMain.handle('updater:get-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('updater:check-for-updates', async () => {
    if (!app.isPackaged) {
      notifyRenderer({
        status: 'not-available',
        error: 'Updates are only checked in packaged app releases.',
      });
      return {
        status: 'not-available',
        reason: 'Development mode',
        currentVersion: app.getVersion(),
      };
    }
    try {
      notifyRenderer({ status: 'checking', error: undefined });
      const result = await autoUpdater.checkForUpdates();
      return { status: 'checking', updateInfo: result?.updateInfo };
    } catch (err: any) {
      const errMsg = err == null ? 'Unknown update error' : (err.message || String(err));
      notifyRenderer({ status: 'error', error: errMsg });
      return { status: 'error', error: errMsg };
    }
  });

  ipcMain.handle('updater:download-update', async () => {
    if (!app.isPackaged) {
      return { status: 'not-available', reason: 'Development mode' };
    }
    try {
      notifyRenderer({ status: 'downloading', error: undefined });
      await autoUpdater.downloadUpdate();
      return { status: 'downloading' };
    } catch (err: any) {
      const errMsg = err == null ? 'Unknown download error' : (err.message || String(err));
      notifyRenderer({ status: 'error', error: errMsg });
      return { status: 'error', error: errMsg };
    }
  });

  ipcMain.handle('updater:install-update', () => {
    if (currentPayload.status === 'downloaded') {
      console.log('[updater] Quitting and installing update...');
      autoUpdater.quitAndInstall(false, true);
      return true;
    }
    return false;
  });
}

export function checkForUpdatesOnStartup(): void {
  if (app.isPackaged) {
    // Delay check slightly to let app initialize smoothly
    setTimeout(() => {
      console.log('[updater] Performing startup background update check...');
      autoUpdater.checkForUpdates().catch((err) => {
        console.warn('[updater] Background update check error:', err?.message || err);
      });
    }, 5000);
  }
}

