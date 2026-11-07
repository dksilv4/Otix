import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

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
    node: { name: 'DK_GAMING_PC', url: 'http://127.0.0.1:8090', installed: true, running: true },
    hardware: { cpu: 'Ryzen 7 9800X3D', gpu: 'RTX 5080', ramBytes: 34359738368, os: 'Windows 11', discreteGpu: true },
    shareEligible: true,
  })),
  getHostNodeAndHardware: vi.fn(() => Promise.resolve({
    node: { name: 'DK_GAMING_PC', url: 'http://127.0.0.1:8090', installed: true, running: true },
    hardware: { cpu: 'Ryzen 7 9800X3D', gpu: 'RTX 5080', ramBytes: 34359738368, os: 'Windows 11', discreteGpu: true },
    shareEligible: true,
  })),
}));

// ── Imports after mocks ─────────────────────────────────────────────

import psList from 'ps-list';
import { GameDetector, clearWindowTitlesCache, GENERIC_TITLE_WORDS, HEURISTIC_EXCLUDED_PROCESSES } from '../game/detector';
import type { LocalGame } from '../preload-api';

const alivePids = new Set<number>();
const origKill = process.kill.bind(process);
let killSpy: any;

beforeAll(() => {
  killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number, sig?: string | number) => {
    if (pid === process.pid || alivePids.has(pid)) {
      return true as any;
    }
    return origKill(pid, sig as any);
  });
});

afterAll(() => {
  killSpy?.mockRestore();
});

function makeGame(overrides: Partial<LocalGame> = {}): LocalGame {
  return {
    id: 'test-game',
    title: 'Test Game',
    exePath: 'D:/Games/TestGame/game.exe',
    installDir: 'D:/Games/TestGame',
    platform: 'pc',
    ...overrides,
  };
}

describe('GameDetector Regression: False Positives & Multi-Instance Duplication', () => {
  let detector: GameDetector;
  const tempSessionsDir = path.join(__dirname, '..', '..', 'tmp-detector-regression-test');
  const originalPlatform = process.platform;

  beforeEach(() => {
    fs.mkdirSync(tempSessionsDir, { recursive: true });
    vi.clearAllMocks();
    vi.useRealTimers();
    alivePids.clear();
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

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

  // ═══════════════════════════════════════════════════════════════════
  // 1. False Positive Rejection: "App 0", Generic Titles, Non-PC Games
  // ═══════════════════════════════════════════════════════════════════

  describe('False Positive Prevention', () => {
    it('does NOT detect "App 0" when an IDE or window title contains "App Incorrectly Detecting..."', async () => {
      // Repro case: PS5 internal folder cataloged as "App 0" matching Antigravity / Cursor IDE window
      const app0Game = makeGame({
        id: 'pc_file_99a6c4626314',
        title: 'App 0',
        exePath: 'D:/Games/PS5/Rayman/PPSA33016-app0/eboot.bin',
        installDir: 'D:/Games/PS5/Rayman/PPSA33016-app0',
        platform: 'ps5',
      });
      detector.setLibrary([app0Game]);

      // Running process is the IDE
      vi.mocked(psList).mockResolvedValue([
        { name: 'antigravity.exe', pid: 3196, ppid: 0, cpu: 0, memory: 0 },
      ]);

      mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
        const titles = [{
          ProcessName: 'antigravity',
          Id: 3196,
          MainWindowTitle: 'App Incorrectly Detecting Game - Otix - Antigravity',
        }];
        cb(null, JSON.stringify(titles), '');
        return {} as any;
      });

      const running = await detector.scanRunningProcesses();
      expect(running).toHaveLength(0);
      expect(detector.getRunningGame()).toBeNull();
    });

    it('rejects window title matches when the process is in HEURISTIC_EXCLUDED_PROCESSES', async () => {
      const editorGame = makeGame({
        id: 'code-editor-game',
        title: 'Visual Studio Code Game',
        exePath: 'D:/Games/VSCodeGame/code.exe',
      });
      detector.setLibrary([editorGame]);

      // Process is code.exe
      vi.mocked(psList).mockResolvedValue([
        { name: 'code.exe', pid: 5432, ppid: 0, cpu: 0, memory: 0 },
      ]);

      mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
        const titles = [{
          ProcessName: 'code',
          Id: 5432,
          MainWindowTitle: 'Visual Studio Code Game - Workspace',
        }];
        cb(null, JSON.stringify(titles), '');
        return {} as any;
      });

      const running = await detector.scanRunningProcesses();
      expect(running).toHaveLength(0);
    });

    it('rejects non-PC platform games from matching PC window titles', async () => {
      const ps5Game = makeGame({
        id: 'ps5-rayman',
        title: 'Rayman Legends',
        platform: 'ps5',
        exePath: 'D:/Games/PS5/Rayman/eboot.bin',
      });
      detector.setLibrary([ps5Game]);

      vi.mocked(psList).mockResolvedValue([
        { name: 'chrome.exe', pid: 9001, ppid: 0, cpu: 0, memory: 0 },
      ]);

      mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
        const titles = [{
          ProcessName: 'chrome',
          Id: 9001,
          MainWindowTitle: 'Rayman Legends Walkthrough - Google Chrome',
        }];
        cb(null, JSON.stringify(titles), '');
        return {} as any;
      });

      const running = await detector.scanRunningProcesses();
      expect(running).toHaveLength(0);
    });

    it('never fuzzy-matches archive files (.zip, .rar, .7z) against active Windows processes', async () => {
      // Repro case: BigAmbitionsMP-0.3.3.zip indexed as a game
      const modZipGame = makeGame({
        id: 'pc_file_19e76a27647c',
        title: 'Big Ambitions Mp 0 3 3',
        exePath: 'D:/Games/PC/Big Ambitions/Mods/BigAmbitionsMP-0.3.3.zip',
        installDir: 'D:/Games/PC/Big Ambitions/Mods',
        platform: 'pc',
      });
      detector.setLibrary([modZipGame]);

      // Big Ambitions.exe is running
      vi.mocked(psList).mockResolvedValue([
        { name: 'Big Ambitions.exe', pid: 13572, ppid: 0, cpu: 0, memory: 0 },
      ]);

      mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
        cb(null, JSON.stringify([]), '');
        return {} as any;
      });

      const running = await detector.scanRunningProcesses();
      expect(running).toHaveLength(0);
    });

    it('contains all common IDEs and developers tools in HEURISTIC_EXCLUDED_PROCESSES', () => {
      expect(HEURISTIC_EXCLUDED_PROCESSES.has('antigravity.exe')).toBe(true);
      expect(HEURISTIC_EXCLUDED_PROCESSES.has('cursor.exe')).toBe(true);
      expect(HEURISTIC_EXCLUDED_PROCESSES.has('windsurf.exe')).toBe(true);
      expect(HEURISTIC_EXCLUDED_PROCESSES.has('code.exe')).toBe(true);
      expect(HEURISTIC_EXCLUDED_PROCESSES.has('devenv.exe')).toBe(true);
      expect(HEURISTIC_EXCLUDED_PROCESSES.has('notepad++.exe')).toBe(true);
    });

    it('contains generic words in GENERIC_TITLE_WORDS', () => {
      expect(GENERIC_TITLE_WORDS.has('app')).toBe(true);
      expect(GENERIC_TITLE_WORDS.has('setup')).toBe(true);
      expect(GENERIC_TITLE_WORDS.has('launcher')).toBe(true);
      expect(GENERIC_TITLE_WORDS.has('installer')).toBe(true);
      expect(GENERIC_TITLE_WORDS.has('patch')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 2. Multi-Instance Prevention & Single-PID Claiming
  // ═══════════════════════════════════════════════════════════════════

  describe('Single-PID Claiming and Deduplication', () => {
    it('prevents multiple library games from claiming the exact same process PID', async () => {
      // Repro case: Big Ambitions and a secondary mod entry both matching Big Ambitions.exe
      const mainGame = makeGame({
        id: 'pc_file_6ad6abd82277',
        title: 'Big Ambitions',
        exePath: 'D:/Games/Big Ambitions/Big Ambitions.exe',
        installDir: 'D:/Games/Big Ambitions',
      });
      const modGame = makeGame({
        id: 'pc_file_secondary_mod',
        title: 'Big Ambitions Community Patch',
        exePath: 'D:/Games/Big Ambitions/Patch/Big Ambitions.exe',
        installDir: 'D:/Games/Big Ambitions/Patch',
      });

      detector.setLibrary([mainGame, modGame]);

      const GAME_PID = 13572;
      alivePids.add(GAME_PID);
      vi.mocked(psList).mockResolvedValue([
        { name: 'Big Ambitions.exe', pid: GAME_PID, ppid: 0, cpu: 0, memory: 0 },
      ]);

      mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
        cb(null, JSON.stringify([]), '');
        return {} as any;
      });

      const running = await detector.scanRunningProcesses();
      // Exactly ONE game detected, never both
      expect(running).toHaveLength(1);
      expect(running[0].game.id).toBe('pc_file_6ad6abd82277');
      expect(running[0].pid).toBe(GAME_PID);

      const all = detector.getRunningGames();
      expect(all).toHaveLength(1);
    });

    it('evicts synthetic node entry when the official library game matches the same PID', async () => {
      // First, simulate Node daemon having pushed a synthetic entry for Big Ambitions
      const GAME_PID = 13572;
      alivePids.add(GAME_PID);
      const synthEntry = {
        game: {
          id: 'file_6ad6abd82277',
          title: 'Big Ambitions',
          platform: 'pc' as const,
          exePath: '',
          installDir: '',
        },
        startTime: Date.now() - 60000,
        launchedByOtix: false,
        pid: GAME_PID,
        fpsAvailable: true,
      };
      detector.addOrUpdateRunningGame('file_6ad6abd82277', synthEntry);

      expect(detector.getRunningGames()).toHaveLength(1);
      expect(detector.getRunningGames()[0].game.id).toBe('file_6ad6abd82277');

      // Now library scan runs and finds the real local library game at PID 13572
      const libraryGame = makeGame({
        id: 'pc_file_6ad6abd82277',
        title: 'Big Ambitions',
        exePath: 'D:/Games/Big Ambitions/Big Ambitions.exe',
      });
      detector.setLibrary([libraryGame]);

      vi.mocked(psList).mockResolvedValue([
        { name: 'Big Ambitions.exe', pid: GAME_PID, ppid: 0, cpu: 0, memory: 0 },
      ]);

      mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
        cb(null, JSON.stringify([]), '');
        return {} as any;
      });

      const running = await detector.scanRunningProcesses();
      // Exactly 1 running game — the local library game replaced the synthetic entry
      expect(running).toHaveLength(1);
      expect(running[0].game.id).toBe('pc_file_6ad6abd82277');
      expect(running[0].pid).toBe(GAME_PID);

      // Verify synthetic entry was removed from internal map
      const all = detector.getRunningGames();
      expect(all).toHaveLength(1);
      expect(all[0].game.id).toBe('pc_file_6ad6abd82277');
    });

    it('addOrUpdateRunningGame merges telemetry into existing game rather than creating a duplicate PID', () => {
      const GAME_PID = 13572;
      alivePids.add(GAME_PID);
      const localGame = makeGame({
        id: 'pc_file_6ad6abd82277',
        title: 'Big Ambitions',
      });
      detector.startTracking(localGame, GAME_PID);

      expect(detector.getRunningGames()).toHaveLength(1);
      expect(detector.getRunningGames()[0].game.id).toBe('pc_file_6ad6abd82277');

      // Node daemon pushes telemetry under ID 'file_6ad6abd82277' with same PID
      detector.addOrUpdateRunningGame('file_6ad6abd82277', {
        game: {
          id: 'file_6ad6abd82277',
          title: 'Big Ambitions',
          platform: 'pc',
          exePath: '',
          installDir: '',
        },
        startTime: Date.now() - 5000,
        launchedByOtix: false,
        pid: GAME_PID,
        fpsAvailable: true,
        fpsSnapshot: { currentFps: 144, frameCount: 1440, captureDurationMs: 1000, gameId: 'file_6ad6abd82277' },
      });

      const running = detector.getRunningGames();
      // Still strictly 1 running game, with merged FPS telemetry
      expect(running).toHaveLength(1);
      expect(running[0].game.id).toBe('pc_file_6ad6abd82277');
      expect(running[0].fpsAvailable).toBe(true);
      expect(running[0].fpsSnapshot?.currentFps).toBe(144);
    });

    it('stopTracking with either prefix cleans up both corresponding entries and PID', () => {
      const GAME_PID = 13572;
      alivePids.add(GAME_PID);
      const localGame = makeGame({
        id: 'pc_file_6ad6abd82277',
        title: 'Big Ambitions',
      });
      detector.startTracking(localGame, GAME_PID);

      expect(detector.getRunningGames()).toHaveLength(1);

      // Stop tracking using the node ID prefix ('file_6ad6abd82277')
      detector.stopTracking('file_6ad6abd82277');

      expect(detector.getRunningGames()).toHaveLength(0);
      expect(detector.getRunningGame()).toBeNull();
    });
  });
});
