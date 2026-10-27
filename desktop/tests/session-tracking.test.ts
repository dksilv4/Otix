import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { GameDetector, type PlaySession } from '../game/detector';
import { ProcessLauncher, type GameLaunchTarget } from '../game/launcher';
import type { LocalGame } from '../preload-api';

// Mock storage
vi.mock('../game/storage', () => ({
  updateLastPlayedAt: vi.fn(),
  updateGamePlatform: vi.fn(),
}));

// Mock ps-list
vi.mock('ps-list', () => ({
  default: vi.fn().mockResolvedValue([]),
}));

// Mock child_process for ProcessLauncher integration
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

import { updateLastPlayedAt } from '../game/storage';
import { spawn } from 'child_process';

class MockChildProcess extends EventEmitter {
  public pid: number;
  public unref = vi.fn();
  public kill = vi.fn((signal?: NodeJS.Signals) => {
    this.emit('exit', null, signal ?? 'SIGTERM');
    return true;
  });

  constructor(pid = process.pid) {
    super();
    this.pid = pid;
  }
}

function createGame(overrides: Partial<LocalGame> = {}): LocalGame {
  return {
    id: 'elden-ring',
    title: 'Elden Ring',
    exePath: 'C:\\Games\\Elden Ring\\eldenring.exe',
    installDir: 'C:\\Games\\Elden Ring',
    platform: 'pc',
    ...overrides,
  };
}

describe('Session Tracking & Playtime Calculation', () => {
  let tempDir: string;
  let detector: GameDetector;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otix-session-test-'));
    detector = new GameDetector(tempDir);
  });

  afterEach(() => {
    detector.stopAll();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('Game Session Start', () => {
    it('starts tracking game session with PID and emits game:started', () => {
      const startedListener = vi.fn();
      detector.on('game:started', startedListener);

      const game = createGame();
      const testPid = process.pid; // Use current active process PID
      const beforeStart = Date.now();

      detector.startTracking(game, testPid);

      expect(startedListener).toHaveBeenCalledTimes(1);
      const entry = startedListener.mock.calls[0][0];

      expect(entry.game.id).toBe(game.id);
      expect(entry.game.title).toBe(game.title);
      expect(entry.pid).toBe(testPid);
      expect(entry.launchedByOtix).toBe(true);
      expect(entry.startTime).toBeGreaterThanOrEqual(beforeStart);

      // Verifies storage was notified of lastPlayedAt
      expect(updateLastPlayedAt).toHaveBeenCalledTimes(1);
      expect(updateLastPlayedAt).toHaveBeenCalledWith(game.id, expect.any(String));
    });

    it('starts tracking protocol launches without PID and marks launchedByOtix as false', () => {
      const startedListener = vi.fn();
      detector.on('game:started', startedListener);

      const game = createGame({ id: 'steam-game', exePath: 'steam://rungameid/1245620' });
      detector.startTracking(game);

      expect(startedListener).toHaveBeenCalledTimes(1);
      const entry = startedListener.mock.calls[0][0];

      expect(entry.game.id).toBe('steam-game');
      expect(entry.pid).toBeUndefined();
      expect(entry.launchedByOtix).toBe(false);
      expect(detector.getRunningGame()?.game.id).toBe('steam-game');
    });
  });

  describe('Active Status Reporting', () => {
    it('reports running game when PID is active', () => {
      const game = createGame();
      detector.startTracking(game, process.pid);

      const runningGames = detector.getRunningGames();
      expect(runningGames).toHaveLength(1);
      expect(runningGames[0].game.id).toBe(game.id);
      expect(runningGames[0].pid).toBe(process.pid);

      const singleRunning = detector.getRunningGame();
      expect(singleRunning).not.toBeNull();
      expect(singleRunning?.game.id).toBe(game.id);
    });

    it('reports null for getRunningGame when no games are active', () => {
      expect(detector.getRunningGames()).toHaveLength(0);
      expect(detector.getRunningGame()).toBeNull();
    });

    it('filters out dead PIDs from active status', () => {
      const game = createGame({ id: 'dead-game' });
      // Use an inactive PID that does not exist
      const deadPid = 99999999;
      detector.startTracking(game, deadPid);

      const running = detector.getRunningGames();
      expect(running).toHaveLength(0);
      expect(detector.getRunningGame()).toBeNull();
    });

    it('reports multiple concurrent active sessions', () => {
      const g1 = createGame({ id: 'game-1', title: 'Game 1' });
      const g2 = createGame({ id: 'game-2', title: 'Game 2' });

      // Start tracking both without PID so they stay alive without PID kill probe
      detector.startTracking(g1);
      detector.startTracking(g2);

      const running = detector.getRunningGames();
      expect(running).toHaveLength(2);
      const ids = running.map((r) => r.game.id).sort();
      expect(ids).toEqual(['game-1', 'game-2']);
    });
  });

  describe('Process Exit Detection & Session Termination', () => {
    it('ends session upon stopTracking, emits game:ended, and persists session to disk', () => {
      const endedListener = vi.fn();
      detector.on('game:ended', endedListener);

      const game = createGame({ id: 'witcher-3', title: 'The Witcher 3' });
      const startTime = Date.now() - 120000; // Simulated start 2 minutes ago

      detector.startTracking(game);
      // Adjust start time of active session
      const entry = detector.getRunningGame();
      if (entry) {
        entry.startTime = startTime;
      }

      detector.stopTracking(game.id);

      expect(endedListener).toHaveBeenCalledTimes(1);
      const session: PlaySession = endedListener.mock.calls[0][0];

      expect(session.gameId).toBe('witcher-3');
      expect(session.gameTitle).toBe('The Witcher 3');
      expect(session.startTime).toBe(startTime);
      expect(session.endTime).toBeGreaterThanOrEqual(session.startTime);

      // Verify game is removed from active status
      expect(detector.getRunningGames()).toHaveLength(0);
      expect(detector.getRunningGame()).toBeNull();

      // Verify sessions file was persisted to disk
      const sessionsFile = path.join(tempDir, 'play-sessions.json');
      expect(fs.existsSync(sessionsFile)).toBe(true);

      const fileData = JSON.parse(fs.readFileSync(sessionsFile, 'utf-8'));
      expect(fileData).toHaveLength(1);
      expect(fileData[0].gameId).toBe('witcher-3');
    });

    it('integrates with ProcessLauncher to start session on launch and end on process exit', async () => {
      const mockChild = new MockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const launcher = new ProcessLauncher();
      launcher.attachSessionTracker(detector);

      const game: GameLaunchTarget = {
        id: 'hades-2',
        title: 'Hades II',
        exePath: 'C:\\Games\\Hades II\\Hades2.exe',
      };

      const endedListener = vi.fn();
      detector.on('game:ended', endedListener);

      // Launch game with launcher
      const launched = await launcher.launchGameProcess(game, { platform: 'win32' });

      // Verify session started in detector
      expect(detector.getRunningGame()?.game.id).toBe('hades-2');
      expect(detector.getRunningGame()?.pid).toBe(process.pid);

      // Simulate game process exit
      mockChild.emit('exit', 0, null);
      await launched.waitForExit();

      // Verify session ended in detector
      expect(endedListener).toHaveBeenCalledTimes(1);
      expect(endedListener.mock.calls[0][0].gameId).toBe('hades-2');
      expect(detector.getRunningGames()).toHaveLength(0);
    });
  });

  describe('Accurate Playtime Duration Calculation (getPlaytimeForGame)', () => {
    it('returns zero duration when no sessions file exists', () => {
      const playtime = detector.getPlaytimeForGame('non-existent-game');
      expect(playtime).toEqual({
        totalMinutes: 0,
        sessionCount: 0,
        lastPlayed: null,
        lastFpsStats: null,
      });
    });

    it('returns zero duration when sessions file contains empty array or corrupt data', () => {
      const sessionsFile = path.join(tempDir, 'play-sessions.json');

      fs.writeFileSync(sessionsFile, '[]', 'utf-8');
      expect(detector.getPlaytimeForGame('any-game')).toEqual({
        totalMinutes: 0,
        sessionCount: 0,
        lastPlayed: null,
        lastFpsStats: null,
      });

      fs.writeFileSync(sessionsFile, 'invalid-corrupt-json{{{', 'utf-8');
      expect(detector.getPlaytimeForGame('any-game')).toEqual({
        totalMinutes: 0,
        sessionCount: 0,
        lastPlayed: null,
        lastFpsStats: null,
      });
    });

    it('accurately calculates duration for a single session', () => {
      const sessionsFile = path.join(tempDir, 'play-sessions.json');
      const now = Date.now();
      const twoMinutesMs = 120000;

      const sessions: PlaySession[] = [
        {
          id: 'sess-1',
          gameId: 'cyberpunk-2077',
          gameTitle: 'Cyberpunk 2077',
          startTime: now - twoMinutesMs,
          endTime: now,
          launchedByOtix: true,
        },
      ];

      fs.writeFileSync(sessionsFile, JSON.stringify(sessions), 'utf-8');

      const playtime = detector.getPlaytimeForGame('cyberpunk-2077');
      expect(playtime.totalMinutes).toBe(2);
      expect(playtime.sessionCount).toBe(1);
      expect(playtime.lastPlayed).toBe(now);
      expect(playtime.lastFpsStats).toBeNull();
    });

    it('verifies rounding semantics to the nearest minute', () => {
      const sessionsFile = path.join(tempDir, 'play-sessions.json');
      const base = Date.now();

      // Test 29s -> rounds to 0 min
      fs.writeFileSync(
        sessionsFile,
        JSON.stringify([
          {
            id: 's1',
            gameId: 'rounding-test',
            gameTitle: 'Test',
            startTime: base,
            endTime: base + 29000,
            launchedByOtix: true,
          },
        ]),
        'utf-8',
      );
      expect(detector.getPlaytimeForGame('rounding-test').totalMinutes).toBe(0);

      // Test 30s -> rounds to 1 min (Math.round(30000 / 60000) = 1)
      fs.writeFileSync(
        sessionsFile,
        JSON.stringify([
          {
            id: 's2',
            gameId: 'rounding-test',
            gameTitle: 'Test',
            startTime: base,
            endTime: base + 30000,
            launchedByOtix: true,
          },
        ]),
        'utf-8',
      );
      expect(detector.getPlaytimeForGame('rounding-test').totalMinutes).toBe(1);

      // Test 89s -> rounds to 1 min (Math.round(89000 / 60000) = 1)
      fs.writeFileSync(
        sessionsFile,
        JSON.stringify([
          {
            id: 's3',
            gameId: 'rounding-test',
            gameTitle: 'Test',
            startTime: base,
            endTime: base + 89000,
            launchedByOtix: true,
          },
        ]),
        'utf-8',
      );
      expect(detector.getPlaytimeForGame('rounding-test').totalMinutes).toBe(1);

      // Test 91s -> rounds to 2 min (Math.round(91000 / 60000) = 2)
      fs.writeFileSync(
        sessionsFile,
        JSON.stringify([
          {
            id: 's4',
            gameId: 'rounding-test',
            gameTitle: 'Test',
            startTime: base,
            endTime: base + 91000,
            launchedByOtix: true,
          },
        ]),
        'utf-8',
      );
      expect(detector.getPlaytimeForGame('rounding-test').totalMinutes).toBe(2);
    });

    it('accumulates playtime across multiple sessions and excludes other games', () => {
      const sessionsFile = path.join(tempDir, 'play-sessions.json');
      const now = Date.now();

      const sessions: PlaySession[] = [
        // Game A - Session 1: 15 minutes (900,000 ms)
        {
          id: 'sess-a1',
          gameId: 'game-a',
          gameTitle: 'Game A',
          startTime: now - 3600000,
          endTime: now - 3600000 + 900000,
          launchedByOtix: true,
        },
        // Game A - Session 2: 45 minutes (2,700,000 ms)
        {
          id: 'sess-a2',
          gameId: 'game-a',
          gameTitle: 'Game A',
          startTime: now - 1800000,
          endTime: now - 1800000 + 2700000,
          launchedByOtix: true,
        },
        // Game B - Session: 120 minutes (7,200,000 ms)
        {
          id: 'sess-b1',
          gameId: 'game-b',
          gameTitle: 'Game B',
          startTime: now - 7200000,
          endTime: now,
          launchedByOtix: true,
        },
      ];

      fs.writeFileSync(sessionsFile, JSON.stringify(sessions), 'utf-8');

      // Game A: 15m + 45m = 60m, 2 sessions
      const statsA = detector.getPlaytimeForGame('game-a');
      expect(statsA.totalMinutes).toBe(60);
      expect(statsA.sessionCount).toBe(2);
      expect(statsA.lastPlayed).toBe(now - 1800000 + 2700000);

      // Game B: 120m, 1 session
      const statsB = detector.getPlaytimeForGame('game-b');
      expect(statsB.totalMinutes).toBe(120);
      expect(statsB.sessionCount).toBe(1);
      expect(statsB.lastPlayed).toBe(now);

      // Game C (unplayed): 0m, 0 sessions
      const statsC = detector.getPlaytimeForGame('game-c');
      expect(statsC.totalMinutes).toBe(0);
      expect(statsC.sessionCount).toBe(0);
      expect(statsC.lastPlayed).toBeNull();
    });

    it('filters out invalid sessions where endTime <= startTime', () => {
      const sessionsFile = path.join(tempDir, 'play-sessions.json');
      const now = Date.now();

      const sessions: PlaySession[] = [
        // Valid session: 10 minutes (600,000 ms)
        {
          id: 'valid-sess',
          gameId: 'filter-test',
          gameTitle: 'Filter Test',
          startTime: now - 600000,
          endTime: now,
          launchedByOtix: true,
        },
        // Invalid session: endTime equals startTime (0 ms)
        {
          id: 'zero-sess',
          gameId: 'filter-test',
          gameTitle: 'Filter Test',
          startTime: now,
          endTime: now,
          launchedByOtix: true,
        },
        // Invalid session: endTime before startTime (negative duration)
        {
          id: 'negative-sess',
          gameId: 'filter-test',
          gameTitle: 'Filter Test',
          startTime: now,
          endTime: now - 50000,
          launchedByOtix: true,
        },
      ];

      fs.writeFileSync(sessionsFile, JSON.stringify(sessions), 'utf-8');

      const stats = detector.getPlaytimeForGame('filter-test');
      expect(stats.totalMinutes).toBe(10);
      expect(stats.sessionCount).toBe(1);
    });

    it('returns the most recent FPS stats when present', () => {
      const sessionsFile = path.join(tempDir, 'play-sessions.json');
      const now = Date.now();

      const olderFps = {
        avgFps: 60,
        minFps: 45,
        maxFps: 75,
        onePercentLow: 50,
        sampleCount: 100,
        durationSeconds: 60,
        source: 'presentmon' as const,
      };

      const newerFps = {
        avgFps: 120,
        minFps: 95,
        maxFps: 144,
        onePercentLow: 105,
        sampleCount: 200,
        durationSeconds: 120,
        source: 'presentmon' as const,
      };

      const sessions: PlaySession[] = [
        {
          id: 'sess-old',
          gameId: 'fps-game',
          gameTitle: 'FPS Game',
          startTime: now - 200000,
          endTime: now - 100000,
          launchedByOtix: true,
          fpsStats: olderFps,
        },
        {
          id: 'sess-new',
          gameId: 'fps-game',
          gameTitle: 'FPS Game',
          startTime: now - 90000,
          endTime: now,
          launchedByOtix: true,
          fpsStats: newerFps,
        },
      ];

      fs.writeFileSync(sessionsFile, JSON.stringify(sessions), 'utf-8');

      const stats = detector.getPlaytimeForGame('fps-game');
      expect(stats.lastFpsStats).toEqual(newerFps);
    });

    it('executes end-to-end start -> stop -> playtime calculation cycle', () => {
      const game = createGame({ id: 'e2e-game', title: 'E2E Game' });

      // 1. Initially 0 playtime
      expect(detector.getPlaytimeForGame('e2e-game').totalMinutes).toBe(0);

      // 2. Start tracking session
      const startTime = Date.now() - 180000; // 3 minutes ago
      detector.startTracking(game);

      const running = detector.getRunningGame();
      expect(running?.game.id).toBe('e2e-game');
      if (running) {
        running.startTime = startTime;
      }

      // 3. Stop tracking session upon process termination
      detector.stopTracking('e2e-game');

      // 4. Verify calculated playtime immediately reflects the completed session
      const playtime = detector.getPlaytimeForGame('e2e-game');
      expect(playtime.sessionCount).toBe(1);
      expect(playtime.totalMinutes).toBe(3);
      expect(playtime.lastPlayed).toBeGreaterThanOrEqual(startTime);
    });
  });
});
