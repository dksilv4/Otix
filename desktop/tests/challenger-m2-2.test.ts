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

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  BrowserWindow: {
    fromWebContents: () => null,
    getFocusedWindow: () => null,
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
}));

import {
  ensureGameMatchesTable,
  upsertGames,
  getGameMatch,
} from '../game/storage';
import * as storageModule from '../game/storage';
import { GameScanOrchestrator, ScannedGame } from '../game/orchestrator';
import { LocalMatcher } from '../game/local-matcher';

describe('Adversarial Challenge M2-2: Timeout, Fallback & Error Isolation', () => {
  let mockPluginManager: any;
  let orchestrator: GameScanOrchestrator;

  beforeEach(() => {
    dbState.reset();
    ensureGameMatchesTable();

    mockPluginManager = {
      getPluginsForSlot: vi.fn().mockReturnValue([]),
      callPluginData: vi.fn().mockResolvedValue([]),
    };
    orchestrator = new GameScanOrchestrator(mockPluginManager);
  });

  afterEach(() => {
    orchestrator.cancelMatching();
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Challenge 1: Single-Item Error Injection & Isolation
  // ─────────────────────────────────────────────────────────────────────────
  describe('Challenge 1: Single-Item Error Injection & Isolation', () => {
    it('LocalMatcher: safely handles non-string titles (number, boolean, object) without throwing TypeError, matching all items in batch', () => {
      const localMatcher = new LocalMatcher();
      const testBatch: ScannedGame[] = [
        { id: 'item_valid_1', title: 'Portal', platform: 'pc' },
        { id: 'item_number_title', title: 12345 as any, platform: 'pc' },
        { id: 'item_object_title', title: { name: 'Cyberpunk' } as any, platform: 'pc' },
        { id: 'item_valid_2', title: 'Half-Life 2', platform: 'pc' },
      ];

      let results: any[] = [];
      expect(() => {
        results = localMatcher.matchBatch(testBatch);
      }).not.toThrow();

      expect(results).toHaveLength(4);
      expect(results[0].status).toBe('matched');
      expect(results[0].queryTitle).toBe('Portal');
      expect(results[1].queryTitle).toBe('12345');
      expect(results[3].status).toBe('matched');
      expect(results[3].queryTitle).toBe('Half-Life 2');
    });

    it('LocalMatcher: DB errors during persistMatch are safely isolated and do not abort subsequent items', () => {
      const localMatcher = new LocalMatcher();
      const testBatch: ScannedGame[] = [
        { id: 'game_before_err', title: 'Doom 2016', platform: 'pc' },
        { id: 'game_with_db_err', title: 'Doom Eternal', platform: 'pc' },
        { id: 'game_after_err', title: 'Doom 64', platform: 'pc' },
      ];

      // Spy on upsertGameMatch and throw on game_with_db_err
      const origUpsert = storageModule.upsertGameMatch;
      vi.spyOn(storageModule, 'upsertGameMatch').mockImplementation((matchData: any) => {
        if (matchData.sourceGameId === 'game_with_db_err') {
          throw new Error('SQLITE_BUSY: database is locked');
        }
        return origUpsert(matchData);
      });

      const results = localMatcher.matchBatch(testBatch);

      expect(results).toHaveLength(3);
      // game_before_err should match
      expect(results[0].status).toBe('matched');
      expect(results[0].sourceGameId).toBe('game_before_err');

      // game_after_err should ALSO match even though previous item failed during persist
      expect(results[2].status).toBe('matched');
      expect(results[2].sourceGameId).toBe('game_after_err');
    });

    it('Orchestrator: robustly handles null/non-string titles in SQLite rows without crashing matching queue', async () => {
      // Seed SQLite with rows including null title
      const rows = [
        { id: 'pc_valid_1', title: 'The Witcher 3', exePath: 'C:\\g1.exe', installDir: 'C:\\g1', platform: 'pc' as const },
        { id: 'pc_bad_null', title: null as any, exePath: 'C:\\g2.exe', installDir: 'C:\\g2', platform: 'pc' as const },
        { id: 'pc_valid_2', title: 'Baldurs Gate 3', exePath: 'C:\\g5.exe', installDir: 'C:\\g5', platform: 'pc' as const },
      ];
      upsertGames(rows as any);

      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockRejectedValue(new Error('Backend unreachable'));

      let errorEvent: any = null;
      let completeEvent: any = null;
      orchestrator.on('game:matching:progress', (e) => {
        if (e.state === 'error') errorEvent = e;
        if (e.state === 'completed') completeEvent = e;
      });

      await orchestrator.startBackgroundMatching({ batchSize: 2 });

      // Orchestrator did NOT crash with error state; completed matching
      expect(errorEvent).toBeNull();
      expect(completeEvent).toBeDefined();
      expect(completeEvent.state).toBe('completed');

      // Valid item 2 was successfully processed in batch 2
      const match2 = getGameMatch('pc', 'valid_2');
      expect(match2).not.toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Challenge 2: 15s Timeout on Remote Batch #2 with Local Fallback
  // ─────────────────────────────────────────────────────────────────────────
  describe('Challenge 2: 15s Timeout on Batch #2 and Local Fallback', () => {
    it('simulates 15s timeout on batch #2 and verifies batch #2 falls back to LocalMatcher while batches #1 and #3 succeed remotely', async () => {
      // 3 batches of 10 items = 30 games total
      const totalGames = 30;
      const batchSize = 10;
      const games = Array.from({ length: totalGames }, (_, i) => ({
        id: `pc_timeout_test_${i}`,
        title: `Timeout Game ${i}`,
        exePath: `C:\\Games\\t_${i}\\t.exe`,
        installDir: `C:\\Games\\t_${i}`,
        platform: 'pc' as const,
      }));
      upsertGames(games as any);

      let batchCount = 0;
      const batchHistory: Array<{ batchNum: number; count: number; outcome: string }> = [];

      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockImplementation(async (...args: any[]) => {
        const chunk = args[0] as ScannedGame[];
        const timeoutMs = args[4] as number;
        batchCount++;
        const currentBatch = batchCount;

        // Verify timeoutMs passed to streamMatchesRemote is exactly 15,000ms
        expect(timeoutMs).toBe(15_000);

        if (currentBatch === 2) {
          batchHistory.push({ batchNum: currentBatch, count: chunk.length, outcome: 'timed_out_15s' });
          // Simulate 15s timeout error raised by the SSE HTTP client timeout handler
          throw new Error('SSE batch timeout (15000ms)');
        }

        // Batches 1 and 3 succeed remotely
        batchHistory.push({ batchNum: currentBatch, count: chunk.length, outcome: 'remote_success' });
        for (const g of chunk) {
          (orchestrator as any).handleProgress(JSON.stringify({
            query_id: `${g.platform}:${g.id}`,
            query_title: g.title,
            status: 'matched',
            match: {
              media_item_id: `otix_remote_id_${g.id}`,
              title: `Otix Remote ${g.title}`,
              confidence: 0.98,
            },
          }), 'background');
        }
      });

      let completeEvent: any = null;
      orchestrator.on('game:matching:complete', (e) => {
        completeEvent = e;
      });

      await orchestrator.startBackgroundMatching({ batchSize });

      // Verify all 3 batches were attempted
      expect(batchHistory).toHaveLength(3);
      expect(batchHistory[0]).toEqual({ batchNum: 1, count: 10, outcome: 'remote_success' });
      expect(batchHistory[1]).toEqual({ batchNum: 2, count: 10, outcome: 'timed_out_15s' });
      expect(batchHistory[2]).toEqual({ batchNum: 3, count: 10, outcome: 'remote_success' });

      // Batch 1 (items 0 to 9) must have remote matches
      for (let i = 0; i < 10; i++) {
        const m = getGameMatch('pc', `timeout_test_${i}`);
        expect(m).not.toBeNull();
        expect(m?.otixMediaId).toBe(`otix_remote_id_timeout_test_${i}`);
      }

      // Batch 2 (items 10 to 19) failed remotely and MUST fall back to LocalMatcher
      for (let i = 10; i < 20; i++) {
        const m = getGameMatch('pc', `timeout_test_${i}`);
        expect(m).not.toBeNull();
        // LocalMatcher sets otixMediaId to queryId: `${platform}:${sourceGameId}`
        expect(m?.otixMediaId).toBe(`pc:timeout_test_${i}`);
      }

      // Batch 3 (items 20 to 29) must have remote matches
      for (let i = 20; i < 30; i++) {
        const m = getGameMatch('pc', `timeout_test_${i}`);
        expect(m).not.toBeNull();
        expect(m?.otixMediaId).toBe(`otix_remote_id_timeout_test_${i}`);
      }

      // Verify completion event
      expect(completeEvent).toBeDefined();
      expect(completeEvent.processed).toBe(30);
      expect(completeEvent.matched).toBe(30);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Challenge 3: Progress Throttling (<= 10 Hz) & Non-Blocking Event Loop
  // ─────────────────────────────────────────────────────────────────────────
  describe('Challenge 3: Progress Throttling (<= 10 Hz) & Non-Blocking Event Loop', () => {
    it('verifies that progress throttling coalesces intermediate rapid events', async () => {
      // 50 games in batches of 1
      const games = Array.from({ length: 50 }, (_, i) => ({
        id: `pc_perf_${i}`,
        title: `Perf Game ${i}`,
        exePath: `C:\\Games\\p_${i}\\p.exe`,
        installDir: `C:\\Games\\p_${i}`,
        platform: 'pc' as const,
      }));
      upsertGames(games as any);

      const progressEvents: any[] = [];
      orchestrator.on('game:matching:progress', (e) => {
        progressEvents.push({ ...e, time: Date.now() });
      });

      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockImplementation(async (...args: any[]) => {
        const chunk = args[0] as ScannedGame[];
        await (orchestrator as any).streamMatchesLocal(chunk, 'background');
      });

      await orchestrator.startBackgroundMatching({ batchSize: 1 });

      // Out of 50 chunks, throttled progress should emit far fewer intermediate events than 50
      const runningEvents = progressEvents.filter((e) => e.state === 'running');
      expect(runningEvents.length).toBeLessThan(50);

      // Terminal event must be delivered with 100% and processed = 50
      const lastEvent = progressEvents[progressEvents.length - 1];
      expect(lastEvent.state).toBe('completed');
      expect(lastEvent.percent).toBe(100);
      expect(lastEvent.processed).toBe(50);
    });

    it('does not freeze the Node event loop during rapid matching', async () => {
      const games = Array.from({ length: 30 }, (_, i) => ({
        id: `pc_loop_${i}`,
        title: `Loop Game ${i}`,
        exePath: `C:\\Games\\l_${i}\\l.exe`,
        installDir: `C:\\Games\\l_${i}`,
        platform: 'pc' as const,
      }));
      upsertGames(games as any);

      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockImplementation(async (...args: any[]) => {
        const chunk = args[0] as ScannedGame[];
        await new Promise((r) => setTimeout(r, 10));
        await (orchestrator as any).streamMatchesLocal(chunk, 'background');
      });

      let eventLoopTicks = 0;
      const intervalId = setInterval(() => {
        eventLoopTicks++;
      }, 5);

      await orchestrator.startBackgroundMatching({ batchSize: 2 });
      clearInterval(intervalId);

      // Event loop must have ticked multiple times during matching execution
      expect(eventLoopTicks).toBeGreaterThan(5);
    });

    it('getMatchingStatus() preserves processed count when matching concludes and is idle', async () => {
      const games = [
        { id: 'pc_status_1', title: 'Status Game 1', exePath: 'C:\\s1.exe', installDir: 'C:\\s1', platform: 'pc' as const },
      ];
      upsertGames(games as any);

      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockRejectedValue(new Error('offline'));

      await orchestrator.startBackgroundMatching();

      // Orchestrator matching is complete
      const status = orchestrator.getMatchingStatus();
      expect(status.isMatching).toBe(false);
      // Confirms getMatchingStatus() retains accurate processed count when idle
      expect(status.processed).toBe(1);
    });
  });
});
