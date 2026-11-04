import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { app, ipcMain, dialog } from 'electron';
import { registerAppInstallerIPC } from '../ipc/app-installer';

// Mock child_process for registry, powershell, and process spawning
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    exec: vi.fn((cmd, cb) => {
      if (typeof cb === 'function') {
        cb(null, 'C:\\Users\\MockUser\\Desktop', '');
      }
    }),
    execSync: vi.fn(() => Buffer.from('')),
    spawn: vi.fn(() => ({
      unref: vi.fn(),
    })),
  };
});

describe('App Installer IPC Suite (New Otix Setup)', () => {
  let mockWindow: any;
  let sentEvents: Array<{ channel: string; payload: any }>;
  const tempInstallDir = path.join(os.tmpdir(), 'otix-test-install-' + Date.now());
  const tempSourceDir = path.join(os.tmpdir(), 'otix-test-source-' + Date.now());

  beforeEach(() => {
    sentEvents = [];
    mockWindow = {
      isDestroyed: vi.fn(() => false),
      minimize: vi.fn(),
      close: vi.fn(),
      webContents: {
        send: vi.fn((channel: string, payload: any) => {
          sentEvents.push({ channel, payload });
        }),
      },
    };

    // Setup mock source dir for instant copy tests
    const resourcesDir = path.join(tempSourceDir, 'resources');
    fs.mkdirSync(resourcesDir, { recursive: true });
    fs.writeFileSync(path.join(tempSourceDir, 'Otix.exe'), 'mock binary');
    fs.writeFileSync(path.join(tempSourceDir, 'package.json'), '{}');
    (process as any).resourcesPath = resourcesDir;

    app.getVersion = vi.fn(() => '0.1.26');
    app.getAppPath = vi.fn(() => tempSourceDir);
    app.getPath = vi.fn((name: string) => path.join(tempSourceDir, name));
    Object.defineProperty(app, 'isPackaged', { value: true, configurable: true, writable: true });
    app.quit = vi.fn();
    (dialog as any).showOpenDialog = vi.fn();

    registerAppInstallerIPC(mockWindow);
  });

  afterEach(() => {
    delete (process as any).resourcesPath;
    Object.defineProperty(app, 'isPackaged', { value: false, configurable: true, writable: true });

    if (fs.existsSync(tempInstallDir)) {
      try {
        fs.rmSync(tempInstallDir, { recursive: true, force: true });
      } catch {}
    }
    if (fs.existsSync(tempSourceDir)) {
      try {
        fs.rmSync(tempSourceDir, { recursive: true, force: true });
      } catch {}
    }
    vi.restoreAllMocks();
  });

  describe('Bootstrap stubs and Window controls', () => {
    it('provides safe fallback stubs for renderer bootstrap in installer mode', async () => {
      expect(await (ipcMain as any)._invoke('ping')).toBe('pong');
      expect(await (ipcMain as any)._invoke('cache:load')).toBeNull();
      expect(await (ipcMain as any)._invoke('desktop-settings:get')).toEqual({});
      expect(await (ipcMain as any)._invoke('installer:get-active-installs')).toEqual([]);
      expect(await (ipcMain as any)._invoke('updater:get-status')).toEqual({ status: 'idle' });
      expect(await (ipcMain as any)._invoke('node-daemon:get-status')).toEqual({
        running: false,
        embedded: false,
        port: 8090,
        url: 'http://127.0.0.1:8090',
      });
      expect(await (ipcMain as any)._invoke('plugin:get-api-base-url')).toBe('https://otix.app');
    });

    it('handles window minimize and close controls for installer window', async () => {
      await (ipcMain as any)._invoke('window:minimize');
      expect(mockWindow.minimize).toHaveBeenCalled();

      await (ipcMain as any)._invoke('window:close');
      expect(mockWindow.close).toHaveBeenCalled();

      await (ipcMain as any)._invoke('setup:window-minimize');
      expect(mockWindow.minimize).toHaveBeenCalledTimes(2);

      await (ipcMain as any)._invoke('setup:window-close');
      expect(mockWindow.close).toHaveBeenCalledTimes(2);
    });

    it('safely skips window actions when window is destroyed', async () => {
      mockWindow.isDestroyed.mockReturnValue(true);

      await (ipcMain as any)._invoke('window:minimize');
      await (ipcMain as any)._invoke('window:close');
      await (ipcMain as any)._invoke('setup:window-minimize');
      await (ipcMain as any)._invoke('setup:window-close');

      expect(mockWindow.minimize).not.toHaveBeenCalled();
      expect(mockWindow.close).not.toHaveBeenCalled();
    });
  });

  describe('setup:get-info', () => {
    it('returns application version, default install path, elevation status, and source dir', async () => {
      const info = await (ipcMain as any)._invoke('setup:get-info');
      expect(info).toBeDefined();
      expect(info.version).toBe('0.1.26');
      expect(typeof info.defaultInstallPath).toBe('string');
      expect(info.defaultInstallPath.length).toBeGreaterThan(0);
      expect(typeof info.isElevated).toBe('boolean');
      expect(typeof info.sourcePath).toBe('string');
    });

    it('returns local user install path and handles relaunch elevated', async () => {
      const userPath = await (ipcMain as any)._invoke('setup:get-user-install-path');
      expect(typeof userPath).toBe('string');
      expect(userPath.toLowerCase()).toContain('otix');

      const relaunch = await (ipcMain as any)._invoke('setup:relaunch-elevated');
      expect(relaunch).toBeDefined();
    });
  });

  describe('setup:get-disk-space', () => {
    it('returns drive and valid free/total disk bytes', async () => {
      const diskSpace = await (ipcMain as any)._invoke('setup:get-disk-space', 'C:\\Games\\Otix');
      expect(diskSpace).toBeDefined();
      expect(diskSpace.drive).toBe('C:\\');
      expect(diskSpace.freeBytes).toBeGreaterThan(0);
      expect(diskSpace.totalBytes).toBeGreaterThan(0);
    });

    it('correctly parses non-C drives or defaults to C drive on empty input', async () => {
      const dDrive = await (ipcMain as any)._invoke('setup:get-disk-space', 'D:\\Games\\Otix');
      expect(dDrive.drive).toBe('D:\\');

      const fallback = await (ipcMain as any)._invoke('setup:get-disk-space', '');
      expect(fallback.drive).toBe('C:\\');
    });
  });

  describe('setup:browse-directory', () => {
    it('returns chosen folder path when dialog is accepted', async () => {
      (dialog as any).showOpenDialog = vi.fn().mockResolvedValue({
        canceled: false,
        filePaths: ['D:\\CustomGames\\Otix'],
      });

      const result = await (ipcMain as any)._invoke('setup:browse-directory', 'C:\\Program Files\\Otix');
      expect(result).toBe('D:\\CustomGames\\Otix');
      expect((dialog as any).showOpenDialog).toHaveBeenCalledWith(
        mockWindow,
        expect.objectContaining({
          properties: ['openDirectory', 'createDirectory'],
        }),
      );
    });

    it('returns null when user cancels folder selection', async () => {
      (dialog as any).showOpenDialog = vi.fn().mockResolvedValue({
        canceled: true,
        filePaths: [],
      });

      const result = await (ipcMain as any)._invoke('setup:browse-directory');
      expect(result).toBeNull();
    });
  });

  describe('setup:start-install', () => {
    it('successfully creates directory, copies files, emits progress, and configures setup', async () => {
      const childProcess = await import('child_process');
      const execMock = vi.mocked(childProcess.exec);
      execMock.mockImplementation((cmd: string, cb: any) => {
        cb(null, 'C:\\Users\\MockUser\\Desktop', '');
        return {} as any;
      });

      const result = await (ipcMain as any)._invoke('setup:start-install', {
        installPath: tempInstallDir,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        startOnBoot: true,
      });

      expect(result).toEqual({ success: true });
      expect(fs.existsSync(tempInstallDir)).toBe(true);
      expect(fs.existsSync(path.join(tempInstallDir, 'Otix.exe'))).toBe(true);

      // Verify progress events were emitted
      const progressEvents = sentEvents.filter((e) => e.channel === 'setup:install-progress');
      expect(progressEvents.length).toBeGreaterThan(0);

      // Check first and final progress payloads
      expect(progressEvents[0].payload.percent).toBe(5);
      expect(progressEvents[progressEvents.length - 1].payload.percent).toBe(100);
      expect(progressEvents[progressEvents.length - 1].payload.status).toBe('Installation completed!');
    });

    it('catches and reports fatal filesystem errors gracefully', async () => {
      // Pass an invalid path that cannot be created on Windows (e.g., illegal characters)
      const invalidPath = process.platform === 'win32' ? 'Z:\\*?\\IllegalDir\\Otix' : '/invalid/nonexistent/root/Otix';
      const result = await (ipcMain as any)._invoke('setup:start-install', {
        installPath: invalidPath,
        createDesktopShortcut: false,
        createStartMenuShortcut: false,
        startOnBoot: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('setup:finish-and-launch & setup:cancel', () => {
    it('triggers app quit on finish-and-launch', async () => {
      vi.useFakeTimers();
      await (ipcMain as any)._invoke('setup:finish-and-launch');
      vi.advanceTimersByTime(300);
      expect(app.quit).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('triggers app quit immediately on cancel', async () => {
      await (ipcMain as any)._invoke('setup:cancel');
      expect(app.quit).toHaveBeenCalled();
    });
  });

  describe('setup:uninstall', () => {
    it('emits uninstallation progress and executes cleanup routines', async () => {
      const result = await (ipcMain as any)._invoke('setup:uninstall', {
        removeUserData: true,
      });

      expect(result).toEqual({ success: true });

      const progressEvents = sentEvents.filter((e) => e.channel === 'setup:uninstall-progress');
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents[progressEvents.length - 1].payload.percent).toBe(100);
      expect(progressEvents[progressEvents.length - 1].payload.status).toBe('Otix uninstalled successfully.');
    });

    it('handles uninstall with removeUserData false', async () => {
      const result = await (ipcMain as any)._invoke('setup:uninstall', {
        removeUserData: false,
      });

      expect(result).toEqual({ success: true });
    });
  });
});
