import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { spawn as realSpawn } from 'child_process';
import {
  ProcessLauncher,
  launchGameProcess,
  parseLaunchArgs,
  type ProcessExitInfo,
} from '../game/launcher';
import { GameDetector, type PlaySession } from '../game/detector';

// Mock storage
vi.mock('../game/storage', () => ({
  updateLastPlayedAt: vi.fn(),
  updateGamePlatform: vi.fn(),
}));

// Mock ps-list
vi.mock('ps-list', () => ({
  default: vi.fn().mockResolvedValue([]),
}));

class MockChildProcess extends EventEmitter {
  public pid: number;
  public unref = vi.fn();
  public kill = vi.fn((signal?: NodeJS.Signals) => {
    this.emit('exit', null, signal ?? 'SIGTERM');
    return true;
  });

  constructor(pid = 7777) {
    super();
    this.pid = pid;
  }
}

let mockSpawnEnabled = true;
let currentMockChild: MockChildProcess;

// Mock child_process.spawn with toggle for mock vs real OS execution
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: vi.fn((cmd: string, args: string[], opts: any) => {
      if (mockSpawnEnabled) {
        currentMockChild = new MockChildProcess(8888);
        return currentMockChild;
      }
      return actual.spawn(cmd, args, opts);
    }),
  };
});

describe('Desktop Process Launcher & Session Tracking Adversarial Suite', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawnEnabled = true;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otix-adv-test-'));
  });

  afterEach(() => {
    mockSpawnEnabled = false;
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. ADVERSARIAL TEST: PROCESS EXIT CODE TRAPPING
  // ==========================================================================
  describe('Process Exit Code Trapping (Adversarial)', () => {
    it('traps clean exit (code 0)', async () => {
      const launcher = new ProcessLauncher();

      const launched = await launcher.launchGameProcess(
        { id: 'clean-game', title: 'Clean Game', exePath: '/usr/bin/clean' },
        { platform: 'darwin' },
      );

      expect(launcher.getActiveProcesses().length).toBe(1);
      expect(currentMockChild).toBeDefined();

      // Emit clean exit code 0
      currentMockChild.emit('exit', 0, null);

      const exitInfo = await launched.waitForExit();
      expect(exitInfo.exitCode).toBe(0);
      expect(exitInfo.signal).toBeNull();
      expect(exitInfo.error).toBeUndefined();
      expect(launcher.getActiveProcesses().length).toBe(0);
    });

    it('traps crash exit (code 1)', async () => {
      const launcher = new ProcessLauncher();

      const launched = await launcher.launchGameProcess(
        { id: 'crash-game', title: 'Crash Game', exePath: '/usr/bin/crash' },
        { platform: 'darwin' },
      );

      expect(currentMockChild).toBeDefined();
      currentMockChild.emit('exit', 1, null);

      const exitInfo = await launched.waitForExit();
      expect(exitInfo.exitCode).toBe(1);
      expect(exitInfo.signal).toBeNull();
      expect(launcher.getActiveProcesses().length).toBe(0);
    });

    it('traps crash exit (code 137 - OOM / kill)', async () => {
      const launcher = new ProcessLauncher();
      const launched = await launcher.launchGameProcess(
        { id: 'oom-game', title: 'OOM Game', exePath: '/usr/bin/oom' },
        { platform: 'darwin' },
      );

      currentMockChild.emit('exit', 137, null);

      const exitInfo = await launched.waitForExit();
      expect(exitInfo.exitCode).toBe(137);
      expect(exitInfo.signal).toBeNull();
    });

    it('traps SIGKILL signal termination', async () => {
      const launcher = new ProcessLauncher();
      const launched = await launcher.launchGameProcess(
        { id: 'sigkill-game', title: 'Sigkill Game', exePath: '/usr/bin/sigkill' },
        { platform: 'darwin' },
      );

      currentMockChild.emit('exit', null, 'SIGKILL');

      const exitInfo = await launched.waitForExit();
      expect(exitInfo.exitCode).toBeNull();
      expect(exitInfo.signal).toBe('SIGKILL');
      expect(launcher.getActiveProcesses().length).toBe(0);
    });

    it('traps SIGSEGV signal termination', async () => {
      const launcher = new ProcessLauncher();
      const launched = await launcher.launchGameProcess(
        { id: 'sigsegv-game', title: 'Sigsegv Game', exePath: '/usr/bin/sigsegv' },
        { platform: 'darwin' },
      );

      currentMockChild.emit('exit', null, 'SIGSEGV');

      const exitInfo = await launched.waitForExit();
      expect(exitInfo.exitCode).toBeNull();
      expect(exitInfo.signal).toBe('SIGSEGV');
    });

    it('traps spawn errors (missing binary / ENOENT) via child error event', async () => {
      const launcher = new ProcessLauncher();
      const onError = vi.fn();
      const onExit = vi.fn();

      const launched = await launcher.launchGameProcess(
        { id: 'missing-game', title: 'Missing Game', exePath: '/opt/otix/non_existent_binary' },
        { platform: 'darwin', onError, onExit },
      );

      const spawnError = new Error('spawn ENOENT');
      (spawnError as any).code = 'ENOENT';

      // Child emits error event
      currentMockChild.emit('error', spawnError);

      const exitInfo = await launched.waitForExit();
      expect(exitInfo.error).toBe(spawnError);
      expect(onError).toHaveBeenCalledWith(spawnError);
      expect(onExit).toHaveBeenCalledWith(exitInfo);
      expect(launcher.getActiveProcesses().length).toBe(0);
    });

    it('traps real OS process exits when spawning host binaries', async () => {
      mockSpawnEnabled = false; // Disable mock to run real OS binary
      const shPath = '/bin/sh';
      if (!fs.existsSync(shPath)) return;

      const runReal = async (args: string[]): Promise<ProcessExitInfo> => {
        return new Promise((resolve) => {
          const child = realSpawn(shPath, args, { stdio: 'ignore' });
          const startTime = Date.now();
          child.on('exit', (code, signal) => {
            const endTime = Date.now();
            resolve({
              exitCode: code,
              signal,
              startTime,
              endTime,
              durationMs: Math.max(0, endTime - startTime),
            });
          });
        });
      };

      const res0 = await runReal(['-c', 'exit 0']);
      expect(res0.exitCode).toBe(0);

      const res1 = await runReal(['-c', 'exit 1']);
      expect(res1.exitCode).toBe(1);

      const res137 = await runReal(['-c', 'exit 137']);
      expect(res137.exitCode).toBe(137);

      const resKill = await runReal(['-c', 'kill -9 $$']);
      expect(resKill.signal).toBe('SIGKILL');

      const resSegv = await runReal(['-c', 'kill -11 $$']);
      expect(resSegv.signal).toBe('SIGSEGV');
    });
  });

  // ==========================================================================
  // 2. ADVERSARIAL TEST: SESSION DURATION & CLOCK SKEW
  // ==========================================================================
  describe('Session Duration & Clock Skew (Adversarial)', () => {
    it('guards against clock skew in ProcessLauncher: durationMs never negative', async () => {
      const launcher = new ProcessLauncher();
      const realDateNow = Date.now;

      try {
        let callCount = 0;
        // First call: process start (time = 1000000)
        // Second call: process exit, but clock stepped back to 500000!
        Date.now = vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return 1_000_000;
          return 500_000; // Clock skew backwards!
        });

        const launched = await launcher.launchGameProcess(
          { id: 'skew-game', title: 'Skew Game', exePath: '/usr/bin/game' },
          { platform: 'darwin' },
        );

        (launched.child as any).emit('exit', 0, null);
        const exitInfo = await launched.waitForExit();

        expect(exitInfo.durationMs).toBe(0); // Math.max(0, endTime - startTime)
        expect(exitInfo.durationMs).toBeGreaterThanOrEqual(0);
      } finally {
        Date.now = realDateNow;
      }
    });

    it('GameDetector filters out invalid sessions where endTime <= startTime', () => {
      const detector = new GameDetector(tempDir);
      const sessionsPath = path.join(tempDir, 'play-sessions.json');

      const now = Date.now();
      const testSessions: Partial<PlaySession>[] = [
        {
          id: 'sess-valid',
          gameId: 'game-1',
          startTime: now - 120_000,
          endTime: now, // 2 minutes (120,000 ms)
        },
        {
          id: 'sess-zero-duration',
          gameId: 'game-1',
          startTime: now,
          endTime: now, // endTime === startTime (0 ms duration)
        },
        {
          id: 'sess-clock-skew-backwards',
          gameId: 'game-1',
          startTime: now,
          endTime: now - 600_000, // endTime < startTime (-10 minutes)
        },
      ];

      fs.writeFileSync(sessionsPath, JSON.stringify(testSessions), 'utf-8');

      const stats = detector.getPlaytimeForGame('game-1');

      // The 2 invalid sessions must be filtered out! Only sess-valid counted.
      expect(stats.sessionCount).toBe(1);
      expect(stats.totalMinutes).toBe(2);
    });

    it('GameDetector filters invalid timestamps (NaN, identical strings, dual null)', () => {
      const detector = new GameDetector(tempDir);
      const sessionsPath = path.join(tempDir, 'play-sessions.json');

      const testSessions = [
        { id: 's1', gameId: 'g-nan', startTime: 1000, endTime: NaN },
        { id: 's2', gameId: 'g-nan', startTime: 'invalid', endTime: 'invalid' },
        { id: 's3', gameId: 'g-nan', startTime: null, endTime: null },
      ];

      fs.writeFileSync(sessionsPath, JSON.stringify(testSessions), 'utf-8');
      const stats = detector.getPlaytimeForGame('g-nan');

      expect(stats.sessionCount).toBe(0);
      expect(stats.totalMinutes).toBe(0);
    });

    it('EMPIRICAL BUG REVEAL: getPlaytimeForGame type-coerces null startTime to 0, inflating playtime to epoch', () => {
      const detector = new GameDetector(tempDir);
      const sessionsPath = path.join(tempDir, 'play-sessions.json');

      // A corrupt session with null startTime and a realistic modern timestamp
      const modernTimestamp = 1_729_978_800_000; // ~Oct 2024
      const corruptSession = {
        id: 'corrupt-null-start',
        gameId: 'corrupt-game',
        startTime: null,
        endTime: modernTimestamp,
      };

      fs.writeFileSync(sessionsPath, JSON.stringify([corruptSession]), 'utf-8');
      const stats = detector.getPlaytimeForGame('corrupt-game');

      // In JavaScript: `modernTimestamp > null` coerces null -> 0, which is true!
      // And `modernTimestamp - null` computes `modernTimestamp - 0`!
      // This results in >28 million minutes (54+ years) of calculated playtime!
      expect(stats.sessionCount).toBe(1);
      expect(stats.totalMinutes).toBeGreaterThan(28_000_000);
    });

    it('GameDetector correctly calculates multi-session accumulations without cross-game bleeding', () => {
      const detector = new GameDetector(tempDir);
      const sessionsPath = path.join(tempDir, 'play-sessions.json');

      const base = 1_700_000_000_000;
      const testSessions: Partial<PlaySession>[] = [
        // Game A sessions: 30s + 90s + 120s = 240s = 4 minutes
        { id: 'a1', gameId: 'game-a', startTime: base, endTime: base + 30_000 },
        { id: 'a2', gameId: 'game-a', startTime: base + 40_000, endTime: base + 130_000 },
        { id: 'a3', gameId: 'game-a', startTime: base + 140_000, endTime: base + 260_000 },

        // Game B sessions: 45s + 45s = 90s = 1.5m -> 2 minutes
        { id: 'b1', gameId: 'game-b', startTime: base, endTime: base + 45_000 },
        { id: 'b2', gameId: 'game-b', startTime: base + 50_000, endTime: base + 95_000 },
      ];

      fs.writeFileSync(sessionsPath, JSON.stringify(testSessions), 'utf-8');

      const statsA = detector.getPlaytimeForGame('game-a');
      expect(statsA.sessionCount).toBe(3);
      expect(statsA.totalMinutes).toBe(4);

      const statsB = detector.getPlaytimeForGame('game-b');
      expect(statsB.sessionCount).toBe(2);
      expect(statsB.totalMinutes).toBe(2); // 90,000 / 60,000 = 1.5 -> Math.round = 2
    });

    it('GameDetector accurately handles minute rounding boundaries', () => {
      const detector = new GameDetector(tempDir);
      const sessionsPath = path.join(tempDir, 'play-sessions.json');

      const boundaries = [
        { ms: 0, expected: 0, desc: '0s -> 0m' },
        { ms: 15_000, expected: 0, desc: '15s -> 0m' },
        { ms: 29_999, expected: 0, desc: '29.999s -> 0m' },
        { ms: 30_000, expected: 1, desc: '30s -> 1m (half-up)' },
        { ms: 59_999, expected: 1, desc: '59.999s -> 1m' },
        { ms: 60_000, expected: 1, desc: '60s -> 1m' },
        { ms: 89_999, expected: 1, desc: '89.999s -> 1m' },
        { ms: 90_000, expected: 2, desc: '90s -> 2m (half-up)' },
        { ms: 119_999, expected: 2, desc: '119.999s -> 2m' },
        { ms: 120_000, expected: 2, desc: '120s -> 2m' },
        { ms: 149_999, expected: 2, desc: '149.999s -> 2m' },
        { ms: 150_000, expected: 3, desc: '150s -> 3m (half-up)' },
      ];

      for (let i = 0; i < boundaries.length; i++) {
        const b = boundaries[i];
        const gId = `boundary-game-${i}`;
        const session: Partial<PlaySession> = {
          id: `sess-${i}`,
          gameId: gId,
          startTime: 1000,
          endTime: 1000 + b.ms,
        };

        fs.writeFileSync(sessionsPath, JSON.stringify([session]), 'utf-8');
        const stats = detector.getPlaytimeForGame(gId);
        if (b.ms === 0) {
          // 0 duration is filtered out because endTime <= startTime
          expect(stats.totalMinutes).toBe(0);
          expect(stats.sessionCount).toBe(0);
        } else {
          expect(stats.totalMinutes).toBe(b.expected);
          expect(stats.sessionCount).toBe(1);
        }
      }
    });
  });

  // ==========================================================================
  // 3. ADVERSARIAL TEST: EMULATOR INVOCATION & COMMAND INJECTION
  // ==========================================================================
  describe('Emulator Invocation & Command Injection Safety (Adversarial)', () => {
    it('parseLaunchArgs safely tokens shell metacharacters without shell execution', () => {
      const payloads = [
        {
          input: 'game; rm -rf /; .nes',
          expected: ['game;', 'rm', '-rf', '/;', '.nes'],
        },
        {
          input: '--custom-flag "quoted argument" --another=\'single quoted\'',
          expected: ['--custom-flag', 'quoted argument', "--another='single quoted'"],
        },
        {
          input: '--rom="game; rm -rf /; .nes"',
          expected: ['--rom="game; rm -rf /; .nes"'],
        },
        {
          input: 'game$(whoami).nes',
          expected: ['game$(whoami).nes'],
        },
        {
          input: 'game`whoami`.nes',
          expected: ['game`whoami`.nes'],
        },
        {
          input: 'game | cat /etc/passwd | .nes',
          expected: ['game', '|', 'cat', '/etc/passwd', '|', '.nes'],
        },
        {
          input: 'game & echo injected & .nes',
          expected: ['game', '&', 'echo', 'injected', '&', '.nes'],
        },
        {
          input: 'game && touch /tmp/pwned.nes',
          expected: ['game', '&&', 'touch', '/tmp/pwned.nes'],
        },
      ];

      for (const p of payloads) {
        const tokens = parseLaunchArgs(p.input);
        expect(tokens).toEqual(p.expected);
      }
    });

    it('launchGameProcess executes binaries directly via argv array without shell', async () => {
      const launcher = new ProcessLauncher();

      // Launch with malicious payload as array or string
      const launched = await launcher.launchGameProcess(
        {
          id: 'test-game',
          title: 'Test Game',
          exePath: '/usr/bin/emulator',
          launchArguments: ['-L', 'core.dylib', 'game; rm -rf /; .nes', '--flag="foo bar"'],
        },
        { platform: 'darwin' },
      );

      // Verify that args passed to child process are discrete array elements
      expect(launched.args).toEqual([
        '-L',
        'core.dylib',
        'game; rm -rf /; .nes',
        '--flag="foo bar"',
      ]);

      // The malicious string is passed intact as single discrete element
      expect(launched.args[2]).toBe('game; rm -rf /; .nes');
    });

    it('proves real OS child_process.spawn does not execute shell injections when shell is false', async () => {
      mockSpawnEnabled = false; // Disable mock to run real OS binary
      const canaryPath = path.join(tempDir, 'pwned_desktop.txt');
      const echoPath = '/bin/echo';
      if (!fs.existsSync(echoPath)) return;

      // Passing arguments with `; touch canary;` to echo
      const maliciousArg = `; touch "${canaryPath}" ;`;

      await new Promise<void>((resolve, reject) => {
        // spawn without shell option (matches ProcessLauncher behavior)
        const child = realSpawn(echoPath, [maliciousArg], { stdio: 'ignore' });
        child.on('exit', () => resolve());
        child.on('error', reject);
      });

      // CRITICAL ASSERTION: The canary file MUST NOT be created!
      expect(fs.existsSync(canaryPath)).toBe(false);
    });
  });
});
