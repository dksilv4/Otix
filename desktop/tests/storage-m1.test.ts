import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// ── In-Memory Mock Store for DB Testing ────────────────────────────────

interface MockTableState {
  rows: Map<string, Record<string, any>>;
}

function createMockDb() {
  const tables = new Map<string, MockTableState>();
  const executedStatements: string[] = [];
  const runParamsLog: any[][] = [];

  function getTable(name: string): MockTableState {
    const lower = name.toLowerCase();
    if (!tables.has(lower)) {
      tables.set(lower, { rows: new Map() });
    }
    return tables.get(lower)!;
  }

  // Pre-initialize scanned_games and game_matches
  getTable('scanned_games');
  getTable('game_matches');
  getTable('game_scan_paths');
  getTable('game_rejected_suggestions');

  return {
    tables,
    executedStatements,
    runParamsLog,
    reset() {
      tables.clear();
      getTable('scanned_games');
      getTable('game_matches');
      getTable('game_scan_paths');
      getTable('game_rejected_suggestions');
      executedStatements.length = 0;
      runParamsLog.length = 0;
    },
    exec: (sql: string) => {
      executedStatements.push(sql);
    },
    transaction: <T extends (...args: any[]) => any>(fn: T): T => {
      return ((...args: any[]) => {
        executedStatements.push('BEGIN TRANSACTION');
        try {
          const res = fn(...args);
          executedStatements.push('COMMIT');
          return res;
        } catch (err) {
          executedStatements.push('ROLLBACK');
          throw err;
        }
      }) as T;
    },
    prepare: (sql: string) => {
      return {
        run: (...params: any[]) => {
          executedStatements.push(sql);
          runParamsLog.push(params);

          // INSERT OR REPLACE INTO scanned_games
          const insertScannedMatch = sql.match(/INSERT\s+OR\s+REPLACE\s+INTO\s+scanned_games\s*\(([^)]+)\)/i);
          if (insertScannedMatch) {
            const cols = insertScannedMatch[1].split(',').map((c) => c.trim().toLowerCase());
            const row: Record<string, any> = {};
            for (let i = 0; i < cols.length; i++) {
              row[cols[i]] = params[i] ?? null;
            }
            const id = String(params[0]);
            getTable('scanned_games').rows.set(id, row);
            return { changes: 1, lastInsertRowid: 1 };
          }

          // INSERT OR REPLACE INTO game_matches
          const insertMatch = sql.match(/INSERT\s+OR\s+REPLACE\s+INTO\s+game_matches\s*\(([^)]+)\)/i);
          if (insertMatch) {
            const cols = insertMatch[1].split(',').map((c) => c.trim().toLowerCase());
            const row: Record<string, any> = {};
            for (let i = 0; i < cols.length; i++) {
              row[cols[i]] = params[i] ?? null;
            }
            const key = `${params[0]}|${params[1]}`;
            getTable('game_matches').rows.set(key, row);
            return { changes: 1, lastInsertRowid: 1 };
          }

          // UPDATE scanned_games SET otix_media_id = ...
          const updateScanned = sql.match(/UPDATE\s+scanned_games\s+SET/i);
          if (updateScanned) {
            const table = getTable('scanned_games');
            // Check for match updates (UPDATE scanned_games SET otix_media_id = ..., WHERE id = ? OR id = ?)
            if (/otix_media_id\s*=/i.test(sql)) {
              const otixMediaId = params[0];
              const otixMediaTitle = params[1];
              const otixConfidence = params[2];
              const id = params[params.length - 2];
              const altId = params[params.length - 1];
              const existing = table.rows.get(String(id)) || table.rows.get(String(altId));
              if (existing) {
                existing.otix_media_id = otixMediaId;
                if (otixMediaTitle !== null) existing.otix_media_title = otixMediaTitle;
                if (otixConfidence !== null) existing.otix_confidence = otixConfidence;
                return { changes: 1 };
              }
            }
            return { changes: 0 };
          }

          // DELETE FROM scanned_games WHERE id IN (...)
          const deleteInMatch = sql.match(/DELETE\s+FROM\s+scanned_games\s+WHERE\s+id\s+IN\s*\(([^)]+)\)/i);
          if (deleteInMatch) {
            const table = getTable('scanned_games');
            let changes = 0;
            for (const id of params) {
              if (table.rows.delete(String(id))) {
                changes++;
              }
            }
            return { changes };
          }

          // DELETE FROM scanned_games WHERE id = ?
          const deleteSingleMatch = sql.match(/DELETE\s+FROM\s+scanned_games\s+WHERE\s+id\s*=\s*\?/i);
          if (deleteSingleMatch) {
            const table = getTable('scanned_games');
            const changes = table.rows.delete(String(params[0])) ? 1 : 0;
            return { changes };
          }

          // DELETE FROM scanned_games WHERE platform IN (...)
          const deletePlatMatch = sql.match(/DELETE\s+FROM\s+scanned_games\s+WHERE\s+platform\s+IN\s*\(([^)]+)\)/i);
          if (deletePlatMatch) {
            const table = getTable('scanned_games');
            const plats = new Set(params.map(String));
            let changes = 0;
            for (const [id, row] of [...table.rows.entries()]) {
              if (plats.has(String(row.platform))) {
                table.rows.delete(id);
                changes++;
              }
            }
            return { changes };
          }

          // DELETE FROM scanned_games WHERE platform = ?
          const deleteSinglePlat = sql.match(/DELETE\s+FROM\s+scanned_games\s+WHERE\s+platform\s*=\s*\?/i);
          if (deleteSinglePlat) {
            const table = getTable('scanned_games');
            const plat = String(params[0]);
            let changes = 0;
            for (const [id, row] of [...table.rows.entries()]) {
              if (String(row.platform) === plat) {
                table.rows.delete(id);
                changes++;
              }
            }
            return { changes };
          }

          // DELETE FROM scanned_games (truncate)
          if (/DELETE\s+FROM\s+scanned_games\s*$/i.test(sql.trim())) {
            const table = getTable('scanned_games');
            const changes = table.rows.size;
            table.rows.clear();
            return { changes };
          }

          // DELETE FROM game_matches (truncate)
          if (/DELETE\s+FROM\s+game_matches\s*$/i.test(sql.trim())) {
            const table = getTable('game_matches');
            const changes = table.rows.size;
            table.rows.clear();
            return { changes };
          }

          return { changes: 0 };
        },
        get: (...params: any[]) => {
          // SELECT id, otix_media_id, ... FROM scanned_games WHERE id = ?
          if (/FROM\s+scanned_games\s+WHERE\s+id\s*=\s*\?/i.test(sql)) {
            const table = getTable('scanned_games');
            return table.rows.get(String(params[0]));
          }
          // SELECT * FROM scanned_games WHERE id = ? OR id = ?
          if (/FROM\s+scanned_games\s+WHERE\s+id\s*=\s*\?\s+OR\s+id\s*=\s*\?/i.test(sql)) {
            const table = getTable('scanned_games');
            return table.rows.get(String(params[0])) || table.rows.get(String(params[1]));
          }
          // SELECT * FROM game_matches WHERE source = ? AND source_game_id = ?
          if (/FROM\s+game_matches\s+WHERE\s+source\s*=\s*\?\s+AND\s+source_game_id\s*=\s*\?/i.test(sql)) {
            const table = getTable('game_matches');
            return table.rows.get(`${params[0]}|${params[1]}`);
          }
          return undefined;
        },
        all: (...params: any[]) => {
          // SELECT id, seeded FROM scanned_games WHERE platform = ?
          if (/FROM\s+scanned_games\s+WHERE\s+platform\s*=\s*\?/i.test(sql)) {
            const table = getTable('scanned_games');
            const plat = String(params[0]);
            const results: any[] = [];
            for (const row of table.rows.values()) {
              if (String(row.platform) === plat) {
                results.push({ id: row.id, seeded: row.seeded ?? 0, platform: row.platform });
              }
            }
            return results;
          }

          // SELECT id, platform, ... FROM scanned_games WHERE platform IN (...)
          if (/FROM\s+scanned_games\s+WHERE\s+platform\s+IN/i.test(sql)) {
            const table = getTable('scanned_games');
            const plats = new Set(params.map(String));
            const results: any[] = [];
            for (const row of table.rows.values()) {
              if (plats.has(String(row.platform))) {
                results.push({ id: row.id, seeded: row.seeded ?? 0, platform: row.platform });
              }
            }
            return results;
          }

          // SELECT id, seeded FROM scanned_games
          if (/SELECT\s+id,\s*seeded\s+FROM\s+scanned_games/i.test(sql)) {
            const table = getTable('scanned_games');
            return [...table.rows.values()].map((r) => ({ id: r.id, seeded: r.seeded ?? 0 }));
          }

          // SELECT * FROM scanned_games
          if (/FROM\s+scanned_games/i.test(sql)) {
            const table = getTable('scanned_games');
            return [...table.rows.values()];
          }

          // SELECT * FROM game_matches
          if (/FROM\s+game_matches/i.test(sql)) {
            const table = getTable('game_matches');
            return [...table.rows.values()];
          }

          return [];
        },
      };
    },
  };
}

const mockDb = createMockDb();

vi.mock('../db', () => ({
  getDb: () => mockDb,
}));

// Imports after mocking
import {
  SQLITE_PARAM_LIMIT,
  chunkArray,
  withTransaction,
  ensureScannedGamesIndexes,
  upsertGames,
  upsertGamesForPlatform,
  deleteGamesByIds,
  upsertGameMatches,
  getGameById,
  getAllGames,
  setNotifyTarget,
  notifyGamesChanged,
  flushNotifyGamesChanged,
  cancelPendingNotifyGamesChanged,
  onGamesChanged,
  disposeService,
  NOTIFY_DEBOUNCE_MS,
  type GameRow,
} from '../game/storage';
import migration014 from '../db/migrations/downloads/014_scanned_games_indexes';

describe('Milestone M1: Database Hardening, Transactions, Chunking & IPC Debounce', () => {
  beforeEach(() => {
    mockDb.reset();
    disposeService();
  });

  afterEach(() => {
    disposeService();
    vi.restoreAllMocks();
  });

  // ── 1. chunkArray Utility ──────────────────────────────────────────────

  describe('chunkArray utility & parameter limit bounds', () => {
    it('defines SQLITE_PARAM_LIMIT as 400', () => {
      expect(SQLITE_PARAM_LIMIT).toBe(400);
    });

    it('returns empty array when input is empty or null', () => {
      expect(chunkArray([])).toEqual([]);
      expect(chunkArray(null as any)).toEqual([]);
      expect(chunkArray(undefined as any)).toEqual([]);
    });

    it('returns a single chunk when items count is below size', () => {
      const items = ['a', 'b', 'c'];
      const chunks = chunkArray(items, 10);
      expect(chunks).toEqual([['a', 'b', 'c']]);
    });

    it('chunks exactly on boundaries', () => {
      const items = Array.from({ length: 800 }, (_, i) => `item_${i}`);
      const chunks = chunkArray(items, 400);
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toHaveLength(400);
      expect(chunks[1]).toHaveLength(400);
      expect(chunks[0][0]).toBe('item_0');
      expect(chunks[1][399]).toBe('item_799');
    });

    it('chunks 1,500 items into 4 safe batches of <= 400', () => {
      const items = Array.from({ length: 1500 }, (_, i) => `item_${i}`);
      const chunks = chunkArray(items, SQLITE_PARAM_LIMIT);
      expect(chunks).toHaveLength(4);
      expect(chunks[0]).toHaveLength(400);
      expect(chunks[1]).toHaveLength(400);
      expect(chunks[2]).toHaveLength(400);
      expect(chunks[3]).toHaveLength(300);
    });

    it('handles custom chunk size override', () => {
      const items = [1, 2, 3, 4, 5];
      const chunks = chunkArray(items, 2);
      expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
    });
  });

  // ── 2. withTransaction Helper ──────────────────────────────────────────

  describe('withTransaction helper', () => {
    it('executes the callback and returns its result inside a transaction', () => {
      const result = withTransaction(() => {
        mockDb.exec('INSERT INTO dummy');
        return 42;
      });
      expect(result).toBe(42);
      expect(mockDb.executedStatements).toContain('BEGIN TRANSACTION');
      expect(mockDb.executedStatements).toContain('COMMIT');
    });

    it('falls back seamlessly to direct execution when db().transaction is not a function', () => {
      const originalTx = mockDb.transaction;
      (mockDb as any).transaction = undefined;

      try {
        const result = withTransaction(() => {
          return 'mock-executed-directly';
        });
        expect(result).toBe('mock-executed-directly');
      } finally {
        mockDb.transaction = originalTx;
      }
    });

    it('propagates errors and executes rollback on exception', () => {
      expect(() => {
        withTransaction(() => {
          throw new Error('Simulated atomic failure');
        });
      }).toThrow('Simulated atomic failure');

      expect(mockDb.executedStatements).toContain('BEGIN TRANSACTION');
      expect(mockDb.executedStatements).toContain('ROLLBACK');
    });
  });

  // ── 3. deleteGamesByIds Safe Chunking ───────────────────────────────────

  describe('deleteGamesByIds safe parameter chunking', () => {
    it('does nothing when given an empty or null array', () => {
      deleteGamesByIds([]);
      deleteGamesByIds(null as any);
      expect(mockDb.executedStatements).not.toContain('BEGIN TRANSACTION');
    });

    it('chunks deletions of 1,000 items into batches <= 400', () => {
      // Prepopulate mock store with 1,000 games
      const table = mockDb.tables.get('scanned_games')!;
      for (let i = 0; i < 1000; i++) {
        table.rows.set(`game_${i}`, { id: `game_${i}`, title: `Game ${i}`, platform: 'pc' });
      }
      expect(table.rows.size).toBe(1000);

      const idsToDelete = Array.from({ length: 1000 }, (_, i) => `game_${i}`);
      deleteGamesByIds(idsToDelete);

      expect(table.rows.size).toBe(0);

      // Verify that no individual prepare call exceeded 400 placeholders
      const deleteCalls = mockDb.runParamsLog.filter(
        (params) => params.length > 0 && params[0].startsWith('game_'),
      );
      expect(deleteCalls.length).toBe(3); // 400, 400, 200
      expect(deleteCalls[0].length).toBe(400);
      expect(deleteCalls[1].length).toBe(400);
      expect(deleteCalls[2].length).toBe(200);
    });
  });

  // ── 4. upsertGames & upsertGamesForPlatform Atomic Operations ──────────

  describe('upsertGames & upsertGamesForPlatform resilience', () => {
    it('handles 1,500 games in upsertGames within a single transaction without parameter overflow', () => {
      const largeGameList: GameRow[] = Array.from({ length: 1500 }, (_, i) => ({
        id: `steam_app_${i}`,
        title: `Game ${i}`,
        exePath: `C:\\Games\\game_${i}.exe`,
        installDir: `C:\\Games\\game_${i}`,
        platform: 'steam' as const,
      }));

      expect(() => upsertGames(largeGameList)).not.toThrow();

      expect(mockDb.executedStatements).toContain('BEGIN TRANSACTION');
      expect(mockDb.executedStatements).toContain('COMMIT');

      const table = mockDb.tables.get('scanned_games')!;
      expect(table.rows.size).toBe(1500);
      expect(table.rows.get('steam_app_0')?.title).toBe('Game 0');
      expect(table.rows.get('steam_app_1499')?.title).toBe('Game 1499');
    });

    it('deletes stale games using chunked queries on re-scan', () => {
      const table = mockDb.tables.get('scanned_games')!;
      // Initially 1,000 games exist in database
      for (let i = 0; i < 1000; i++) {
        table.rows.set(`epic_game_${i}`, {
          id: `epic_game_${i}`,
          title: `Old Game ${i}`,
          platform: 'epic',
        });
      }
      expect(table.rows.size).toBe(1000);

      // Re-scan with only 100 games (900 stale games need deletion)
      const freshScanned: GameRow[] = Array.from({ length: 100 }, (_, i) => ({
        id: `epic_game_${i}`,
        title: `Fresh Game ${i}`,
        exePath: `C:\\Epic\\game_${i}.exe`,
        installDir: `C:\\Epic\\game_${i}`,
        platform: 'epic' as const,
      }));

      upsertGames(freshScanned);

      expect(table.rows.size).toBe(100);
      expect(table.rows.has('epic_game_99')).toBe(true);
      expect(table.rows.has('epic_game_100')).toBe(false);

      // Check parameter chunking: 900 stale items deleted in chunks (400, 400, 100)
      const deleteInStatements = mockDb.executedStatements.filter((stmt) =>
        stmt.includes('DELETE FROM scanned_games WHERE id IN'),
      );
      expect(deleteInStatements.length).toBe(3);
    });

    it('performs zero delete queries when re-scanning same library without stale items', () => {
      const initialGames: GameRow[] = Array.from({ length: 100 }, (_, i) => ({
        id: `gog_${i}`,
        title: `GOG Game ${i}`,
        exePath: `C:\\GOG\\game_${i}.exe`,
        installDir: `C:\\GOG\\game_${i}`,
        platform: 'gog' as const,
      }));

      upsertGames(initialGames);

      mockDb.executedStatements.length = 0;
      // Re-scan exact same set
      upsertGames(initialGames);

      // Should not have executed any DELETE statements
      const deleteStatements = mockDb.executedStatements.filter((s) => s.includes('DELETE FROM scanned_games'));
      expect(deleteStatements.length).toBe(0);
    });

    it('upsertGamesForPlatform executes inside transaction and scopes stale deletions to platform', () => {
      const table = mockDb.tables.get('scanned_games')!;
      // Seed games for Steam and GOG
      table.rows.set('steam_1', { id: 'steam_1', platform: 'steam', title: 'Steam Game 1' });
      table.rows.set('steam_2', { id: 'steam_2', platform: 'steam', title: 'Steam Game 2' });
      table.rows.set('gog_1', { id: 'gog_1', platform: 'gog', title: 'GOG Game 1' });

      // Upsert Steam with only steam_1 (steam_2 is stale)
      upsertGamesForPlatform(
        [
          {
            id: 'steam_1',
            platform: 'steam',
            title: 'Steam Game 1 Updated',
            exePath: 'C:\\steam.exe',
            installDir: 'C:\\steam',
          },
        ],
        'steam',
      );

      expect(table.rows.has('steam_1')).toBe(true);
      expect(table.rows.has('steam_2')).toBe(false); // Stale steam game deleted
      expect(table.rows.has('gog_1')).toBe(true); // GOG game preserved intact!
    });
  });

  // ── 5. upsertGameMatches Bulk Operation ────────────────────────────────

  describe('upsertGameMatches atomic bulk updates', () => {
    it('atomically updates scanned_games and inserts game_matches inside a transaction', () => {
      const table = mockDb.tables.get('scanned_games')!;
      table.rows.set('steam_101', { id: 'steam_101', title: 'Half-Life', platform: 'steam' });
      table.rows.set('steam_102', { id: 'steam_102', title: 'Portal', platform: 'steam' });

      upsertGameMatches([
        {
          id: 'steam_101',
          source: 'steam',
          sourceGameId: '101',
          otixMediaId: 'otix_hl',
          otixMediaTitle: 'Half-Life',
          otixConfidence: 0.99,
        },
        {
          id: 'steam_102',
          source: 'steam',
          sourceGameId: '102',
          otixMediaId: 'otix_portal',
          otixMediaTitle: 'Portal',
          otixConfidence: 0.95,
        },
      ]);

      expect(mockDb.executedStatements).toContain('BEGIN TRANSACTION');
      expect(mockDb.executedStatements).toContain('COMMIT');

      // Verify scanned_games updated
      expect(table.rows.get('steam_101')?.otix_media_id).toBe('otix_hl');
      expect(table.rows.get('steam_102')?.otix_media_id).toBe('otix_portal');

      // Verify game_matches inserted
      const matchTable = mockDb.tables.get('game_matches')!;
      expect(matchTable.rows.get('steam|101')?.otix_media_id).toBe('otix_hl');
      expect(matchTable.rows.get('steam|102')?.otix_media_id).toBe('otix_portal');
    });

    it('handles items with only id and otixMediaId (scanned_games match only)', () => {
      const table = mockDb.tables.get('scanned_games')!;
      table.rows.set('game_abc', { id: 'game_abc', title: 'ABC', platform: 'pc' });

      upsertGameMatches([
        { id: 'game_abc', otixMediaId: 'otix_123' },
      ]);

      expect(table.rows.get('game_abc')?.otix_media_id).toBe('otix_123');
    });
  });

  // ── 6. Coalesced IPC Debounce & Flush ───────────────────────────────────

  describe('Coalesced IPC Notification Debounce & Flushing', () => {
    function createMockWindow() {
      const ee = new EventEmitter() as any;
      let destroyed = false;
      ee.isDestroyed = () => destroyed;
      ee._destroy = () => {
        destroyed = true;
        ee.emit('closed');
      };
      ee.webContents = {
        isDestroyed: () => destroyed,
        send: vi.fn(),
      };
      return ee;
    }

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('coalesces 1,500 rapid notifyGamesChanged calls into exactly 1 dispatch after 1,000ms', () => {
      const win = createMockWindow();
      setNotifyTarget(win);
      const listener = vi.fn();
      const unsub = onGamesChanged(listener);

      // Rapidly fire 1,500 notifications over 500ms
      for (let i = 0; i < 1500; i++) {
        notifyGamesChanged();
        if (i % 250 === 0) {
          vi.advanceTimersByTime(50);
        }
      }

      // Quiet period has not elapsed yet
      expect(win.webContents.send).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();

      // Advance 999ms after the last write
      vi.advanceTimersByTime(999);
      expect(win.webContents.send).not.toHaveBeenCalled();

      // Final 1ms completes the 1,000ms debounce
      vi.advanceTimersByTime(1);
      expect(win.webContents.send).toHaveBeenCalledTimes(1);
      expect(win.webContents.send).toHaveBeenCalledWith('games-db:changed');
      expect(listener).toHaveBeenCalledTimes(1);

      unsub();
    });

    it('immediately flushes pending notifications via flushNotifyGamesChanged', () => {
      const win = createMockWindow();
      setNotifyTarget(win);
      const listener = vi.fn();
      onGamesChanged(listener);

      notifyGamesChanged();
      expect(win.webContents.send).not.toHaveBeenCalled();

      // Flush at phase boundary
      flushNotifyGamesChanged();
      expect(win.webContents.send).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(1);

      // Verify timer does not fire again
      vi.advanceTimersByTime(2000);
      expect(win.webContents.send).toHaveBeenCalledTimes(1);
    });

    it('flushNotifyGamesChanged without pending changes is a no-op', () => {
      const win = createMockWindow();
      setNotifyTarget(win);

      flushNotifyGamesChanged();
      expect(win.webContents.send).not.toHaveBeenCalled();
    });

    it('flushNotifyGamesChanged with { force: true } dispatches even if no notification is pending', () => {
      const win = createMockWindow();
      setNotifyTarget(win);

      flushNotifyGamesChanged({ force: true });
      expect(win.webContents.send).toHaveBeenCalledTimes(1);
    });

    it('notifyGamesChanged with { immediate: true } bypasses debounce', () => {
      const win = createMockWindow();
      setNotifyTarget(win);

      notifyGamesChanged({ immediate: true });
      expect(win.webContents.send).toHaveBeenCalledTimes(1);
    });

    it('cancelPendingNotifyGamesChanged clears timer without emitting', () => {
      const win = createMockWindow();
      setNotifyTarget(win);

      notifyGamesChanged();
      cancelPendingNotifyGamesChanged();

      vi.advanceTimersByTime(2000);
      expect(win.webContents.send).not.toHaveBeenCalled();
    });

    it('cleans up target window and cancels timers on window closed event', () => {
      const win = createMockWindow();
      setNotifyTarget(win);

      notifyGamesChanged();

      // Simulate window close
      win._destroy();

      vi.advanceTimersByTime(2000);
      // webContents.send must not have been called on closed window
      expect(win.webContents.send).not.toHaveBeenCalled();
    });
  });

  // ── 7. Migration 014 & Schema Indexing ──────────────────────────────────

  describe('Migration 014: scanned_games_indexes', () => {
    it('has migration id 14 and name scanned_games_indexes', () => {
      expect(migration014.id).toBe(14);
      expect(migration014.name).toBe('scanned_games_indexes');
    });

    it('executes CREATE INDEX IF NOT EXISTS for all 4 secondary indexes', () => {
      const statements: string[] = [];
      const runner = {
        exec: (sql: string) => statements.push(sql),
        getDb: () => mockDb,
      };

      migration014.up(runner as any);

      expect(statements.length).toBe(1);
      const sql = statements[0];
      expect(sql).toContain('idx_scanned_games_platform');
      expect(sql).toContain('idx_scanned_games_otix_media_id');
      expect(sql).toContain('idx_scanned_games_install_dir');
      expect(sql).toContain('idx_scanned_games_exe_path');
    });

    it('ensureScannedGamesIndexes helper creates all 4 indexes idempotently', () => {
      mockDb.executedStatements.length = 0;
      ensureScannedGamesIndexes();

      const lastExec = mockDb.executedStatements[mockDb.executedStatements.length - 1];
      expect(lastExec).toContain('idx_scanned_games_platform');
      expect(lastExec).toContain('idx_scanned_games_otix_media_id');
      expect(lastExec).toContain('idx_scanned_games_install_dir');
      expect(lastExec).toContain('idx_scanned_games_exe_path');
    });
  });
});
