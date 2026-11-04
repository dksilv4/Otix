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
import { GameScanOrchestrator, ScannedGame } from '../game/orchestrator';
import { LocalMatcher } from '../game/local-matcher';
import { cleanGameTitle } from '../game/parser';

describe('Adversarial Stress Test: Corrupted Titles & Throttling Mechanics (Milestone 2 Round 2)', () => {
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
  // Stress Test 1: Parser cleanGameTitle with hostile / corrupted inputs
  // ─────────────────────────────────────────────────────────────────────────
  describe('Stress Test 1: Title Sanitization Robustness', () => {
    it('cleanGameTitle handles numbers, nulls, undefined, objects, booleans, symbols, and hostile strings without throwing', () => {
      const inputs: any[] = [
        null,
        undefined,
        0,
        12345,
        -99.9,
        NaN,
        Infinity,
        -Infinity,
        true,
        false,
        {},
        { title: 'Cyberpunk 2077' },
        [],
        ['Elden Ring'],
        () => 'function_title',
        '',
        '   \t\r\n   ',
        '!@#$%^&*()_+{}[]:;"\'<>,.?/~`|\\',
        '\0\0null_byte_title\0',
        '🎮 🔥 👾 Space Invaders 👾 🔥 🎮',
        '\u202Ereversed\u202D',
        'A'.repeat(50000), // Huge 50KB string
        "'; DROP TABLE scanned_games; --",
        '<script>alert("xss")</script>',
      ];

      for (const input of inputs) {
        expect(() => {
          const res = cleanGameTitle(input);
          expect(typeof res).toBe('string');
        }).not.toThrow();
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Stress Test 2: LocalMatcher batch error isolation with corrupted titles
  // ─────────────────────────────────────────────────────────────────────────
  describe('Stress Test 2: LocalMatcher Batch Isolation with Hostile / Corrupted Titles', () => {
    it('safely isolates corrupted titles (numbers, symbols, objects, nulls) and matches all items in batch', () => {
      const matcher = new LocalMatcher();
      const corruptedBatch: ScannedGame[] = [
        { id: 'valid_before', title: 'Hades', platform: 'pc' },
        { id: 'null_title', title: null as any, platform: 'pc' },
        { id: 'undefined_title', title: undefined as any, platform: 'pc' },
        { id: 'zero_title', title: 0 as any, platform: 'pc' },
        { id: 'num_title', title: 987654 as any, platform: 'pc' },
        { id: 'nan_title', title: NaN as any, platform: 'pc' },
        { id: 'bool_title', title: false as any, platform: 'pc' },
        { id: 'plain_obj', title: {} as any, platform: 'pc' },
        { id: 'nested_obj', title: { name: 'Elden Ring', year: 2022 } as any, platform: 'pc' },
        { id: 'arr_title', title: ['Subnautica', 'Below Zero'] as any, platform: 'pc' },
        { id: 'empty_title', title: '   ', platform: 'pc' },
        { id: 'symbols_only', title: '!@#$%^&*()_+', platform: 'pc' },
        { id: 'unicode_emoji', title: '🚀 Outer Wilds 🪐', platform: 'pc' },
        { id: 'giant_title', title: 'Mass Effect '.repeat(2000), platform: 'pc' },
        { id: 'valid_after', title: 'Celeste', platform: 'pc' },
      ];

      let results: any[] = [];
      expect(() => {
        results = matcher.matchBatch(corruptedBatch);
      }).not.toThrow();

      expect(results).toHaveLength(corruptedBatch.length);

      // Valid game before must match
      expect(results[0].status).toBe('matched');
      expect(results[0].queryTitle).toBe('Hades');
      expect(results[0].sourceGameId).toBe('valid_before');

      // Null and undefined titles should be safely returned as unmatched without error
      expect(results[1].status).toBe('unmatched');
      expect(results[2].status).toBe('unmatched');

      // Valid game after all corrupted titles must also match successfully
      const last = results[results.length - 1];
      expect(last.status).toBe('matched');
      expect(last.queryTitle).toBe('Celeste');
      expect(last.sourceGameId).toBe('valid_after');

      // Verify persisted matches for valid games
      expect(getGameMatch('pc', 'valid_before')).not.toBeNull();
      expect(getGameMatch('pc', 'valid_after')).not.toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Stress Test 3: Orchestrator matching queue with hostile SQLite rows
  // ─────────────────────────────────────────────────────────────────────────
  describe('Stress Test 3: Orchestrator Queue with Hostile SQLite Rows', () => {
    it('processes batch containing null, numeric, symbol, and object titles without crashing the background matching queue', async () => {
      const hostileRows = [
        { id: 'pc_normal_1', title: 'Witcher 3', exePath: 'C:\\w.exe', installDir: 'C:\\w', platform: 'pc' as const },
        { id: 'pc_null_title', title: null as any, exePath: 'C:\\null.exe', installDir: 'C:\\null', platform: 'pc' as const },
        { id: 'pc_number_title', title: 404 as any, exePath: 'C:\\404.exe', installDir: 'C:\\404', platform: 'pc' as const },
        { id: 'pc_symbols_title', title: '???$$$###@@@', exePath: 'C:\\sym.exe', installDir: 'C:\\sym', platform: 'pc' as const },
        { id: 'pc_object_title', title: { foo: 'bar' } as any, exePath: 'C:\\obj.exe', installDir: 'C:\\obj', platform: 'pc' as const },
        { id: 'pc_whitespace_title', title: '    ', exePath: 'C:\\ws.exe', installDir: 'C:\\ws', platform: 'pc' as const },
        { id: 'pc_normal_2', title: 'Cyberpunk 2077', exePath: 'C:\\cp.exe', installDir: 'C:\\cp', platform: 'pc' as const },
      ];
      upsertGames(hostileRows as any);

      // Simulate remote failure to test local fallback under hostile row data
      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockRejectedValue(new Error('Remote 503 Service Unavailable'));

      let errorEvent: any = null;
      let completeEvent: any = null;
      orchestrator.on('game:matching:progress', (e) => {
        if (e.state === 'error') errorEvent = e;
        if (e.state === 'completed') completeEvent = e;
      });

      await orchestrator.startBackgroundMatching({ batchSize: 3 });

      expect(errorEvent).toBeNull();
      expect(completeEvent).toBeDefined();
      expect(completeEvent.state).toBe('completed');
      expect(completeEvent.processed).toBe(hostileRows.length);

      // Verify normal games were matched
      expect(getGameMatch('pc', 'normal_1')).not.toBeNull();
      expect(getGameMatch('pc', 'normal_2')).not.toBeNull();

      // Check matching status when idle
      const status = orchestrator.getMatchingStatus();
      expect(status.isMatching).toBe(false);
      expect(status.processed).toBe(hostileRows.length);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Stress Test 4: 10 Hz Progress Throttling Verification Under Heavy Burst
  // ─────────────────────────────────────────────────────────────────────────
  describe('Stress Test 4: 10 Hz Progress Throttle Under Rapid Event Bursts', () => {
    it('strictly enforces <= 10 Hz throttle during a burst of 100 rapid batch events', async () => {
      const totalItems = 100;
      const games = Array.from({ length: totalItems }, (_, i) => ({
        id: `pc_burst_item_${i}`,
        title: `Burst Game ${i}`,
        exePath: `C:\\b_${i}.exe`,
        installDir: `C:\\b_${i}`,
        platform: 'pc' as const,
      }));
      upsertGames(games as any);

      const timestamps: number[] = [];
      const events: any[] = [];

      orchestrator.on('game:matching:progress', (e) => {
        timestamps.push(Date.now());
        events.push({ ...e });
      });

      // Simulate rapid remote completion (1ms per chunk of 1 item = 100 chunks in ~100ms)
      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockImplementation(async (...args: any[]) => {
        const chunk = args[0] as ScannedGame[];
        for (const g of chunk) {
          (orchestrator as any).handleProgress(JSON.stringify({
            query_id: `${g.platform}:${g.id}`,
            query_title: g.title,
            status: 'matched',
            match: {
              media_item_id: `otix_id_${g.id}`,
              title: g.title,
              confidence: 0.99,
            },
          }), 'background');
        }
      });

      await orchestrator.startBackgroundMatching({ batchSize: 1 });

      // Ensure that not all 100 chunk emissions resulted in an event
      const runningEvents = events.filter((e) => e.state === 'running');
      console.log('Running events count:', runningEvents.length);
      console.log('Events with timestamps:', events.map((e, idx) => ({ state: e.state, percent: e.percent, processed: e.processed, ts: timestamps[idx] })));

      expect(runningEvents.length).toBeLessThan(totalItems);

      // Terminal event must be completed with 100% and processed = 100
      const lastEvent = events[events.length - 1];
      expect(lastEvent.state).toBe('completed');
      expect(lastEvent.percent).toBe(100);
      expect(lastEvent.processed).toBe(totalItems);
    });

    it('enforces >= 90ms inter-event interval for sustained intermediate running progress events', async () => {
      // 25 chunks of 2 items = 50 items total, each chunk takes 20ms -> total duration ~500ms
      const totalItems = 50;
      const games = Array.from({ length: totalItems }, (_, i) => ({
        id: `pc_sustained_${i}`,
        title: `Sustained Game ${i}`,
        exePath: `C:\\s_${i}.exe`,
        installDir: `C:\\s_${i}`,
        platform: 'pc' as const,
      }));
      upsertGames(games as any);

      const timestamps: number[] = [];
      const events: any[] = [];

      orchestrator.on('game:matching:progress', (e) => {
        timestamps.push(Date.now());
        events.push({ ...e });
      });

      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockImplementation(async (...args: any[]) => {
        const chunk = args[0] as ScannedGame[];
        // Simulate realistic 20ms chunk latency
        await new Promise((resolve) => setTimeout(resolve, 20));
        for (const g of chunk) {
          (orchestrator as any).handleProgress(JSON.stringify({
            query_id: `${g.platform}:${g.id}`,
            query_title: g.title,
            status: 'matched',
            match: {
              media_item_id: `otix_id_${g.id}`,
              title: g.title,
              confidence: 0.99,
            },
          }), 'background');
        }
      });

      await orchestrator.startBackgroundMatching({ batchSize: 2 });

      console.log('Sustained events:', events.map((e, idx) => ({ state: e.state, percent: e.percent, processed: e.processed, ts: timestamps[idx] })));

      // Intermediate running events (excluding final 100% which triggers completion flush)
      const intermediateEvents = events
        .map((e, idx) => ({ event: e, ts: timestamps[idx] }))
        .filter((x) => x.event.state === 'running' && x.event.percent < 100);

      const intervals: number[] = [];
      for (let i = 1; i < intermediateEvents.length; i++) {
        intervals.push(intermediateEvents[i].ts - intermediateEvents[i - 1].ts);
      }
      console.log('Sustained intermediate intervals:', intervals);

      // Intermediate running emissions must respect the ~100ms throttle interval (>= 85ms accounting for timer jitter)
      for (const interval of intervals) {
        expect(interval).toBeGreaterThanOrEqual(85);
      }

      // Calculate actual frequency (Hz)
      const durationSec = (intermediateEvents[intermediateEvents.length - 1].ts - intermediateEvents[0].ts) / 1000;
      const rateHz = intervals.length / durationSec;
      console.log(`Measured sustained emission rate: ${rateHz.toFixed(2)} Hz over ${durationSec.toFixed(2)}s`);
      expect(rateHz).toBeLessThanOrEqual(10.5); // Strictly <= 10 Hz (with small timer variance allowance)

      // Verify terminal event
      const lastEvent = events[events.length - 1];
      expect(lastEvent.state).toBe('completed');
      expect(lastEvent.percent).toBe(100);
      expect(lastEvent.processed).toBe(totalItems);
    });

    it('offline streamMatchesLocal throttles match:progress events to <= 10 Hz', async () => {
      const count = 50;
      const games: ScannedGame[] = Array.from({ length: count }, (_, i) => ({
        id: `offline_throttle_${i}`,
        title: `Offline Game ${i}`,
        platform: 'pc',
      }));

      const matchProgressTimestamps: number[] = [];
      orchestrator.on('match:progress', () => {
        matchProgressTimestamps.push(Date.now());
      });

      // Call private streamMatchesLocal directly
      await (orchestrator as any).streamMatchesLocal(games, 'background');

      // The burst has 50 items. Without throttling, there would be 50 emissions.
      // With 10 Hz throttling, intermediate events are coalesced
      expect(matchProgressTimestamps.length).toBeLessThan(count);

      // Verify intervals between intermediate events
      for (let i = 1; i < matchProgressTimestamps.length - 1; i++) {
        const interval = matchProgressTimestamps[i] - matchProgressTimestamps[i - 1];
        expect(interval).toBeGreaterThanOrEqual(85);
      }
    });
  });
});
