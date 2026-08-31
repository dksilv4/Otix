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

vi.mock('../../db', () => ({
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

// Prevent hardcoded launcher scans from discovering real games on this machine
vi.mock('../launchers', () => ({
  scanAllLaunchers: () => Promise.resolve([]),
}));

// http always fails — simulates Otix backend being unreachable
vi.mock('http', () => {
  const EE = require('events').EventEmitter;
  const mockRequest = (_url: any, _options: any) => {
    const req = new EE();
    (req as any).write = () => {};
    (req as any).end = () => {};
    process.nextTick(() => req.emit('error', new Error('ECONNREFUSED')));
    return req;
  };
  return {
    default: { request: mockRequest, get: () => {} },
    request: mockRequest,
    get: () => {},
  };
});

// Import after mocks
import { GameScanOrchestrator } from '../orchestrator';
import { getGameMatch, upsertGameMatch, ensureGameMatchesTable } from '../storage';

describe('GameScanOrchestrator offline fallback', () => {
  beforeEach(() => {
    dbState.reset();
    ensureGameMatchesTable();
  });

  it('should self-match locally when backend is unreachable', async () => {
    const mockPluginManager = {
      getPluginsForSlot: vi.fn().mockReturnValue([
        { pluginId: 'otix-epic', label: 'Epic Games' },
      ]),
      callPluginData: vi.fn().mockResolvedValue([
        {
          id: 'Jaguar',
          title: 'Rocket League™',
          platform: 'epic',
          posterUrl: 'https://cdn.example.com/rl.jpg',
          externalIds: [{ source: 'epic', id: 'Jaguar' }],
        },
      ]),
    };

    const orchestrator = new GameScanOrchestrator(mockPluginManager as any);
    orchestrator.setApiBaseUrl('http://127.0.0.1:8000');

    const progressEvents: any[] = [];
    let completeEvent: any = null;
    orchestrator.on('match:progress', (e) => progressEvents.push(e));
    orchestrator.on('match:complete', (e) => (completeEvent = e));

    const results = await orchestrator.scanAll();

    // The offline fallback self-matched the game with a local identity id.
    const match = getGameMatch('epic', 'Jaguar');
    expect(match).toBeDefined();
    expect(match?.otixMediaId).toBe('epic:Jaguar');
    expect(match?.otixTitle).toBe('Rocket League™');
    expect(match?.otixConfidence).toBe(1.0);
    expect(match?.matchType).toBe('auto');
    expect(match?.status).toBe('approved');

    expect(progressEvents).toHaveLength(1);
    expect(progressEvents[0].status).toBe('matched');
    expect(progressEvents[0].queryId).toBe('epic:Jaguar');
    expect(progressEvents[0].match?.media_item_id).toBe('epic:Jaguar');

    expect(completeEvent).not.toBeNull();
    expect(completeEvent.offline).toBe(true);
    expect(completeEvent.matched).toBe(1);
    expect(completeEvent.unmatched).toBe(0);

    expect(results[0].matched).toBe(0); // scan summary counts pre-match split
    expect(results[0].unmatched).toBe(1);
  });

  it('should reuse an existing cross-source match by comparison key', async () => {
    const mockPluginManager = {
      getPluginsForSlot: vi.fn().mockReturnValue([
        { pluginId: 'otix-steam', label: 'Steam' },
      ]),
      callPluginData: vi.fn().mockResolvedValue([
        {
          id: '252950',
          title: 'Rocket League',
          platform: 'steam',
          posterUrl: 'https://cdn.example.com/steam-rl.jpg',
          externalIds: [{ source: 'steam', id: '252950' }],
        },
      ]),
    };

    const orchestrator = new GameScanOrchestrator(mockPluginManager as any);
    orchestrator.setApiBaseUrl('http://127.0.0.1:8000');

    // Seed a prior Epic self-match with the same title
    upsertGameMatch({
      source: 'epic',
      sourceGameId: 'Jaguar',
      otixMediaId: 'epic:Jaguar',
      otixTitle: 'Rocket League™',
      otixPosterUrl: 'https://cdn.example.com/rl.jpg',
      otixConfidence: 1.0,
      matchType: 'auto',
      status: 'approved',
    });

    const progressEvents: any[] = [];
    orchestrator.on('match:progress', (e) => progressEvents.push(e));

    await orchestrator.scanAll();

    // Steam reuses the Epic local identity instead of creating its own.
    const steamMatch = getGameMatch('steam', '252950');
    expect(steamMatch).toBeDefined();
    expect(steamMatch?.otixMediaId).toBe('epic:Jaguar');
    expect(steamMatch?.otixConfidence).toBe(0.95);

    expect(progressEvents).toHaveLength(1);
    expect(progressEvents[0].match?.media_item_id).toBe('epic:Jaguar');
  });
});
