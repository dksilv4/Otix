import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── In-Memory Mock SQLite DB for Challenger M2-1 ────────────────────────

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

          const dm = sql.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/i);
          if (dm) {
            const tableName = dm[1].toLowerCase();
            const t = dbState.tables.get(tableName);
            if (t) {
              if (sql.includes('WHERE id IN')) {
                for (const p of params) t.delete(String(p));
              } else if (sql.includes('WHERE platform IN')) {
                for (const [k, v] of [...t.entries()]) {
                  if (params.includes(v.platform)) t.delete(k);
                }
              } else if (params.length >= 2) {
                t.delete(`${params[0]}|${params[1]}`);
              } else if (params.length === 1) {
                t.delete(String(params[0]));
              } else {
                t.clear();
              }
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
                  if (params[1] != null) row.otix_media_title = params[1];
                  if (params[2] != null) row.otix_confidence = params[2];
                } else if (sql.includes('otix_media_id = COALESCE')) {
                  if (params[0] != null) row.otix_media_id = params[0];
                  if (params[1] != null) row.otix_media_title = params[1];
                  const conf = params[9] !== undefined ? params[9] : params[params.length - 3];
                  if (conf != null) row.otix_confidence = conf;
                }
              }
            }
            return { changes: 1 };
          }
          return { changes: 1 };
        },
        get: (...params: any[]) => {
          const countM = sql.match(/SELECT\s+COUNT\(\*\)(?:\s+AS\s+\w+)?\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/i);
          if (countM) {
            const t = dbState.tables.get(countM[1].toLowerCase());
            let rows = t ? [...t.values()] : [];
            const whereClause = countM[2] || '';
            if (/sources NOT LIKE/i.test(whereClause)) {
              rows = rows.filter((r) => !r.sources || !String(r.sources).includes('"isApp":true'));
            }
            if (/otix_media_id IS NULL/i.test(whereClause)) {
              rows = rows.filter((r) => r.otix_media_id === null || r.otix_media_id === undefined || r.otix_media_id === '');
            } else if (/otix_media_id IS NOT NULL/i.test(whereClause)) {
              rows = rows.filter((r) => r.otix_media_id !== null && r.otix_media_id !== undefined && r.otix_media_id !== '');
            }
            const count = rows.length;
            return { count, 'COUNT(*)': count, cnt: count };
          }

          const sm = sql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)/i);
          if (sm) {
            const tableName = sm[2].toLowerCase();
            const t = dbState.tables.get(tableName);
            if (t) {
              if (tableName === 'game_matches') {
                const key = `${params[0]}|${params[1]}`;
                return t.get(key);
              }
              const key = String(params[0]);
              const row = t.get(key);
              if (row) return row;
              if (params.length > 1) {
                return t.get(String(params[1]));
              }
            }
          }
          return undefined;
        },
        all: (...params: any[]) => {
          const sm = sql.match(/FROM\s+(\w+)/i);
          if (sm) {
            const tableName = sm[1].toLowerCase();
            const t = dbState.tables.get(tableName);
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

// Mock Electron modules
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

import {
  ensureGameMatchesTable,
  upsertGames,
  getAllGames,
  getGameCount,
  getGameMatch,
  flushNotifyGamesChanged,
  GameRow,
} from '../game/storage';
import { GameScanOrchestrator, ScannedGame } from '../game/orchestrator';
import { registerScannerIPC, setScanOrchestrator } from '../ipc/scanner';
import { generateRealisticGames, SimulatedGame } from '../scripts/stress-test-matching';

describe('Challenger M2-1: Cancellation & Resumption Empirical Challenge', () => {
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

  // ─────────────────────────────────────────────────────────────────────────
  // Empirical Challenge 1: 1,500 Game Library Simulation & Phase 1 Storage
  // ─────────────────────────────────────────────────────────────────────────
  describe('Empirical Challenge 1: 1,500 Games Phase 1 Ingestion & Pre-Commit', () => {
    it('persists 100% of 1,500 discovered games into SQLite before matching begins', () => {
      const TOTAL_GAMES = 1500;
      const simulated = generateRealisticGames(TOTAL_GAMES);
      expect(simulated).toHaveLength(TOTAL_GAMES);

      const rows: GameRow[] = simulated.map((g) => ({
        id: g.id,
        title: g.title,
        exePath: g.exePath,
        installDir: g.installDir,
        platform: g.platform as any,
        posterUrl: g.posterUrl,
        iconUrl: g.iconUrl,
        isDlc: g.isDlc,
        dlcOf: g.dlcOf,
        isBeta: g.isBeta,
        betaOf: g.betaOf,
        isApp: g.isApp,
        sources: g.sources,
      }));

      const startTime = performance.now();
      upsertGames(rows);
      flushNotifyGamesChanged();
      const elapsed = performance.now() - startTime;

      // Persistence SLA: < 2,000ms
      expect(elapsed).toBeLessThan(2000);

      // Verify all 1,500 records are stored
      const inDb = getAllGames();
      expect(inDb).toHaveLength(TOTAL_GAMES);

      // Verify that 100% of discovered games have otix_media_id IS NULL initially
      const unmatchedCount = inDb.filter((g) => !g.otixMediaId || g.otixMediaId === '').length;
      expect(unmatchedCount).toBe(TOTAL_GAMES);

      // Verify initial matching status
      const status = orchestrator.getMatchingStatus();
      expect(status.isMatching).toBe(false);
      expect(status.totalInLibrary).toBe(TOTAL_GAMES);
      expect(status.totalUnmatched).toBe(TOTAL_GAMES);
      expect(status.totalMatched).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Empirical Challenge 2: Cancellation Midway at 30% (450/1500)
  // ─────────────────────────────────────────────────────────────────────────
  describe('Empirical Challenge 2: Cancellation Midway at 30% (450 items)', () => {
    it('cancels matching at 450 items, leaving 100% of 1,500 games intact with 450 matched and 1,050 unmatched', async () => {
      const TOTAL_GAMES = 1500;
      const CANCEL_TARGET = 450; // 30%
      const BATCH_SIZE = 25;

      const simulated = generateRealisticGames(TOTAL_GAMES);
      const rows: GameRow[] = simulated.map((g) => ({
        id: g.id,
        title: g.title,
        exePath: g.exePath,
        installDir: g.installDir,
        platform: g.platform as any,
        posterUrl: g.posterUrl,
        iconUrl: g.iconUrl,
        sources: g.sources,
      }));
      upsertGames(rows);

      let processedSoFar = 0;
      let cancelTriggered = false;

      // Mock streamMatchesRemote to match items in 25-item chunks and abort when target is reached
      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockImplementation(async (chunk: any, _pluginId: any, _mediaType: any, signal: any) => {
        if (signal.aborted) return;

        for (const g of chunk) {
          (orchestrator as any).handleProgress(JSON.stringify({
            query_id: `${g.platform}:${g.id}`,
            query_title: g.title,
            status: 'matched',
            match: {
              media_item_id: `otix_catalog_${g.platform}_${g.id}`,
              title: `Catalog ${g.title}`,
              confidence: 0.99,
              poster_url: `https://images.otix.app/p/${g.id}.jpg`,
            },
          }), 'background');
        }

        processedSoFar += chunk.length;

        if (processedSoFar >= CANCEL_TARGET && !cancelTriggered) {
          cancelTriggered = true;
          // Trigger cancellation midway
          orchestrator.cancelMatching();
        }
      });

      const cancelEvents: any[] = [];
      orchestrator.on('game:matching:cancelled', () => cancelEvents.push('game:matching:cancelled'));
      orchestrator.on('scan:cancelled', (e) => cancelEvents.push(e));

      await orchestrator.startBackgroundMatching({ batchSize: BATCH_SIZE });

      // Verification A: Matching is stopped
      expect(orchestrator.isMatching).toBe(false);
      expect(cancelEvents.length).toBeGreaterThan(0);

      // Verification B: Exactly 450 items were matched before cancellation
      expect(processedSoFar).toBe(CANCEL_TARGET);

      // Verification C: 100% of discovered games (1,500) remain intact in SQLite
      const allInDbAfterCancel = getAllGames();
      expect(allInDbAfterCancel).toHaveLength(TOTAL_GAMES);

      // Verification D: Exactly 450 games retain valid catalog IDs
      const matchedAfterCancel = allInDbAfterCancel.filter((g) => Boolean(g.otixMediaId));
      expect(matchedAfterCancel).toHaveLength(CANCEL_TARGET);

      for (let i = 0; i < CANCEL_TARGET; i++) {
        const gameId = simulated[i].id;
        const g = allInDbAfterCancel.find((x) => x.id === gameId);
        expect(g).toBeDefined();
        expect(g?.otixMediaId).toBe(`otix_catalog_${gameId}`);
        expect(g?.otixConfidence).toBe(0.99);

        // Verify entry in game_matches table (keyed by platform and unprefixed id)
        const unprefixedId = gameId.replace(/^[^_]+_/, '');
        const matchEntry = getGameMatch(simulated[i].platform, unprefixedId);
        expect(matchEntry).toBeDefined();
        expect(matchEntry?.otixMediaId).toBe(`otix_catalog_${gameId}`);
      }

      // Verification E: Exactly 1,050 games remain unmatched in SQLite
      const unmatchedAfterCancel = allInDbAfterCancel.filter((g) => !g.otixMediaId);
      expect(unmatchedAfterCancel).toHaveLength(TOTAL_GAMES - CANCEL_TARGET);

      // Verification F: Orchestrator status reflects exact library state
      const postCancelStatus = orchestrator.getMatchingStatus();
      expect(postCancelStatus.isMatching).toBe(false);
      expect(postCancelStatus.totalInLibrary).toBe(TOTAL_GAMES);
      expect(postCancelStatus.totalMatched).toBe(CANCEL_TARGET);
      expect(postCancelStatus.totalUnmatched).toBe(TOTAL_GAMES - CANCEL_TARGET);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Empirical Challenge 3: Resumption Query Only Fetches Remaining Unmatched Games
  // ─────────────────────────────────────────────────────────────────────────
  describe('Empirical Challenge 3: Resumption Precision & Completion', () => {
    it('resumes matching and queries ONLY the remaining 1,050 unmatched games without re-fetching the 450 matched games', async () => {
      const TOTAL_GAMES = 1500;
      const CANCEL_TARGET = 450;
      const BATCH_SIZE = 25;

      const simulated = generateRealisticGames(TOTAL_GAMES);
      const rows: GameRow[] = simulated.map((g) => ({
        id: g.id,
        title: g.title,
        exePath: g.exePath,
        installDir: g.installDir,
        platform: g.platform as any,
        posterUrl: g.posterUrl,
        iconUrl: g.iconUrl,
        sources: g.sources,
      }));
      upsertGames(rows);

      // Phase 2a: Run until 450 and cancel
      let matchedInRun1 = 0;
      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockImplementation(async (chunk: any) => {
        for (const g of chunk) {
          (orchestrator as any).handleProgress(JSON.stringify({
            query_id: `${g.platform}:${g.id}`,
            query_title: g.title,
            status: 'matched',
            match: {
              media_item_id: `catalog_id_${g.platform}_${g.id}`,
              title: `Catalog ${g.title}`,
              confidence: 0.98,
            },
          }), 'background');
        }
        matchedInRun1 += chunk.length;
        if (matchedInRun1 >= CANCEL_TARGET) {
          orchestrator.cancelMatching();
        }
      });

      await orchestrator.startBackgroundMatching({ batchSize: BATCH_SIZE });
      expect(matchedInRun1).toBe(CANCEL_TARGET);
      expect(orchestrator.isMatching).toBe(false);

      // Phase 2b: Resume matching
      const resumedChunksReceived: ScannedGame[][] = [];
      const resumedItemsReceived: ScannedGame[] = [];

      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockImplementation(async (chunk: any) => {
        resumedChunksReceived.push(chunk);
        for (const g of chunk) {
          resumedItemsReceived.push(g);
          (orchestrator as any).handleProgress(JSON.stringify({
            query_id: `${g.platform}:${g.id}`,
            query_title: g.title,
            status: 'matched',
            match: {
              media_item_id: `resumed_catalog_id_${g.platform}_${g.id}`,
              title: `Catalog ${g.title}`,
              confidence: 0.97,
            },
          }), 'background');
        }
      });

      // Execute resumption
      await orchestrator.startBackgroundMatching({ batchSize: BATCH_SIZE });

      // Verification G: Resumption query only fetched exactly 1,050 remaining games
      expect(resumedItemsReceived).toHaveLength(TOTAL_GAMES - CANCEL_TARGET);

      // Verification H: ZERO games from the first 450 were re-processed in resumption
      const first450Ids = new Set(simulated.slice(0, CANCEL_TARGET).map((g) => g.id));
      for (const resumedItem of resumedItemsReceived) {
        expect(first450Ids.has(resumedItem.id)).toBe(false);
      }

      // Verification I: All 1,050 resumed items are chunked in bounded batches of 25
      expect(resumedChunksReceived).toHaveLength((TOTAL_GAMES - CANCEL_TARGET) / BATCH_SIZE);
      for (const chunk of resumedChunksReceived) {
        expect(chunk.length).toBeLessThanOrEqual(BATCH_SIZE);
      }

      // Verification J: Final library state: 100% (1,500) matched with 0 remaining unmatched
      const finalDbGames = getAllGames();
      expect(finalDbGames).toHaveLength(TOTAL_GAMES);

      const finalUnmatched = finalDbGames.filter((g) => !g.otixMediaId);
      expect(finalUnmatched).toHaveLength(0);

      const finalMatched = finalDbGames.filter((g) => Boolean(g.otixMediaId));
      expect(finalMatched).toHaveLength(TOTAL_GAMES);

      // First 450 retain their initial catalog IDs
      for (let i = 0; i < CANCEL_TARGET; i++) {
        const id = simulated[i].id;
        const g = finalDbGames.find((x) => x.id === id);
        expect(g?.otixMediaId).toBe(`catalog_id_${id}`);
      }

      // Last 1,050 have their resumed catalog IDs
      for (let i = CANCEL_TARGET; i < TOTAL_GAMES; i++) {
        const id = simulated[i].id;
        const g = finalDbGames.find((x) => x.id === id);
        expect(g?.otixMediaId).toBe(`resumed_catalog_id_${id}`);
      }

      const finalStatus = orchestrator.getMatchingStatus();
      expect(finalStatus.isMatching).toBe(false);
      expect(finalStatus.totalInLibrary).toBe(TOTAL_GAMES);
      expect(finalStatus.totalMatched).toBe(TOTAL_GAMES);
      expect(finalStatus.totalUnmatched).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Empirical Challenge 4: Adversarial Edge Cases & Stress Scenarios
  // ─────────────────────────────────────────────────────────────────────────
  describe('Empirical Challenge 4: Adversarial Edge Cases', () => {
    it('cancelMatching is completely idempotent and safe when called repeatedly while idle', () => {
      expect(orchestrator.isMatching).toBe(false);
      expect(() => orchestrator.cancelMatching()).not.toThrow();
      expect(() => orchestrator.cancelMatching()).not.toThrow();
      expect(() => orchestrator.cancelMatching()).not.toThrow();
      expect(orchestrator.isMatching).toBe(false);
    });

    it('rejects concurrent startBackgroundMatching calls and preserves active loop', async () => {
      const simulated = generateRealisticGames(50);
      upsertGames(simulated as any);

      let slowResolver: () => void;
      const slowPromise = new Promise<void>((r) => { slowResolver = r; });

      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockImplementation(() => slowPromise);

      const run1 = orchestrator.startBackgroundMatching();
      expect(orchestrator.isMatching).toBe(true);

      // Concurrent invocation must return immediately without spawning a second loop
      const run2 = orchestrator.startBackgroundMatching();
      await run2;

      expect(orchestrator.isMatching).toBe(true);

      slowResolver!();
      await run1;
      expect(orchestrator.isMatching).toBe(false);
    });

    it('rematchAll: true forces re-matching of already-matched games', async () => {
      const simulated = generateRealisticGames(25);
      const rows: GameRow[] = simulated.map((g) => ({
        id: g.id,
        title: g.title,
        exePath: g.exePath,
        installDir: g.installDir,
        platform: g.platform as any,
        otixMediaId: `old_id_${g.id}`,
        sources: g.sources,
      }));
      upsertGames(rows);

      // By default, startBackgroundMatching should find 0 unmatched games
      let defaultProcessed = 0;
      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockImplementation(async (chunk: any) => {
        defaultProcessed += chunk.length;
      });
      await orchestrator.startBackgroundMatching();
      expect(defaultProcessed).toBe(0);

      // With rematchAll: true, all 25 games should be queried and matched
      let rematchProcessed = 0;
      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockImplementation(async (chunk: any) => {
        rematchProcessed += chunk.length;
      });
      await orchestrator.startBackgroundMatching({ rematchAll: true });
      expect(rematchProcessed).toBe(25);
    });

    it('processes only specified gameIds when selective matching is requested', async () => {
      const simulated = generateRealisticGames(10);
      const rows: GameRow[] = simulated.map((g) => ({
        id: g.id,
        title: g.title,
        exePath: g.exePath,
        installDir: g.installDir,
        platform: g.platform as any,
        sources: g.sources,
      }));
      upsertGames(rows);

      const targetIds = [simulated[2].id, simulated[7].id];
      const matchedIds: string[] = [];

      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockImplementation(async (chunk: any) => {
        for (const g of chunk) {
          matchedIds.push(`${g.platform}_${g.id}`);
          (orchestrator as any).handleProgress(JSON.stringify({
            query_id: `${g.platform}:${g.id}`,
            query_title: g.title,
            status: 'matched',
            match: { media_item_id: `selective_${g.id}`, title: g.title },
          }), 'background');
        }
      });

      await orchestrator.startBackgroundMatching({ gameIds: targetIds });

      expect(matchedIds).toEqual(expect.arrayContaining(targetIds));
      expect(matchedIds).toHaveLength(2);

      const unp2 = simulated[2].id.replace(/^[^_]+_/, '');
      const unp7 = simulated[7].id.replace(/^[^_]+_/, '');
      const unp0 = simulated[0].id.replace(/^[^_]+_/, '');
      expect(getGameMatch(simulated[2].platform, unp2)).toBeDefined();
      expect(getGameMatch(simulated[7].platform, unp7)).toBeDefined();
      expect(getGameMatch(simulated[0].platform, unp0)).toBeNull();
    });

    it('IPC matching:cancel handler cancels background matching cleanly', async () => {
      const simulated = generateRealisticGames(50);
      upsertGames(simulated as any);

      let loopResolver: () => void;
      const loopPromise = new Promise<void>((r) => { loopResolver = r; });
      vi.spyOn(orchestrator as any, 'streamMatchesRemote').mockImplementation(() => loopPromise);

      // Trigger matching via IPC
      const startHandler = ipcHandlers.get('matching:start')!;
      const startRes = await startHandler({} as any, {});
      expect(startRes.success).toBe(true);
      expect(orchestrator.isMatching).toBe(true);

      // Trigger cancel via IPC
      const cancelHandler = ipcHandlers.get('matching:cancel')!;
      const cancelRes = await cancelHandler({} as any);
      expect(cancelRes.success).toBe(true);
      expect(cancelRes.cancelled).toBe(true);
      expect(orchestrator.isMatching).toBe(false);

      loopResolver!();
    });
  });
});
