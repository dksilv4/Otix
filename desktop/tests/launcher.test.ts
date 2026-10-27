import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import {
  ProcessLauncher,
  launchGameProcess,
  parseLaunchArgs,
  getExecutableDir,
  resolveMacAppExecutable,
  type GameLaunchTarget,
  type ProcessExitInfo,
} from '../game/launcher';

// Mock child_process.spawn
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

// Mock fs functions used in .app bundle resolution
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
  };
});

class MockChildProcess extends EventEmitter {
  public pid: number;
  public unref = vi.fn();
  public kill = vi.fn((signal?: NodeJS.Signals) => {
    this.emit('exit', null, signal ?? 'SIGTERM');
    return true;
  });

  constructor(pid = 4242) {
    super();
    this.pid = pid;
  }
}

describe('ProcessLauncher', () => {
  let mockChild: MockChildProcess;
  let launcher: ProcessLauncher;

  beforeEach(() => {
    vi.clearAllMocks();
    mockChild = new MockChildProcess(5555);
    vi.mocked(spawn).mockReturnValue(mockChild as any);
    launcher = new ProcessLauncher();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Argument Parsing (parseLaunchArgs)', () => {
    it('returns empty array when args are undefined, null, or empty string', () => {
      expect(parseLaunchArgs()).toEqual([]);
      expect(parseLaunchArgs(undefined)).toEqual([]);
      expect(parseLaunchArgs('')).toEqual([]);
      expect(parseLaunchArgs('   ')).toEqual([]);
    });

    it('returns array directly if an array is passed', () => {
      const args = ['-fullscreen', '-novid', '--port=8080'];
      expect(parseLaunchArgs(args)).toEqual(['-fullscreen', '-novid', '--port=8080']);
    });

    it('splits space-separated arguments into tokens', () => {
      expect(parseLaunchArgs('-fullscreen -novid -high')).toEqual([
        '-fullscreen',
        '-novid',
        '-high',
      ]);
    });

    it('preserves double-quoted arguments with spaces', () => {
      const parsed = parseLaunchArgs('-game "Counter Strike" +connect "127.0.0.1:27015"');
      expect(parsed).toEqual(['-game', 'Counter Strike', '+connect', '127.0.0.1:27015']);
    });

    it('preserves single-quoted arguments with spaces', () => {
      const parsed = parseLaunchArgs("-user 'Gordon Freeman' -cfg 'autoexec test.cfg'");
      expect(parsed).toEqual(['-user', 'Gordon Freeman', '-cfg', 'autoexec test.cfg']);
    });
  });

  describe('Working Directory Resolution (getExecutableDir)', () => {
    it('resolves Windows backslash directory on any host platform', () => {
      const dir = getExecutableDir('C:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe', 'win32');
      expect(dir).toBe('C:\\Games\\Cyberpunk 2077\\bin\\x64');
    });

    it('resolves POSIX directory on Unix/macOS', () => {
      const dir = getExecutableDir('/usr/local/games/doom/doom-engine', 'darwin');
      expect(dir).toBe('/usr/local/games/doom');
    });
  });

  describe('macOS .app Bundle Resolution (resolveMacAppExecutable)', () => {
    it('returns null if path does not end with .app', () => {
      expect(resolveMacAppExecutable('/usr/bin/game')).toBeNull();
      expect(resolveMacAppExecutable('/Applications/Game/binary')).toBeNull();
    });

    it('resolves binary using CFBundleExecutable from Info.plist', () => {
      const appPath = '/Applications/SuperGame.app';
      const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');
      const expectedBinary = path.join(appPath, 'Contents', 'MacOS', 'SuperGameRunner');

      vi.mocked(fs.existsSync).mockImplementation((checkPath: any) => {
        if (checkPath === infoPlistPath) return true;
        if (checkPath === expectedBinary) return true;
        return false;
      });

      vi.mocked(fs.readFileSync).mockImplementation((readPath: any) => {
        if (readPath === infoPlistPath) {
          return `<?xml version="1.0" encoding="UTF-8"?>
          <plist version="1.0">
          <dict>
            <key>CFBundleExecutable</key>
            <string>SuperGameRunner</string>
          </dict>
          </plist>`;
        }
        return '';
      });

      const resolved = resolveMacAppExecutable(appPath);
      expect(resolved).toBe(expectedBinary);
    });

    it('falls back to directory scan matching app base name when Info.plist is missing', () => {
      const appPath = '/Games/Hades.app';
      const macOsDir = path.join(appPath, 'Contents', 'MacOS');

      vi.mocked(fs.existsSync).mockImplementation((checkPath: any) => {
        if (checkPath === path.join(appPath, 'Contents', 'Info.plist')) return false;
        if (checkPath === macOsDir) return true;
        return false;
      });

      vi.mocked(fs.readdirSync).mockImplementation((dirPath: any) => {
        if (dirPath === macOsDir) {
          return ['helper', 'Hades', 'crashpad'] as any;
        }
        return [] as any;
      });

      const resolved = resolveMacAppExecutable(appPath);
      expect(resolved).toBe(path.join(macOsDir, 'Hades'));
    });

    it('falls back to first file in Contents/MacOS when app name does not match', () => {
      const appPath = '/Games/IndieTitle.app';
      const macOsDir = path.join(appPath, 'Contents', 'MacOS');

      vi.mocked(fs.existsSync).mockImplementation((checkPath: any) => {
        if (checkPath === macOsDir) return true;
        return false;
      });

      vi.mocked(fs.readdirSync).mockImplementation((dirPath: any) => {
        if (dirPath === macOsDir) {
          return ['game_engine_binary'] as any;
        }
        return [] as any;
      });

      const resolved = resolveMacAppExecutable(appPath);
      expect(resolved).toBe(path.join(macOsDir, 'game_engine_binary'));
    });

    it('returns null if Contents/MacOS is empty', () => {
      const appPath = '/Games/Empty.app';
      const macOsDir = path.join(appPath, 'Contents', 'MacOS');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);

      const resolved = resolveMacAppExecutable(appPath);
      expect(resolved).toBeNull();
    });
  });

  describe('Windows Process Spawning (.exe)', () => {
    it('spawns Windows .exe with windowsHide: false and default working directory', async () => {
      const game: GameLaunchTarget = {
        id: 'witcher-3',
        title: 'The Witcher 3: Wild Hunt',
        exePath: 'C:\\Games\\The Witcher 3\\bin\\x64\\witcher3.exe',
      };

      const launched = await launcher.launchGameProcess(game, { platform: 'win32' });

      expect(spawn).toHaveBeenCalledTimes(1);
      const [cmd, args, opts] = vi.mocked(spawn).mock.calls[0];

      expect(cmd).toBe(game.exePath);
      expect(args).toEqual([]);
      expect(opts).toMatchObject({
        cwd: 'C:\\Games\\The Witcher 3\\bin\\x64',
        detached: true,
        windowsHide: false,
      });
      expect(launched.pid).toBe(5555);
      expect(launched.platform).toBe('win32');
    });

    it('passes custom working directory from options', async () => {
      const game: GameLaunchTarget = {
        id: 'portal-2',
        title: 'Portal 2',
        exePath: 'C:\\Steam\\steamapps\\common\\portal2\\portal2.exe',
      };

      await launcher.launchGameProcess(game, {
        platform: 'win32',
        workingDir: 'C:\\CustomWorkingDirectory',
      });

      const [, , opts] = vi.mocked(spawn).mock.calls[0];
      expect(opts.cwd).toBe('C:\\CustomWorkingDirectory');
    });

    it('passes working directory from game definition if not in options', async () => {
      const game: GameLaunchTarget = {
        id: 'skyrim',
        title: 'Skyrim',
        exePath: 'C:\\Games\\Skyrim\\SkyrimSE.exe',
        workingDirectory: 'C:\\Games\\Skyrim\\CustomWorkingDir',
      };

      await launcher.launchGameProcess(game, { platform: 'win32' });

      const [, , opts] = vi.mocked(spawn).mock.calls[0];
      expect(opts.cwd).toBe('C:\\Games\\Skyrim\\CustomWorkingDir');
    });

    it('passes custom launch arguments from string and options array', async () => {
      const game: GameLaunchTarget = {
        id: 'cs2',
        title: 'Counter-Strike 2',
        exePath: 'C:\\Games\\CS2\\game\\bin\\win64\\cs2.exe',
        launchArguments: '-novid -high',
      };

      await launcher.launchGameProcess(game, {
        platform: 'win32',
        args: ['-fullscreen', '+fps_max 144'],
      });

      const [, args] = vi.mocked(spawn).mock.calls[0];
      expect(args).toEqual(['-novid', '-high', '-fullscreen', '+fps_max 144']);
    });

    it('allows overriding windowsHide if explicitly specified in options', async () => {
      const game: GameLaunchTarget = {
        id: 'background-worker',
        title: 'Background Process',
        exePath: 'C:\\Tools\\worker.exe',
      };

      await launcher.launchGameProcess(game, {
        platform: 'win32',
        windowsHide: true,
      });

      const [, , opts] = vi.mocked(spawn).mock.calls[0];
      expect((opts as any).windowsHide).toBe(true);
    });
  });

  describe('macOS Process Spawning (Binary & .app Bundle)', () => {
    it('spawns macOS native binary directly with working dir and args', async () => {
      const game: GameLaunchTarget = {
        id: 'celeste',
        title: 'Celeste',
        exePath: '/Users/user/Games/Celeste/Celeste.bin.osx',
        launchArguments: '--debug',
      };

      const launched = await launcher.launchGameProcess(game, { platform: 'darwin' });

      expect(spawn).toHaveBeenCalledTimes(1);
      const [cmd, args, opts] = vi.mocked(spawn).mock.calls[0];

      expect(cmd).toBe(game.exePath);
      expect(args).toEqual(['--debug']);
      expect(opts.cwd).toBe('/Users/user/Games/Celeste');
      expect(launched.executablePath).toBe(game.exePath);
    });

    it('resolves and executes inner binary for macOS .app bundle', async () => {
      const appPath = '/Applications/Balatro.app';
      const innerBinary = path.join(appPath, 'Contents', 'MacOS', 'Balatro');

      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        if (p === path.join(appPath, 'Contents', 'MacOS')) return true;
        return false;
      });
      vi.mocked(fs.readdirSync).mockImplementation((p: any) => {
        if (p === path.join(appPath, 'Contents', 'MacOS')) return ['Balatro'] as any;
        return [] as any;
      });

      const game: GameLaunchTarget = {
        id: 'balatro',
        title: 'Balatro',
        exePath: appPath,
      };

      const launched = await launcher.launchGameProcess(game, {
        platform: 'darwin',
        args: ['-windowed'],
      });

      const [cmd, args, opts] = vi.mocked(spawn).mock.calls[0];
      expect(cmd).toBe(innerBinary);
      expect(args).toEqual(['-windowed']);
      expect(opts.cwd).toBe(path.dirname(innerBinary));
      expect(launched.executablePath).toBe(innerBinary);
    });

    it('spawns via open -W -a when useOpenCommand is specified', async () => {
      const appPath = '/Applications/DeadCells.app';
      const game: GameLaunchTarget = {
        id: 'dead-cells',
        title: 'Dead Cells',
        exePath: appPath,
      };

      await launcher.launchGameProcess(game, {
        platform: 'darwin',
        useOpenCommand: true,
        args: ['-fast'],
      });

      const [cmd, args, opts] = vi.mocked(spawn).mock.calls[0];
      expect(cmd).toBe('open');
      expect(args).toEqual(['-W', '-a', appPath, '--args', '-fast']);
      expect(opts.cwd).toBe('/Applications');
    });

    it('falls back to open -W -a when inner executable cannot be resolved in .app', async () => {
      const appPath = '/Applications/UnknownGame.app';
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const game: GameLaunchTarget = {
        id: 'unknown-app',
        title: 'Unknown App',
        exePath: appPath,
      };

      await launcher.launchGameProcess(game, { platform: 'darwin' });

      const [cmd, args] = vi.mocked(spawn).mock.calls[0];
      expect(cmd).toBe('open');
      expect(args).toEqual(['-W', '-a', appPath]);
    });
  });

  describe('Exit Code Trapping', () => {
    it('traps clean process exit with exit code 0', async () => {
      const game: GameLaunchTarget = {
        id: 'game-clean',
        title: 'Clean Exit Game',
        exePath: '/Games/Clean/game',
      };

      const exitListener = vi.fn();
      launcher.on('process:exit', exitListener);

      const launched = await launcher.launchGameProcess(game, { platform: 'darwin' });
      expect(launcher.getActiveProcesses()).toHaveLength(1);

      // Simulate clean exit
      mockChild.emit('exit', 0, null);

      const exitInfo = await launched.waitForExit();
      expect(exitInfo.exitCode).toBe(0);
      expect(exitInfo.signal).toBeNull();
      expect(exitInfo.gameId).toBe('game-clean');
      expect(exitInfo.durationMs).toBeGreaterThanOrEqual(0);
      expect(exitListener).toHaveBeenCalledTimes(1);
      expect(exitListener).toHaveBeenCalledWith(exitInfo);
      expect(launcher.getActiveProcesses()).toHaveLength(0);
    });

    it('traps non-zero exit code on process crash or failure', async () => {
      const game: GameLaunchTarget = {
        id: 'game-crash',
        title: 'Crash Game',
        exePath: 'C:\\Games\\Crash\\game.exe',
      };

      const launched = await launcher.launchGameProcess(game, { platform: 'win32' });

      // Simulate crash with error code 1
      mockChild.emit('exit', 1, null);

      const exitInfo = await launched.waitForExit();
      expect(exitInfo.exitCode).toBe(1);
      expect(exitInfo.signal).toBeNull();
      expect(exitInfo.gameId).toBe('game-crash');
    });

    it('traps termination by signal (SIGTERM / SIGKILL)', async () => {
      const game: GameLaunchTarget = {
        id: 'game-signal',
        title: 'Killed Game',
        exePath: '/usr/bin/game',
      };

      const launched = await launcher.launchGameProcess(game, { platform: 'darwin' });

      // Terminate via kill helper
      launched.kill('SIGTERM');

      const exitInfo = await launched.waitForExit();
      expect(exitInfo.exitCode).toBeNull();
      expect(exitInfo.signal).toBe('SIGTERM');
    });

    it('traps spawn error event and invokes onError callback', async () => {
      const game: GameLaunchTarget = {
        id: 'game-missing',
        title: 'Missing Binary',
        exePath: '/does/not/exist/game',
      };

      const onError = vi.fn();
      const onExit = vi.fn();

      const launched = await launcher.launchGameProcess(game, {
        platform: 'darwin',
        onError,
        onExit,
      });

      const spawnError = new Error('spawn ENOENT');
      mockChild.emit('error', spawnError);

      const exitInfo = await launched.waitForExit();
      expect(exitInfo.error).toBe(spawnError);
      expect(exitInfo.exitCode).toBeNull();
      expect(onError).toHaveBeenCalledWith(spawnError);
      expect(onExit).toHaveBeenCalledWith(exitInfo);
    });
  });

  describe('Session Tracking Callbacks & Hooks', () => {
    it('notifies registered onProcessExit callback hook upon process termination', async () => {
      const game: GameLaunchTarget = {
        id: 'hook-game',
        title: 'Hook Game',
        exePath: 'C:\\Games\\Hook\\game.exe',
      };

      const exitHook = vi.fn();
      const unregister = launcher.onProcessExit(exitHook);

      const launched = await launcher.launchGameProcess(game, { platform: 'win32' });

      mockChild.emit('exit', 0, null);
      await launched.waitForExit();

      expect(exitHook).toHaveBeenCalledTimes(1);
      expect(exitHook).toHaveBeenCalledWith(
        expect.objectContaining({
          gameId: 'hook-game',
          exitCode: 0,
        }),
      );

      unregister();
    });

    it('notifies per-launch sessionTracker start and stop methods', async () => {
      const game: GameLaunchTarget = {
        id: 'tracked-game',
        title: 'Tracked Game',
        exePath: 'C:\\Games\\Tracked\\game.exe',
      };

      const mockTracker = {
        startTracking: vi.fn(),
        stopTracking: vi.fn(),
      };

      const launched = await launcher.launchGameProcess(game, {
        platform: 'win32',
        sessionTracker: mockTracker,
      });

      expect(mockTracker.startTracking).toHaveBeenCalledTimes(1);
      expect(mockTracker.startTracking).toHaveBeenCalledWith(game, 5555);

      mockChild.emit('exit', 0, null);
      await launched.waitForExit();

      expect(mockTracker.stopTracking).toHaveBeenCalledTimes(1);
      expect(mockTracker.stopTracking).toHaveBeenCalledWith('tracked-game');
    });

    it('notifies globally attached session tracker via attachSessionTracker', async () => {
      const game: GameLaunchTarget = {
        id: 'global-tracked',
        title: 'Global Tracked Game',
        exePath: '/Games/global/game',
      };

      const globalTracker = {
        startTracking: vi.fn(),
        stopTracking: vi.fn(),
      };

      const unregister = launcher.attachSessionTracker(globalTracker);

      const launched = await launcher.launchGameProcess(game, { platform: 'darwin' });
      expect(globalTracker.startTracking).toHaveBeenCalledWith(game, 5555);

      mockChild.emit('exit', 0, null);
      await launched.waitForExit();

      expect(globalTracker.stopTracking).toHaveBeenCalledWith('global-tracked');
      unregister();
    });
  });

  describe('Top-level Convenience Function (launchGameProcess)', () => {
    it('launches using default launcher instance', async () => {
      const game: GameLaunchTarget = {
        id: 'top-level-game',
        title: 'Top Level Game',
        exePath: 'C:\\Games\\Top\\game.exe',
      };

      const launched = await launchGameProcess(game, { platform: 'win32' });
      expect(launched.gameId).toBe('top-level-game');
      expect(spawn).toHaveBeenCalledTimes(1);
    });

    it('throws error when exePath is missing', async () => {
      const invalidGame = { id: 'invalid', title: 'Invalid' } as any;
      await expect(launchGameProcess(invalidGame)).rejects.toThrow(
        'Executable path is required to launch game',
      );
    });
  });
});
