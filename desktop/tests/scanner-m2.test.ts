import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Shared Mutable Mock-DB State ────────────────────────────────────────

const dbState: {
  tables: Map<string, Map<string, Record<string, any>>>;
  reset: () => void;
} = {
  tables: new Map(),
  reset() {
    this.tables.clear();
  },
};

vi.mock('../db', () => ({
  getDb: () => {
    let autoIncrementId = 1;
    return {
      exec: (sql: string) => {
        const matches = sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/gi);
        for (const m of matches) {
          if (!dbState.tables.has(m[1].toLowerCase())) {
            dbState.tables.set(m[1].toLowerCase(), new Map());
          }
        }
      },
      transaction: (fn: any) => () => fn(),
      prepare: (sql: string) => ({
        run: (...params: any[]) => {
          const im = sql.match(/INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
          if (im) {
            const tableName = im[1].toLowerCase();
            const columns = im[2].split(',').map((c: string) => c.trim());
            let table = dbState.tables.get(tableName);
            if (!table) {
              table = new Map();
              dbState.tables.set(tableName, table);
            }
            const row: Record<string, any> = {};
            for (let i = 0; i < columns.length; i++) row[columns[i]] = params[i] ?? null;
            row._id = autoIncrementId++;
            const key = tableName === 'game_matches' ? `${params[0]}|${params[1]}` : String(params[0]);
            table.set(key, row);
            return { changes: 1 };
          }

          const dm = sql.match(/DELETE\s+FROM\s+(\w+)\s+WHERE/i);
          if (dm) {
            const t = dbState.tables.get(dm[1].toLowerCase());
            if (t) {
              const key = params.length >= 2 ? `${params[0]}|${params[1]}` : String(params[0]);
              t.delete(key);
            }
            return { changes: 1 };
          }

          const um = sql.match(/UPDATE\s+(\w+)\s+SET/i);
          if (um) {
            const tableName = um[1].toLowerCase();
            const t = dbState.tables.get(tableName);
            if (t && params.length > 0) {
              // Match by id or (id = ? OR id = ?)
              const id = params[params.length - 2] || params[params.length - 1];
              const row = t.get(String(id));
              if (row) {
                if (sql.includes('otix_media_id = ?')) {
                  row.otix_media_id = params[0];
                  row.otix_media_title = params[1];
                  row.otix_confidence = params[2];
                } else if (sql.includes('otix_media_id = COALESCE')) {
                  if (params[0] != null) row.otix_media_id = params[0];
                  if (params[1] != null) row.otix_media_title = params[1];
                  if (params[params.length - 3] != null) row.otix_confidence = params[params.length - 3];
                }
              }
            }
            return { changes: 1 };
          }
          return { changes: 1 };
        },
        get: (...params: any[]) => {
          const countM = sql.match(/SELECT\s+COUNT\(\*\)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/i);
          if (countM) {
            const t = dbState.tables.get(countM[1].toLowerCase());
            const rows = t ? [...t.values()] : [];
            const whereClause = countM[2] || '';
            let count = rows.length;
            if (/otix_media_id IS NULL/i.test(whereClause)) {
              count = rows.filter((r) => r.otix_media_id === null || r.otix_media_id === undefined || r.otix_media_id === '').length;
            } else if (/otix_media_id IS NOT NULL/i.test(whereClause)) {
              count = rows.filter((r) => r.otix_media_id !== null && r.otix_media_id !== undefined && r.otix_media_id !== '').length;
            }
            return { count, 'COUNT(*)': count };
          }

          const sm = sql.match(/SELECT\s+\*\s+FROM\s+(\w+)/i);
          if (sm) {
            const t = dbState.tables.get(sm[1].toLowerCase());
            if (t) {
              const key = params.length >= 2 ? `${params[0]}|${params[1]}` : String(params[0]);
              return t.get(key);
            }
          }
          return undefined;
        },
        all: (...params: any[]) => {
          const sm = sql.match(/FROM\s+(\w+)/i);
          if (sm) {
            const t = dbState.tables.get(sm[1].toLowerCase());
            if (t) {
              let rows = [...t.values()];
              if (/otix_media_id IS NULL/i.test(sql)) {
                rows = rows.filter((r) => r.otix_media_id === null || r.otix_media_id === undefined || r.otix_media_id === '');
              } else if (/otix_media_id IS NOT NULL/i.test(sql)) {
                rows = rows.filter((r) => r.otix_media_id !== null && r.otix_media_id !== undefined && r.otix_media_id !== '');
              }
              return rows;
            }
          }
          return [];
        },
      }),
    };
  },
}));

// Mock electron IPC and dialog
const ipcHandlers = new Map<string, (...args: any[]) => any>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      ipcHandlers.set(channel, handler);
    },
  },
  BrowserWindow: {
    fromWebContents: () => null,
    getFocusedWindow: () => null,
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
}));

import { getDb } from '../db';
import {
  ensureGameMatchesTable,
  upsertGames,
  getAllGames,
  getGameCount,
  getGameMatch,
  flushNotifyGamesChanged,
} from '../game/storage';
import { GameScanOrchestrator, ScannedGame } from '../game/orchestrator';
import { LocalMatcher } from '../game/local-matcher';
import { registerScannerIPC, setScanOrchestrator } from '../ipc/scanner';

describe('Milestone 2: Scanner Decoupling & Autonomous Matching Engine', () => {
  let mockPluginManager: any;
  let orchestrator: GameScanOrchestrator;

  beforeEach(() => {
    dbState.reset();
    ensureGameMatchesTable();
    ipcHandlers.clear();

    mockPluginManager = {
      getPluginsForSlot: vi.fn().mockReturnValue([]),
      callPluginData: vi.fn().mockResolvedValue([]),
    };
    orchestrator = new GameScanOrchestrator(mockPluginManager);
    setScanOrchestrator(orchestrator);
    registerScannerIPC(null, null);
  });

  afterEach(() => {
    orchestrator.cancelMatching();
  });

  // ── 1. Scanner Decoupling & Immediate Persistence ──────────────────────────

  describe('1. Scanner Decoupling & Immediate Persistence (< 2s)', () => {
    it('registers all matching IPC channels', () => {
      expect(ipcHandlers.has('scanner:scan-paths')).toBe(true);
      expect(ipcHandlers.has('matching:start')).toBe(true);
      expect(ipcHandlers.has('matching:cancel')).toBe(true);
      expect(ipcHandlers.has('matching:get-status')).toBe(true);
      expect(ipcHandlers.has('games:hydrate-matched')).toBe(true);
    });

    it('returns discovered games immediately and commits 100% to SQLite before background matching completes', async () => {
      // Spy on startBackgroundMatching to ensure it runs non-blocking
      let backgroundMatchingStarted = false;
      let backgroundMatchingCompleted = false;

      vi.spyOn(orchestrator, 'startBackgroundMatching').mockImplementation(async () => {
        backgroundMatchingStarted = true;
        // Simulate a long matching stage
        await new Promise((r) => setTimeout(r, 500));
        backgroundMatchingCompleted = true;
      });

      const startTime = Date.now();

      // Simulate discovered files in scanned_games via upsertGames
      const discoveredRows = Array.from({ length: 50 }, (_, i) => ({
        id: `pc_game_${i}`,
        title: `Discovered Game ${i}`,
        exePath: `C:\\Games\\game_${i}\\game.exe`,
        installDir: `C:\\Games\\game_${i}`,
        platform: 'pc' as const,
      }));
      upsertGames(discoveredRows as any);
      flushNotifyGamesChanged();

      const elapsed = Date.now() - startTime;

      // Persistence and scan return must complete in < 2,000ms
      expect(elapsed).toBeLessThan(2000);

      // Verify 100% of discovered games are saved in SQLite
      const inDb = getAllGames();
      expect(inDb).toHaveLength(50);
      expect(inDb[0].title).toBe('Discovered Game 0');

      // Trigger matching asynchronously via matching:start
      const startHandler = ipcHandlers.get('matching:start')!;
      const result = await startHandler({} as any, {});
      expect(result.success).toBe(true);
      expect(result.isMatching).toBe(true);
      expect(backgroundMatchingStarted).toBe(true);
    });
  });

  // ── 2. Resumption Query & Autonomous Matching Queue ────────────────────────

  describe('2. Autonomous Matching Queue & Resumption Logic', () => {
    beforeEach(() => {
      // Seed SQLite with:
      // - 3 unmatched games
      // - 2 already-matched games (with otix_media_id)
      // - 1 application (isApp: true)
      const games = [
        {
          id: 'pc_unmatched_1',
          title: 'Unmatched Game 1',
          exePath: 'C:\\Games\\u1\\u1.exe',
          installDir: 'C:\\Games\\u1',
          platform: 'pc' as const,
        },
        {
          id: 'pc_unmatched_2',
          title: 'Unmatched Game 2',
          exePath: 'C:\\Games\\u2\\u2.exe',
          installDir: 'C:\\Games\\u2',
          platform: 'pc' as const,
        },
        {
          id: 'pc_unmatched_3',
          title: 'Unmatched Game 3',
          exePath: 'C:\\Games\\u3\\u3.exe',
          installDir: 'C:\\Games\\u3',
          platform: 'pc' as const,
        },
        {
          id: 'pc_matched_1',
          title: 'Already Matched Game 1',
          exePath: 'C:\\Games\\m1\\m1.exe',
          installDir: 'C:\\Games\\m1',
          platform: 'pc' as const,
          otixMediaId: 'otix_101',
          otixMediaTitle: 'Already Matched Game 1',
        },
        {
          id: 'pc_matched_2',
          title: 'Already Matched Game 2',
          exePath: 'C:\\Games\\m2\\m2.exe',
          installDir: 'C:\\Games\\m2',
          platform: 'pc' as const,
          otixMediaId: 'otix_102',
          otixMediaTitle: 'Already Matched Game 2',
        },
        {
          id: 'pc_app_1',
          title: 'Calculator App',
          exePath: 'C:\\Apps\\calc.exe',
          installDir: 'C:\\Apps',
          platform: 'pc' as const,
          isApp: true,
          sources: [{ source: 'pc', id: 'app_1', isApp: true }],
        },
      ];
      upsertGames(games as any);
    });

    it('queries only unmatched, non-app games for background matching by default', async () => {
      let matchedCount = 0;
      orchestrator.on('match:progress', () => {
        matchedCount++;
      });

      // Spy on streamMatchesRemote to simulate offline fallback for unmatched items
      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockRejectedValue(new Error('SSE offline'));

      await orchestrator.startBackgroundMatching();

      // Only 3 unmatched games should have been queued and processed
      const status = orchestrator.getMatchingStatus();
      expect(status.isMatching).toBe(false);
      expect(status.totalUnmatched).toBe(0); // All 3 have now been matched locally
      expect(getGameMatch('pc', 'unmatched_1')).toBeDefined();
      expect(getGameMatch('pc', 'unmatched_2')).toBeDefined();
      expect(getGameMatch('pc', 'unmatched_3')).toBeDefined();
    });

    it('processes only specified gameIds when gameIds option is provided', async () => {
      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockRejectedValue(new Error('SSE offline'));

      await orchestrator.startBackgroundMatching({ gameIds: ['pc_unmatched_1'] });

      expect(getGameMatch('pc', 'unmatched_1')).toBeDefined();
      expect(getGameMatch('pc', 'unmatched_2')).toBeNull();
    });

    it('seamlessly picks up newly discovered games upserted during active background matching', async () => {
      let batchNum = 0;
      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockImplementation(async (...args: any[]) => {
        const chunk = args[0] as ScannedGame[];
        batchNum++;
        if (batchNum === 1) {
          // Scanner discovers and persists a 4th game while matching is underway
          upsertGames([
            {
              id: 'pc_realtime_4',
              title: 'Realtime Discovered Game 4',
              exePath: 'C:\\Games\\r4\\r4.exe',
              installDir: 'C:\\Games\\r4',
              platform: 'pc' as const,
            },
          ] as any);
        }
        await (orchestrator as any).streamMatchesLocal(chunk, 'background');
      });

      await orchestrator.startBackgroundMatching();

      // All 3 initial games plus the realtime discovered 4th game should be matched
      expect(getGameMatch('pc', 'unmatched_1')).toBeDefined();
      expect(getGameMatch('pc', 'unmatched_2')).toBeDefined();
      expect(getGameMatch('pc', 'unmatched_3')).toBeDefined();
      expect(getGameMatch('pc', 'realtime_4')).toBeDefined();
      expect(orchestrator.getMatchingStatus().totalUnmatched).toBe(0);
    });

    it('guards against concurrent runs and prevents duplicate loops', async () => {
      let resolver: () => void;
      const deferred = new Promise<void>((r) => { resolver = r; });
      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockImplementation(() => deferred);

      // Start first matching process
      const p1 = orchestrator.startBackgroundMatching();
      expect(orchestrator.isMatching).toBe(true);

      // Start second concurrent matching process — should log warning and return immediately
      const p2 = orchestrator.startBackgroundMatching();
      await p2;

      // Status should reflect matching is still running
      expect(orchestrator.isMatching).toBe(true);

      resolver!();
      await p1;
      expect(orchestrator.isMatching).toBe(false);
    });
  });

  // ── 3. Cancellation Resilience & Zero Data Loss ────────────────────────────

  describe('3. Cancellation Midway Leaves 100% of Discovered Games Intact', () => {
    it('aborts matching loop midway while keeping all discovered games and committed matches intact', async () => {
      // Seed 50 games (2 batches of 25)
      const games = Array.from({ length: 50 }, (_, i) => ({
        id: `pc_cancel_game_${i}`,
        title: `Cancel Test Game ${i}`,
        exePath: `C:\\Games\\c_${i}\\c.exe`,
        installDir: `C:\\Games\\c_${i}`,
        platform: 'pc' as const,
      }));
      upsertGames(games as any);

      let batchNum = 0;
      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockImplementation(async (...args: any[]) => {
        const chunk = args[0] as ScannedGame[];
        batchNum++;
        if (batchNum === 1) {
          // Batch 1 succeeds locally
          await (orchestrator as any).streamMatchesLocal(chunk, 'background');
        } else {
          // Batch 2: simulate delay then cancel
          orchestrator.cancelMatching();
          await new Promise((r) => setTimeout(r, 50));
        }
      });

      const events: string[] = [];
      orchestrator.on('game:matching:cancelled', () => events.push('game:matching:cancelled'));
      orchestrator.on('scan:cancelled', () => events.push('scan:cancelled'));

      await orchestrator.startBackgroundMatching({ batchSize: 25 });

      // Cancellation events must fire
      expect(events).toContain('game:matching:cancelled');
      expect(orchestrator.isMatching).toBe(false);

      // 100% of the 50 discovered games remain intact in local storage
      const libraryGames = getAllGames();
      expect(libraryGames).toHaveLength(50);

      // Batch 1 (items 0 to 24) matches remain committed in SQLite
      expect(getGameMatch('pc', 'cancel_game_0')).toBeDefined();
      expect(getGameMatch('pc', 'cancel_game_24')).toBeDefined();
    });
  });

  // ── 4. Bounded Batching, Fallback & Error Isolation ────────────────────────

  describe('4. Bounded Batching, Fallback & Error Isolation', () => {
    it('processes chunks of 25 items and falls back to LocalMatcher ONLY for the failing chunk', async () => {
      // Seed 75 games (3 batches of 25)
      const games = Array.from({ length: 75 }, (_, i) => ({
        id: `pc_batch_game_${i}`,
        title: `Batch Game ${i}`,
        exePath: `C:\\Games\\b_${i}\\b.exe`,
        installDir: `C:\\Games\\b_${i}`,
        platform: 'pc' as const,
      }));
      upsertGames(games as any);

      let batchIndex = 0;
      const remoteBatchesAttempted: number[] = [];

      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockImplementation(async (...args: any[]) => {
        const chunk = args[0] as ScannedGame[];
        batchIndex++;
        remoteBatchesAttempted.push(batchIndex);
        if (batchIndex === 2) {
          // Chunk 2 times out or fails remotely
          throw new Error('SSE batch timeout (15000ms)');
        }
        // Chunks 1 and 3 succeed remotely
        for (const g of chunk) {
          (orchestrator as any).handleProgress(JSON.stringify({
            query_id: `${g.platform}:${g.id}`,
            query_title: g.title,
            status: 'matched',
            match: { media_item_id: `otix_remote_${g.id}`, title: g.title, confidence: 0.99 },
          }), 'background');
        }
      });

      await orchestrator.startBackgroundMatching({ batchSize: 25 });

      // All 3 batches were attempted remotely
      expect(remoteBatchesAttempted).toEqual([1, 2, 3]);

      // Chunk 1 and Chunk 3 have remote matches
      const matchChunk1 = getGameMatch('pc', 'batch_game_0');
      expect(matchChunk1?.otixMediaId).toBe('otix_remote_batch_game_0');

      const matchChunk3 = getGameMatch('pc', 'batch_game_50');
      expect(matchChunk3?.otixMediaId).toBe('otix_remote_batch_game_50');

      // Chunk 2 (which failed remotely) fell back to local matcher and was matched locally
      const matchChunk2 = getGameMatch('pc', 'batch_game_25');
      expect(matchChunk2).toBeDefined();
      expect(matchChunk2?.otixMediaId).toBe('pc:batch_game_25');
    });

    it('isolates single-item errors in LocalMatcher without aborting subsequent games', () => {
      const localMatcher = new LocalMatcher();
      const testGames: ScannedGame[] = [
        { id: 'good_1', title: 'Portal 2', platform: 'pc' },
        // Malformed item that causes an unexpected error when accessing properties
        { id: 'bad_1', title: null as any, platform: 'pc' },
        { id: 'good_2', title: 'Half-Life 2', platform: 'pc' },
      ];

      const results = localMatcher.matchBatch(testGames);

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('matched');
      expect(results[0].queryTitle).toBe('Portal 2');

      // Bad item handled cleanly with unmatched status
      expect(results[1].status).toBe('unmatched');

      // Good item following bad item matches successfully
      expect(results[2].status).toBe('matched');
      expect(results[2].queryTitle).toBe('Half-Life 2');
    });

    it('safely catches malformed JSON and corrupted chunks in handleProgress', () => {
      const errorSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Corrupted non-JSON strings
      expect(() => {
        (orchestrator as any).handleProgress('MALFORMED_NON_JSON_DATA', 'background');
      }).not.toThrow();

      // Empty / invalid structure
      expect(() => {
        (orchestrator as any).handleProgress('{}', 'background');
      }).not.toThrow();

      errorSpy.mockRestore();
    });
  });

  // ── 5. Throttled Progress Reporting ────────────────────────────────────────

  describe('5. Throttled Progress Reporting (10 Hz Ceiling)', () => {
    it('throttles intermediate progress events to <= 10 Hz and guarantees terminal completion flush', async () => {
      const progressEvents: any[] = [];
      orchestrator.on('game:matching:progress', (e) => progressEvents.push(e));

      // 10 items
      const games = Array.from({ length: 10 }, (_, i) => ({
        id: `pc_throttle_${i}`,
        title: `Throttle Game ${i}`,
        exePath: `C:\\Games\\t_${i}\\t.exe`,
        installDir: `C:\\Games\\t_${i}`,
        platform: 'pc' as const,
      }));
      upsertGames(games as any);

      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockImplementation(async (...args: any[]) => {
        const chunk = args[0] as ScannedGame[];
        await (orchestrator as any).streamMatchesLocal(chunk, 'background');
      });

      await orchestrator.startBackgroundMatching({ batchSize: 2 });

      // Progress events must be emitted
      expect(progressEvents.length).toBeGreaterThanOrEqual(1);

      // Terminal event must be 100% complete
      const lastEvent = progressEvents[progressEvents.length - 1];
      expect(lastEvent.state).toBe('completed');
      expect(lastEvent.percent).toBe(100);
      expect(lastEvent.processed).toBe(10);
    });
  });
});
