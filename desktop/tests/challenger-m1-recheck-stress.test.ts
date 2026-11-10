import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// ── In-Memory Mock Database ──────────────────────────────────────────
let mockDbRows: Record<string, any>[] = [];

function createMockDb() {
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

vi.mock('../game/node-hardware', () => ({
  getCachedHostNodeAndHardware: vi.fn(() => ({
    node: null,
    hardware: { cpu: 'Adversarial CPU', gpu: 'Adversarial GPU', ramBytes: 32000000000, os: 'Windows 11', discreteGpu: true },
    shareEligible: false,
  })),
  getHostNodeAndHardware: vi.fn(() => Promise.resolve({
    node: null,
    hardware: { cpu: 'Adversarial CPU', gpu: 'Adversarial GPU', ramBytes: 32000000000, os: 'Windows 11', discreteGpu: true },
    shareEligible: false,
  })),
}));

vi.mock('../desktop-settings', () => ({
  getSettings: vi.fn(() => ({ onlyTrackScannedGames: false, embeddedNodePort: 8090 })),
}));

let mockPsListProcesses: Array<{ pid: number; name: string }> = [];
vi.mock('ps-list', () => ({
  default: vi.fn(() => Promise.resolve([...mockPsListProcesses])),
}));

// Mock child_process so PowerShell window detection does not hang fake timers
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    exec: vi.fn((cmd: string, opts: any, cb: any) => {
      const callback = typeof opts === 'function' ? opts : cb;
      if (callback) {
        callback(null, '', '');
      }
      return {} as any;
    }),
  };
});

import { GameDetector } from '../game/detector';
import type { LocalGame } from '../preload-api';

describe('Challenger M1 Recheck: Grace Period Adversarial Stress Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbRows = [];
    mockPsListProcesses = [];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otix-challenger-m1-recheck-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
    vi.restoreAllMocks();
  });

  it('keeps session alive during full 20s grace period and ends cleanly at 20s if no game process spawns', async () => {
    vi.useFakeTimers();
    const detector = new GameDetector(tempDir);
    const game: LocalGame = {
      id: 'ghost-game',
      title: 'Ghost Game',
      exePath: 'C:\\Games\\GhostGame\\Ghost.exe',
      installDir: 'C:\\Games\\GhostGame',
      platform: 'pc',
    };
    detector.setLibrary([game]);

    const endedSpy = vi.fn();
    detector.on('game:ended', endedSpy);

    const bootstrapPid = 1010;
    const alivePids = new Set<number>([bootstrapPid]);

    const killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number) => {
      if (alivePids.has(pid)) return true as any;
      throw new Error('ESRCH: No such process');
    });

    // Otix launches launcher
    detector.startTracking(game, bootstrapPid);
    expect(detector.getRunningGames()).toHaveLength(1);

    // Launcher dies at t = 1s
    alivePids.delete(bootstrapPid);
    mockPsListProcesses = [];

    // Advance to t = 2s (first check tick)
    await vi.advanceTimersByTimeAsync(2000);
    expect(detector.getRunningGames()).toHaveLength(1);
    expect(detector.getRunningGames()[0].pid).toBeUndefined();
    expect(endedSpy).not.toHaveBeenCalled();

    // Advance to t = 18s (within 20s grace period)
    await vi.advanceTimersByTimeAsync(16000);
    expect(detector.getRunningGames()).toHaveLength(1);
    expect(endedSpy).not.toHaveBeenCalled();

    // Advance to t = 20s (grace period boundary expires)
    await vi.advanceTimersByTimeAsync(2000);
    expect(endedSpy).toHaveBeenCalledTimes(1);
    expect(endedSpy.mock.calls[0][0].gameId).toBe('ghost-game');
    expect(detector.getRunningGames()).toHaveLength(0);

    killSpy.mockRestore();
    detector.stopAll();
    vi.useRealTimers();
  });

  it('successfully transitions to game PID at the very tail of the grace period (t = 18s)', async () => {
    vi.useFakeTimers();
    const detector = new GameDetector(tempDir);
    const game: LocalGame = {
      id: 'late-spawn-game',
      title: 'Late Spawner',
      exePath: 'C:\\Games\\Late\\Late.exe',
      installDir: 'C:\\Games\\Late',
      platform: 'pc',
    };
    detector.setLibrary([game]);

    const endedSpy = vi.fn();
    const updatedSpy = vi.fn();
    detector.on('game:ended', endedSpy);
    detector.on('game:updated', updatedSpy);

    const bootstrapPid = 2020;
    const gameMainPid = 3030;
    const alivePids = new Set<number>([bootstrapPid]);

    const killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number) => {
      if (alivePids.has(pid)) return true as any;
      throw new Error('ESRCH: No such process');
    });

    detector.startTracking(game, bootstrapPid);
    alivePids.delete(bootstrapPid);
    mockPsListProcesses = [];

    // Advance through 16 seconds without game process
    await vi.advanceTimersByTimeAsync(16000);
    expect(endedSpy).not.toHaveBeenCalled();
    expect(detector.getRunningGames()).toHaveLength(1);

    // At t = 18s, game process finally appears!
    alivePids.add(gameMainPid);
    mockPsListProcesses = [{ pid: gameMainPid, name: 'Late.exe' }];

    // Process check ticks at t = 18s
    await vi.advanceTimersByTimeAsync(2000);
    expect(endedSpy).not.toHaveBeenCalled();
    expect(detector.getRunningGames()).toHaveLength(1);
    expect(detector.getRunningGames()[0].pid).toBe(gameMainPid);
    expect(updatedSpy).toHaveBeenCalledWith(expect.objectContaining({ pid: gameMainPid }));

    // Advance to t = 40s (well beyond initial 20s grace period)
    await vi.advanceTimersByTimeAsync(22000);
    expect(endedSpy).not.toHaveBeenCalled();
    expect(detector.getRunningGames()).toHaveLength(1);

    // Terminate gameMainPid
    alivePids.delete(gameMainPid);
    mockPsListProcesses = [];
    await vi.advanceTimersByTimeAsync(2000);
    expect(endedSpy).toHaveBeenCalledTimes(1);
    expect(detector.getRunningGames()).toHaveLength(0);

    killSpy.mockRestore();
    detector.stopAll();
    vi.useRealTimers();
  });

  it('supports concurrent grace periods for multiple independent Otix-launched games', async () => {
    vi.useFakeTimers();
    const detector = new GameDetector(tempDir);
    const game1: LocalGame = {
      id: 'game-1',
      title: 'Game One',
      exePath: 'C:\\Games\\One\\One.exe',
      installDir: 'C:\\Games\\One',
      platform: 'pc',
    };
    const game2: LocalGame = {
      id: 'game-2',
      title: 'Game Two',
      exePath: 'C:\\Games\\Two\\Two.exe',
      installDir: 'C:\\Games\\Two',
      platform: 'pc',
    };
    detector.setLibrary([game1, game2]);

    const endedSpy = vi.fn();
    detector.on('game:ended', endedSpy);

    const alivePids = new Set<number>([111, 222]);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number) => {
      if (alivePids.has(pid)) return true as any;
      throw new Error('ESRCH: No such process');
    });

    detector.startTracking(game1, 111);
    detector.startTracking(game2, 222);
    expect(detector.getRunningGames()).toHaveLength(2);

    // Both intermediate launchers exit at t = 1s
    alivePids.clear();
    mockPsListProcesses = [];

    // Advance 2s: both in grace period
    await vi.advanceTimersByTimeAsync(2000);
    expect(detector.getRunningGames()).toHaveLength(2);
    expect(endedSpy).not.toHaveBeenCalled();

    // At t = 4s, Game 1 spawns, but Game 2 does not spawn
    alivePids.add(333);
    mockPsListProcesses = [{ pid: 333, name: 'One.exe' }];

    await vi.advanceTimersByTimeAsync(2000);
    const running = detector.getRunningGames();
    expect(running).toHaveLength(2);
    const running1 = running.find((r) => r.game.id === 'game-1');
    const running2 = running.find((r) => r.game.id === 'game-2');
    expect(running1?.pid).toBe(333);
    expect(running2?.pid).toBeUndefined();

    // Advance to t = 22s: Game 2 grace period expires and ends, Game 1 remains alive
    await vi.advanceTimersByTimeAsync(18000);
    expect(endedSpy).toHaveBeenCalledTimes(1);
    expect(endedSpy.mock.calls[0][0].gameId).toBe('game-2');
    expect(detector.getRunningGames()).toHaveLength(1);
    expect(detector.getRunningGames()[0].game.id).toBe('game-1');

    killSpy.mockRestore();
    detector.stopAll();
    vi.useRealTimers();
  });

  it('guarantees stopAll() clears all grace periods and stops all timers without memory leak', async () => {
    vi.useFakeTimers();
    const detector = new GameDetector(tempDir);
    const game: LocalGame = {
      id: 'leak-test-game',
      title: 'Leak Test Game',
      exePath: 'C:\\Games\\Leak\\Leak.exe',
      installDir: 'C:\\Games\\Leak',
      platform: 'pc',
    };
    detector.setLibrary([game]);

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });

    detector.startTracking(game, 9999);
    // Intermediate launcher is immediately dead
    await vi.advanceTimersByTimeAsync(2000);
    expect(detector.getRunningGames()).toHaveLength(1);

    // Call stopAll() during active grace period
    detector.stopAll();
    expect(detector.getRunningGames()).toHaveLength(0);

    // Advancing timers should not cause any errors, ticks, or resurrect sessions
    await vi.advanceTimersByTimeAsync(30000);
    expect(detector.getRunningGames()).toHaveLength(0);

    killSpy.mockRestore();
    vi.useRealTimers();
  });

  it('ensures getRunningGames() continuously reports running game throughout grace period and game spawn after check tick', async () => {
    vi.useFakeTimers();
    const detector = new GameDetector(tempDir);
    const game: LocalGame = {
      id: 'continuous-game',
      title: 'Continuous Game',
      exePath: 'C:\\Games\\Cont\\Cont.exe',
      installDir: 'C:\\Games\\Cont',
      platform: 'pc',
    };
    detector.setLibrary([game]);

    const bootstrapPid = 4040;
    const gameMainPid = 5050;
    const alivePids = new Set<number>([bootstrapPid]);

    const killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number) => {
      if (alivePids.has(pid)) return true as any;
      throw new Error('ESRCH: No such process');
    });

    detector.startTracking(game, bootstrapPid);

    // Initial check: length 1, PID bootstrapPid
    expect(detector.getRunningGames()).toHaveLength(1);
    expect(detector.getRunningGames()[0].pid).toBe(bootstrapPid);

    // Launcher terminates at t = 1s
    alivePids.delete(bootstrapPid);
    mockPsListProcesses = [];

    // Advance to t = 2s: process check triggers, PID becomes undefined, session kept alive
    await vi.advanceTimersByTimeAsync(2000);
    expect(detector.getRunningGames()).toHaveLength(1);
    expect(detector.getRunningGames()[0].pid).toBeUndefined();

    // Advance to t = 3s: polling getRunningGames() still yields 1 in grace period
    await vi.advanceTimersByTimeAsync(1000);
    expect(detector.getRunningGames()).toHaveLength(1);
    expect(detector.getRunningGames()[0].pid).toBeUndefined();

    // Game process spawns at t = 4s
    alivePids.add(gameMainPid);
    mockPsListProcesses = [{ pid: gameMainPid, name: 'Cont.exe' }];

    // Advance to t = 4s: next check binds gameMainPid
    await vi.advanceTimersByTimeAsync(1000);
    expect(detector.getRunningGames()).toHaveLength(1);
    expect(detector.getRunningGames()[0].pid).toBe(gameMainPid);

    killSpy.mockRestore();
    detector.stopAll();
    vi.useRealTimers();
  });

  it('cleans up session tracking immediately without firing duplicate ended events when stopTracking is called during grace period', async () => {
    vi.useFakeTimers();
    const detector = new GameDetector(tempDir);
    const game: LocalGame = {
      id: 'manual-stop-game',
      title: 'Manual Stop Game',
      exePath: 'C:\\Games\\Stop\\Stop.exe',
      installDir: 'C:\\Games\\Stop',
      platform: 'pc',
    };
    detector.setLibrary([game]);

    const endedSpy = vi.fn();
    detector.on('game:ended', endedSpy);

    const bootstrapPid = 6060;
    const alivePids = new Set<number>([bootstrapPid]);

    const killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number) => {
      if (alivePids.has(pid)) return true as any;
      throw new Error('ESRCH: No such process');
    });

    detector.startTracking(game, bootstrapPid);
    alivePids.delete(bootstrapPid);

    // Advance 2s into grace period
    await vi.advanceTimersByTimeAsync(2000);
    expect(detector.getRunningGames()).toHaveLength(1);
    expect(endedSpy).not.toHaveBeenCalled();

    // User or system explicitly stops tracking at t = 4s
    detector.stopTracking('manual-stop-game');
    expect(endedSpy).toHaveBeenCalledTimes(1);
    expect(detector.getRunningGames()).toHaveLength(0);

    // Advance through 30s — no second game:ended event or error
    await vi.advanceTimersByTimeAsync(30000);
    expect(endedSpy).toHaveBeenCalledTimes(1);
    expect(detector.getRunningGames()).toHaveLength(0);

    killSpy.mockRestore();
    detector.stopAll();
    vi.useRealTimers();
  });

  it('does NOT grant a grace period after the actual game process terminates', async () => {
    vi.useFakeTimers();
    const detector = new GameDetector(tempDir);
    const game: LocalGame = {
      id: 'quick-crash-game',
      title: 'Quick Crash Game',
      exePath: 'C:\\Games\\Crash\\Crash.exe',
      installDir: 'C:\\Games\\Crash',
      platform: 'pc',
    };
    detector.setLibrary([game]);

    const endedSpy = vi.fn();
    detector.on('game:ended', endedSpy);

    const bootstrapPid = 7070;
    const gameMainPid = 8080;
    const alivePids = new Set<number>([bootstrapPid]);

    const killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number) => {
      if (alivePids.has(pid)) return true as any;
      throw new Error('ESRCH: No such process');
    });

    detector.startTracking(game, bootstrapPid);
    alivePids.delete(bootstrapPid);

    // Transition to gameMainPid at t = 2s
    alivePids.add(gameMainPid);
    mockPsListProcesses = [{ pid: gameMainPid, name: 'Crash.exe' }];
    await vi.advanceTimersByTimeAsync(2000);

    expect(detector.getRunningGames()[0].pid).toBe(gameMainPid);

    // Now gameMainPid crashes at t = 4s
    alivePids.delete(gameMainPid);
    mockPsListProcesses = [];

    // Next tick at t = 4s: must terminate IMMEDIATELY, NOT grant another 20s
    await vi.advanceTimersByTimeAsync(2000);
    expect(endedSpy).toHaveBeenCalledTimes(1);
    expect(detector.getRunningGames()).toHaveLength(0);

    killSpy.mockRestore();
    detector.stopAll();
    vi.useRealTimers();
  });
});
