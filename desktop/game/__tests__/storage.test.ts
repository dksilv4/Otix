import { describe, it, expect, vi } from 'vitest';

/**
 * In-memory mock store that replaces better-sqlite3 for tests.
 * The getConnection mock returns an object with prepare()/exec()
 * that delegate to this store, so the storage.ts CRUD functions
 * actually persist data across operations within a test file.
 */
function createMockDb() {
  const tables = new Map<string, Map<string, Record<string, any>>>();
  let autoIncrementId = 1;

  return {
    exec: (sql: string) => {
      // Parse CREATE TABLE IF NOT EXISTS to know table structure
      const createMatch = sql.match(
        /CREATE TABLE IF NOT EXISTS (\w+)/i,
      );
      if (createMatch) {
        const name = createMatch[1];
        if (!tables.has(name)) {
          tables.set(name, new Map());
        }
      }
    },
    prepare: (sql: string) => {
      const stmt = {
        run: (...params: any[]) => {
          // INSERT OR REPLACE
          const insertMatch = sql.match(
            /INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)/i,
          );
          if (insertMatch) {
            const tableName = insertMatch[1];
            const columns = insertMatch[2]
              .split(',')
              .map((c: string) => c.trim());
            const table = tables.get(tableName);
            if (table) {
              // Build row from columns and params
              const row: Record<string, any> = {};
              for (let i = 0; i < columns.length; i++) {
                row[columns[i]] = params[i] ?? null;
              }
              // Primary key is (source, source_game_id) for game_matches
              const key = `${params[0]}|${params[1]}`;
              row.id = autoIncrementId++;
              table.set(key, row);
            }
            return { changes: 1 };
          }

          // DELETE
          const deleteMatch = sql.match(
            /DELETE\s+FROM\s+(\w+)\s+WHERE/i,
          );
          if (deleteMatch) {
            const tableName = deleteMatch[1];
            const table = tables.get(tableName);
            if (table) {
              const whereSource = sql.match(/source\s*=\s*\?/i);
              const whereSourceGameId = sql.match(
                /source_game_id\s*=\s*\?/i,
              );
              if (whereSource && whereSourceGameId && params.length >= 2) {
                const key = `${params[0]}|${params[1]}`;
                table.delete(key);
              }
            }
            return { changes: 1 };
          }

          return { changes: 0 };
        },
        get: (...params: any[]) => {
          const selectMatch = sql.match(
            /SELECT\s+\*\s+FROM\s+(\w+)/i,
          );
          if (selectMatch) {
            const tableName = selectMatch[1];
            const table = tables.get(tableName);
            if (table) {
              const whereSource = sql.match(/source\s*=\s*\?/i);
              const whereSourceGameId = sql.match(
                /source_game_id\s*=\s*\?/i,
              );
              if (whereSource && whereSourceGameId && params.length >= 2) {
                const key = `${params[0]}|${params[1]}`;
                return table.get(key) || undefined;
              }
            }
          }
          return undefined;
        },
        all: (...params: any[]) => {
          const selectMatch = sql.match(
            /SELECT\s+\*\s+FROM\s+(\w+)/i,
          );
          if (selectMatch) {
            const tableName = selectMatch[1];
            const table = tables.get(tableName);
            if (table) {
              return Array.from(table.values());
            }
          }
          return [];
        },
      };
      return stmt;
    },
  };
}

// Create a single mock db instance shared across all tests in this file
const mockDb = createMockDb();

vi.mock('../../db', () => ({
  getConnection: () => mockDb,
}));

import {
  getGameMatch,
  upsertGameMatch,
  deleteGameMatch,
  ensureGameMatchesTable,
  getAllGameMatches,
} from '../storage';

describe('game_matches table', () => {
  it('should create the table without error', () => {
    expect(() => ensureGameMatchesTable()).not.toThrow();
  });

  it('should be idempotent on create', () => {
    expect(() => ensureGameMatchesTable()).not.toThrow();
  });

  it('should upsert a game match', () => {
    expect(() =>
      upsertGameMatch({
        source: 'epic',
        sourceGameId: 'Jaguar',
        otixMediaId: 'otix_abc123',
        otixTitle: 'Rocket League',
        otixPosterUrl: 'https://example.com/poster.jpg',
        otixConfidence: 0.98,
        matchType: 'manual',
      }),
    ).not.toThrow();
  });

  it('should retrieve a game match by source + id', () => {
    const match = getGameMatch('epic', 'Jaguar');
    expect(match).toBeDefined();
    expect(match?.source).toBe('epic');
    expect(match?.sourceGameId).toBe('Jaguar');
    expect(match?.otixMediaId).toBe('otix_abc123');
    expect(match?.matchType).toBe('manual');
  });

  it('should retrieve all game matches', () => {
    // Add a second match
    upsertGameMatch({
      source: 'gog',
      sourceGameId: '12345',
      otixMediaId: 'otix_xyz789',
      otixTitle: 'The Witcher 3',
      matchType: 'auto',
    });

    const all = getAllGameMatches();
    expect(all.length).toBeGreaterThanOrEqual(2);
    const gogMatch = all.find((m) => m.source === 'gog');
    expect(gogMatch).toBeDefined();
    expect(gogMatch?.otixTitle).toBe('The Witcher 3');
  });

  it('should return null for unknown game', () => {
    const match = getGameMatch('epic', 'nonexistent');
    expect(match).toBeNull();
  });

  it('should delete a game match', () => {
    deleteGameMatch('epic', 'Jaguar');
    const match = getGameMatch('epic', 'Jaguar');
    expect(match).toBeNull();
  });

  it('should upsert and update an existing match', () => {
    // Insert original
    upsertGameMatch({
      source: 'steam',
      sourceGameId: '440',
      otixMediaId: 'otix_teamfortress2',
      otixTitle: 'Team Fortress 2',
      matchType: 'auto',
    });

    // Update with higher confidence and different match type
    upsertGameMatch({
      source: 'steam',
      sourceGameId: '440',
      otixMediaId: 'otix_teamfortress2',
      otixTitle: 'Team Fortress 2 (Updated)',
      otixConfidence: 0.99,
      matchType: 'manual',
    });

    const match = getGameMatch('steam', '440');
    expect(match).toBeDefined();
    // Note: in the mock, INSERT OR REPLACE replaces the row,
    // so we'll see the updated values
    expect(match?.otixTitle).toBe('Team Fortress 2 (Updated)');
    expect(match?.matchType).toBe('manual');
  });
});
