import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { EventEmitter } from 'events';

// ── In-Memory Mock Database for Storage Testing ────────────────────────

interface MockTableState {
  rows: Map<string, Record<string, any>>;
}

let mockDbRows: Record<string, any>[] = [];

function createMockDb() {
  const tables = new Map<string, MockTableState>();
  tables.set('scanned_games', { rows: new Map() });
  tables.set('game_matches', { rows: new Map() });
  tables.set('game_scan_paths', { rows: new Map() });

  return {
    exec: vi.fn(),
    transaction: <T extends (...args: any[]) => any>(fn: T): T => fn,
    prepare: (sql: string) => ({
      run: vi.fn().mockReturnValue({ changes: 1 }),
      get: vi.fn().mockReturnValue(null),
      all: vi.fn().mockImplementation(() => {
        if (/scanned_games/i.test(sql)) {
          return [...mockDbRows];
        }
        return [];
      }),
    }),
  };
}

const mockDbInstance = createMockDb();

vi.mock('../db', () => ({
  getDb: () => mockDbInstance,
}));

// ── Hardware & Settings Mocks ──────────────────────────────────────────

vi.mock('../game/node-hardware', () => ({
  getCachedHostNodeAndHardware: vi.fn(() => ({
    node: null,
    hardware: { cpu: 'Adversarial Test CPU', gpu: 'Adversarial Test GPU', ramBytes: 32000000000, os: 'Windows 11', discreteGpu: true },
    shareEligible: false,
  })),
  getHostNodeAndHardware: vi.fn(() => Promise.resolve({
    node: null,
    hardware: { cpu: 'Adversarial Test CPU', gpu: 'Adversarial Test GPU', ramBytes: 32000000000, os: 'Windows 11', discreteGpu: true },
    shareEligible: false,
  })),
}));

vi.mock('../desktop-settings', () => ({
  getSettings: vi.fn(() => ({ onlyTrackScannedGames: false, embeddedNodePort: 8090 })),
}));

// Mock ps-list for detector tests
let mockPsListProcesses: Array<{ pid: number; name: string }> = [];
vi.mock('ps-list', () => ({
  default: vi.fn(() => Promise.resolve([...mockPsListProcesses])),
}));

// ── File System Spying Hooks ──────────────────────────────────────────

export const fsCallCounters = {
  statSync: 0,
  openSync: 0,
  readFileSync: 0,
  readdirSync: 0,
  reset() {
    this.statSync = 0;
    this.openSync = 0;
    this.readFileSync = 0;
    this.readdirSync = 0;
  },
};

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    statSync: (...args: any[]) => {
      fsCallCounters.statSync++;
      return (actual.statSync as any)(...args);
    },
    openSync: (...args: any[]) => {
      fsCallCounters.openSync++;
      return (actual.openSync as any)(...args);
    },
    readFileSync: (...args: any[]) => {
      fsCallCounters.readFileSync++;
      return (actual.readFileSync as any)(...args);
    },
    readdirSync: (...args: any[]) => {
      fsCallCounters.readdirSync++;
      return (actual.readdirSync as any)(...args);
    },
  };
});

// ── Child Process Mock Control ────────────────────────────────────────

class MockChildProcess extends EventEmitter {
  public pid: number;
  public unref = vi.fn();
  public kill = vi.fn((signal?: NodeJS.Signals) => {
    this.emit('exit', null, signal ?? 'SIGTERM');
    return true;
  });

  constructor(pid = 12345) {
    super();
    this.pid = pid;
  }
}

let mockSpawnMode: 'mock' | 'real' | 'error' = 'mock';
let mockSpawnError: Error | null = null;
let currentMockChildren: MockChildProcess[] = [];
let mockExecCallbackData: any = null;

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    exec: vi.fn((cmd: string, opts: any, cb: any) => {
      const callback = typeof opts === 'function' ? opts : cb;
      if (callback) {
        callback(null, mockExecCallbackData !== null ? JSON.stringify(mockExecCallbackData) : '', '');
      }
      return {} as any;
    }),
    spawn: (cmd: string, args: string[], opts: any) => {
      if (mockSpawnMode === 'real') {
        return actual.spawn(cmd, args, opts);
      }
      const child = new MockChildProcess(Math.floor(Math.random() * 50000) + 10000);
      currentMockChildren.push(child);
      if (mockSpawnMode === 'error') {
        setImmediate(() => {
          child.emit('error', mockSpawnError || new Error('ENOENT: spawn failed'));
        });
      }
      return child;
    },
  };
});

// ── Imports Under Test ────────────────────────────────────────────────

import {
  ProcessLauncher,
  launchGameProcess,
  parseLaunchArgs,
  getExecutableDir,
  resolveMacAppExecutable,
} from '../game/launcher';
import { GameDetector } from '../game/detector';
import {
  getAllGames,
  clearRowCache,
  resolveGameMetadataAsync,
  getPeVersionAsync,
} from '../game/storage';
import type { LocalGame } from '../preload-api';

describe('Challenger M1-1 Adversarial Stress Test Suite', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawnMode = 'mock';
    mockSpawnError = null;
    mockExecCallbackData = null;
    currentMockChildren = [];
    mockDbRows = [];
    mockPsListProcesses = [];
    fsCallCounters.reset();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otix-challenger-m1-p1-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. ADVERSARIAL PROCESS EXECUTION & LAUNCH ARGUMENTS
  // =========================================================================
  describe('1. Adversarial Process Execution & Argument Tokenization', () => {
    it('handles empty, undefined, null, and whitespace-only launch arguments safely', () => {
      expect(parseLaunchArgs(undefined)).toEqual([]);
      expect(parseLaunchArgs(null as any)).toEqual([]);
      expect(parseLaunchArgs('')).toEqual([]);
      expect(parseLaunchArgs('    ')).toEqual([]);
      expect(parseLaunchArgs('\t\n\r   \t')).toEqual([]);
      expect(parseLaunchArgs([])).toEqual([]);
    });

    it('correctly preserves boundaries for arguments with nested quotes, spaces, and complex flags', () => {
      const complexArgs = '-dx12 +set fs_game "my custom mod/folder" --config="C:\\Program Files\\Game\\settings.cfg" -user \'Gamer "Pro" 123\' --title="War & Peace: 1944"';
      const parsed = parseLaunchArgs(complexArgs);

      expect(parsed).toEqual([
        '-dx12',
        '+set',
        'fs_game',
        'my custom mod/folder',
        '--config="C:\\Program Files\\Game\\settings.cfg"',
        '-user',
        'Gamer "Pro" 123',
        '--title="War & Peace: 1944"',
      ]);
    });

    it('handles special shell metacharacters without shell injection vulnerability', () => {
      const maliciousArgs = '--param="val&calc.exe|dir>out.txt<in.txt%PATH%$HOME;rmdir /s"';
      const parsed = parseLaunchArgs(maliciousArgs);

      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toBe('--param="val&calc.exe|dir>out.txt<in.txt%PATH%$HOME;rmdir /s"');
    });

    it('handles unmatched and unbalanced quotes gracefully without hanging or throwing', () => {
      const unclosedDouble = '-windowed -title "Unclosed Title with spaces';
      const parsedDouble = parseLaunchArgs(unclosedDouble);
      expect(parsedDouble).toBeDefined();
      expect(parsedDouble.length).toBeGreaterThanOrEqual(2);
      expect(parsedDouble[0]).toBe('-windowed');

      const unclosedSingle = '-arg \'single unclosed arg';
      const parsedSingle = parseLaunchArgs(unclosedSingle);
      expect(parsedSingle).toBeDefined();
      expect(parsedSingle.length).toBeGreaterThanOrEqual(2);
    });

    it('throws synchronous error if game or exePath is missing', async () => {
      const launcher = new ProcessLauncher({ platform: 'win32' });

      await expect(launcher.launchGameProcess(null as any)).rejects.toThrow('Executable path is required');
      await expect(launcher.launchGameProcess({ id: 'game-1', title: 'Test', exePath: '' } as any)).rejects.toThrow('Executable path is required');
    });

    it('handles non-existent binary spawning error gracefully via onError and waitForExit error info', async () => {
      mockSpawnMode = 'error';
      mockSpawnError = Object.assign(new Error('spawn C:\\fake\\non_existent_game.exe ENOENT'), { code: 'ENOENT' });

      const launcher = new ProcessLauncher({ platform: 'win32' });
      const onErrorSpy = vi.fn();
      const onExitSpy = vi.fn();

      const launched = await launcher.launchGameProcess(
        {
          id: 'non-existent-game',
          title: 'Non Existent Game',
          exePath: 'C:\\fake\\non_existent_game.exe',
        },
        {
          onError: onErrorSpy,
          onExit: onExitSpy,
        },
      );

      expect(launched).toBeDefined();
      const exitInfo = await launched.waitForExit();

      expect(onErrorSpy).toHaveBeenCalledTimes(1);
      expect(onErrorSpy.mock.calls[0][0].code).toBe('ENOENT');

      expect(onExitSpy).toHaveBeenCalledTimes(1);
      expect(exitInfo.error).toBeDefined();
      expect((exitInfo.error as any).code).toBe('ENOENT');
      expect(exitInfo.exitCode).toBeNull();
      expect(exitInfo.signal).toBeNull();

      // Process must not linger in active processes
      expect(launcher.getActiveProcesses()).toHaveLength(0);
    });

    it('supports concurrent launches of multiple processes with isolated tracking', async () => {
      mockSpawnMode = 'mock';
      const launcher = new ProcessLauncher({ platform: 'win32' });

      const launchedPromises = Array.from({ length: 5 }, (_, i) =>
        launcher.launchGameProcess({
          id: `concurrent-game-${i}`,
          title: `Game ${i}`,
          exePath: `C:\\Games\\Game${i}\\game.exe`,
          launchArguments: `-instance ${i}`,
        }),
      );

      const launched = await Promise.all(launchedPromises);
      expect(launcher.getActiveProcesses()).toHaveLength(5);

      // Terminate each process with different exit codes
      for (let i = 0; i < launched.length; i++) {
        const child = currentMockChildren[i];
        child.emit('exit', i === 0 ? 0 : i * 10, null);
      }

      const results = await Promise.all(launched.map((l) => l.waitForExit()));
      expect(results[0].exitCode).toBe(0);
      expect(results[1].exitCode).toBe(10);
      expect(results[2].exitCode).toBe(20);
      expect(launcher.getActiveProcesses()).toHaveLength(0);
    });

    it('correctly resolves executable directory for Windows backslash paths on any platform', () => {
      const winPath = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Half-Life\\hl.exe';
      const dir = getExecutableDir(winPath, 'win32');
      expect(dir).toBe('C:\\Program Files (x86)\\Steam\\steamapps\\common\\Half-Life');

      const posixPath = '/Applications/Games/Hades.app/Contents/MacOS/Hades';
      const posixDir = getExecutableDir(posixPath, 'darwin');
      expect(posixDir).toBe('/Applications/Games/Hades.app/Contents/MacOS');
    });
  });

  // =========================================================================
  // 2. ADVERSARIAL PROCESS GRACE PERIOD & MULTI-STAGE LAUNCHER STRESS
  // =========================================================================
  describe('2. Adversarial Process Grace Period & Session Tracking', () => {
    it('maintains active session across multiple check intervals when launcher PID terminates within 20s', async () => {
      vi.useFakeTimers();
      const detector = new GameDetector(tempDir);
      const game: LocalGame = {
        id: 'redlauncher-cyberpunk',
        title: 'Cyberpunk 2077',
        exePath: 'C:\\Games\\Cyberpunk 2077\\REDprelauncher.exe',
        installDir: 'C:\\Games\\Cyberpunk 2077',
        platform: 'pc',
      };

      const endedSpy = vi.fn();
      detector.on('game:ended', endedSpy);

      const initialPid = 2222;
      const alivePids = new Set<number>([initialPid]);

      const killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number) => {
        if (alivePids.has(pid)) return true as any;
        throw new Error('ESRCH: No such process');
      });

      // Otix launches intermediate launcher
      detector.startTracking(game, initialPid);
      expect(detector.getRunningGames()).toHaveLength(1);
      expect(detector.getRunningGames()[0].pid).toBe(initialPid);
      expect(detector.getRunningGames()[0].launchedByOtix).toBe(true);

      // Launcher process exits rapidly at t = 500ms
      alivePids.delete(initialPid);

      // Advance by 2s (first check tick: PID is dead, grace period entered)
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
      expect(endedSpy).not.toHaveBeenCalled();
      expect(detector.getRunningGames()).toHaveLength(1);
      expect(detector.getRunningGames()[0].pid).toBeUndefined(); // PID cleared to allow re-scan

      // Advance through multiple check ticks: t = 4s, 8s, 12s, 16s, 18s
      vi.advanceTimersByTime(4000); // t = 6s
      expect(endedSpy).not.toHaveBeenCalled();
      expect(detector.getRunningGames()).toHaveLength(1);

      vi.advanceTimersByTime(6000); // t = 12s
      expect(endedSpy).not.toHaveBeenCalled();
      expect(detector.getRunningGames()).toHaveLength(1);

      vi.advanceTimersByTime(6000); // t = 18s
      expect(endedSpy).not.toHaveBeenCalled();
      expect(detector.getRunningGames()).toHaveLength(1);

      // Advance past 20s grace period limit (e.g. t = 22s total)
      vi.advanceTimersByTime(4000); // t = 22s
      expect(endedSpy).toHaveBeenCalledTimes(1);
      expect(endedSpy.mock.calls[0][0].gameId).toBe('redlauncher-cyberpunk');
      expect(detector.getRunningGames()).toHaveLength(0);

      killSpy.mockRestore();
      detector.stopAll();
      vi.useRealTimers();
    });

    it('transitions to newly detected game PID if game process is immediately running when launcher exits', async () => {
      vi.useFakeTimers();
      const detector = new GameDetector(tempDir);
      const game: LocalGame = {
        id: 'witcher-3-launcher',
        title: 'The Witcher 3: Wild Hunt',
        exePath: 'C:\\Games\\The Witcher 3\\bin\\x64\\witcher3.exe',
        installDir: 'C:\\Games\\The Witcher 3',
        platform: 'pc',
      };
      detector.setLibrary([game]);

      const updatedSpy = vi.fn();
      const endedSpy = vi.fn();
      detector.on('game:updated', updatedSpy);
      detector.on('game:ended', endedSpy);

      const bootstrapPid = 3333;
      const gameMainPid = 4444;
      const alivePids = new Set<number>([bootstrapPid, gameMainPid]);

      const killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number) => {
        if (alivePids.has(pid)) return true as any;
        throw new Error('ESRCH: No such process');
      });

      // Start tracking intermediate launcher PID 3333
      detector.startTracking(game, bootstrapPid);
      expect(detector.getRunningGames()).toHaveLength(1);

      // Bootstrap PID terminates, and main game PID is already in process list
      alivePids.delete(bootstrapPid);
      mockPsListProcesses = [{ pid: gameMainPid, name: 'witcher3.exe' }];

      // Advance by 2s for process check tick
      await vi.advanceTimersByTimeAsync(2000);

      // Session must seamlessly adopt PID 4444!
      expect(detector.getRunningGames()).toHaveLength(1);
      expect(detector.getRunningGames()[0].pid).toBe(gameMainPid);
      expect(updatedSpy).toHaveBeenCalledWith(expect.objectContaining({ pid: gameMainPid }));
      expect(endedSpy).not.toHaveBeenCalled();

      // Session stays alive past 20s
      await vi.advanceTimersByTimeAsync(30000);
      expect(endedSpy).not.toHaveBeenCalled();

      // Terminate gameMainPid
      alivePids.delete(gameMainPid);
      await vi.advanceTimersByTimeAsync(2000);
      expect(endedSpy).toHaveBeenCalledTimes(1);

      killSpy.mockRestore();
      detector.stopAll();
      vi.useRealTimers();
    });

    it('preserves session during grace period when scanRunningProcesses() runs and binds when game process spawns', async () => {
      vi.useFakeTimers();
      const detector = new GameDetector(tempDir);
      const game: LocalGame = {
        id: 'delayed-spawn-game',
        title: 'Cyberpunk 2077',
        exePath: 'C:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe',
        installDir: 'C:\\Games\\Cyberpunk 2077',
        platform: 'pc',
      };
      detector.setLibrary([game]);

      const endedSpy = vi.fn();
      detector.on('game:ended', endedSpy);

      const bootstrapPid = 7777;
      const gameMainPid = 8888;
      const alivePids = new Set<number>([bootstrapPid]);

      const killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number) => {
        if (alivePids.has(pid)) return true as any;
        throw new Error('ESRCH: No such process');
      });

      // Otix launches bootstrap launcher
      detector.startTracking(game, bootstrapPid);
      expect(detector.getRunningGames()).toHaveLength(1);

      // Bootstrap PID exits at t = 1s, but main game binary takes 3-4s to load into memory
      alivePids.delete(bootstrapPid);
      mockPsListProcesses = []; // Real game process has NOT appeared yet in process snapshot!

      // Advance by 2s: startProcessCheck triggers scanRunningProcesses()
      await vi.advanceTimersByTimeAsync(2000);

      // Session MUST remain alive in grace period!
      expect(endedSpy).not.toHaveBeenCalled();
      expect(detector.getRunningGames()).toHaveLength(1);
      expect(detector.getRunningGames()[0].game.id).toBe('delayed-spawn-game');
      expect(detector.getRunningGames()[0].pid).toBeUndefined();

      // At t = 4s, main game process appears in process list
      alivePids.add(gameMainPid);
      mockPsListProcesses = [{ pid: gameMainPid, name: 'Cyberpunk2077.exe' }];

      // Advance by 2s: next scan binds gameMainPid
      await vi.advanceTimersByTimeAsync(2000);

      expect(detector.getRunningGames()).toHaveLength(1);
      expect(detector.getRunningGames()[0].pid).toBe(gameMainPid);
      expect(endedSpy).not.toHaveBeenCalled();

      // Session stays alive past 20s grace period limit because process is running
      await vi.advanceTimersByTimeAsync(30000);
      expect(endedSpy).not.toHaveBeenCalled();

      // Finally terminate gameMainPid
      alivePids.delete(gameMainPid);
      mockPsListProcesses = [];
      await vi.advanceTimersByTimeAsync(2000);
      expect(endedSpy).toHaveBeenCalledTimes(1);
      expect(endedSpy.mock.calls[0][0].gameId).toBe('delayed-spawn-game');
      expect(detector.getRunningGames()).toHaveLength(0);

      killSpy.mockRestore();
      detector.stopAll();
      vi.useRealTimers();
    });

    it('does NOT grant grace period to non-Otix background detected games', async () => {
      vi.useFakeTimers();
      const detector = new GameDetector(tempDir);
      const game: LocalGame = {
        id: 'background-game',
        title: 'Background Game',
        exePath: 'C:\\Games\\Background\\bg.exe',
        installDir: 'C:\\Games\\Background',
        platform: 'pc',
      };
      detector.setLibrary([game]);

      const endedSpy = vi.fn();
      detector.on('game:ended', endedSpy);

      const pid = 5555;
      const alivePids = new Set<number>([pid]);

      const killSpy = vi.spyOn(process, 'kill').mockImplementation((p: number) => {
        if (alivePids.has(p)) return true as any;
        throw new Error('ESRCH: No such process');
      });

      // Background scan discovers game process (launchedByOtix = false)
      mockPsListProcesses = [{ pid, name: 'bg.exe' }];
      await detector.scanRunningProcesses();

      expect(detector.getRunningGames()).toHaveLength(1);
      expect(detector.getRunningGames()[0].launchedByOtix).toBe(false);

      // PID dies
      alivePids.delete(pid);

      // Run process check (t = 2s)
      vi.advanceTimersByTime(2000);

      // Must terminate immediately at 2s without waiting 20s
      expect(endedSpy).toHaveBeenCalledTimes(1);
      expect(detector.getRunningGames()).toHaveLength(0);

      killSpy.mockRestore();
      detector.stopAll();
      vi.useRealTimers();
    });

    it('cancels grace period immediately if user explicitly stops tracking', () => {
      vi.useFakeTimers();
      const detector = new GameDetector(tempDir);
      const game: LocalGame = {
        id: 'manual-stop-game',
        title: 'Manual Stop Game',
        exePath: 'C:\\Games\\Manual\\manual.exe',
        installDir: 'C:\\Games\\Manual',
        platform: 'pc',
      };

      const endedSpy = vi.fn();
      detector.on('game:ended', endedSpy);

      const pid = 6666;
      const alivePids = new Set<number>([pid]);

      const killSpy = vi.spyOn(process, 'kill').mockImplementation((p: number) => {
        if (alivePids.has(p)) return true as any;
        throw new Error('ESRCH: No such process');
      });

      detector.startTracking(game, pid);
      expect(detector.getRunningGames()).toHaveLength(1);

      // Explicitly stop tracking during grace period
      detector.stopTracking(game.id);

      expect(endedSpy).toHaveBeenCalledTimes(1);
      expect(detector.getRunningGames()).toHaveLength(0);

      // Subsequent timer advances do not emit additional ended events
      vi.advanceTimersByTime(25000);
      expect(endedSpy).toHaveBeenCalledTimes(1);

      killSpy.mockRestore();
      detector.stopAll();
      vi.useRealTimers();
    });
  });

  // =========================================================================
  // 3. STORAGE HYDRATION SPEED & ZERO SYNCHRONOUS DISK I/O BENCHMARK
  // =========================================================================
  describe('3. Storage Hydration Speed & Zero Synchronous Disk I/O Benchmark', () => {
    it('executes getAllGames() with 500+ mock rows with ZERO synchronous disk calls (statSync, openSync, readFileSync)', () => {
      // Generate 500 mock database rows with diverse metadata completeness
      const MOCK_ROW_COUNT = 500;
      mockDbRows = Array.from({ length: MOCK_ROW_COUNT }, (_, i) => {
        const hasOtixData = i % 2 === 0;
        const hasSources = i % 3 === 0;
        return {
          id: `game-row-${i}`,
          title: `Stress Game Title ${i}`,
          platform: 'pc',
          exe_path: `C:\\Games\\StressGame_${i}\\game_${i}.exe`,
          install_dir: `C:\\Games\\StressGame_${i}`,
          size_bytes: hasOtixData ? 1048576 * (i + 1) : null,
          version: hasOtixData ? `1.${i}.0` : null,
          modified_at: '2026-11-09T18:00:00.000Z',
          created_at: '2026-11-01T00:00:00.000Z',
          updated_at: '2026-11-09T18:00:00.000Z',
          otix_data: hasOtixData
            ? JSON.stringify({
                sizeBytes: 1048576 * (i + 1),
                version: `1.${i}.0`,
                overview: `High performance game description for game ${i}`,
              })
            : null,
          sources: hasSources
            ? JSON.stringify([{ type: 'steam', appid: 1000 + i, isDlc: false }])
            : null,
          otix_match_suggestion: null,
          otix_media_id: i % 4 === 0 ? `media-${i}` : null,
        };
      });

      // Clear all in-memory caches to force full fresh row hydration
      clearRowCache();
      fsCallCounters.reset();

      const startTime = performance.now();
      const hydratedGames = getAllGames();
      const durationMs = performance.now() - startTime;

      // ASSERTION 1: Zero synchronous disk operations during getAllGames()
      expect(fsCallCounters.statSync).toBe(0);
      expect(fsCallCounters.openSync).toBe(0);
      expect(fsCallCounters.readFileSync).toBe(0);
      expect(fsCallCounters.readdirSync).toBe(0);

      // ASSERTION 2: All 500 rows successfully hydrated into GameRow objects
      expect(hydratedGames).toHaveLength(MOCK_ROW_COUNT);
      expect(hydratedGames[0].id).toBe('game-row-0');
      expect(hydratedGames[499].id).toBe('game-row-499');

      // ASSERTION 3: Sub-millisecond per-row execution speed (<1ms per row SLA)
      const perRowTimeMs = durationMs / MOCK_ROW_COUNT;
      // In-memory mapping should be under 0.1ms per row (total < 50ms)
      expect(perRowTimeMs).toBeLessThan(1.0);
      expect(durationMs).toBeLessThan(100);

      console.log(`[Storage Benchmark] 500 rows hydrated in ${durationMs.toFixed(2)}ms (${(perRowTimeMs * 1000).toFixed(2)} µs/row). Synchronous disk calls: 0`);
    });

    it('scales to 1,000+ mock rows with sub-millisecond per-row latency and clean memory footprint', () => {
      const MOCK_ROW_COUNT = 1000;
      mockDbRows = Array.from({ length: MOCK_ROW_COUNT }, (_, i) => ({
        id: `mega-game-${i}`,
        title: `Mega Game ${i}`,
        platform: 'pc',
        exe_path: `C:\\Games\\MegaGame_${i}\\mega_${i}.exe`,
        install_dir: `C:\\Games\\MegaGame_${i}`,
        size_bytes: 5242880,
        version: '2.0.0',
        modified_at: '2026-11-09T18:00:00.000Z',
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-09T18:00:00.000Z',
        otix_data: JSON.stringify({ sizeBytes: 5242880, version: '2.0.0' }),
        sources: null,
        otix_match_suggestion: null,
        otix_media_id: `media-mega-${i}`,
      }));

      clearRowCache();
      fsCallCounters.reset();

      const startTime = performance.now();
      const hydratedGames = getAllGames();
      const durationMs = performance.now() - startTime;

      expect(fsCallCounters.statSync).toBe(0);
      expect(hydratedGames).toHaveLength(MOCK_ROW_COUNT);

      const perRowTimeMs = durationMs / MOCK_ROW_COUNT;
      expect(perRowTimeMs).toBeLessThan(1.0);

      console.log(`[Storage Benchmark 1,000 Rows] Hydrated in ${durationMs.toFixed(2)}ms (${(perRowTimeMs * 1000).toFixed(2)} µs/row). Synchronous disk calls: 0`);
    });

    it('asynchronously resolves missing metadata in background without blocking execution thread', async () => {
      const dummyFilePath = path.join(tempDir, 'async_resolve_test.exe');
      fs.writeFileSync(dummyFilePath, Buffer.alloc(1024));

      const startTime = performance.now();
      const result = await resolveGameMetadataAsync('test-async-row', dummyFilePath);
      const durationMs = performance.now() - startTime;

      expect(result).not.toBeNull();
      expect(result?.sizeBytes).toBe(1024);
      expect(result?.modifiedAt).toBeDefined();
      expect(durationMs).toBeLessThan(50);
    });
  });
});
