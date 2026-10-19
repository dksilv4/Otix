import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { execSync } from 'child_process';
import { getSettings } from '../desktop-settings';

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

export function setAutoDownloadUpdates(enabled: boolean): void {
  autoUpdater.autoDownload = enabled;
}

/**
 * Attempt to resolve a GitHub token to allow checking/downloading releases
 * from private GitHub repositories.
 */
export function resolveGitHubToken(): string | null {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    const settings = getSettings();
    if (settings?.githubToken) return settings.githubToken;
  } catch {
    // ignore
  }
  try {
    const token = execSync('gh auth token', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 1500,
    }).trim();
    if (token) return token;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Configure private feed URL if a token is available.
 */
export function configureAutoUpdaterFeed(): void {
  const token = resolveGitHubToken();
  if (token && typeof autoUpdater.setFeedURL === 'function') {
    try {
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'dksilv4',
        repo: 'Otix',
        private: true,
        token,
      });
      console.log('[updater] Configured private GitHub feed URL with auth token.');
    } catch (err: any) {
      console.warn('[updater] Failed to setFeedURL with token:', err?.message || err);
    }
  }
}

/**
 * Normalize and sanitize updater errors so ugly raw 404/atom XML headers
 * never leak to the renderer or user UI.
 */
export function sanitizeUpdaterError(err: any): string {
  if (err == null) return 'Unknown update error';
  const msg = typeof err === 'string' ? err : err.message || String(err);
  if (
    msg.includes('releases.atom') ||
    msg.includes('authentication token') ||
    (msg.includes('404') && (msg.includes('github.com') || msg.includes('dksilv4/Otix')))
  ) {
    return 'Update check unavailable: GitHub repository is private or requires authentication.';
  }
  return msg;
}

export function registerUpdaterIPC(win: BrowserWindow | null): void {
  mainWindowRef = win;

  if (isInitialized) {
    return;
  }
  isInitialized = true;

  const settings = getSettings();

  // Configure autoUpdater logger
  autoUpdater.logger = {
    info: (...args: any[]) => console.log('[updater]', ...args),
    warn: (...args: any[]) => console.warn('[updater]', ...args),
    error: (...args: any[]) => console.error('[updater]', ...args),
    debug: (...args: any[]) => console.debug('[updater]', ...args),
  };

  // Configure autoUpdater defaults
  autoUpdater.autoDownload = settings.autoDownloadUpdates !== false;
  autoUpdater.autoInstallOnAppQuit = true;

  configureAutoUpdaterFeed();

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
    const errorMsg = sanitizeUpdaterError(err);
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
        error: undefined,
      });
      return {
        status: 'not-available',
        reason: 'Development mode',
        currentVersion: app.getVersion(),
      };
    }
    configureAutoUpdaterFeed();
    try {
      notifyRenderer({ status: 'checking', error: undefined });
      const result = await autoUpdater.checkForUpdates();
      return { status: 'checking', updateInfo: result?.updateInfo };
    } catch (err: any) {
      const errMsg = sanitizeUpdaterError(err);
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
      const errMsg = sanitizeUpdaterError(err);
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
  const settings = getSettings();
  if (settings.autoCheckUpdates === false) {
    console.log('[updater] Automatic startup update check disabled in settings.');
    return;
  }
  if (app.isPackaged) {
    configureAutoUpdaterFeed();
    // Delay check slightly to let app initialize smoothly
    setTimeout(() => {
      console.log('[updater] Performing startup background update check...');
      autoUpdater.checkForUpdates().catch((err) => {
        console.warn('[updater] Background update check error:', sanitizeUpdaterError(err));
      });
    }, 5000);
  }
}
