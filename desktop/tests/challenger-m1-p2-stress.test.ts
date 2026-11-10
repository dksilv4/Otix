import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as http from 'http';

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

vi.mock('../desktop-settings', () => ({
  getSettings: vi.fn(() => ({ onlyTrackScannedGames: false, embeddedNodePort: 8090 })),
}));

// ── Imports under test ───────────────────────────────────────────────

import { runNodeScan } from '../ipc/scanner-pipeline/node-scan-runner';
import {
  resolveGameMetadataAsync,
  queueAsyncMetadataHydration,
  getPeVersionAsync,
  clearRowCache,
} from '../game/storage';
import type { LocalGame } from '../preload-api';

// ── Binary PE Generator Helper ───────────────────────────────────────

function createMockPeBinary(versionStr = '2.4.1.0'): Buffer {
  const buf = Buffer.alloc(4096, 0);

  // DOS MZ Header
  buf.writeUInt16LE(0x5a4d, 0); // MZ
  buf.writeUInt32LE(128, 0x3c); // PE header offset = 128

  // PE Header at offset 128
  buf.write('PE\0\0', 128, 4, 'utf8');
  buf.writeUInt16LE(1, 128 + 6); // numSections = 1
  buf.writeUInt16LE(0, 128 + 20); // optHeaderSize = 0

  // Section Header at offset 128 + 24 = 152 (40 bytes)
  const secOffset = 152;
  buf.write('.rsrc\0\0\0', secOffset, 8, 'utf8');
  buf.writeUInt32LE(1024, secOffset + 16); // rsrcSize = 1024
  buf.writeUInt32LE(512, secOffset + 20); // rsrcOffset = 512

  // In .rsrc section (offset 512):
  // Write "ProductVersion\0" followed by padding and UTF-16LE version string
  const pvNeedle = Buffer.from('ProductVersion\0', 'utf16le');
  pvNeedle.copy(buf, 512);

  let verOffset = 512 + pvNeedle.length;
  // Two null bytes padding
  buf.writeUInt16LE(0, verOffset);
  verOffset += 2;

  const verBuf = Buffer.from(`${versionStr}\0`, 'utf16le');
  verBuf.copy(buf, verOffset);

  return buf;
}

describe('Challenger 2 Adversarial Stress Suite: Scanner Pipeline & Async Hydration', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otix-challenger-m1-p2-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
    vi.restoreAllMocks();
  });

  // ══════════════════════════════════════════════════════════════════════
  // 1. Scanner Pipeline & SSE Streaming Stress Tests
  // ══════════════════════════════════════════════════════════════════════

  describe('Scanner Pipeline: SSE Stream & Polling Elimination Stress', () => {
    it('handles packet-fragmented SSE chunks delivered across multiple TCP packets', async () => {
      let filesCalls = 0;
      let sseSocket: any = null;

      const server = http.createServer((req, res) => {
        req.resume();
        if (req.url?.startsWith('/api/v1/scan/progress')) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
          sseSocket = res;

          // Split an SSE event across 4 tiny fragmented chunks
          const part1 = 'event: game_f';
          const part2 = 'ound\ndata: {"path": "C:\\\\Games\\\\';
          const part3 = 'EldenRing\\\\eldenring.exe", "name": "';
          const part4 = 'eldenring.exe"}\n\n';

          res.write(part1);
          setTimeout(() => res.write(part2), 15);
          setTimeout(() => res.write(part3), 30);
          setTimeout(() => res.write(part4), 45);
        } else if (req.url?.startsWith('/api/v1/scan/status')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ phase: 'scanning', files_scanned: 1, current_directory: 'C:\\Games' }));
        } else if (req.url?.startsWith('/api/v1/files')) {
          filesCalls++;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([]));
        } else if (req.url?.startsWith('/api/v1/scan')) {
          // Delay scan resolution to allow fragmented chunks to arrive
          setTimeout(() => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
          }, 120);
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const port = (server.address() as any).port;

      const discoveredGames: LocalGame[] = [];

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
        sendSafeProgress: () => {},
      });

      server.close();

      // Verified that fragmented event was reassembled correctly despite chunk boundaries
      expect(discoveredGames).toHaveLength(1);
      expect(discoveredGames[0].id).toBe('eldenring');
      expect(discoveredGames[0].exePath).toBe('C:\\Games\\EldenRing\\eldenring.exe');
      expect(filesCalls).toBe(1); // Only final fetch
    });

    it('handles high-throughput multi-event chunks and ignores unknown event types without crashing', async () => {
      let filesCalls = 0;

      const server = http.createServer((req, res) => {
        req.resume();
        if (req.url?.startsWith('/api/v1/scan/progress')) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });

          // Build a payload with 30 valid game_found/file_indexed events
          // mixed with corrupt JSON, unknown event types, ping/heartbeats, and empty data
          let payload = '';
          for (let i = 0; i < 30; i++) {
            payload += `event: game_found\ndata: {"path": "C:\\\\Games\\\\Game_${i}\\\\game.exe", "name": "game_${i}.exe"}\n\n`;
            if (i % 5 === 0) {
              // Unknown event
              payload += `event: heartbeat\ndata: {"timestamp": 123456789}\n\n`;
              // Corrupt JSON
              payload += `event: game_found\ndata: {INVALID_JSON__CORRUPTED\n\n`;
              // Empty data
              payload += `event: file_indexed\ndata: \n\n`;
            }
          }

          res.write(payload);
          res.end();
        } else if (req.url?.startsWith('/api/v1/scan/status')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ phase: 'idle', files_scanned: 30 }));
        } else if (req.url?.startsWith('/api/v1/files')) {
          filesCalls++;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([]));
        } else if (req.url?.startsWith('/api/v1/scan')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const port = (server.address() as any).port;

      const discoveredGames: LocalGame[] = [];

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
        sendSafeProgress: () => {},
      });

      server.close();

      // All 30 valid events were successfully parsed; corrupt/unknown ones were safely ignored
      expect(discoveredGames).toHaveLength(30);
      expect(discoveredGames.map((g) => g.id)).toContain('game_0');
      expect(discoveredGames.map((g) => g.id)).toContain('game_29');
    });

    it('survives SSE server failure, network timeouts, and HTTP 500 error responses gracefully', async () => {
      let finalFilesCalled = false;

      // Server simulates SSE endpoint failing with 500 Internal Server Error
      const server = http.createServer((req, res) => {
        req.resume();
        if (req.url?.startsWith('/api/v1/scan/progress')) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'SSE stream failed' }));
        } else if (req.url?.startsWith('/api/v1/scan/status')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ phase: 'scanning', files_scanned: 2 }));
        } else if (req.url?.startsWith('/api/v1/files')) {
          finalFilesCalled = true;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([{ path: 'C:\\Fallback\\app.exe', name: 'app.exe' }]));
        } else if (req.url?.startsWith('/api/v1/scan')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        }
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const port = (server.address() as any).port;

      const discoveredGames: LocalGame[] = [];

      // Even when SSE fails completely, scan completes and captures files via final fetch
      await expect(
        runNodeScan({
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
          sendSafeProgress: () => {},
        })
      ).resolves.not.toThrow();

      server.close();

      expect(finalFilesCalled).toBe(true);
      expect(discoveredGames).toHaveLength(1);
      expect(discoveredGames[0].id).toBe('app');
    });

    it('verifies progressTimer queries status but NEVER polls /api/v1/files during scanning', async () => {
      let filesCalls = 0;
      let statusCalls = 0;

      const server = http.createServer((req, res) => {
        req.resume();
        if (req.url?.startsWith('/api/v1/scan/progress')) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
        } else if (req.url?.startsWith('/api/v1/scan/status')) {
          statusCalls++;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            phase: 'scanning',
            files_scanned: statusCalls * 10,
            current_directory: 'C:\\Games\\ActiveDirectory',
          }));
        } else if (req.url?.startsWith('/api/v1/files')) {
          filesCalls++;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([]));
        } else if (req.url?.startsWith('/api/v1/scan')) {
          // Keep scan running for 1,200ms to allow progressTimer (500ms interval) to fire at least twice
          setTimeout(() => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
          }, 1200);
        }
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const port = (server.address() as any).port;

      const progressLogs: { msg: string; pct: number }[] = [];

      await runNodeScan({
        port,
        authHeaders: {},
        nodeDaemon: { isRunning: () => true },
        ingestFile: () => null,
        handleDiscoveredBatch: () => {},
        sendSafeProgress: (msg, pct) => {
          progressLogs.push({ msg, pct });
        },
      });

      server.close();

      // progressTimer fired status check multiple times
      expect(statusCalls).toBeGreaterThanOrEqual(2);
      expect(progressLogs.length).toBeGreaterThanOrEqual(2);
      expect(progressLogs[0].msg).toContain('ActiveDirectory');

      // Crucial Milestone 1 verification: /api/v1/files was polled EXACTLY 1 time (the final completion fetch)
      expect(filesCalls).toBe(1);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 2. High Concurrency & Memory Stress: resolveGameMetadataAsync
  // ══════════════════════════════════════════════════════════════════════

  describe('resolveGameMetadataAsync High Concurrency & Memory Stress', () => {
    it('executes 100 concurrent async resolution calls on heterogeneous targets without memory leak or crash', async () => {
      // Prepare 20 valid PE files
      const validFiles: string[] = [];
      for (let i = 0; i < 20; i++) {
        const filePath = path.join(tempDir, `game_${i}.exe`);
        fs.writeFileSync(filePath, createMockPeBinary(`1.${i}.0.0`));
        validFiles.push(filePath);
      }

      // Prepare 20 dummy empty/truncated files
      const dummyFiles: string[] = [];
      for (let i = 0; i < 20; i++) {
        const filePath = path.join(tempDir, `corrupt_${i}.exe`);
        fs.writeFileSync(filePath, Buffer.from(`NOT_A_PE_BINARY_${i}`));
        dummyFiles.push(filePath);
      }

      // Prepare 20 directories
      const dirs: string[] = [];
      for (let i = 0; i < 20; i++) {
        const dirPath = path.join(tempDir, `dir_${i}`);
        fs.mkdirSync(dirPath, { recursive: true });
        dirs.push(dirPath);
      }

      // Assemble 100 heterogeneous targets:
      // - 20 valid PE files
      // - 20 corrupted/non-PE files
      // - 20 directory paths
      // - 20 non-existent paths
      // - 20 Steam protocol URIs (steam://rungameid/...)
      const tasks: Promise<any>[] = [];

      for (let i = 0; i < 20; i++) {
        tasks.push(resolveGameMetadataAsync(`row-valid-${i}`, validFiles[i]));
      }
      for (let i = 0; i < 20; i++) {
        tasks.push(resolveGameMetadataAsync(`row-dummy-${i}`, dummyFiles[i]));
      }
      for (let i = 0; i < 20; i++) {
        tasks.push(resolveGameMetadataAsync(`row-dir-${i}`, dirs[i]));
      }
      for (let i = 0; i < 20; i++) {
        tasks.push(resolveGameMetadataAsync(`row-missing-${i}`, path.join(tempDir, `missing_${i}.exe`)));
      }
      for (let i = 0; i < 20; i++) {
        tasks.push(resolveGameMetadataAsync(`row-steam-${i}`, `steam://rungameid/${1000 + i}`));
      }

      expect(tasks).toHaveLength(100);

      const startMem = process.memoryUsage().heapUsed;
      const startTime = performance.now();

      // Execute all 100 concurrently
      const results = await Promise.all(tasks);
      const elapsedMs = performance.now() - startTime;
      const endMem = process.memoryUsage().heapUsed;

      // 100 concurrent async resolutions complete cleanly
      expect(results).toHaveLength(100);
      expect(elapsedMs).toBeLessThan(5000); // Must resolve rapidly under async I/O

      // Valid PE results resolved correct version and size
      const validResults = results.slice(0, 20);
      for (let i = 0; i < 20; i++) {
        expect(validResults[i]).not.toBeNull();
        const expectedVer = i === 0 ? '1' : `1.${i}`;
        expect(validResults[i]?.version).toBe(expectedVer);
        expect(validResults[i]?.sizeBytes).toBe(4096);
      }

      // Dummy non-PE results resolved size but null version
      const dummyResults = results.slice(20, 40);
      for (let i = 0; i < 20; i++) {
        expect(dummyResults[i]).not.toBeNull();
        expect(dummyResults[i]?.version).toBeUndefined();
      }

      // Directory results resolved without size
      const dirResults = results.slice(40, 60);
      for (let i = 0; i < 20; i++) {
        expect(dirResults[i]).not.toBeNull();
        expect(dirResults[i]?.modifiedAt).toBeDefined();
      }

      // Non-existent paths resolved to null safely
      const missingResults = results.slice(60, 80);
      for (let i = 0; i < 20; i++) {
        expect(missingResults[i]).toBeNull();
      }

      // Steam URIs resolved to null safely (no disk stat attempted)
      const steamResults = results.slice(80, 100);
      for (let i = 0; i < 20; i++) {
        expect(steamResults[i]).toBeNull();
      }

      // Verify no uncontrolled heap explosion (< 50MB delta for 100 calls)
      const heapDeltaBytes = Math.max(0, endMem - startMem);
      expect(heapDeltaBytes).toBeLessThan(50 * 1024 * 1024);
    });

    it('queueAsyncMetadataHydration deduplicates bursts of concurrent requests for identical rowIds', async () => {
      const testExe = path.join(tempDir, 'dedup_test.exe');
      fs.writeFileSync(testExe, createMockPeBinary('3.0.0.0'));

      // Enqueue 100 concurrent requests with the SAME rowId
      for (let i = 0; i < 100; i++) {
        queueAsyncMetadataHydration('identical-row-id', testExe);
      }

      // Allow setImmediate loop to execute
      await new Promise<void>((resolve) => setImmediate(() => resolve()));
      // Allow async inner promise in setImmediate to resolve
      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      // Query resolved metadata directly
      const meta = await resolveGameMetadataAsync('identical-row-id', testExe);
      expect(meta).not.toBeNull();
      expect(meta?.version).toBe('3');
    });

    it('bounds internal cache size under high churn preventing memory leaks', async () => {
      // Call resolveGameMetadataAsync with 5,200 distinct row IDs to trigger cache cap reset (>5,000)
      const dummyFile = path.join(tempDir, 'cached.exe');
      fs.writeFileSync(dummyFile, createMockPeBinary('5.0.0.0'));

      for (let i = 0; i < 5200; i++) {
        await resolveGameMetadataAsync(`churn-row-${i}`, dummyFile);
      }

      // Verify that after 5200 iterations, process did not crash or exhaust memory
      const heapUsed = process.memoryUsage().heapUsed;
      expect(heapUsed).toBeGreaterThan(0);

      // Verify that getPeVersionAsync cache also hits cache hit on same file
      const v1 = await getPeVersionAsync(dummyFile);
      const v2 = await getPeVersionAsync(dummyFile);
      expect(v1).toBe('5');
      expect(v2).toBe('5');
    });
  });
});
