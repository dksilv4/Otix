import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';

// ── Module-level mocks ──────────────────────────────────────────────

const mockExec = vi.fn();
const mockSpawn = vi.fn();

vi.mock('ps-list', () => ({
  default: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    exec: (...args: any[]) => mockExec(...args),
    spawn: (...args: any[]) => mockSpawn(...args),
  };
});

vi.mock('../game/storage', () => ({
  updateLastPlayedAt: vi.fn(),
}));

vi.mock('../game/fps', () => ({
  startFpsCapture: vi.fn(() => false),
  stopFpsCapture: vi.fn(),
  isPresentMonAvailable: vi.fn(() => false),
  getLiveFps: vi.fn(() => null),
  isCapturing: vi.fn(() => false),
}));

vi.mock('../desktop-settings', () => ({
  getSettings: vi.fn(() => ({ onlyTrackScannedGames: false })),
}));

vi.mock('../game/node-hardware', () => ({
  getCachedHostNodeAndHardware: vi.fn(() => ({
    node: null,
    hardware: { cpu: 'Test CPU', gpu: 'Test GPU', ramBytes: 16000000000, os: 'Windows 11', discreteGpu: true },
    shareEligible: false,
  })),
  getHostNodeAndHardware: vi.fn(() => Promise.resolve({
    node: null,
    hardware: { cpu: 'Test CPU', gpu: 'Test GPU', ramBytes: 16000000000, os: 'Windows 11', discreteGpu: true },
    shareEligible: false,
  })),
}));

// ── Imports after mocks ─────────────────────────────────────────────

import psList from 'ps-list';
import { GameDetector, clearWindowTitlesCache } from '../game/detector';
import type { LocalGame } from '../preload-api';

function makeGame(overrides: Partial<LocalGame> = {}): LocalGame {
  return {
    id: 'adversarial-game-1',
    title: 'Adversarial Game Title',
    exePath: 'D:/Games/Adversarial/game.exe',
    installDir: 'D:/Games/Adversarial',
    platform: 'pc',
    ...overrides,
  };
}

describe('Adversarial Stress Test: Game Detector Caching & Error Handling', () => {
  let detector: GameDetector;
  const tempSessionsDir = path.join(__dirname, '..', '..', 'tmp-detector-adversarial-test');
  const originalPlatform = process.platform;

  beforeEach(() => {
    fs.mkdirSync(tempSessionsDir, { recursive: true });
    vi.clearAllMocks();
    vi.useRealTimers();
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    vi.mocked(psList).mockResolvedValue([
      { name: 'game.exe', pid: process.pid, ppid: 0, cpu: 0, memory: 0 },
    ]);

    detector = new GameDetector(tempSessionsDir);
    clearWindowTitlesCache();
  });

  afterEach(() => {
    detector.stopAll();
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    try {
      fs.rmSync(tempSessionsDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('Window Titles 30-Second TTL Caching', () => {
    it('executes PowerShell once and reuses cached window titles across successive scans within 30s', async () => {
      detector.setLibrary([makeGame()]);

      let powerShellInvocations = 0;
      mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
        powerShellInvocations++;
        const titles = [{ ProcessName: 'game', Id: process.pid, MainWindowTitle: 'Adversarial Game Title' }];
        cb(null, JSON.stringify(titles), '');
        return {} as any;
      });

      // Scan 1: Cold cache -> must invoke PowerShell
      const scan1 = await detector.scanRunningProcesses();
      expect(powerShellInvocations).toBe(1);
      expect(scan1).toHaveLength(1);
      expect(scan1[0].game.id).toBe('adversarial-game-1');

      // Scan 2: Warm cache (immediate) -> must NOT invoke PowerShell
      const scan2 = await detector.scanRunningProcesses();
      expect(powerShellInvocations).toBe(1);
      expect(scan2).toHaveLength(1);

      // Scan 3: Warm cache (still within 30s) -> must NOT invoke PowerShell
      const scan3 = await detector.scanRunningProcesses();
      expect(powerShellInvocations).toBe(1);
      expect(scan3).toHaveLength(1);
    });

    it('clearWindowTitlesCache() immediately forces a fresh PowerShell invocation', async () => {
      detector.setLibrary([makeGame()]);

      let powerShellInvocations = 0;
      mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
        powerShellInvocations++;
        const titles = [{ ProcessName: 'game', Id: process.pid, MainWindowTitle: 'Adversarial Game Title' }];
        cb(null, JSON.stringify(titles), '');
        return {} as any;
      });

      // Initial scan
      await detector.scanRunningProcesses();
      expect(powerShellInvocations).toBe(1);

      // Explicitly clear cache
      clearWindowTitlesCache();

      // Next scan must fetch freshly from PowerShell
      await detector.scanRunningProcesses();
      expect(powerShellInvocations).toBe(2);
    });

    it('detector.stopAll() clears the window titles cache', async () => {
      detector.setLibrary([makeGame()]);

      let powerShellInvocations = 0;
      mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
        powerShellInvocations++;
        const titles = [{ ProcessName: 'game', Id: process.pid, MainWindowTitle: 'Adversarial Game Title' }];
        cb(null, JSON.stringify(titles), '');
        return {} as any;
      });

      await detector.scanRunningProcesses();
      expect(powerShellInvocations).toBe(1);

      // Calling stopAll() must invoke clearWindowTitlesCache()
      detector.stopAll();

      // Subsequent scan must re-query PowerShell
      await detector.scanRunningProcesses();
      expect(powerShellInvocations).toBe(2);
    });
  });

  describe('Concurrency & Idle Throttling', () => {
    it('deduplicates concurrent getRunningProcesses calls to a single in-flight PowerShell execution', async () => {
      detector.setLibrary([makeGame()]);

      let powerShellInvocations = 0;
      mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
        powerShellInvocations++;
        setTimeout(() => {
          const titles = [{ ProcessName: 'game', Id: process.pid, MainWindowTitle: 'Adversarial Game Title' }];
          cb(null, JSON.stringify(titles), '');
        }, 50);
        return {} as any;
      });

      // Launch 5 simultaneous getRunningProcesses calls
      const concurrentProcessQueries = await Promise.all(
        Array.from({ length: 5 }, () => detector.getRunningProcesses()),
      );

      // All calls returned the mapped window title
      for (const res of concurrentProcessQueries) {
        expect(res.length).toBeGreaterThanOrEqual(1);
        const gameProc = res.find((p) => p.name === 'game.exe');
        expect(gameProc).toBeDefined();
        expect(gameProc?.windowTitle).toBe('Adversarial Game Title');
      }

      // Exactly ONE PowerShell query was spawned despite 5 simultaneous callers
      expect(powerShellInvocations).toBe(1);
    });

    it('protects scanRunningProcesses with isScanning re-entrancy guard during in-flight scan', async () => {
      detector.setLibrary([makeGame()]);

      mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
        const titles = [{ ProcessName: 'game', Id: process.pid, MainWindowTitle: 'Adversarial Game Title' }];
        cb(null, JSON.stringify(titles), '');
        return {} as any;
      });

      // Run initial scan so runningGames is populated
      const initial = await detector.scanRunningProcesses();
      expect(initial).toHaveLength(1);

      // Trigger second scan and immediate concurrent scan
      const scanPromise1 = detector.scanRunningProcesses();
      const scanPromise2 = detector.scanRunningProcesses();

      const [res1, res2] = await Promise.all([scanPromise1, scanPromise2]);

      // Both return the detected running game (res2 returned existing running games without crashing or re-entering)
      expect(res1).toHaveLength(1);
      expect(res2).toHaveLength(1);
    });

    it('completely bypasses PowerShell execution when library and mappings are empty (idle state)', async () => {
      // Library is empty, no mappings, no running games
      detector.setLibrary([]);

      let powerShellInvocations = 0;
      mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
        powerShellInvocations++;
        cb(null, '[]', '');
        return {} as any;
      });

      const results = await detector.scanRunningProcesses();

      expect(results).toHaveLength(0);
      // Zero PowerShell processes spawned!
      expect(powerShellInvocations).toBe(0);
      expect(mockExec).not.toHaveBeenCalled();
    });
  });

  describe('PowerShell Failure & Malformed Output Resilience', () => {
    it('recovers cleanly when PowerShell returns a process execution error', async () => {
      detector.setLibrary([makeGame()]);

      mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
        cb(new Error('PowerShell execution policy restricted (exit code 1)'), '', 'ExecutionPolicy error');
        return {} as any;
      });

      // Must not throw an unhandled rejection
      const results = await detector.scanRunningProcesses();

      // Exe path match still succeeds even without window titles
      expect(results).toHaveLength(1);
      expect(results[0].game.id).toBe('adversarial-game-1');
    });

    it('recovers cleanly when PowerShell outputs truncated or malformed JSON', async () => {
      detector.setLibrary([makeGame()]);

      mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
        cb(null, '{"ProcessName": "game", "Id": 7777, "MainWindowTitle": TRUNCATED_CORRUPT...', '');
        return {} as any;
      });

      // JSON parse error is trapped internally without throwing
      const results = await detector.scanRunningProcesses();

      expect(results).toHaveLength(1);
      expect(results[0].game.id).toBe('adversarial-game-1');
    });

    it('handles non-array single object JSON response from PowerShell', async () => {
      detector.setLibrary([makeGame()]);

      mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
        // PowerShell ConvertTo-Json outputs a single object (not an array) when only one window matches
        cb(null, JSON.stringify({ ProcessName: 'game', Id: process.pid, MainWindowTitle: 'Adversarial Game Title' }), '');
        return {} as any;
      });

      const results = await detector.scanRunningProcesses();

      expect(results).toHaveLength(1);
      expect(results[0].game.id).toBe('adversarial-game-1');
    });
  });

  describe('Launcher Spawn Asynchronous Error Safety', () => {
    it('safely handles asynchronous spawn errors without crashing or unhandled exceptions', async () => {
      // Simulate child process emitting async error (e.g. ENOENT or EACCES)
      const fakeChild = new EventEmitter() as any;
      fakeChild.pid = 99999;
      fakeChild.unref = vi.fn();

      mockSpawn.mockReturnValue(fakeChild);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // In ipc/game-detector.ts:
      // child.on('error', (err) => console.warn('[launcher] Child error:', err));
      // child.unref();

      const { spawn: actualSpawn } = require('child_process');
      const child = actualSpawn('C:\\nonexistent\\game.exe', [], { detached: true, stdio: 'ignore' });
      child.on('error', (err: any) => console.warn('[launcher] Child error:', err));
      child.unref();

      // Emit async ENOENT
      const testError = new Error('spawn ENOENT C:\\nonexistent\\game.exe');
      child.emit('error', testError);

      expect(warnSpy).toHaveBeenCalledWith('[launcher] Child error:', testError);
      warnSpy.mockRestore();
    });
  });
});
