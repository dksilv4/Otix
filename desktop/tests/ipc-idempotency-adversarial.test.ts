import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Mock electron-updater before imports ───────────────────────────

const { mockAutoUpdater } = vi.hoisted(() => {
  const EventEmitter = require('events');
  const mock = new EventEmitter();
  mock.logger = null;
  mock.autoDownload = true;
  mock.autoInstallOnAppQuit = true;
  mock.allowPrerelease = false;
  mock.setFeedURL = vi.fn();
  mock.checkForUpdates = vi.fn().mockResolvedValue({ updateInfo: { version: '1.0.0' } });
  mock.downloadUpdate = vi.fn().mockResolvedValue([]);
  mock.quitAndInstall = vi.fn();
  return { mockAutoUpdater: mock };
});

vi.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater,
}));

import { ipcMain } from 'electron';
import { registerWindowIPC, notifyMaximizedChange } from '../ipc/window';
import { registerUpdaterIPC, _setUpdateVerifiedForTest } from '../ipc/updater';

describe('Adversarial Stress Test: Idempotent IPC Registration & Window Recreation', () => {
  // Map simulating native Electron registry with strict duplicate check
  const activeHandlers = new Map<string, Function>();

  beforeEach(() => {
    _setUpdateVerifiedForTest(false);

    // Emulate strict Electron behavior where registering without removing throws
    vi.spyOn(ipcMain, 'handle').mockImplementation((channel: string, handler: Function) => {
      if (activeHandlers.has(channel)) {
        throw new Error(`Attempted to register a second handler for '${channel}'`);
      }
      activeHandlers.set(channel, handler);
    });

    vi.spyOn(ipcMain, 'removeHandler').mockImplementation((channel: string) => {
      activeHandlers.delete(channel);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockWindow = (id: number) => {
    return {
      id,
      minimize: vi.fn(),
      maximize: vi.fn(),
      unmaximize: vi.fn(),
      close: vi.fn(),
      isMaximized: vi.fn().mockReturnValue(false),
      setAlwaysOnTop: vi.fn(),
      isAlwaysOnTop: vi.fn().mockReturnValue(false),
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: {
        isDestroyed: vi.fn().mockReturnValue(false),
        send: vi.fn(),
      },
    } as any;
  };

  describe('Window IPC Idempotent Registration & Target Dispatch', () => {
    it('survives repeated registrations across multiple window recreations without throwing duplicate handler errors', () => {
      const win1 = createMockWindow(1);
      const win2 = createMockWindow(2);
      const win3 = createMockWindow(3);

      // Window 1 created
      expect(() => registerWindowIPC(win1)).not.toThrow();

      // Window 1 destroyed and Window 2 recreated
      expect(() => registerWindowIPC(win2)).not.toThrow();

      // Window 2 destroyed and Window 3 recreated
      expect(() => registerWindowIPC(win3)).not.toThrow();
    });

    it('routes IPC actions to the newly recreated window instance and not to previous/destroyed windows', async () => {
      const win1 = createMockWindow(1);
      const win2 = createMockWindow(2);

      // Register initial window
      registerWindowIPC(win1);

      // Simulate window destruction and recreation
      win1.isDestroyed.mockReturnValue(true);
      registerWindowIPC(win2);

      // Invoke window:minimize handler
      const minimizeHandler = activeHandlers.get('window:minimize');
      expect(minimizeHandler).toBeDefined();
      await minimizeHandler!({ sender: {} });

      // Verifies win2 was minimized, win1 was untouched
      expect(win1.minimize).not.toHaveBeenCalled();
      expect(win2.minimize).toHaveBeenCalledTimes(1);

      // Invoke window:maximize handler
      const maximizeHandler = activeHandlers.get('window:maximize');
      await maximizeHandler!({ sender: {} });
      expect(win1.maximize).not.toHaveBeenCalled();
      expect(win2.maximize).toHaveBeenCalledTimes(1);

      // Invoke window:close handler
      const closeHandler = activeHandlers.get('window:close');
      await closeHandler!({ sender: {} });
      expect(win1.close).not.toHaveBeenCalled();
      expect(win2.close).toHaveBeenCalledTimes(1);

      // Invoke window:set-always-on-top
      const topHandler = activeHandlers.get('window:set-always-on-top');
      await topHandler!({ sender: {} }, true);
      expect(win1.setAlwaysOnTop).not.toHaveBeenCalled();
      expect(win2.setAlwaysOnTop).toHaveBeenCalledWith(true);

      // Test notifyMaximizedChange
      notifyMaximizedChange(true);
      expect(win1.webContents.send).not.toHaveBeenCalled();
      expect(win2.webContents.send).toHaveBeenCalledWith('window:maximized-changed', true);
    });

    it('covers all registered window IPC handlers in removeHandler teardown list', () => {
      const registeredChannels: string[] = [];

      vi.spyOn(ipcMain, 'handle').mockImplementation((channel: string, handler: Function) => {
        registeredChannels.push(channel);
        activeHandlers.set(channel, handler);
      });

      const win = createMockWindow(99);
      registerWindowIPC(win);

      expect(registeredChannels).toContain('window:minimize');
      expect(registeredChannels).toContain('window:maximize');
      expect(registeredChannels).toContain('window:unmaximize');
      expect(registeredChannels).toContain('window:close');
      expect(registeredChannels).toContain('window:is-maximized');
      expect(registeredChannels).toContain('window:set-always-on-top');
      expect(registeredChannels).toContain('window:get-always-on-top');

      // Calling registerWindowIPC again must cleanly remove every single one of them
      expect(() => registerWindowIPC(win)).not.toThrow();
    });
  });

  describe('Updater IPC Idempotent Registration & Window Recreation', () => {
    it('survives repeated updater IPC registrations without duplicate handler errors', () => {
      const win1 = createMockWindow(1);
      const win2 = createMockWindow(2);

      // Initial registration
      expect(() => registerUpdaterIPC(win1)).not.toThrow();

      // Second registration on window reload / recreation
      expect(() => registerUpdaterIPC(win2)).not.toThrow();

      // Third registration on null window (headless / minimized to tray)
      expect(() => registerUpdaterIPC(null)).not.toThrow();
    });

    it('allows clean invocation of updater IPC handlers after repeated re-registrations', async () => {
      const win1 = createMockWindow(1);
      const win2 = createMockWindow(2);

      registerUpdaterIPC(win1);
      registerUpdaterIPC(win2);

      const statusHandler = activeHandlers.get('updater:get-status');
      expect(statusHandler).toBeDefined();
      const status = await statusHandler!({ sender: {} });
      expect(status).toBeDefined();
      expect(status.status).toBe('idle');

      const versionHandler = activeHandlers.get('updater:get-version');
      expect(versionHandler).toBeDefined();
      const version = await versionHandler!({ sender: {} });
      expect(version).toBe('0.1.0');
    });

    it('routes background updater events to the active recreated window', () => {
      const win1 = createMockWindow(1);
      const win2 = createMockWindow(2);

      registerUpdaterIPC(win1);

      // Window 1 is closed, Window 2 is recreated
      win1.isDestroyed.mockReturnValue(true);
      registerUpdaterIPC(win2);

      // Emit autoUpdater status event
      mockAutoUpdater.emit('checking-for-update');

      // win1 is destroyed and must not receive messages
      expect(win1.webContents.send).not.toHaveBeenCalled();

      // win2 is active and receives the updated status event
      expect(win2.webContents.send).toHaveBeenCalledWith(
        'updater:status-changed',
        expect.objectContaining({ status: 'checking' }),
      );
    });
  });
});
