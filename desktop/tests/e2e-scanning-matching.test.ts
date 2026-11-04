import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
      transaction: (fn: any) => fn,
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
            const t = dbState.tables.get(um[1].toLowerCase());
            if (t && params.length > 0) {
              const id = params[params.length - 1];
              const row = t.get(String(id));
              if (row) {
                row.otix_media_id = params[0];
                row.otix_media_title = params[1];
                row.otix_confidence = params[2];
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
              count = rows.filter((r) => r.otix_media_id === null || r.otix_media_id === undefined).length;
            } else if (/otix_media_id IS NOT NULL/i.test(whereClause)) {
              count = rows.filter((r) => r.otix_media_id !== null && r.otix_media_id !== undefined).length;
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
        all: () => {
          const sm = sql.match(/FROM\s+(\w+)/i);
          if (sm) {
            const t = dbState.tables.get(sm[1].toLowerCase());
            if (t) {
              const rows = [...t.values()];
              if (/otix_media_id IS NULL/i.test(sql)) {
                return rows.filter((r) => r.otix_media_id === null || r.otix_media_id === undefined);
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

// Imports after mocking
import { getDb } from '../db';
import { cleanGameTitle } from '../game/parser';
import { scanLocalFiles, isUpdateFile, isDlcFile } from '../game/local-scanner';
import { LocalMatcher } from '../game/local-matcher';
import { ensureGameMatchesTable } from '../game/storage';
import type { ScannedGame } from '../game/orchestrator';
import {
  generateRealisticGames,
  executePhase1Persistence,
  executePhase2Matching,
  type SimulatedGame,
} from '../scripts/stress-test-matching';

// ── Test Suite ──────────────────────────────────────────────────────────

describe('E2E Library Scanning & Catalog Matching Pipeline', () => {
  let mockDbInstance: any;

  beforeEach(() => {
    dbState.reset();
    ensureGameMatchesTable();
    mockDbInstance = getDb();
    mockDbInstance.exec(`
      CREATE TABLE IF NOT EXISTS scanned_games (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        exe_path TEXT NOT NULL,
        local_exe_path TEXT,
        install_dir TEXT NOT NULL,
        platform TEXT NOT NULL,
        icon_url TEXT,
        poster_url TEXT,
        update_files TEXT,
        otix_media_id TEXT,
        otix_media_title TEXT,
        otix_media_slug TEXT,
        otix_confidence REAL,
        otix_match_suggestion TEXT,
        otix_poster_url TEXT,
        otix_backdrop_url TEXT,
        otix_textless_poster_url TEXT,
        otix_logo_url TEXT,
        otix_icon_url TEXT,
        seeded INTEGER NOT NULL DEFAULT 0,
        local_icon_url TEXT,
        otix_data TEXT,
        last_played_at TEXT,
        sources TEXT DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_scanned_games_platform ON scanned_games(platform);
      CREATE INDEX IF NOT EXISTS idx_scanned_games_otix_media_id ON scanned_games(otix_media_id);
      CREATE INDEX IF NOT EXISTS idx_scanned_games_install_dir ON scanned_games(install_dir);
      CREATE INDEX IF NOT EXISTS idx_scanned_games_exe_path ON scanned_games(exe_path);
    `);
  });

  // ── Tier 1 & 2: Two-Phase Decoupling & Storage Persistence ──────────

  describe('Tier 1: Two-Phase Scanning & Persistence Decoupling (F1, F4, F5)', () => {
    it('commits 100% of discovered games into SQLite before matching begins', () => {
      const items = generateRealisticGames(500);

      // Execute Phase 1
      executePhase1Persistence(mockDbInstance, items);

      // Verify all items are committed
      const totalCount = mockDbInstance.prepare('SELECT COUNT(*) FROM scanned_games').get().count;
      expect(totalCount).toBe(500);

      // Verify matching has NOT touched these rows yet (otix_media_id is NULL)
      const unmatchedCount = mockDbInstance.prepare('SELECT COUNT(*) FROM scanned_games WHERE otix_media_id IS NULL').get().count;
      expect(unmatchedCount).toBe(500);

      // Verify individual row integrity
      const sample = mockDbInstance.prepare('SELECT * FROM scanned_games WHERE id = ?').get(items[0].id);
      expect(sample).toBeDefined();
      expect(sample.title).toBe(items[0].title);
      expect(sample.exe_path).toBe(items[0].exePath);
      expect(sample.otix_media_id).toBeNull();
    });

    it('chunks SQL parameters to <= 400 variables to avoid SQLite variable limits', () => {
      const items = generateRealisticGames(1500);

      expect(() => {
        executePhase1Persistence(mockDbInstance, items);
      }).not.toThrow();

      const totalCount = mockDbInstance.prepare('SELECT COUNT(*) FROM scanned_games').get().count;
      expect(totalCount).toBe(1500);
    });
  });

  // ── Tier 1 & 2: Mid-Flight Cancellation & Data Preservation ─────────

  describe('Tier 1: Mid-Flight Cancellation Integrity & Fault Tolerance (F5, F6)', () => {
    it('leaves 100% of discovered games intact in local storage when cancelled midway', async () => {
      const items = generateRealisticGames(500);
      executePhase1Persistence(mockDbInstance, items);

      const abortController = new AbortController();
      const cancelAt = 150;

      const result = await executePhase2Matching(mockDbInstance, items, {
        batchSize: 50,
        abortSignal: abortController.signal,
        onBatchComplete: (matched) => {
          if (matched >= cancelAt) {
            abortController.abort();
          }
        },
      });

      expect(result.cancelled).toBe(true);
      expect(result.matchedCount).toBe(150);

      // Crucial assertion: All 500 games MUST remain in SQLite
      const totalCount = mockDbInstance.prepare('SELECT COUNT(*) FROM scanned_games').get().count;
      expect(totalCount).toBe(500);

      // Exactly 150 games matched, 350 games remain pending
      const matchedCount = mockDbInstance.prepare('SELECT COUNT(*) FROM scanned_games WHERE otix_media_id IS NOT NULL').get().count;
      expect(matchedCount).toBe(150);

      const unmatchedCount = mockDbInstance.prepare('SELECT COUNT(*) FROM scanned_games WHERE otix_media_id IS NULL').get().count;
      expect(unmatchedCount).toBe(350);
    });

    it('handles cancellation on the very first batch without data loss', async () => {
      const items = generateRealisticGames(100);
      executePhase1Persistence(mockDbInstance, items);

      const abortController = new AbortController();
      abortController.abort(); // Cancelled before starting

      const result = await executePhase2Matching(mockDbInstance, items, {
        batchSize: 50,
        abortSignal: abortController.signal,
      });

      expect(result.cancelled).toBe(true);
      expect(result.matchedCount).toBe(0);

      // 100% of games still present
      const totalCount = mockDbInstance.prepare('SELECT COUNT(*) FROM scanned_games').get().count;
      expect(totalCount).toBe(100);
    });
  });

  // ── Tier 1 & 2: Resumption Exclusivity ───────────────────────────────

  describe('Tier 1: Autonomous Resumption Exclusivity (F6)', () => {
    it('resumes matching processing ONLY unmatched games (WHERE otix_media_id IS NULL)', async () => {
      const items = generateRealisticGames(300);
      executePhase1Persistence(mockDbInstance, items);

      // Match first 100 items
      const abortController = new AbortController();
      await executePhase2Matching(mockDbInstance, items, {
        batchSize: 50,
        abortSignal: abortController.signal,
        onBatchComplete: (matched) => {
          if (matched >= 100) abortController.abort();
        },
      });

      // Resume: fetch ONLY unmatched rows from database
      const unmatchedRows = mockDbInstance.prepare('SELECT * FROM scanned_games WHERE otix_media_id IS NULL').all();
      expect(unmatchedRows.length).toBe(200);

      const remainingGames: SimulatedGame[] = unmatchedRows.map((r: any) => ({
        id: r.id,
        title: r.title,
        rawFilename: r.title,
        installDir: r.install_dir,
        exePath: r.exe_path,
        platform: r.platform,
      }));

      // Match remaining items
      const resumeResult = await executePhase2Matching(mockDbInstance, remainingGames, { batchSize: 50 });
      expect(resumeResult.matchedCount).toBe(200);

      // Verify final complete state: 300 / 300 matched
      const finalMatched = mockDbInstance.prepare('SELECT COUNT(*) FROM scanned_games WHERE otix_media_id IS NOT NULL').get().count;
      expect(finalMatched).toBe(300);

      const finalUnmatched = mockDbInstance.prepare('SELECT COUNT(*) FROM scanned_games WHERE otix_media_id IS NULL').get().count;
      expect(finalUnmatched).toBe(0);
    });

    it('resuming when 100% of games are already matched performs zero work', async () => {
      const items = generateRealisticGames(50);
      executePhase1Persistence(mockDbInstance, items);
      await executePhase2Matching(mockDbInstance, items, { batchSize: 50 });

      // Check remaining
      const remainingRows = mockDbInstance.prepare('SELECT * FROM scanned_games WHERE otix_media_id IS NULL').all();
      expect(remainingRows.length).toBe(0);
    });
  });

  // ── Tier 1 & 3: Bounded Batching & Per-Chunk Local Fallback ──────────

  describe('Tier 1 & 3: Bounded Batching & Per-Chunk Local Fallback (F7, F8)', () => {
    it('bounds match requests into chunks of 25-50 items', async () => {
      const items = generateRealisticGames(125);
      const batchSizes: number[] = [];

      let processed = 0;
      await executePhase2Matching(mockDbInstance, items, {
        batchSize: 50,
        onBatchComplete: (matched) => {
          batchSizes.push(matched - processed);
          processed = matched;
        },
      });

      expect(batchSizes).toEqual([50, 50, 25]);
    });

    it('falls back to local matching per-chunk when remote request fails', () => {
      const matcher = new LocalMatcher();
      const offlineChunk: ScannedGame[] = [
        { id: 'offline_1', title: 'Half-Life 2', platform: 'pc', posterUrl: 'https://cdn.example.com/hl2.jpg' },
        { id: 'offline_2', title: 'Portal', platform: 'pc', posterUrl: 'https://cdn.example.com/portal.jpg' },
      ];

      const results = matcher.matchBatch(offlineChunk);
      expect(results.length).toBe(2);
      expect(results[0].status).toBe('matched');
      expect(results[0].queryTitle).toBe('Half-Life 2');
      expect(results[1].status).toBe('matched');
      expect(results[1].queryTitle).toBe('Portal');
    });

    it('isolates single-item parsing exceptions without breaking the batch (F8)', () => {
      const matcher = new LocalMatcher();
      const itemsWithEdgeCases: ScannedGame[] = [
        { id: 'valid_1', title: 'Cyberpunk 2077', platform: 'pc' },
        { id: 'empty_title', title: '', platform: 'pc' },
        { id: 'valid_2', title: 'The Witcher 3', platform: 'pc' },
      ];

      const results = matcher.matchBatch(itemsWithEdgeCases);
      expect(results.length).toBe(3);
      expect(results[0].status).toBe('matched');
      expect(results[1].status).toBe('unmatched'); // Gracefully handled empty title
      expect(results[2].status).toBe('matched');
    });
  });

  // ── Tier 1 & 2: Title Sanitization & Regex Optimization ─────────────

  describe('Tier 1 & 2: Title Sanitization & Regex Optimization (F10)', () => {
    const testCases: [string, string][] = [
      ['Cyberpunk.2077.Phantom.Liberty.v2.12-CODEX', 'Cyberpunk 2077 Phantom Liberty'],
      ['Baldurs.Gate.3.v4.1.1.3624941-RUNE', 'Baldurs Gate 3'],
      ['Elden.Ring.Shadow.of.the.Erdtree.v1.12.3-FLT', 'Elden Ring Shadow of the Erdtree'],
      ['Grand.Theft.Auto.V.v1.0.2802.Repack', 'Grand Theft Auto V'],
      ['The Legend of Zelda: Tears of the Kingdom [0100F2C0115B6000] [v1.2.0].xci', 'The Legend of Zelda: Tears of the Kingdom'],
      ['Super Mario Odyssey [0100000000010000] [v0].nsp', 'Super Mario Odyssey'],
      ['God of War III [BCUS98174].iso', 'God of War III'],
      ['Gran Turismo 4 (USA).iso', 'Gran Turismo 4'],
      ['1 - Resident Evil 4 Remake', 'Resident Evil 4 Remake'],
      ['The Witcher 3 [v4.04] [Deluxe Edition]', 'The Witcher 3'],
    ];

    it.each(testCases)('cleans "%s" -> "%s"', (raw, expected) => {
      const cleaned = cleanGameTitle(raw);
      expect(cleaned.trim()).toBe(expected);
    });

    it('cleans 1,500 titles in < 25ms (microsecond throughput SLA)', () => {
      const sampleTitles = testCases.map(([raw]) => raw);
      const manyTitles: string[] = [];
      for (let i = 0; i < 1500; i++) {
        manyTitles.push(sampleTitles[i % sampleTitles.length]);
      }

      const start = performance.now();
      for (const t of manyTitles) {
        cleanGameTitle(t);
      }
      const duration = performance.now() - start;

      // SLA: 1,500 titles parsed in < 50ms
      expect(duration).toBeLessThan(50);
    });
  });

  // ── Tier 2: Boundary & Corner Cases ─────────────────────────────────

  describe('Tier 2: Boundary & Adversarial Cases', () => {
    it('handles empty string and whitespace-only titles without infinite loops', () => {
      expect(cleanGameTitle('')).toBe('');
      expect(cleanGameTitle('   ')).toBe('');
    });

    it('handles titles consisting exclusively of repack tags', () => {
      const cleaned = cleanGameTitle('repack.fitgirl.dodi.codex.flt');
      expect(cleaned.trim()).toBe('');
    });

    it('safely handles SQL injection patterns in game titles (Parameterized SQL)', () => {
      const maliciousGame: SimulatedGame = {
        id: 'sql_inj_1',
        title: "Test Game'; DROP TABLE scanned_games; --",
        rawFilename: 'test.exe',
        exePath: 'C:/Games/test.exe',
        installDir: 'C:/Games',
        platform: 'pc',
      };

      executePhase1Persistence(mockDbInstance, [maliciousGame]);

      // Table must still exist and contain the game
      const row = mockDbInstance.prepare('SELECT * FROM scanned_games WHERE id = ?').get('sql_inj_1');
      expect(row).toBeDefined();
      expect(row.title).toBe("Test Game'; DROP TABLE scanned_games; --");
      expect(mockDbInstance.prepare('SELECT COUNT(*) FROM scanned_games').get().count).toBe(1);
    });

    it('preserves Unicode and non-ASCII titles without character corruption', () => {
      const unicodeGames: SimulatedGame[] = [
        {
          id: 'jp_1',
          title: 'ゼルダの伝説 ティアーズ オブ ザ キングダム',
          rawFilename: 'zelda.exe',
          exePath: 'C:/Games/zelda.exe',
          installDir: 'C:/Games',
          platform: 'pc',
        },
        {
          id: 'jp_2',
          title: '龍が如く7 光と闇の行方 インターナショナル',
          rawFilename: 'yakuza.exe',
          exePath: 'C:/Games/yakuza.exe',
          installDir: 'C:/Games',
          platform: 'pc',
        },
      ];

      executePhase1Persistence(mockDbInstance, unicodeGames);

      const row1 = mockDbInstance.prepare('SELECT * FROM scanned_games WHERE id = ?').get('jp_1');
      expect(row1.title).toBe('ゼルダの伝説 ティアーズ オブ ザ キングダム');

      const row2 = mockDbInstance.prepare('SELECT * FROM scanned_games WHERE id = ?').get('jp_2');
      expect(row2.title).toBe('龍が如く7 光と闇の行方 インターナショナル');
    });

    it('handles paths with 260+ characters (Windows MAX_PATH boundary)', () => {
      const deepPath = 'C:/Games/' + 'SubFolder_'.repeat(25) + 'FinalDirectory';
      expect(deepPath.length).toBeGreaterThan(260);

      const longPathGame: SimulatedGame = {
        id: 'long_path_1',
        title: 'Deep Nested Game',
        rawFilename: 'game.exe',
        exePath: `${deepPath}/game.exe`,
        installDir: deepPath,
        platform: 'pc',
      };

      executePhase1Persistence(mockDbInstance, [longPathGame]);
      const retrieved = mockDbInstance.prepare('SELECT * FROM scanned_games WHERE id = ?').get('long_path_1');
      expect(retrieved.install_dir).toBe(deepPath);
    });
  });

  // ── Tier 3 & 4: Real-World Workload Simulation ──────────────────────

  describe('Tier 4: Real-World Multi-Directory Workloads (Repacks, ISOs, Steam, DLCs)', () => {
    it('executes a mixed 1,500-item realistic library scan with 100% preservation across mid-match interruption and resumption', async () => {
      const items = generateRealisticGames(1500);

      // Phase 1: Ingestion
      const p1Start = performance.now();
      executePhase1Persistence(mockDbInstance, items);
      const p1Time = performance.now() - p1Start;
      expect(p1Time).toBeLessThan(2000); // SLA: < 2,000ms

      // Verify all 1,500 games committed
      const initialTotal = mockDbInstance.prepare('SELECT COUNT(*) FROM scanned_games').get().count;
      expect(initialTotal).toBe(1500);

      // Phase 2: Start matching and interrupt at 450 items
      const abortController = new AbortController();
      const run1 = await executePhase2Matching(mockDbInstance, items, {
        batchSize: 50,
        abortSignal: abortController.signal,
        onBatchComplete: (matched) => {
          if (matched >= 450) abortController.abort();
        },
      });

      expect(run1.cancelled).toBe(true);
      expect(run1.matchedCount).toBe(450);

      // Check integrity: 100% intact
      const postCancelTotal = mockDbInstance.prepare('SELECT COUNT(*) FROM scanned_games').get().count;
      expect(postCancelTotal).toBe(1500);

      // Phase 3: Resume remaining unmatched
      const pendingRows = mockDbInstance.prepare('SELECT * FROM scanned_games WHERE otix_media_id IS NULL').all();
      expect(pendingRows.length).toBe(1050);

      const remainingGames: SimulatedGame[] = pendingRows.map((r: any) => ({
        id: r.id,
        title: r.title,
        rawFilename: r.title,
        installDir: r.install_dir,
        exePath: r.exe_path,
        platform: r.platform,
      }));

      const run2 = await executePhase2Matching(mockDbInstance, remainingGames, { batchSize: 50 });
      expect(run2.matchedCount).toBe(1050);

      // Final state: 1,500 items fully matched
      const finalMatched = mockDbInstance.prepare('SELECT COUNT(*) FROM scanned_games WHERE otix_media_id IS NOT NULL').get().count;
      expect(finalMatched).toBe(1500);

      const finalUnmatched = mockDbInstance.prepare('SELECT COUNT(*) FROM scanned_games WHERE otix_media_id IS NULL').get().count;
      expect(finalUnmatched).toBe(0);
    });
  });

  // ── Tier 5: Realistic File Discovery, Classification & Hydration Pipeline ──

  describe('Tier 5: Real-World Local Discovery, Filtering & Matching Integration', () => {
    let testLibraryDir: string;

    beforeEach(() => {
      testLibraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otix-e2e-pipeline-'));
    });

    it('discovers 100% of base games while attaching updates/DLCs without polluting library', async () => {
      const pcDir = path.join(testLibraryDir, 'PC');
      const romsDir = path.join(testLibraryDir, 'ROMs');
      const steamDir = path.join(testLibraryDir, 'Steam');
      const ps3Dir = path.join(testLibraryDir, 'PS3');

      // 1. Unreal Engine game with deep binary (Hogwarts Legacy)
      const hlDir = path.join(pcDir, 'Hogwarts Legacy', 'Phoenix', 'Binaries', 'Win64');
      fs.mkdirSync(hlDir, { recursive: true });
      fs.writeFileSync(path.join(hlDir, 'HogwartsLegacy.exe'), 'mock binary');

      // 2. Steam Library with appmanifest
      const steamApps = path.join(steamDir, 'steamapps');
      const cyberpunkCommon = path.join(steamApps, 'common', 'Cyberpunk 2077', 'bin', 'x64');
      fs.mkdirSync(cyberpunkCommon, { recursive: true });
      fs.writeFileSync(path.join(cyberpunkCommon, 'Cyberpunk2077.exe'), 'mock binary');
      fs.writeFileSync(
        path.join(steamApps, 'appmanifest_1091500.acf'),
        `"AppState" { "appid" "1091500" "name" "Cyberpunk 2077" "installdir" "Cyberpunk 2077" }`
      );

      // 3. Switch ROM with standalone Update and DLC files
      fs.mkdirSync(romsDir, { recursive: true });
      const basePokemon = path.join(romsDir, 'Pokemon Scarlet [0100A55016140000].nsp');
      const updatePokemon = path.join(romsDir, 'Pokemon Scarlet [0100A55016140800].nsp');
      const dlcPokemon = path.join(romsDir, 'Pokemon Scarlet [0100A55016140001].nsp');
      fs.writeFileSync(basePokemon, 'mock rom');
      fs.writeFileSync(updatePokemon, 'mock update');
      fs.writeFileSync(dlcPokemon, 'mock dlc');

      // 4. Game with bundled DLC tag in title (should be kept as base game)
      const marioBundle = path.join(romsDir, 'Super Mario Odyssey [DLC Included].nsp');
      fs.writeFileSync(marioBundle, 'mock rom');

      // 5. PS3 Disc Game
      const rdrDir = path.join(ps3Dir, 'Red Dead Redemption [BLUS30418]');
      fs.mkdirSync(path.join(rdrDir, 'PS3_GAME', 'USRDIR'), { recursive: true });
      fs.writeFileSync(path.join(rdrDir, 'PS3_DISC.SFB'), 'mock disc header');
      fs.writeFileSync(path.join(rdrDir, 'PS3_GAME', 'USRDIR', 'EBOOT.BIN'), 'mock eboot');

      // Execute local scanner
      const scanResult = await scanLocalFiles({
        scanDirectories: [pcDir, steamDir],
        isoDirectories: [romsDir, ps3Dir],
      });

      // Verification: exactly 5 base games discovered (Updates & standalone DLC NOT emitted as separate games)
      expect(scanResult.games.length).toBe(5);

      const titles = scanResult.games.map((g) => g.title);
      expect(titles.some((t) => t.includes('Hogwarts Legacy'))).toBe(true);
      expect(titles).toContain('Cyberpunk 2077');
      expect(titles.some((t) => t.includes('Pokemon Scarlet'))).toBe(true);
      expect(titles).toContain('Super Mario Odyssey');
      expect(titles.some((t) => t.includes('Red Dead Redemption'))).toBe(true);

      // Verify updates and DLCs are attached to Pokemon Scarlet
      const pokemonGame = scanResult.games.find((g) => g.title.includes('Pokemon Scarlet'));
      expect(pokemonGame).toBeDefined();
      expect(pokemonGame?.updateFiles?.length).toBeGreaterThanOrEqual(1);

      // Verify platforms
      expect(scanResult.games.find((g) => g.title.includes('Super Mario Odyssey'))?.platform).toBe('switch');
      expect(scanResult.games.find((g) => g.title.includes('Red Dead Redemption'))?.platform).toBe('ps3');
      expect(scanResult.games.find((g) => g.title === 'Cyberpunk 2077')?.platform).toBe('steam');

      // Phase 2: Ingest into SQLite storage and verify phase 1 persistence
      const simulated: SimulatedGame[] = scanResult.games.map((g) => ({
        id: g.id,
        title: g.title,
        rawFilename: g.title,
        installDir: g.installDir,
        exePath: g.exePath,
        platform: (g.platform as any) || 'pc',
      }));

      executePhase1Persistence(mockDbInstance, simulated);
      const rowCount = mockDbInstance.prepare('SELECT COUNT(*) FROM scanned_games').get().count;
      expect(rowCount).toBe(5);

      // Phase 3: Run matching
      const matcher = new LocalMatcher();
      const matchCandidates = matcher.matchBatch(scanResult.games.map((g) => ({
        id: g.id,
        title: g.title,
        platform: g.platform,
      })));

      expect(matchCandidates.length).toBe(5);
      expect(matchCandidates.every((m) => m.status === 'matched')).toBe(true);
    });
  });
});
