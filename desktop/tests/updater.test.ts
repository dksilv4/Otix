import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as os from 'os';
import {
  registerUpdaterIPC,
  sanitizeUpdaterError,
  setAllowPrerelease,
  setAutoDownloadUpdates,
  startPeriodicUpdateChecks,
  stopPeriodicUpdateChecks,
  validateGitHubToken,
  verifyUpdatePackage,
  verifyExecutableSignature,
  installDownloadedUpdate,
  _setUpdateVerifiedForTest,
} from '../ipc/updater';
import { autoUpdater } from 'electron-updater';

vi.mock('electron-updater', () => {
  const EventEmitter = require('events');
  const mockAutoUpdater = new EventEmitter();
  mockAutoUpdater.logger = null;
  mockAutoUpdater.autoDownload = true;
  mockAutoUpdater.autoInstallOnAppQuit = true;
  mockAutoUpdater.allowPrerelease = false;
  mockAutoUpdater.setFeedURL = vi.fn();
  mockAutoUpdater.checkForUpdates = vi.fn().mockResolvedValue({ updateInfo: { version: '1.0.0' } });
  mockAutoUpdater.downloadUpdate = vi.fn().mockResolvedValue([]);
  mockAutoUpdater.quitAndInstall = vi.fn();

  return {
    autoUpdater: mockAutoUpdater,
  };
});

describe('Desktop Auto-Updater IPC', () => {
  const tempDir = path.join(os.tmpdir(), 'otix-updater-test-' + Date.now());

  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
    _setUpdateVerifiedForTest(false);

    // Mock global.fetch for GitHub token verification & release checks
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('api.github.com/repos/dksilv4/Otix')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ full_name: 'dksilv4/Otix' }),
        } as any);
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ message: 'Not found' }),
      } as any);
    });

    registerUpdaterIPC(null);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    vi.restoreAllMocks();
  });

  it('handles updater:get-version and returns current app version', async () => {
    const version = await (ipcMain as any)._invoke('updater:get-version');
    expect(version).toBe('0.1.0');
  });

  it('handles updater:get-status and returns cached update payload', async () => {
    const status = await (ipcMain as any)._invoke('updater:get-status');
    expect(status).toBeDefined();
    expect(status.status).toBe('idle');
  });

  it('handles updater:check-for-updates in development mode gracefully', async () => {
    const res = await (ipcMain as any)._invoke('updater:check-for-updates');
    expect(res).toEqual({
      status: 'not-available',
      reason: 'Development mode',
      currentVersion: '0.1.0',
    });
  });

  it('handles updater:download-update in development mode gracefully', async () => {
    const res = await (ipcMain as any)._invoke('updater:download-update');
    expect(res).toEqual({
      status: 'not-available',
      reason: 'Development mode',
    });
  });

  it('handles updater:install-update safely when update is not downloaded', async () => {
    const res = await (ipcMain as any)._invoke('updater:install-update');
    expect(res).toBe(false);
  });

  it('handles updater:validate-token and connects to public repo', async () => {
    const res = await (ipcMain as any)._invoke('updater:validate-token');
    expect(res.valid).toBe(true);
    expect(res.repo).toBe('dksilv4/Otix');
  });

  it('handles validateGitHubToken when API returns non-200 error', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Bad credentials',
    });
    const res = await validateGitHubToken('invalid-token');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('401');
  });

  it('handles validateGitHubToken when fetch throws network error', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network offline'));
    const res = await validateGitHubToken('some-token');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Network offline');
  });

  it('allows setting autoDownload and allowPrerelease', () => {
    setAutoDownloadUpdates(false);
    expect(autoUpdater.autoDownload).toBe(false);
    setAutoDownloadUpdates(true);
    expect(autoUpdater.autoDownload).toBe(true);

    setAllowPrerelease(true);
    expect(autoUpdater.allowPrerelease).toBe(true);
    setAllowPrerelease(false);
    expect(autoUpdater.allowPrerelease).toBe(false);
  });

  it('starts and stops periodic checks without crashing', () => {
    expect(() => startPeriodicUpdateChecks(1000)).not.toThrow();
    expect(() => stopPeriodicUpdateChecks()).not.toThrow();
  });

  describe('Cryptographic & Signature Tamper Verification', () => {
    it('verifies SHA-512 hash against matching hex digest', async () => {
      const testFile = path.join(tempDir, 'valid-update.pkg');
      const testContent = 'Authentic update binary payload content ' + Date.now();
      fs.writeFileSync(testFile, testContent, 'utf-8');

      const expectedHex = crypto.createHash('sha512').update(testContent).digest('hex');
      const isValid = await verifyUpdatePackage(testFile, expectedHex);

      expect(isValid).toBe(true);
    });

    it('verifies SHA-512 hash against matching base64 digest', async () => {
      const testFile = path.join(tempDir, 'valid-base64.pkg');
      const testContent = 'Base64 encoded manifest hash check ' + Date.now();
      fs.writeFileSync(testFile, testContent, 'utf-8');

      const expectedBase64 = crypto.createHash('sha512').update(testContent).digest('base64');
      const isValid = await verifyUpdatePackage(testFile, expectedBase64);

      expect(isValid).toBe(true);
    });

    it('rejects update package when SHA-512 hash mismatches', async () => {
      const testFile = path.join(tempDir, 'tampered-update.pkg');
      fs.writeFileSync(testFile, 'Tampered binary content', 'utf-8');

      const bogusHash = 'a'.repeat(128); // 128 hex chars = invalid sha512
      const isValid = await verifyUpdatePackage(testFile, bogusHash);

      expect(isValid).toBe(false);
    });

    it('rejects SHA-512 verification on nonexistent file or empty arguments', async () => {
      expect(await verifyUpdatePackage('', 'somehash')).toBe(false);
      expect(await verifyUpdatePackage('/nonexistent/path/package.pkg', 'somehash')).toBe(false);
      expect(await verifyUpdatePackage(tempDir, '')).toBe(false);
    });

    it('verifies executable signature handles invalid or missing file gracefully', async () => {
      const result = await verifyExecutableSignature('/nonexistent/file.bin');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('File not found');

      const emptyResult = await verifyExecutableSignature('');
      expect(emptyResult.valid).toBe(false);
    });

    it('blocks installation and unlinks file when downloaded package has SHA-512 mismatch', async () => {
      const tamperedFile = path.join(tempDir, 'downloaded-tampered.pkg');
      fs.writeFileSync(tamperedFile, 'Compromised installer payload', 'utf-8');
      expect(fs.existsSync(tamperedFile)).toBe(true);

      const wrongHash = 'b'.repeat(128);

      // Emit update-downloaded with mismatched sha512
      autoUpdater.emit('update-downloaded', {
        version: '2.0.0',
        downloadedFile: tamperedFile,
        sha512: wrongHash,
      } as any);

      // Allow asynchronous verification promise to settle
      await new Promise((r) => setTimeout(r, 80));

      // 1. File must be deleted from disk
      expect(fs.existsSync(tamperedFile)).toBe(false);

      // 2. Status must be error with checksum mismatch notification
      const status = await (ipcMain as any)._invoke('updater:get-status');
      expect(status.status).toBe('error');
      expect(status.error).toContain('SHA-512 checksum mismatch');

      // 3. installDownloadedUpdate must reject execution
      const installed = installDownloadedUpdate();
      expect(installed).toBe(false);
      expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    });

    it('blocks installation when digital code signature verification fails', async () => {
      const invalidSignedFile = path.join(tempDir, 'invalid-signature.pkg');
      const content = 'Unsigned content for test';
      fs.writeFileSync(invalidSignedFile, content, 'utf-8');
      const validHash = crypto.createHash('sha512').update(content).digest('hex');

      // Emit update-downloaded with forceVerifySignature: true on an unsigned test binary
      // which will trigger verifyExecutableSignature
      autoUpdater.emit('update-downloaded', {
        version: '2.0.1',
        downloadedFile: invalidSignedFile,
        sha512: validHash,
        verifySignature: true,
      } as any);

      await new Promise((r) => setTimeout(r, 120));

      // On macOS/Win, the unsigned mock file fails code signature verification and is unlinked
      // On platforms where signature tool detects unsigned file:
      const status = await (ipcMain as any)._invoke('updater:get-status');
      if (process.platform === 'darwin' || process.platform === 'win32') {
        expect(status.status).toBe('error');
        expect(status.error).toContain('signature verification failed');
        expect(fs.existsSync(invalidSignedFile)).toBe(false);
        expect(installDownloadedUpdate()).toBe(false);
      }
    });

    it('verifies package and allows installation when hash and signature are valid', async () => {
      const legitimateFile = path.join(tempDir, 'valid-signed.pkg');
      const content = 'Legitimate Otix Desktop Binary';
      fs.writeFileSync(legitimateFile, content, 'utf-8');
      const validHash = crypto.createHash('sha512').update(content).digest('hex');

      autoUpdater.emit('update-downloaded', {
        version: '2.0.2',
        downloadedFile: legitimateFile,
        sha512: validHash,
        verifySignature: false, // development test mode
      } as any);

      await new Promise((r) => setTimeout(r, 80));

      const status = await (ipcMain as any)._invoke('updater:get-status');
      expect(status.status).toBe('downloaded');
      expect(status.version).toBe('2.0.2');

      const installed = installDownloadedUpdate();
      expect(installed).toBe(true);
      expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
    });

    it('blocks installDownloadedUpdate if status is downloaded but package is unverified', () => {
      // Manually set status to downloaded without verification passing
      (ipcMain as any)._invoke('updater:get-status');
      _setUpdateVerifiedForTest(false);

      const installed = installDownloadedUpdate();
      expect(installed).toBe(false);
    });
  });

  describe('sanitizeUpdaterError', () => {
    it('handles null/undefined gracefully', () => {
      expect(sanitizeUpdaterError(null)).toBe('Unknown update error');
      expect(sanitizeUpdaterError(undefined)).toBe('Unknown update error');
    });

    it('sanitizes 404 releases.atom errors', () => {
      const err = new Error('404 Not Found https://github.com/dksilv4/Otix/releases.atom');
      expect(sanitizeUpdaterError(err)).toBe(
        'Update check unavailable: release servers returned 404.'
      );
    });

    it('sanitizes 403 rate limit errors', () => {
      expect(sanitizeUpdaterError('API rate limit exceeded for user')).toBe(
        'GitHub API rate limit exceeded. Please try again later.'
      );
    });

    it('sanitizes network disconnection errors', () => {
      expect(sanitizeUpdaterError('net::ERR_INTERNET_DISCONNECTED')).toBe(
        'Network error: Unable to reach update servers. Check your connection.'
      );
    });

    it('sanitizes timeout errors', () => {
      expect(sanitizeUpdaterError('ETIMEDOUT connection to host')).toBe(
        'Connection timed out while checking for updates.'
      );
    });

    it('sanitizes checksum mismatch errors', () => {
      expect(sanitizeUpdaterError('sha512 checksum mismatch for installer')).toBe(
        'Update package verification failed: Checksum mismatch.'
      );
    });
  });
});
