/**
 * desktop/scripts/challenger-verify-benchmark.ts
 *
 * Empirical verification harness authored by Challenger M4-2.
 * Tests:
 * 1. Genuine SQLite database execution, serialization, and timing (no mocks/sleeps).
 * 2. SLA failure behavior: when SLA is violated, does it log FAILED and exit with code 1?
 * 3. Schema completeness of desktop/benchmark-stats.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import {
  computePercentiles,
  getMemorySnapshot,
  generateMockGames,
  benchmarkHydration,
  benchmarkRenderScroll,
  benchmarkScanThroughput,
  runBenchmarkSuite,
  type LauncherBenchmarkReport,
} from './benchmark-launcher-suite';

let passedChecks = 0;
let totalChecks = 0;

function assert(condition: boolean, message: string) {
  totalChecks++;
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ PASSED: ${message}`);
  passedChecks++;
}

async function runEmpiricalChecks() {
  console.log('================================================================');
  console.log('    CHALLENGER M4-2 EMPIRICAL VERIFICATION HARNESS');
  console.log('================================================================\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Real Database Queries and Deserialization Verification
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[SECTION 1] Verifying Real SQLite Database Execution & Deserialization...');

  const db = require('../db/index');
  const storage = require('../game/storage');

  await db.initDatabase();
  storage.ensureScannedGamesIndexes();

  // Test 1.1: Verify real table exists in SQLite
  const rawDb = db.getDb();
  const tables = rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='scanned_games'").all();
  assert(tables.length === 1 && tables[0].name === 'scanned_games', 'Table `scanned_games` exists in real SQLite database');

  // Test 1.2: Upsert mock games and verify actual row count in DB
  const testCorpus = generateMockGames(50);
  storage.upsertGames(testCorpus);

  const rowCountStmt = rawDb.prepare('SELECT count(*) as count FROM scanned_games');
  const rowCount = rowCountStmt.get().count;
  assert(rowCount >= 50, `Real SQLite table contains inserted rows (count: ${rowCount})`);

  // Test 1.3: Verify raw row vs deserialized game object
  const rawRow = rawDb.prepare("SELECT * FROM scanned_games WHERE id = ?").get(testCorpus[0].id);
  assert(typeof rawRow.otix_data === 'string', 'Raw SQLite row stores JSON string for otix_data');

  storage.clearRowCache();
  const deserializedGames = storage.getAllGames();
  const matched = deserializedGames.find((g: any) => g.id === testCorpus[0].id);
  assert(matched != null, 'storage.getAllGames() retrieves real inserted row');
  assert(typeof matched.data === 'object' && matched.data !== null, 'rowToGame correctly deserialized otix_data JSON string into an object');
  assert(matched.title === testCorpus[0].title, 'Deserialized title matches inserted title');

  // Test 1.4: Verify genuine timing measurement
  const t0 = performance.now();
  storage.clearRowCache();
  storage.getAllGames();
  const elapsed = performance.now() - t0;
  assert(elapsed > 0, `Query execution timing is genuine and non-zero (${elapsed.toFixed(3)}ms)`);

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: SLA Failure Behavior
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[SECTION 2] Verifying SLA Failure Behavior & Exit Codes...');

  // Test 2.1: Direct benchmarkHydration SLA violation
  // If SLA is set to an impossibly small threshold (0.0001 ms), it MUST fail
  const failedHydration = await benchmarkHydration(500, 3, 0.0001);
  assert(failedHydration.passed === false, `benchmarkHydration returns passed: false when latency (${failedHydration.meanLatencyMs}ms) > SLA (0.0001ms)`);

  // Test 2.2: Direct benchmarkRenderScroll SLA violation
  // If frame time SLA is set to 0.000001 ms, it MUST fail
  const failedRender = benchmarkRenderScroll(testCorpus, 50, 0.000001);
  assert(failedRender.passed === false, `benchmarkRenderScroll returns passed: false when frame time (${failedRender.meanFrameTimeMs}ms) > SLA (0.000001ms)`);

  // Test 2.3: Subprocess exit code 1 when SLA is violated
  console.log('Testing subprocess exit code on SLA failure...');
  
  const interceptFile = path.resolve(__dirname, 'temp-intercept-perf.js');
  const interceptCode = `
    const { performance } = require('perf_hooks');
    const origNow = performance.now.bind(performance);
    let callCount = 0;
    performance.now = function() {
      callCount++;
      return origNow() + (callCount * 200);
    };
  `;
  fs.writeFileSync(interceptFile, interceptCode, 'utf-8');

  try {
    const runnerFile = path.resolve(__dirname, 'benchmark-launcher-suite.ts');
    const child = spawnSync('cmd.exe', ['/c', 'npx', 'tsx', runnerFile], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf-8',
      env: {
        ...process.env,
        NODE_OPTIONS: `--require "${interceptFile.replace(/\\/g, '/')}"`,
      },
      timeout: 60000,
    });

    const output = (child.stdout || '') + (child.stderr || '');
    console.log(`Subprocess exit code: ${child.status}`);

    const hasFailedText = output.includes('FAILED') || output.includes('FAIL');
    assert(hasFailedText, 'Runner printed FAILED/FAIL upon SLA violation');
    assert(child.status === 1, `Runner process exited with code 1 upon SLA failure (exit code: ${child.status})`);

    // Verify benchmark-stats.json recorded slaPassed: false from the failing run
    const failedStats = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../benchmark-stats.json'), 'utf-8'));
    assert(failedStats.slaPassed === false, 'benchmark-stats.json recorded slaPassed: false upon SLA failure');
  } finally {
    try {
      fs.unlinkSync(interceptFile);
    } catch {}
  }

  // Restore clean state by running the actual benchmark suite cleanly
  console.log('\nRestoring clean benchmark-stats.json via clean benchmark execution...');
  const cleanReport = await runBenchmarkSuite();
  assert(cleanReport.slaPassed === true, 'Clean runBenchmarkSuite() completes with slaPassed: true');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Schema and Completeness of desktop/benchmark-stats.json
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[SECTION 3] Verifying Schema and Contents of desktop/benchmark-stats.json...');

  const statsPath = path.resolve(__dirname, '../benchmark-stats.json');
  assert(fs.existsSync(statsPath), `benchmark-stats.json exists at ${statsPath}`);

  const rawJson = fs.readFileSync(statsPath, 'utf-8');
  const stats: LauncherBenchmarkReport = JSON.parse(rawJson);

  // Top level fields
  assert(typeof stats.timestamp === 'string' && !isNaN(Date.parse(stats.timestamp)), 'timestamp is valid ISO string');
  assert(stats.suite === 'Otix Launcher Performance Benchmark Suite', 'suite title is correct');
  assert(typeof stats.nodeVersion === 'string', 'nodeVersion present');
  assert(typeof stats.platform === 'string', 'platform present');
  assert(typeof stats.slaPassed === 'boolean', 'slaPassed boolean present');

  // Hydration 500
  const h500 = stats.hydration500;
  assert(h500 != null, 'hydration500 section present');
  assert(h500.itemCount >= 500, 'hydration500.itemCount >= 500');
  assert(h500.runs >= 5, 'hydration500.runs >= 5');
  assert(typeof h500.meanLatencyMs === 'number' && h500.meanLatencyMs > 0, 'hydration500.meanLatencyMs > 0');
  assert(typeof h500.medianLatencyMs === 'number' && h500.medianLatencyMs > 0, 'hydration500.medianLatencyMs > 0');
  assert(typeof h500.p95LatencyMs === 'number' && h500.p95LatencyMs > 0, 'hydration500.p95LatencyMs > 0');
  assert(typeof h500.throughputItemsPerSec === 'number' && h500.throughputItemsPerSec > 0, 'hydration500.throughputItemsPerSec > 0');
  assert(h500.slaMs === 300, 'hydration500.slaMs is 300');
  assert(h500.passed === true, 'hydration500.passed is true');

  // Hydration 1500
  const h1500 = stats.hydration1500;
  assert(h1500 != null, 'hydration1500 section present');
  assert(h1500.itemCount >= 1500, 'hydration1500.itemCount >= 1500');
  assert(typeof h1500.meanLatencyMs === 'number' && h1500.meanLatencyMs > 0, 'hydration1500.meanLatencyMs > 0');
  assert(typeof h1500.medianLatencyMs === 'number' && h1500.medianLatencyMs > 0, 'hydration1500.medianLatencyMs > 0');
  assert(typeof h1500.p95LatencyMs === 'number' && h1500.p95LatencyMs > 0, 'hydration1500.p95LatencyMs > 0');
  assert(typeof h1500.throughputItemsPerSec === 'number' && h1500.throughputItemsPerSec > 0, 'hydration1500.throughputItemsPerSec > 0');
  assert(h1500.slaMs === 300, 'hydration1500.slaMs is 300');
  assert(h1500.passed === true, 'hydration1500.passed is true');

  // Render Scroll
  const rs = stats.renderScroll;
  assert(rs != null, 'renderScroll section present');
  assert(rs.totalFrames >= 60, 'renderScroll.totalFrames >= 60');
  assert(typeof rs.meanFrameTimeMs === 'number' && rs.meanFrameTimeMs > 0, 'renderScroll.meanFrameTimeMs > 0');
  assert(typeof rs.medianFrameTimeMs === 'number' && rs.medianFrameTimeMs > 0, 'renderScroll.medianFrameTimeMs > 0');
  assert(typeof rs.p95FrameTimeMs === 'number' && rs.p95FrameTimeMs > 0, 'renderScroll.p95FrameTimeMs > 0');
  assert(typeof rs.p99FrameTimeMs === 'number' && rs.p99FrameTimeMs > 0, 'renderScroll.p99FrameTimeMs > 0');
  assert(typeof rs.effectiveFps === 'number' && rs.effectiveFps >= 60, 'renderScroll.effectiveFps >= 60');
  assert(rs.slaFrameTimeMs === 16.6, 'renderScroll.slaFrameTimeMs is 16.6');
  assert(rs.passed === true, 'renderScroll.passed is true');

  // Scan Throughput
  const st = stats.scanThroughput;
  assert(st != null, 'scanThroughput section present');
  assert(st.itemsScanned >= 500, 'scanThroughput.itemsScanned >= 500');
  assert(typeof st.itemsPerSecond === 'number' && st.itemsPerSecond > 5000, 'scanThroughput.itemsPerSecond > 5000');

  // Memory Snapshots
  const mem = stats.memory;
  assert(mem != null, 'memory section present');
  assert(mem.baseline.rssMb > 0 && mem.baseline.heapUsedMb > 0, 'memory.baseline valid');
  assert(mem.peak.rssMb > 0 && mem.peak.heapUsedMb > 0, 'memory.peak valid');
  assert(mem.final.rssMb > 0 && mem.final.heapUsedMb > 0, 'memory.final valid');

  db.closeDb();

  console.log('\n================================================================');
  console.log(`ALL CHECKS PASSED: ${passedChecks} / ${totalChecks}`);
  console.log('================================================================\n');
}

runEmpiricalChecks().catch((err) => {
  console.error('Empirical verification failed:', err);
  process.exit(1);
});
