import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared mutable mock-db state (reset per test) ────────────────
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
          const im = sql.match(
            /INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)/i,
          );
          if (im) {
            const tableName = im[1];
            const columns = im[2].split(',').map((c: string) => c.trim());
            const table = dbState.tables.get(tableName);
            if (table) {
              const row: Record<string, any> = {};
              for (let i = 0; i < columns.length; i++)
                row[columns[i]] = params[i] ?? null;
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
        all: () => [],
      }),
    };
  },
}));

// Prevent hardcoded launcher scans from discovering real games on this machine
vi.mock('../launchers', () => ({
  scanAllLaunchers: () => Promise.resolve([]),
}));

// Mock http module to avoid real connections and simulate SSE events
vi.mock('http', () => {
  const EE = require('events').EventEmitter;
  const mockRequest = (_url: any, _options: any) => {
    const req = new EE();
    (req as any).write = () => {};
    (req as any).end = () => {};

    process.nextTick(() => {
      const res = new EE();
      (res as any).statusCode = 200;
      req.emit('response', res);

      process.nextTick(() => {
        res.emit(
          'data',
          Buffer.from(
            'event: game-progress\n' +
              'data: {"query_id":"epic:Jaguar","status":"matched","match":{"media_item_id":"otix_rl","title":"Rocket League","confidence":0.98,"poster_url":"https://img.example.com/rl.jpg","backdrop_url":"https://img.example.com/rl-bg.jpg"}}\n' +
              '\n' +
              'event: complete\n' +
              'data: {"total":1,"matched":1,"unmatched":0}\n' +
              '\n',
          ),
        );
        res.emit('end');
      });
    });

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
import { getGameMatch, ensureGameMatchesTable } from '../storage';

describe('GameScanOrchestrator', () => {
  beforeEach(() => {
    dbState.reset();
    ensureGameMatchesTable();
  });

  it('should scan all plugins and return summary', async () => {
    const mockPluginManager = {
      getPluginsForSlot: vi.fn().mockReturnValue([
        { pluginId: 'otix-epic', label: 'Epic Games' },
      ]),
      callPluginData: vi.fn().mockResolvedValue([
        {
          id: 'Jaguar',
          title: 'Rocket League',
          platform: 'epic',
          externalIds: [{ source: 'epic', id: 'Jaguar' }],
        },
      ]),
    };

    const orchestrator = new GameScanOrchestrator(mockPluginManager as any);
    orchestrator.setApiBaseUrl('http://127.0.0.1:8000');

    const progressEvents: any[] = [];
    const completeEvents: any[] = [];
    orchestrator.on('match:progress', (e) => progressEvents.push(e));
    orchestrator.on('scan:complete', (e) => completeEvents.push(e));

    const results = await orchestrator.scanAll();

    expect(results).toHaveLength(1);
    expect(results[0].pluginId).toBe('otix-epic');
    expect(results[0].totalGames).toBe(1);
    expect(results[0].unmatched).toBe(1);

    // Should emit progress and complete events
    expect(progressEvents.length).toBeGreaterThanOrEqual(1);
    expect(completeEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('should persist matched games to game_matches via SSE consumer', async () => {
    const mockPluginManager = {
      getPluginsForSlot: vi.fn().mockReturnValue([
        { pluginId: 'otix-epic', label: 'Epic Games' },
      ]),
      callPluginData: vi.fn().mockResolvedValue([
        {
          id: 'Jaguar',
          title: 'Rocket League',
          platform: 'epic',
          externalIds: [{ source: 'epic', id: 'Jaguar' }],
        },
      ]),
    };

    const orchestrator = new GameScanOrchestrator(mockPluginManager as any);
    orchestrator.setApiBaseUrl('http://127.0.0.1:8000');
    await orchestrator.scanAll();

    const match = getGameMatch('epic', 'Jaguar');
    expect(match).toBeDefined();
    expect(match?.otixMediaId).toBe('otix_rl');
    expect(match?.matchType).toBe('auto');
  });

  it('should filter already-matched games and not re-scan them', async () => {
    const mockPluginManager = {
      getPluginsForSlot: vi.fn().mockReturnValue([
        { pluginId: 'otix-epic', label: 'Epic Games' },
      ]),
      callPluginData: vi.fn().mockResolvedValue([
        {
          id: 'Jaguar',
          title: 'Rocket League',
          platform: 'epic',
          externalIds: [{ source: 'epic', id: 'Jaguar' }],
        },
        {
          id: 'Fortnite',
          title: 'Fortnite',
          platform: 'epic',
          externalIds: [{ source: 'epic', id: 'Fortnite' }],
        },
      ]),
    };

    const orchestrator = new GameScanOrchestrator(mockPluginManager as any);
    orchestrator.setApiBaseUrl('http://127.0.0.1:8000');

    // First scan: both unmatched
    const results = await orchestrator.scanAll();
    expect(results[0].unmatched).toBe(2);

    // Reset events emitted flag
    const progressEvents: any[] = [];
    orchestrator.on('match:progress', (e) => progressEvents.push(e));

    // Second scan: Fortnite is still unmatched, RL matched from previous scan
    const results2 = await orchestrator.scanAll();
    expect(results2[0].unmatched).toBe(1);
    expect(results2[0].matched).toBe(1);
  });

  it('should handle plugin errors gracefully', async () => {
    const mockPluginManager = {
      getPluginsForSlot: vi.fn().mockReturnValue([
        { pluginId: 'otix-epic', label: 'Epic Games' },
        { pluginId: 'otix-failing', label: 'Failing Plugin' },
      ]),
      callPluginData: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'Game1',
            title: 'Game 1',
            platform: 'epic',
            externalIds: [{ source: 'epic', id: 'Game1' }],
          },
        ])
        .mockRejectedValueOnce(new Error('Plugin crashed')),
    };

    const orchestrator = new GameScanOrchestrator(mockPluginManager as any);
    orchestrator.setApiBaseUrl('http://127.0.0.1:8000');
    const results = await orchestrator.scanAll();

    expect(results).toHaveLength(2);
    expect(results[0].totalGames).toBe(1);
    expect(results[1].errors).toBeDefined();
    expect(results[1].errors![0]).toBe('Plugin crashed');
  });

  it('should scan a single plugin', async () => {
    const mockPluginManager = {
      getPluginsForSlot: vi.fn().mockReturnValue([
        { pluginId: 'otix-epic', label: 'Epic Games' },
      ]),
      callPluginData: vi.fn().mockResolvedValue([
        {
          id: 'Jaguar',
          title: 'Rocket League',
          platform: 'epic',
          externalIds: [{ source: 'epic', id: 'Jaguar' }],
        },
      ]),
    };

    const orchestrator = new GameScanOrchestrator(mockPluginManager as any);
    orchestrator.setApiBaseUrl('http://127.0.0.1:8000');
    const result = await orchestrator.scanPlugin({ pluginId: 'otix-epic', mediaType: 'game' });

    expect(result.totalGames).toBe(1);
    expect(result.unmatched).toBe(1);
  });

  it('should return error for unknown plugin', async () => {
    const mockPluginManager = {
      getPluginsForSlot: vi.fn().mockReturnValue([
        { pluginId: 'otix-epic', label: 'Epic Games' },
      ]),
      callPluginData: vi.fn(),
    };

    const orchestrator = new GameScanOrchestrator(mockPluginManager as any);
    const result = await orchestrator.scanPlugin({ pluginId: 'nonexistent', mediaType: 'game' });

    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toContain('not registered');
  });
});
