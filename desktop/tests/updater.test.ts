import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';
import {
  registerUpdaterIPC,
  sanitizeUpdaterError,
  setAllowPrerelease,
  setAutoDownloadUpdates,
  startPeriodicUpdateChecks,
  stopPeriodicUpdateChecks,
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
  beforeEach(() => {
    registerUpdaterIPC(null);
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
