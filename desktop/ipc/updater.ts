import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { execSync } from 'child_process';
import { getSettings } from '../desktop-settings';
import { setTrayUpdaterState } from '../tray';

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
let startupCheckTimeout: NodeJS.Timeout | null = null;
let periodicCheckTimer: NodeJS.Timeout | null = null;

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
  try {
    setTrayUpdaterState(currentPayload);
  } catch {
    // tray may not be initialized yet
  }
}

export function setAutoDownloadUpdates(enabled: boolean): void {
  autoUpdater.autoDownload = enabled;
}

export function setAllowPrerelease(enabled: boolean): void {
  autoUpdater.allowPrerelease = enabled;
}

/**
 * Attempt to resolve a GitHub token to allow checking/downloading releases
 * from private GitHub repositories.
 */
export function resolveGitHubToken(): string | null {
  if (process.env.GH_TOKEN && process.env.GH_TOKEN.trim()) {
    return process.env.GH_TOKEN.trim();
  }
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim()) {
    return process.env.GITHUB_TOKEN.trim();
  }
  try {
    const settings = getSettings();
    if (settings?.githubToken && settings.githubToken.trim()) {
      return settings.githubToken.trim();
    }
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
 * Configure autoUpdater feed URL for public GitHub releases.
 */
export function configureAutoUpdaterFeed(): void {
  if (typeof autoUpdater.setFeedURL === 'function') {
    try {
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'dksilv4',
        repo: 'Otix',
      });
      console.log('[updater] Configured public GitHub feed URL.');
    } catch (err: any) {
      console.warn('[updater] Failed to configure feed URL:', err?.message || err);
    }
  }
}

/**
 * Test connectivity against the GitHub releases API.
 */
export async function validateGitHubToken(token?: string): Promise<{
  valid: boolean;
  repo?: string;
  error?: string;
}> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Otix-Desktop-Updater',
      Accept: 'application/vnd.github.v3+json',
    };
    if (token?.trim()) {
      headers.Authorization = `Bearer ${token.trim()}`;
    }
    const res = await fetch('https://api.github.com/repos/dksilv4/Otix', { headers });
    if (res.ok) {
      const data = (await res.json()) as any;
      return {
        valid: true,
        repo: data?.full_name || 'dksilv4/Otix',
      };
    }
    return { valid: false, error: `GitHub API returned ${res.status}: ${res.statusText}` };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'Failed to reach GitHub API.' };
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
    (msg.includes('404') && (msg.includes('github.com') || msg.includes('dksilv4/Otix')))
  ) {
    return 'Update check unavailable: release servers returned 404.';
  }
  if (
    msg.includes('403') ||
    msg.includes('rate limit exceeded')
  ) {
    return 'GitHub API rate limit exceeded. Please try again later.';
  }
  if (
    msg.includes('ERR_INTERNET_DISCONNECTED') ||
    msg.includes('ERR_NAME_NOT_RESOLVED') ||
    msg.includes('ENOTFOUND')
  ) {
    return 'Network error: Unable to reach update servers. Check your connection.';
  }
  if (msg.includes('ETIMEDOUT')) {
    return 'Connection timed out while checking for updates.';
  }
  if (msg.includes('sha512 checksum mismatch')) {
    return 'Update package verification failed: Checksum mismatch.';
  }
  return msg;
}

export async function triggerManualUpdateCheck(): Promise<{
  status: UpdateStatus;
  updateInfo?: any;
  error?: string;
  reason?: string;
  currentVersion?: string;
}> {
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
  if (currentPayload.status === 'checking') {
    return { status: 'checking' };
  }
  if (currentPayload.status === 'downloading') {
    return { status: 'downloading' };
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
}

export async function downloadAvailableUpdate(): Promise<{
  status: UpdateStatus;
  error?: string;
  reason?: string;
}> {
  if (!app.isPackaged) {
    return { status: 'not-available', reason: 'Development mode' };
  }
  if (currentPayload.status === 'downloading') {
    return { status: 'downloading' };
  }
  if (currentPayload.status === 'downloaded') {
    return { status: 'downloaded' };
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
}

export function installDownloadedUpdate(): boolean {
  if (currentPayload.status === 'downloaded') {
    console.log('[updater] Quitting and installing update...');
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { markAppQuitting } = require('../main');
      markAppQuitting?.();
    } catch {
      // ignore
    }
    autoUpdater.quitAndInstall(false, true);
    return true;
  }
  return false;
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
  autoUpdater.allowPrerelease = settings.allowPrerelease === true;

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
    let notes: string | null = currentPayload.releaseNotes ?? null;
    if (typeof info?.releaseNotes === 'string') {
      notes = info.releaseNotes;
    } else if (Array.isArray(info?.releaseNotes)) {
      notes = info.releaseNotes
        .map((r: any) => (typeof r === 'string' ? r : r?.note || ''))
        .filter(Boolean)
        .join('\n');
    }

    notifyRenderer({
      status: 'not-available',
      version: info.version,
      releaseNotes: notes,
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
    let notes: string | null = currentPayload.releaseNotes ?? null;
    if (typeof info?.releaseNotes === 'string') {
      notes = info.releaseNotes;
    } else if (Array.isArray(info?.releaseNotes)) {
      notes = info.releaseNotes
        .map((r: any) => (typeof r === 'string' ? r : r?.note || ''))
        .filter(Boolean)
        .join('\n');
    }

    notifyRenderer({
      status: 'downloaded',
      version: info.version,
      releaseNotes: notes,
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
    return triggerManualUpdateCheck();
  });

  ipcMain.handle('updater:download-update', async () => {
    return downloadAvailableUpdate();
  });

  ipcMain.handle('updater:install-update', () => {
    return installDownloadedUpdate();
  });

  ipcMain.handle('updater:validate-token', async (_event, token?: string) => {
    return validateGitHubToken(token);
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
    if (startupCheckTimeout) clearTimeout(startupCheckTimeout);
    startupCheckTimeout = setTimeout(() => {
      console.log('[updater] Performing startup background update check...');
      autoUpdater.checkForUpdates().catch((err) => {
        console.warn('[updater] Background update check error:', sanitizeUpdaterError(err));
      });
    }, 1200);
  }
}

export function startPeriodicUpdateChecks(intervalMs: number = 4 * 60 * 60 * 1000): void {
  stopPeriodicUpdateChecks();
  const settings = getSettings();
  if (settings.autoCheckUpdates === false) {
    return;
  }
  if (!app.isPackaged) {
    return;
  }
  periodicCheckTimer = setInterval(() => {
    console.log('[updater] Performing periodic background update check...');
    configureAutoUpdaterFeed();
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[updater] Periodic background update check error:', sanitizeUpdaterError(err));
    });
  }, intervalMs);
  if (periodicCheckTimer.unref) {
    periodicCheckTimer.unref();
  }
}

export function stopPeriodicUpdateChecks(): void {
  if (periodicCheckTimer) {
    clearInterval(periodicCheckTimer);
    periodicCheckTimer = null;
  }
  if (startupCheckTimeout) {
    clearTimeout(startupCheckTimeout);
    startupCheckTimeout = null;
  }
}
