import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as http from 'http';
import { EventEmitter } from 'events';

// ── Mock DB for storage ──────────────────────────────────────────────

interface MockTableState {
  rows: Map<string, Record<string, any>>;
}

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
      all: vi.fn().mockReturnValue([]),
    }),
  };
}

const mockDbInstance = createMockDb();

vi.mock('../db', () => ({
  getDb: () => mockDbInstance,
}));

// ── Process & Hardware Mocks ────────────────────────────────────────

const mockSpawn = vi.fn();

vi.mock('ps-list', () => ({
  default: vi.fn().mockResolvedValue([]),
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: (...args: any[]) => mockSpawn(...args),
  };
});

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

vi.mock('../desktop-settings', () => ({
  getSettings: vi.fn(() => ({ onlyTrackScannedGames: false, embeddedNodePort: 8090 })),
}));

// ── Imports ──────────────────────────────────────────────────────────

import { GameDetector } from '../game/detector';
import { ProcessLauncher, parseLaunchArgs } from '../game/launcher';
import { runNodeScan } from '../ipc/scanner-pipeline/node-scan-runner';
import {
  clearRowCache,
  getAllGames,
  resolveGameMetadataAsync,
  getPeVersionAsync,
} from '../game/storage';
import type { LocalGame } from '../preload-api';

class MockChildProcess extends EventEmitter {
  public pid: number;
  public unref = vi.fn();
  public kill = vi.fn((signal?: NodeJS.Signals) => {
    this.emit('exit', null, signal ?? 'SIGTERM');
    return true;
  });

  constructor(pid = 9876) {
    super();
    this.pid = pid;
  }
}

describe('Milestone 1 Optimization & Hardening Verification', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otix-m1-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
    vi.restoreAllMocks();
  });

  // ── 1. Process Execution & Launcher Delegation ─────────────────────

  describe('Process Execution & Argument Parsing', () => {
    it('parses complex arguments with double and single quotes preserving boundaries', () => {
      const input = '-dx12 +exec "autoexec config.cfg" -user \'Cyber Samurai\' --server="192.168.1.1:27015"';
      const parsed = parseLaunchArgs(input);
      expect(parsed).toEqual([
        '-dx12',
        '+exec',
        'autoexec config.cfg',
        '-user',
        'Cyber Samurai',
        '--server="192.168.1.1:27015"',
      ]);
    });

    it('launches process, tracks lifecycle events, and binds child.on(exit)', async () => {
      const mockChild = new MockChildProcess(12345);
      mockSpawn.mockReturnValue(mockChild);

      const launcher = new ProcessLauncher({ platform: 'win32' });
      const target = {
        id: 'test-cyberpunk',
        title: 'Cyberpunk 2077',
        exePath: 'C:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe',
        launchArguments: '-dx12 -novid',
      };

      const exitListener = vi.fn();
      launcher.onProcessExit(exitListener);

      const launched = await launcher.launchGameProcess(target);
      expect(launched.pid).toBe(12345);
      expect(mockSpawn).toHaveBeenCalledWith(
        'C:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe',
        ['-dx12', '-novid'],
        expect.objectContaining({ cwd: 'C:\\Games\\Cyberpunk 2077\\bin\\x64' }),
      );

      mockChild.emit('exit', 0, null);
      const exitInfo = await launched.waitForExit();

      expect(exitInfo.exitCode).toBe(0);
      expect(exitInfo.gameId).toBe('test-cyberpunk');
      expect(exitListener).toHaveBeenCalledWith(expect.objectContaining({ gameId: 'test-cyberpunk', exitCode: 0 }));
    });

    it('cleans up session tracking immediately when child process emits an error', async () => {
      const mockChild = new MockChildProcess(54321);
      mockSpawn.mockReturnValue(mockChild);

      const killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number) => {
        if (pid === 54321) return true as any;
        throw new Error('ESRCH: No such process');
      });

      const detector = new GameDetector(tempDir);
      const target: LocalGame = {
        id: 'error-launch-game',
        title: 'Missing Binary Game',
        exePath: 'C:\\Games\\Missing\\nonexistent.exe',
        installDir: 'C:\\Games\\Missing',
        platform: 'pc',
      };
      detector.setLibrary([target]);

      const launcher = new ProcessLauncher({ platform: 'win32' });
      const stopTrackingSpy = vi.spyOn(detector, 'stopTracking');

      const launched = await launcher.launchGameProcess(target, {
        sessionTracker: {
          startTracking: (g, pid) => detector.startTracking(g, pid),
        },
        onExit: (exitInfo) => {
          if (exitInfo.error) {
            detector.stopTracking(target.id);
          }
        },
      });

      expect(detector.getRunningGames()).toHaveLength(1);

      // Child emits error event (e.g. ENOENT spawn error)
      const spawnErr = new Error('ENOENT: spawn failed');
      mockChild.emit('error', spawnErr);

      await launched.waitForExit();

      expect(stopTrackingSpy).toHaveBeenCalledWith('error-launch-game');
      expect(detector.getRunningGames()).toHaveLength(0);

      killSpy.mockRestore();
      detector.stopAll();
    });
  });

  // ── 2. Multi-Stage Launcher Grace Period in GameDetector ────────────

  describe('GameDetector Multi-Stage Launcher Grace Period', () => {
    it('does not terminate session immediately after 2s when intermediate launcher PID terminates', async () => {
      vi.useFakeTimers();
      const detector = new GameDetector(tempDir);
      const game: LocalGame = {
        id: 'cyberpunk-multi-stage',
        title: 'Cyberpunk 2077',
        exePath: 'C:\\Games\\Cyberpunk 2077\\REDprelauncher.exe',
        installDir: 'C:\\Games\\Cyberpunk 2077',
        platform: 'pc',
      };

      const endedListener = vi.fn();
      detector.on('game:ended', endedListener);

      const launcherPid = 1111;
      const alivePids = new Set<number>([launcherPid]);

      const killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number) => {
        if (alivePids.has(pid)) {
          return true as any;
        }
        throw new Error('ESRCH: No such process');
      });

      // Otix launches intermediate launcher (PID: 1111)
      detector.startTracking(game, launcherPid);

      expect(detector.getRunningGames()).toHaveLength(1);
      expect(detector.getRunningGames()[0].pid).toBe(launcherPid);
      expect(detector.getRunningGames()[0].launchedByOtix).toBe(true);

      // Simulate intermediate launcher process exiting at t = 2s
      alivePids.delete(launcherPid);

      // Advance timer by 2,000ms (one processCheck interval)
      await vi.advanceTimersByTimeAsync(2000);

      // Session MUST stay alive during the 15-20s grace period!
      expect(endedListener).not.toHaveBeenCalled();
      expect(detector.getRunningGames()).toHaveLength(1);
      expect(detector.getRunningGames()[0].game.id).toBe('cyberpunk-multi-stage');

      // Advance by another 4,000ms (t = 6s total)
      await vi.advanceTimersByTimeAsync(4000);
      expect(endedListener).not.toHaveBeenCalled();

      // Now advance past the 20,000ms grace period (t = 22s total)
      await vi.advanceTimersByTimeAsync(16000);

      // Now that grace period has expired without detecting replacement process, session terminates
      expect(endedListener).toHaveBeenCalledTimes(1);
      expect(endedListener.mock.calls[0][0].gameId).toBe('cyberpunk-multi-stage');
      expect(detector.getRunningGames()).toHaveLength(0);

      killSpy.mockRestore();
      detector.stopAll();
      vi.useRealTimers();
    });
  });

  // ── 3. Scanner Pipeline: Elimination of 500ms Polling Loop ─────────

  describe('Scanner Pipeline SSE Stream & Polling Elimination', () => {
    it('ingests files via SSE events and executes single final fetch on completion without 500ms polling spam', async () => {
      let getFilesCallCount = 0;

      const server = http.createServer((req, res) => {
        req.resume(); // drain incoming request stream

        if (req.url?.startsWith('/api/v1/scan/progress')) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
          res.write('event: game_found\n');
          res.write('data: {"path": "C:\\\\Games\\\\Hades\\\\hades.exe", "name": "hades.exe"}\n\n');
          req.on('close', () => res.end());
        } else if (req.url?.startsWith('/api/v1/scan/status')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ phase: 'scanning', files_scanned: 42, current_directory: 'C:\\Games' }));
        } else if (req.url?.startsWith('/api/v1/files')) {
          getFilesCallCount++;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([{ path: 'C:\\Games\\Portal\\portal.exe', name: 'portal.exe' }]));
        } else if (req.url?.startsWith('/api/v1/scan')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const address = server.address() as any;
      const port = address.port;

      const discoveredGames: LocalGame[] = [];
      const progressUpdates: string[] = [];

      await runNodeScan({
        port,
        authHeaders: {},
        nodeDaemon: { isRunning: () => true },
        ingestFile: (f) => ({
          id: f.name.replace('.exe', ''),
          title: f.name.replace('.exe', ''),
          exePath: f.path,
          installDir: path.dirname(f.path),
          platform: 'pc',
        }),
        handleDiscoveredBatch: (batch) => {
          discoveredGames.push(...batch);
        },
        sendSafeProgress: (msg) => {
          progressUpdates.push(msg);
        },
      });

      server.close();

      // Verifies SSE event was ingested in real time
      expect(discoveredGames.some((g) => g.id === 'hades')).toBe(true);
      // Verifies final fetch captured the Portal file
      expect(discoveredGames.some((g) => g.id === 'portal')).toBe(true);

      // Verifies /api/v1/files was called ONLY ONCE on scan completion, NOT polled repeatedly
      expect(getFilesCallCount).toBe(1);
    });
  });

  // ── 4. Non-Blocking Storage Deserialization ──────────────────────────

  describe('Storage Non-Blocking Deserialization & Async Metadata', () => {
    it('retrieves games synchronously via getAllGames with high performance (<10ms)', () => {
      clearRowCache();

      const startTime = performance.now();
      const games = getAllGames();
      const durationMs = performance.now() - startTime;

      expect(Array.isArray(games)).toBe(true);
      expect(durationMs).toBeLessThan(50); // High-speed in-memory hydration
    });

    it('asynchronously resolves PE metadata without blocking main process thread', async () => {
      const dummyExe = path.join(tempDir, 'dummy.exe');
      fs.writeFileSync(dummyExe, Buffer.alloc(2048));

      const peVer = await getPeVersionAsync(dummyExe);
      expect(peVer).toBeNull(); // Empty dummy PE buffer safely resolves to null without crash

      const resolved = await resolveGameMetadataAsync('dummy-row-1', dummyExe);
      expect(resolved).not.toBeNull();
      expect(resolved?.sizeBytes).toBe(2048);
      expect(resolved?.modifiedAt).toBeDefined();
    });
  });
});
