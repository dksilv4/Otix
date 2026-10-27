import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { execSync, execFile } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
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
let isUpdateVerified = false;

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

/**
 * Pre-installation cryptographic SHA-512 hash verification of the downloaded installer
 * against expected SHA-512 from the release manifest.
 * Supports both base64 and hex encoded SHA-512 digests.
 */
export async function verifyUpdatePackage(filePath: string, expectedSha512: string): Promise<boolean> {
  if (!filePath || !expectedSha512) {
    return false;
  }
  if (!fs.existsSync(filePath)) {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    try {
      const hash = crypto.createHash('sha512');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (chunk) => {
        hash.update(chunk);
      });

      stream.on('end', () => {
        const digestBuffer = hash.digest();
        const hexDigest = digestBuffer.toString('hex').toLowerCase();
        const base64Digest = digestBuffer.toString('base64');

        const cleanExpected = expectedSha512.trim();
        const cleanExpectedLower = cleanExpected.toLowerCase();

        const matches =
          cleanExpectedLower === hexDigest ||
          cleanExpected === base64Digest;

        resolve(matches);
      });

      stream.on('error', (err) => {
        console.error('[updater] Error reading file for SHA-512 verification:', err);
        resolve(false);
      });
    } catch (err) {
      console.error('[updater] Exception during SHA-512 verification stream setup:', err);
      resolve(false);
    }
  });
}

/**
 * OS-level digital code signature verification using native platform tooling:
 * - macOS: /usr/bin/codesign -v --strict
 * - Windows: PowerShell Get-AuthenticodeSignature
 * - Linux: GPG signature verification or filesystem accessibility check
 */
export async function verifyExecutableSignature(filePath: string): Promise<{ valid: boolean; reason?: string }> {
  if (!filePath) {
    return { valid: false, reason: 'Missing executable file path' };
  }
  if (!fs.existsSync(filePath)) {
    return { valid: false, reason: `File not found: ${filePath}` };
  }

  const platform = process.platform;

  if (platform === 'darwin') {
    return new Promise((resolve) => {
      execFile('/usr/bin/codesign', ['--verify', '--strict', '--verbose=2', filePath], (error, stdout, stderr) => {
        if (error) {
          const detail = (stderr || stdout || error.message).trim();
          console.warn(`[updater] macOS codesign check failed for ${filePath}: ${detail}`);
          return resolve({ valid: false, reason: `macOS code signature invalid: ${detail}` });
        }
        resolve({ valid: true });
      });
    });
  }

  if (platform === 'win32') {
    return new Promise((resolve) => {
      const escapedPath = filePath.replace(/'/g, "''");
      const psScript = `(Get-AuthenticodeSignature -FilePath '${escapedPath}').Status.ToString()`;
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
        (error, stdout, stderr) => {
          if (error) {
            const detail = (stderr || stdout || error.message).trim();
            console.warn(`[updater] Authenticode check failed for ${filePath}: ${detail}`);
            return resolve({ valid: false, reason: `Windows Authenticode verification error: ${detail}` });
          }
          const status = stdout.trim();
          if (status === 'Valid') {
            resolve({ valid: true });
          } else {
            resolve({ valid: false, reason: `Windows Authenticode status not valid: ${status || 'Unknown'}` });
          }
        },
      );
    });
  }

  if (platform === 'linux') {
    return new Promise((resolve) => {
      const sigPath = `${filePath}.sig`;
      const ascPath = `${filePath}.asc`;
      const checkPath = fs.existsSync(sigPath) ? sigPath : (fs.existsSync(ascPath) ? ascPath : null);

      if (checkPath) {
        execFile('gpg', ['--verify', checkPath, filePath], (error, stdout, stderr) => {
          if (error) {
            const detail = (stderr || stdout || error.message).trim();
            return resolve({ valid: false, reason: `Linux GPG verification failed: ${detail}` });
          }
          resolve({ valid: true });
        });
      } else {
        try {
          fs.accessSync(filePath, fs.constants.R_OK);
          resolve({ valid: true });
        } catch (err: any) {
          resolve({ valid: false, reason: `Linux file accessibility check failed: ${err.message}` });
        }
      }
    });
  }

  return { valid: true };
}

export function _setUpdateVerifiedForTest(verified: boolean): void {
  isUpdateVerified = verified;
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
    if (!isUpdateVerified) {
      console.warn('[updater] Installation rejected: update package has not passed tamper verification.');
      notifyRenderer({
        status: 'error',
        error: 'Update installation blocked: package failed verification.',
      });
      return false;
    }

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

  autoUpdater.on('update-downloaded', async (info: any) => {
    let notes: string | null = currentPayload.releaseNotes ?? null;
    if (typeof info?.releaseNotes === 'string') {
      notes = info.releaseNotes;
    } else if (Array.isArray(info?.releaseNotes)) {
      notes = info.releaseNotes
        .map((r: any) => (typeof r === 'string' ? r : r?.note || ''))
        .filter(Boolean)
        .join('\n');
    }

    const downloadedFilePath = info?.downloadedFile;
    const expectedSha512 =
      info?.sha512 ||
      (Array.isArray(info?.files) ? info.files.find((f: any) => f?.sha512)?.sha512 : undefined);

    isUpdateVerified = false;

    // Perform pre-installation cryptographic & signature verification
    if (downloadedFilePath) {
      // 1. SHA-512 cryptographic hash verification
      if (expectedSha512) {
        const hashValid = await verifyUpdatePackage(downloadedFilePath, expectedSha512);
        if (!hashValid) {
          console.error(`[updater] Tamper alert: SHA-512 checksum mismatch for ${downloadedFilePath}`);
          try {
            if (fs.existsSync(downloadedFilePath)) {
              fs.unlinkSync(downloadedFilePath);
              console.log(`[updater] Deleted tampered update file from disk: ${downloadedFilePath}`);
            }
          } catch (delErr: any) {
            console.error('[updater] Failed to delete tampered file:', delErr);
          }
          notifyRenderer({
            status: 'error',
            error: 'Update package verification failed: SHA-512 checksum mismatch. The update may be corrupted or tampered with.',
          });
          return;
        }
      }

      // 2. OS-level digital signature verification
      const shouldVerifySignature = app.isPackaged || Boolean(info?.verifySignature);
      if (shouldVerifySignature) {
        const sigResult = await verifyExecutableSignature(downloadedFilePath);
        if (!sigResult.valid) {
          console.error(`[updater] Tamper alert: Digital code signature invalid for ${downloadedFilePath}: ${sigResult.reason}`);
          try {
            if (fs.existsSync(downloadedFilePath)) {
              fs.unlinkSync(downloadedFilePath);
              console.log(`[updater] Deleted invalidly-signed update file from disk: ${downloadedFilePath}`);
            }
          } catch (delErr: any) {
            console.error('[updater] Failed to delete invalidly-signed file:', delErr);
          }
          notifyRenderer({
            status: 'error',
            error: `Update package signature verification failed: ${sigResult.reason || 'Invalid digital signature'}.`,
          });
          return;
        }
      }
    }

    isUpdateVerified = true;

    notifyRenderer({
      status: 'downloaded',
      version: info?.version,
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
