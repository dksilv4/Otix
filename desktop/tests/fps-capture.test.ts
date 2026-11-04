// desktop/tests/fps-capture.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import {
  FpsCaptureService,
  FrameSample,
  IForegroundWatcher,
} from '../game/fps-capture';

describe('Native FpsCaptureService', () => {
  let tmpDir: string;
  let service: FpsCaptureService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otix-fps-test-'));
    service = new FpsCaptureService(tmpDir);
  });

  afterEach(() => {
    service.stopCapture();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('computeStats', () => {
    it('returns null for empty frame times', () => {
      expect(service.computeStats([])).toBeNull();
    });

    it('computes average, 1% low, 0.1% low, min, and max FPS accurately', () => {
      // 60 fps is ~16.67ms
      const frameTimes = new Array(100).fill(16.67);
      // Add a couple stutter frames
      frameTimes[10] = 50; // 20 fps
      frameTimes[20] = 100; // 10 fps

      const stats = service.computeStats(frameTimes);
      expect(stats).toBeDefined();
      expect(stats?.totalFrames).toBe(100);
      expect(stats?.avgFps).toBeGreaterThan(50);
      expect(stats?.minFps).toBeCloseTo(10, 0);
      expect(stats?.maxFps).toBeCloseTo(60, 0);
      expect(stats?.onePercentLow).toBeLessThanOrEqual(stats!.avgFps);
    });

    it('filters out unfocused/background frames and records backgroundDurationMs (Alt-Tab)', () => {
      // 1000 in-game frames at 280 FPS (~3.57ms) while focused
      const focusedSamples: FrameSample[] = [];
      let ts = Date.now();
      for (let i = 0; i < 1000; i++) {
        ts += 3.57;
        focusedSamples.push({
          ms: 3.57,
          ts,
          isBg: false,
          isLobby: false,
        });
      }

      // 500 frames at 30 FPS (~33.33ms) while unfocused / Alt-Tabbed
      const unfocusedSamples: FrameSample[] = [];
      for (let i = 0; i < 500; i++) {
        ts += 33.33;
        unfocusedSamples.push({
          ms: 33.33,
          ts,
          isBg: true,
          isLobby: false,
        });
      }

      const allSamples = [...focusedSamples, ...unfocusedSamples];
      const stats = service.computeStats(allSamples);

      expect(stats).toBeDefined();
      expect(stats?.totalFrames).toBe(1500);
      expect(stats?.gameplayFrames).toBe(1000);
      // avgFps must reflect true gameplay ~280 FPS, NOT dragged down to ~80-100 by the 30 FPS background frames!
      expect(stats?.avgFps).toBeCloseTo(280, 0);
      expect(stats?.backgroundDurationMs).toBeGreaterThan(16000);
      expect(stats?.unfilteredAvgFps).toBeLessThan(100);
    });

    it('filters out lobby frames explicitly marked via GSI / game provider (CS2 scenario)', () => {
      // CS2 scenario: 600 frames at 120 FPS (~8.33ms) in lobby waiting for match
      const lobbySamples: FrameSample[] = [];
      let ts = Date.now();
      for (let i = 0; i < 600; i++) {
        ts += 8.33;
        lobbySamples.push({
          ms: 8.33,
          ts,
          isBg: false,
          isLobby: true,
        });
      }

      // 1800 frames at 280 FPS (~3.57ms) in-game
      const gameSamples: FrameSample[] = [];
      for (let i = 0; i < 1800; i++) {
        ts += 3.57;
        gameSamples.push({
          ms: 3.57,
          ts,
          isBg: false,
          isLobby: false,
        });
      }

      const allSamples = [...lobbySamples, ...gameSamples];
      const stats = service.computeStats(allSamples);

      expect(stats).toBeDefined();
      expect(stats?.totalFrames).toBe(2400);
      expect(stats?.gameplayFrames).toBe(1800);
      // avgFps must be pure in-game FPS (~280), not dragged down to ~200 by lobby frames
      expect(stats?.avgFps).toBeCloseTo(280, 0);
      expect(stats?.lobbyDurationMs).toBeGreaterThan(4900);
      expect(stats?.unfilteredAvgFps).toBeLessThan(230);
    });

    it('filters out lobby frames using generic statistical heuristics for ALL games (no GSI required)', () => {
      // Generic shooter/battle royale scenario without GSI:
      // Player sits in pre-match lobby at locked 60 FPS cap (150 frames at 16.67ms with virtually zero variance)
      const lobbySamples: FrameSample[] = [];
      let ts = Date.now();
      for (let i = 0; i < 200; i++) {
        ts += 16.67;
        lobbySamples.push({
          ms: 16.67,
          ts,
          isBg: false,
          isLobby: false, // No explicit GSI tag!
        });
      }

      // Player enters active match running at 200 FPS (~5.0ms with dynamic variance 4.7ms - 5.3ms)
      const matchSamples: FrameSample[] = [];
      for (let i = 0; i < 800; i++) {
        const jitter = (i % 5) * 0.15 - 0.3; // 4.7ms to 5.3ms
        const ms = 5.0 + jitter;
        ts += ms;
        matchSamples.push({
          ms,
          ts,
          isBg: false,
          isLobby: false,
        });
      }

      const allSamples = [...lobbySamples, ...matchSamples];
      const stats = service.computeStats(allSamples);

      expect(stats).toBeDefined();
      expect(stats?.totalFrames).toBe(1000);
      // The statistical heuristic should identify the 60 FPS cap lobby plateau and exclude it
      expect(stats?.avgFps).toBeGreaterThan(180);
      expect(stats?.lobbyDurationMs).toBeGreaterThan(3000);
      expect(stats?.unfilteredAvgFps).toBeLessThan(140);
    });

    it('preserves 60 FPS gameplay in fixed frame rate games (Elden Ring guardrail)', () => {
      // Game locked to 60 FPS across both menu and entire game
      const samples: FrameSample[] = [];
      let ts = Date.now();
      for (let i = 0; i < 300; i++) {
        ts += 16.67;
        samples.push({
          ms: 16.67,
          ts,
          isBg: false,
          isLobby: false,
        });
      }

      const stats = service.computeStats(samples);
      expect(stats).toBeDefined();
      expect(stats?.totalFrames).toBe(300);
      expect(stats?.gameplayFrames).toBe(300);
      expect(stats?.avgFps).toBeCloseTo(60, 0);
    });

    it('handles 100% lobby session gracefully without failing', () => {
      // User only opened game, stayed in lobby, and closed it
      const samples: FrameSample[] = [];
      let ts = Date.now();
      for (let i = 0; i < 100; i++) {
        ts += 8.33; // 120 FPS
        samples.push({
          ms: 8.33,
          ts,
          isBg: false,
          isLobby: true,
        });
      }

      const stats = service.computeStats(samples);
      expect(stats).toBeDefined();
      expect(stats?.avgFps).toBeCloseTo(120, 0);
      expect(stats?.lobbyDurationMs).toBeGreaterThan(800);
    });

    it('filters out loading stalls (>= 200ms) and accumulates loadingDurationMs', () => {
      const samples: FrameSample[] = [];
      let ts = Date.now();
      for (let i = 0; i < 200; i++) {
        ts += 16.67;
        samples.push({
          ms: 16.67,
          ts,
          isBg: false,
          isLobby: false,
        });
      }

      // 3 loading stall frames
      samples.push({ ms: 300, ts: ts + 300, isBg: false, isLobby: false });
      samples.push({ ms: 500, ts: ts + 800, isBg: false, isLobby: false });
      samples.push({ ms: 250, ts: ts + 1050, isBg: false, isLobby: false });

      const stats = service.computeStats(samples);
      expect(stats).toBeDefined();
      expect(stats?.gameplayFrames).toBe(200);
      expect(stats?.totalFrames).toBe(203);
      expect(stats?.loadingDurationMs).toBe(1050);
      expect(stats?.avgFps).toBeCloseTo(60, 0);
    });
  });

  describe('foregroundWatcher & focus integration', () => {
    it('uses custom foreground watcher to detect focused vs unfocused process', () => {
      let currentPid = 1234;
      const mockWatcher: IForegroundWatcher = {
        start: () => {},
        stop: () => {},
        getForegroundPid: () => currentPid,
        isFocused: (targetPid: number) => currentPid === targetPid,
      };

      service.setForegroundWatcher(mockWatcher);

      expect(service.isProcessFocused(1234)).toBe(true);
      expect(service.isProcessFocused(5678)).toBe(false);

      currentPid = 5678;
      expect(service.isProcessFocused(1234)).toBe(false);
      expect(service.isProcessFocused(5678)).toBe(true);
    });
  });

  describe('CS2 GSI integration', () => {
    it('tracks lobby state for CS2 via GSI manager events', () => {
      const mockGsi = new EventEmitter() as any;
      mockGsi.getState = () => ({ activity: 'menu', isInGame: false });

      service.setCs2GsiManager(mockGsi);

      // Initial state from getState()
      expect(service.isProcessInLobby('cs2')).toBe(true);
      expect(service.isProcessInLobby('counter_strike_2')).toBe(true);

      // Match starts: activity changes to playing
      mockGsi.emit('update', { activity: 'playing', isInGame: true });
      expect(service.isProcessInLobby('cs2')).toBe(false);
      expect(service.isProcessInLobby('counter_strike_2')).toBe(false);

      // Match ends: back to menu
      mockGsi.emit('update', { activity: 'menu', isInGame: false });
      expect(service.isProcessInLobby('cs2')).toBe(true);
      expect(service.isProcessInLobby('counter_strike_2')).toBe(true);
    });
  });

  describe('session persistence', () => {
    it('saves and retrieves recent sessions and calculates playtime for a game', () => {
      const now = Date.now();
      service.saveSession({
        gameId: 'game_hades',
        gameTitle: 'Hades',
        startTime: now - 3600000,
        endTime: now,
        fpsStats: {
          avgFps: 144,
          onePercentLow: 120,
          zeroPointOnePercentLow: 90,
          maxFps: 165,
          minFps: 60,
          totalFrames: 10000,
          gameplayFrames: 9800,
          loadingDurationMs: 2000,
          captureDurationMs: 3600000,
          gameplayDurationMs: 3590000,
          backgroundDurationMs: 8000,
          lobbyDurationMs: 0,
        },
      });

      const recent = service.getRecentSessions(10);
      expect(recent).toHaveLength(1);
      expect(recent[0].gameTitle).toBe('Hades');
      expect(recent[0].fpsStats?.avgFps).toBe(144);
      expect(recent[0].fpsStats?.backgroundDurationMs).toBe(8000);

      const playtime = service.getPlaytimeForGame('game_hades');
      expect(playtime.sessionCount).toBe(1);
      expect(playtime.totalMinutes).toBe(60);
      expect(playtime.lastFpsStats?.avgFps).toBe(144);
    });
  });
});
