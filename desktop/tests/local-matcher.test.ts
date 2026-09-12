import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared mutable mock-db state (reset per test) ────────────────────
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
        const cm = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
        if (cm && !dbState.tables.has(cm[1])) {
          dbState.tables.set(cm[1], new Map());
        }
      },
      prepare: (sql: string) => ({
        run: (...params: any[]) => {
          const im = sql.match(/INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
          if (im) {
            const tableName = im[1];
            const columns = im[2].split(',').map((c: string) => c.trim());
            const table = dbState.tables.get(tableName);
            if (table) {
              const row: Record<string, any> = {};
              for (let i = 0; i < columns.length; i++) row[columns[i]] = params[i] ?? null;
              row._id = autoIncrementId++;
              table.set(`${params[0]}|${params[1]}`, row);
            }
            return { changes: 1 };
          }
          const dm = sql.match(/DELETE\s+FROM\s+(\w+)\s+WHERE/i);
          if (dm && params.length >= 2) {
            const t = dbState.tables.get(dm[1]);
            if (t) t.delete(`${params[0]}|${params[1]}`);
            return { changes: 1 };
          }
          return { changes: 0 };
        },
        get: (...params: any[]) => {
          const sm = sql.match(/SELECT\s+\*\s+FROM\s+(\w+)/i);
          if (sm) {
            const t = dbState.tables.get(sm[1]);
            if (t && params.length >= 2) return t.get(`${params[0]}|${params[1]}`);
          }
          return undefined;
        },
        all: () => {
          const sm = sql.match(/FROM\s+(\w+)/i);
          if (sm) {
            const t = dbState.tables.get(sm[1]);
            if (t) return [...t.values()];
          }
          return [];
        },
      }),
    };
  },
}));

// Import after mocks
import { LocalMatcher } from '../game/local-matcher';
import { ensureGameMatchesTable, getGameMatch, upsertGameMatch } from '../game/storage';
import type { ScannedGame } from '../game/orchestrator';
import type { CatalogMatchCandidate } from '../game/catalog-match';

const catalogFor = (
  queryId: string,
  overrides: Partial<CatalogMatchCandidate> = {},
): Map<string, CatalogMatchCandidate> =>
  new Map([[queryId, { mediaId: 'catalog:rocket-league', title: 'Rocket League', ...overrides }]]);

const game = (overrides: Partial<ScannedGame> = {}): ScannedGame => ({
  id: 'Jaguar',
  title: 'Rocket League™',
  platform: 'epic',
  posterUrl: 'https://cdn.example.com/rl.jpg',
  externalIds: [{ source: 'epic', id: 'Jaguar' }],
  ...overrides,
});

describe('LocalMatcher', () => {
  beforeEach(() => {
    dbState.reset();
    ensureGameMatchesTable();
  });

  it('self-matches a game to a local identity with its own artwork', () => {
    const matcher = new LocalMatcher();
    const [result] = matcher.matchBatch([game()]);

    expect(result.status).toBe('matched');
    expect(result.mediaId).toBe('epic:Jaguar');
    expect(result.otixConfidence).toBe(1.0);

    const stored = getGameMatch('epic', 'Jaguar');
    expect(stored?.otixMediaId).toBe('epic:Jaguar');
    expect(stored?.otixTitle).toBe('Rocket League™');
    expect(stored?.otixPosterUrl).toBe('https://cdn.example.com/rl.jpg');
    expect(stored?.status).toBe('approved');
  });

  it('skips games that are already matched', () => {
    upsertGameMatch({
      source: 'epic', sourceGameId: 'Jaguar', otixMediaId: 'epic:Jaguar',
      otixTitle: 'Rocket League™', matchType: 'manual', status: 'approved',
    });
    const matcher = new LocalMatcher();
    const [result] = matcher.matchBatch([game()]);

    expect(result.status).toBe('matched');
    expect(result.mediaId).toBe('epic:Jaguar');
    // Already-matched rows are returned untouched, not re-persisted
    expect(result.otixConfidence).toBeUndefined();
  });

  it('reuses an existing cross-source match by comparison key', () => {
    upsertGameMatch({
      source: 'epic', sourceGameId: 'Jaguar', otixMediaId: 'epic:Jaguar',
      otixTitle: 'Rocket League™', otixPosterUrl: 'https://cdn.example.com/rl.jpg',
      otixConfidence: 1.0, matchType: 'auto', status: 'approved',
    });
    const matcher = new LocalMatcher();
    const [result] = matcher.matchBatch([game({ platform: 'steam', id: '252950', posterUrl: 'https://cdn.example.com/steam.jpg' })]);

    expect(result.status).toBe('matched');
    expect(result.mediaId).toBe('epic:Jaguar');
    expect(result.otixConfidence).toBe(0.95);

    const steamMatch = getGameMatch('steam', '252950');
    expect(steamMatch?.otixMediaId).toBe('epic:Jaguar');
  });

  it('dedupes within a single batch via comparison key', () => {
    const matcher = new LocalMatcher();
    const results = matcher.matchBatch([
      game({ id: 'a', title: 'Shenmue 3', platform: 'epic' }),
      game({ id: 'b', title: 'Shenmue III', platform: 'steam' }),
    ]);

    expect(results[0].mediaId).toBe('epic:a');
    expect(results[1].mediaId).toBe('epic:a');
    expect(results[1].otixConfidence).toBe(0.95);
  });

  it('prefers a manual match over an auto match for cross-source reuse', () => {
    upsertGameMatch({
      source: 'epic', sourceGameId: 'Jaguar', otixMediaId: 'epic:Jaguar',
      otixTitle: 'Rocket League™', otixConfidence: 0.9, matchType: 'auto', status: 'approved',
    });
    upsertGameMatch({
      source: 'gog', sourceGameId: 'RL', otixMediaId: 'gog:RL',
      otixTitle: 'Rocket League', otixConfidence: 0.7, matchType: 'manual', status: 'approved',
    });
    const matcher = new LocalMatcher();
    const [result] = matcher.matchBatch([game({ platform: 'steam', id: '252950' })]);

    expect(result.mediaId).toBe('gog:RL');
  });

  it('returns unmatched for a game with no title', () => {
    const matcher = new LocalMatcher();
    const [result] = matcher.matchBatch([game({ title: '   ' })]);
    expect(result.status).toBe('unmatched');
    expect(getGameMatch('epic', 'Jaguar')).toBeNull();
  });

  describe('catalog matches', () => {
    it('applies a catalog candidate before self-match, with curated identity', () => {
      const matcher = new LocalMatcher();
      const [result] = matcher.matchBatch(
        [game()],
        catalogFor('epic:Jaguar', { posterUrl: 'https://cdn.example.com/catalog.jpg' }),
      );

      expect(result.status).toBe('matched');
      expect(result.mediaId).toBe('catalog:rocket-league');
      expect(result.otixTitle).toBe('Rocket League');
      expect(result.otixPosterUrl).toBe('https://cdn.example.com/catalog.jpg');
      expect(result.otixConfidence).toBe(0.9);

      const stored = getGameMatch('epic', 'Jaguar');
      expect(stored?.otixMediaId).toBe('catalog:rocket-league');
      expect(stored?.otixTitle).toBe('Rocket League');
    });

    it('honours an explicit catalog confidence', () => {
      const matcher = new LocalMatcher();
      const [result] = matcher.matchBatch([game()], catalogFor('epic:Jaguar', { confidence: 0.98 }));
      expect(result.otixConfidence).toBe(0.98);
    });

    it('prefers a catalog match over cross-source reuse', () => {
      // Epic already has an auto identity for the same title
      upsertGameMatch({
        source: 'epic', sourceGameId: 'Jaguar', otixMediaId: 'epic:Jaguar',
        otixTitle: 'Rocket League™', otixConfidence: 1.0, matchType: 'auto', status: 'approved',
      });
      const matcher = new LocalMatcher();
      const [result] = matcher.matchBatch(
        [game({ platform: 'steam', id: '252950' })],
        catalogFor('steam:252950'),
      );

      expect(result.mediaId).toBe('catalog:rocket-league');
      expect(getGameMatch('steam', '252950')?.otixMediaId).toBe('catalog:rocket-league');
    });

    it('does not overwrite an already-matched game', () => {
      upsertGameMatch({
        source: 'epic', sourceGameId: 'Jaguar', otixMediaId: 'epic:Jaguar',
        otixTitle: 'Rocket League™', otixConfidence: 1.0, matchType: 'auto', status: 'approved',
      });
      const matcher = new LocalMatcher();
      const [result] = matcher.matchBatch([game()], catalogFor('epic:Jaguar'));

      expect(result.mediaId).toBe('epic:Jaguar');
      expect(result.otixConfidence).toBe(1.0);
      expect(getGameMatch('epic', 'Jaguar')?.otixMediaId).toBe('epic:Jaguar');
    });

    it('registers the catalog identity for reuse by later games in the batch', () => {
      const matcher = new LocalMatcher();
      const results = matcher.matchBatch(
        [
          game({ id: 'a', title: 'Rocket League™', platform: 'epic' }),
          game({ id: 'b', title: 'Rocket League', platform: 'steam' }),
        ],
        catalogFor('epic:a'),
      );

      // Steam has no catalog entry of its own but reuses the catalog identity
      expect(results[1].status).toBe('matched');
      expect(results[1].mediaId).toBe('catalog:rocket-league');
      expect(results[1].otixConfidence).toBe(0.95);
    });
  });
});
