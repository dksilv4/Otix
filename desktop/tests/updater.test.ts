import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';
import { registerUpdaterIPC } from '../ipc/updater';

vi.mock('electron-updater', () => {
  const EventEmitter = require('events');
  const mockAutoUpdater = new EventEmitter();
  mockAutoUpdater.logger = null;
  mockAutoUpdater.autoDownload = true;
  mockAutoUpdater.autoInstallOnAppQuit = true;
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
});
