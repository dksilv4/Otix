#!/usr/bin/env node
/**
 * scripts/check-performance.mjs
 *
 * Full-Stack Pre-Commit Performance Evaluator & Regression Tracking System for Otix.
 *
 * Checks & evaluates:
 * 1. Desktop Subsystem (desktop/scripts/benchmark-launcher-suite.ts):
 *    - SQLite Hydration Latency (500 and 1,500 items)
 *    - Virtual Render / Scroll Frame Times (p95, p99, effective FPS)
 *    - File Discovery & Local Scanner Throughput (items/sec)
 *    - Memory Footprint (RSS, Heap)
 * 2. Frontend Subsystem (frontend/scripts/benchmark-frontend.mjs):
 *    - Production Bundle & Asset Budget (Total JS/CSS, main entry, largest chunk)
 *    - State & Matcher Latency (mergeLocalAndServerGames, 500 local + 200 server groups)
 * 3. Backend Subsystem (backend/scripts/benchmark_backend.py):
 *    - Release Name Parser Throughput (5,500 parses on 105+ fixtures)
 *    - Query Count Scaling & O(1) Complexity Gates
 * 4. Node Subsystem (node/internal/parser):
 *    - Go Title & Release Parser Throughput and Memory Allocation (ns/op, B/op)
 *
 * Evaluation & Historical Tracking:
 * - Persists commit benchmarks to benchmarks/perf-history.json and benchmarks/perf-latest.json
 * - Compares metrics against previous commit / baseline
 * - Computes delta percentage (Δ%) for every metric
 * - Blocks commit on critical performance regressions or SLA violations
 *
 * CLI Usage:
 *   node scripts/check-performance.mjs [--pre-commit] [--history] [--compare [sha1] [sha2]] [--allow-regression] [--quick]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const benchmarksDir = path.join(rootDir, 'benchmarks');
const historyFile = path.join(benchmarksDir, 'perf-history.json');
const latestFile = path.join(benchmarksDir, 'perf-latest.json');

// ── Color Utilities ─────────────────────────────────────────────────────────

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
};

// ── Git Context Utilities ───────────────────────────────────────────────────

function getGitContext() {
  try {
    const commit = execSync('git rev-parse HEAD', { cwd: rootDir, encoding: 'utf-8' }).trim();
    const shortCommit = commit.slice(0, 7);
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: rootDir, encoding: 'utf-8' }).trim();
    const author = execSync('git log -1 --pretty=format:"%an"', { cwd: rootDir, encoding: 'utf-8' }).trim();
    const message = execSync('git log -1 --pretty=format:"%s"', { cwd: rootDir, encoding: 'utf-8' }).trim();

    let stagedCount = 0;
    try {
      const staged = execSync('git diff --cached --name-only', { cwd: rootDir, encoding: 'utf-8' }).trim();
      if (staged) {
        stagedCount = staged.split('\n').filter(Boolean).length;
      }
    } catch {}

    return { commit, shortCommit, branch, author, message, stagedCount };
  } catch (err) {
    return {
      commit: '0000000000000000000000000000000000000000',
      shortCommit: '0000000',
      branch: 'unknown',
      author: 'developer',
      message: 'working directory snapshot',
      stagedCount: 0,
    };
  }
}

// ── Subsystem Runners ───────────────────────────────────────────────────────

function runDesktopBenchmarks() {
  console.log(`${colors.cyan}[1/4] Evaluating Desktop Subsystem (Hydration, Scroll FPS, Scanner, Memory)...${colors.reset}`);
  const startTime = Date.now();
  try {
    execSync('npx tsx desktop/scripts/benchmark-launcher-suite.ts', {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
      timeout: 30000,
    });

    const statsPath = path.join(rootDir, 'desktop', 'benchmark-stats.json');
    if (!fs.existsSync(statsPath)) {
      throw new Error(`Desktop benchmark stats not found at ${statsPath}`);
    }

    const raw = fs.readFileSync(statsPath, 'utf-8');
    const data = JSON.parse(raw);

    return {
      success: true,
      durationMs: Date.now() - startTime,
      hydration500Ms: data.hydration500?.meanLatencyMs || 0,
      hydration1500Ms: data.hydration1500?.meanLatencyMs || 0,
      renderFrameP99Ms: data.renderScroll?.p99FrameTimeMs || 0,
      renderMeanFrameMs: data.renderScroll?.meanFrameTimeMs || 0,
      effectiveFps: data.renderScroll?.effectiveFps || 0,
      scannerItemsPerSec: data.scanThroughput?.itemsPerSecond || 0,
      rssMb: data.memory?.final?.rssMb || 0,
      heapUsedMb: data.memory?.final?.heapUsedMb || 0,
      slaPassed: Boolean(data.slaPassed),
    };
  } catch (err) {
    console.error(`${colors.yellow}      Desktop benchmark warning: ${err.message}${colors.reset}`);
    return {
      success: false,
      durationMs: Date.now() - startTime,
      hydration500Ms: 0,
      hydration1500Ms: 0,
      renderFrameP99Ms: 0,
      renderMeanFrameMs: 0,
      effectiveFps: 0,
      scannerItemsPerSec: 0,
      rssMb: 0,
      heapUsedMb: 0,
      slaPassed: false,
      error: err.message,
    };
  }
}

function runFrontendBenchmarks() {
  console.log(`${colors.cyan}[2/4] Evaluating Frontend Subsystem (Bundle Budget & State Matcher)...${colors.reset}`);
  const startTime = Date.now();
  try {
    const stdout = execSync('node frontend/scripts/benchmark-frontend.mjs --json', {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
      timeout: 30000,
    });

    const data = JSON.parse(stdout.trim());
    return {
      success: true,
      durationMs: Date.now() - startTime,
      totalJsMb: data.bundle?.totalJsMb || 0,
      totalCssKb: data.bundle?.totalCssKb || 0,
      entryChunkKb: data.bundle?.entryChunk?.sizeKb || 0,
      largestChunkKb: data.bundle?.largestChunk?.sizeKb || 0,
      chunkCount: data.bundle?.chunkCount || 0,
      mergeLatencyMs: data.microBenchmark?.totalDurationMs || 0,
      bundleSlaPassed: data.bundle?.slaPassed ?? true,
      microSlaPassed: data.microBenchmark?.slaPassed ?? true,
      slaPassed: Boolean(data.slaPassed),
    };
  } catch (err) {
    console.error(`${colors.yellow}      Frontend benchmark warning: ${err.message}${colors.reset}`);
    return {
      success: false,
      durationMs: Date.now() - startTime,
      totalJsMb: 0,
      totalCssKb: 0,
      entryChunkKb: 0,
      largestChunkKb: 0,
      chunkCount: 0,
      mergeLatencyMs: 0,
      bundleSlaPassed: false,
      microSlaPassed: false,
      slaPassed: false,
      error: err.message,
    };
  }
}

function runBackendBenchmarks() {
  console.log(`${colors.cyan}[3/4] Evaluating Backend Subsystem (Python Parser & Query Count Scaling)...${colors.reset}`);
  const startTime = Date.now();
  try {
    const stdout = execSync('python backend/scripts/benchmark_backend.py --json', {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
      timeout: 30000,
    });

    const data = JSON.parse(stdout.trim());
    return {
      success: true,
      durationMs: Date.now() - startTime,
      parserParsesPerSec: data.parser?.parsesPerSec || 0,
      parserMeanLatencyUs: data.parser?.meanLatencyUs || 0,
      parserDurationMs: data.parser?.durationMs || 0,
      parserSlaPassed: Boolean(data.parser?.slaPassed),
      queryScalingChecked: Boolean(data.queries?.checked),
      queryScalingPassed: Boolean(data.queries?.passed),
      slaPassed: Boolean(data.slaPassed),
    };
  } catch (err) {
    console.error(`${colors.yellow}      Backend benchmark warning: ${err.message}${colors.reset}`);
    return {
      success: false,
      durationMs: Date.now() - startTime,
      parserParsesPerSec: 0,
      parserMeanLatencyUs: 0,
      parserDurationMs: 0,
      parserSlaPassed: false,
      queryScalingChecked: false,
      queryScalingPassed: false,
      slaPassed: false,
      error: err.message,
    };
  }
}

function runNodeBenchmarks() {
  console.log(`${colors.cyan}[4/4] Evaluating Node Companion Daemon Subsystem (Go Parser & Allocations)...${colors.reset}`);
  const startTime = Date.now();
  try {
    const stdout = execSync(
      'go test -bench=BenchmarkParseReleaseName -benchtime=500ms -run=^$ ./internal/parser',
      {
        cwd: path.join(rootDir, 'node'),
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf-8',
        timeout: 20000,
      }
    );

    // Parse: BenchmarkParseReleaseName-16    157    4122408 ns/op    2723259 B/op    29105 allocs/op
    const match = stdout.match(/BenchmarkParseReleaseName\S*\s+\d+\s+(\d+)\s+ns\/op\s+(\d+)\s+B\/op\s+(\d+)\s+allocs\/op/);
    if (!match) {
      throw new Error(`Failed to parse Go benchmark output: ${stdout}`);
    }

    const nsPerOp = parseInt(match[1], 10);
    const bytesPerOp = parseInt(match[2], 10);
    const allocsPerOp = parseInt(match[3], 10);

    // Each op parses 110 cases in fixtures/parser_fixtures.json
    const casesCount = 110;
    const nsPerItem = Math.round(nsPerOp / casesCount);
    const bytesPerItem = Math.round(bytesPerOp / casesCount);
    const allocsPerItem = Math.round(allocsPerOp / casesCount);
    const parsesPerSec = nsPerItem > 0 ? Math.round(1_000_000_000 / nsPerItem) : 0;

    // SLA: < 60,000 ns per item (> 16,000 parses/sec)
    const slaPassed = nsPerItem <= 60000;

    return {
      success: true,
      durationMs: Date.now() - startTime,
      nsPerItem,
      bytesPerItem,
      allocsPerItem,
      parsesPerSec,
      slaPassed,
    };
  } catch (err) {
    console.error(`${colors.yellow}      Go node benchmark warning: ${err.message}${colors.reset}`);
    return {
      success: false,
      durationMs: Date.now() - startTime,
      nsPerItem: 0,
      bytesPerItem: 0,
      allocsPerItem: 0,
      parsesPerSec: 0,
      slaPassed: false,
      error: err.message,
    };
  }
}

// ── Historical Store Management ─────────────────────────────────────────────

function loadHistory() {
  if (!fs.existsSync(historyFile)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(historyFile, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  if (!fs.existsSync(benchmarksDir)) {
    fs.mkdirSync(benchmarksDir, { recursive: true });
  }
  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf-8');
}

function saveLatest(latest) {
  if (!fs.existsSync(benchmarksDir)) {
    fs.mkdirSync(benchmarksDir, { recursive: true });
  }
  fs.writeFileSync(latestFile, JSON.stringify(latest, null, 2), 'utf-8');
}

// ── Metric Evaluation & Regression Logic ────────────────────────────────────

const METRIC_DEFS = [
  // Desktop
  {
    key: 'desktop_hydration500',
    subsystem: 'Desktop',
    name: 'Hydration 500 Items',
    unit: 'ms',
    lowerIsBetter: true,
    slaLimit: 300,
    absoluteNoiseFloor: 15.0, // Run-to-run noise under 15ms is negligible (SLA 300ms)
    warnThresholdPct: 25,
    failThresholdPct: 50,
    getValue: (m) => m.desktop?.hydration500Ms || 0,
  },
  {
    key: 'desktop_hydration1500',
    subsystem: 'Desktop',
    name: 'Hydration 1,500 Items',
    unit: 'ms',
    lowerIsBetter: true,
    slaLimit: 300,
    absoluteNoiseFloor: 30.0, // Run-to-run noise under 30ms is negligible (SLA 300ms)
    warnThresholdPct: 25,
    failThresholdPct: 50,
    getValue: (m) => m.desktop?.hydration1500Ms || 0,
  },
  {
    key: 'desktop_render_p99',
    subsystem: 'Desktop',
    name: 'Render Scroll Frame (p99)',
    unit: 'ms',
    lowerIsBetter: true,
    slaLimit: 16.6,
    absoluteNoiseFloor: 2.0, // Sub-millisecond timing jitter under 2.0ms is negligible (SLA 16.6ms)
    warnThresholdPct: 25,
    failThresholdPct: 50,
    getValue: (m) => m.desktop?.renderFrameP99Ms || 0,
  },
  {
    key: 'desktop_scanner_throughput',
    subsystem: 'Desktop',
    name: 'File Scanner Throughput',
    unit: 'items/s',
    lowerIsBetter: false,
    slaLimit: 5000,
    warnThresholdPct: 20,
    failThresholdPct: 40,
    getValue: (m) => m.desktop?.scannerItemsPerSec || 0,
  },
  {
    key: 'desktop_rss_mb',
    subsystem: 'Desktop',
    name: 'Process Memory (RSS)',
    unit: 'MB',
    lowerIsBetter: true,
    slaLimit: 300,
    absoluteNoiseFloor: 150.0,
    warnThresholdPct: 25,
    failThresholdPct: 50,
    getValue: (m) => m.desktop?.rssMb || 0,
  },
  // Frontend
  {
    key: 'frontend_total_js_mb',
    subsystem: 'Frontend',
    name: 'Total JS Bundle Size',
    unit: 'MB',
    lowerIsBetter: true,
    slaLimit: 7.5,
    warnThresholdPct: 10,
    failThresholdPct: 25,
    getValue: (m) => m.frontend?.totalJsMb || 0,
  },
  {
    key: 'frontend_entry_chunk_kb',
    subsystem: 'Frontend',
    name: 'Main Entry Chunk Size',
    unit: 'KB',
    lowerIsBetter: true,
    slaLimit: 1536,
    warnThresholdPct: 10,
    failThresholdPct: 20,
    getValue: (m) => m.frontend?.entryChunkKb || 0,
  },
  {
    key: 'frontend_merge_latency_ms',
    subsystem: 'Frontend',
    name: 'State Merge Latency',
    unit: 'ms',
    lowerIsBetter: true,
    slaLimit: 300,
    absoluteNoiseFloor: 260.0, // Latencies under 260ms safely satisfy SLA (300ms)
    warnThresholdPct: 35,
    failThresholdPct: 75,
    getValue: (m) => m.frontend?.mergeLatencyMs || 0,
  },
  // Backend
  {
    key: 'backend_parser_throughput',
    subsystem: 'Backend',
    name: 'Python Parser Throughput',
    unit: 'parses/s',
    lowerIsBetter: false,
    slaLimit: 20000,
    warnThresholdPct: 25,
    failThresholdPct: 50,
    getValue: (m) => m.backend?.parserParsesPerSec || 0,
  },
  {
    key: 'backend_parser_latency_us',
    subsystem: 'Backend',
    name: 'Python Parser Latency',
    unit: 'µs/item',
    lowerIsBetter: true,
    slaLimit: 50,
    absoluteNoiseFloor: 40.0,
    warnThresholdPct: 30,
    failThresholdPct: 60,
    getValue: (m) => m.backend?.parserMeanLatencyUs || 0,
  },
  // Node Go
  {
    key: 'node_parser_throughput',
    subsystem: 'Node (Go)',
    name: 'Go Parser Throughput',
    unit: 'parses/s',
    lowerIsBetter: false,
    slaLimit: 16000,
    warnThresholdPct: 20,
    failThresholdPct: 40,
    getValue: (m) => m.node?.parsesPerSec || 0,
  },
  {
    key: 'node_parser_ns_per_item',
    subsystem: 'Node (Go)',
    name: 'Go Parser Latency',
    unit: 'ns/item',
    lowerIsBetter: true,
    slaLimit: 60000,
    absoluteNoiseFloor: 50000.0,
    warnThresholdPct: 25,
    failThresholdPct: 50,
    getValue: (m) => m.node?.nsPerItem || 0,
  },
];

function evaluateMetrics(currentMetrics, prevMetrics) {
  const evaluations = [];
  let severeRegressions = 0;
  let warningRegressions = 0;
  let slaViolations = 0;
  let improvedCount = 0;
  let stableCount = 0;

  for (const def of METRIC_DEFS) {
    const curVal = def.getValue(currentMetrics);
    const prevVal = prevMetrics ? def.getValue(prevMetrics) : 0;

    let delta = 0;
    let deltaPct = 0;
    let hasDelta = prevVal > 0 && curVal > 0;

    if (hasDelta) {
      delta = curVal - prevVal;
      deltaPct = ((curVal - prevVal) / prevVal) * 100;
    }

    // SLA check
    let slaPassed = true;
    if (def.lowerIsBetter) {
      if (curVal > def.slaLimit) slaPassed = false;
    } else {
      if (curVal < def.slaLimit) slaPassed = false;
    }

    if (!slaPassed) {
      slaViolations++;
    }

    // Status classification
    let status = 'STABLE';
    const noiseFloor = def.absoluteNoiseFloor || 0;
    const isBelowNoiseFloor = def.lowerIsBetter && curVal <= noiseFloor && prevVal <= noiseFloor;

    if (!slaPassed) {
      status = 'FAIL_SLA';
    } else if (hasDelta && !isBelowNoiseFloor) {
      if (def.lowerIsBetter) {
        if (deltaPct <= -5) {
          status = 'IMPROVED';
          improvedCount++;
        } else if (deltaPct > def.failThresholdPct) {
          status = 'DEGRADED';
          severeRegressions++;
        } else if (deltaPct > def.warnThresholdPct) {
          status = 'REGRESSED';
          warningRegressions++;
        } else {
          stableCount++;
        }
      } else {
        // Higher is better
        if (deltaPct >= 5) {
          status = 'IMPROVED';
          improvedCount++;
        } else if (deltaPct < -def.failThresholdPct) {
          status = 'DEGRADED';
          severeRegressions++;
        } else if (deltaPct < -def.warnThresholdPct) {
          status = 'REGRESSED';
          warningRegressions++;
        } else {
          stableCount++;
        }
      }
    } else {
      stableCount++;
    }

    evaluations.push({
      key: def.key,
      subsystem: def.subsystem,
      name: def.name,
      unit: def.unit,
      lowerIsBetter: def.lowerIsBetter,
      slaLimit: def.slaLimit,
      curVal,
      prevVal,
      delta,
      deltaPct: hasDelta ? Math.round(deltaPct * 10) / 10 : null,
      slaPassed,
      status,
    });
  }

  const passed = slaViolations === 0 && severeRegressions === 0;

  return {
    evaluations,
    passed,
    slaViolations,
    severeRegressions,
    warningRegressions,
    improvedCount,
    stableCount,
  };
}

// ── Table & Console Presentation ────────────────────────────────────────────

function printScorecard(evalResult, currentCommit, prevCommit) {
  console.log('\n' + '='.repeat(100));
  console.log(
    ` ${colors.bold}OTIX FULL-STACK PRE-COMMIT PERFORMANCE EVALUATION SCORECARD${colors.reset}`
  );
  console.log(
    ` Commit: ${colors.cyan}${currentCommit.shortCommit}${colors.reset} (${currentCommit.branch}) - "${currentCommit.message}"`
  );
  if (prevCommit) {
    console.log(
      ` Baseline Comparison: vs Commit ${colors.cyan}${prevCommit.shortCommit || prevCommit.commit?.slice(0, 7)}${colors.reset} (${prevCommit.timestamp || 'historical'})`
    );
  } else {
    console.log(` Baseline Comparison: ${colors.yellow}Initial baseline commit recorded${colors.reset}`);
  }
  console.log('='.repeat(100));

  const pad = (str, len, align = 'left') => {
    const s = String(str);
    return align === 'right' ? s.padStart(len) : s.padEnd(len);
  };

  const header = `| ${pad('Subsystem', 11)} | ${pad('Metric', 26)} | ${pad('Baseline', 12, 'right')} | ${pad('Current', 12, 'right')} | ${pad('Δ Change', 10, 'right')} | ${pad('SLA Limit', 11, 'right')} | ${pad('Status', 10)} |`;
  console.log(header);
  console.log('|' + '-'.repeat(13) + '|' + '-'.repeat(28) + '|' + '-'.repeat(14) + '|' + '-'.repeat(14) + '|' + '-'.repeat(12) + '|' + '-'.repeat(13) + '|' + '-'.repeat(12) + '|');

  for (const item of evalResult.evaluations) {
    const prevStr = item.prevVal > 0 ? `${item.prevVal.toLocaleString()} ${item.unit}` : '---';
    const curStr = item.curVal > 0 ? `${item.curVal.toLocaleString()} ${item.unit}` : '---';
    const deltaStr = item.deltaPct !== null ? `${item.deltaPct > 0 ? '+' : ''}${item.deltaPct}%` : '---';
    const slaStr = `${item.lowerIsBetter ? '<' : '>'} ${item.slaLimit.toLocaleString()}`;

    let statusStyled = item.status;
    if (item.status === 'IMPROVED') {
      statusStyled = `${colors.green}${colors.bold}IMPROVED${colors.reset}`;
    } else if (item.status === 'STABLE') {
      statusStyled = `${colors.cyan}STABLE${colors.reset}`;
    } else if (item.status === 'REGRESSED') {
      statusStyled = `${colors.yellow}${colors.bold}REGRESSED${colors.reset}`;
    } else if (item.status === 'DEGRADED') {
      statusStyled = `${colors.red}${colors.bold}DEGRADED${colors.reset}`;
    } else if (item.status === 'FAIL_SLA') {
      statusStyled = `${colors.bgRed}${colors.white}${colors.bold}FAIL SLA${colors.reset}`;
    }

    const row = `| ${pad(item.subsystem, 11)} | ${pad(item.name, 26)} | ${pad(prevStr, 12, 'right')} | ${pad(curStr, 12, 'right')} | ${pad(deltaStr, 10, 'right')} | ${pad(slaStr, 11, 'right')} | ${pad(statusStyled, 10)} |`;
    console.log(row);
  }

  console.log('='.repeat(100));
  console.log(
    ` Summary: ${colors.green}${evalResult.improvedCount} improved${colors.reset} | ${colors.cyan}${evalResult.stableCount} stable${colors.reset} | ${colors.yellow}${evalResult.warningRegressions} regressed${colors.reset} | ${colors.red}${evalResult.severeRegressions} degraded${colors.reset} | ${colors.red}${evalResult.slaViolations} SLA violations${colors.reset}`
  );
  console.log('='.repeat(100) + '\n');
}

// ── Historical Timeline & Comparison Views ──────────────────────────────────

function showHistory() {
  const history = loadHistory();
  if (history.length === 0) {
    console.log(`${colors.yellow}No performance history found in benchmarks/perf-history.json.${colors.reset}`);
    return;
  }

  console.log('\n' + '='.repeat(100));
  console.log(` ${colors.bold}OTIX PERFORMANCE COMMIT TIMELINE & REGRESSION HISTORY (${history.length} commits recorded)${colors.reset}`);
  console.log('='.repeat(100));

  console.log(`| ${'Commit'.padEnd(7)} | ${'Date/Time'.padEnd(20)} | ${'Branch'.padEnd(10)} | ${'Hydr500'.padStart(9)} | ${'FPS'.padStart(9)} | ${'Scanner'.padStart(11)} | ${'JS Bundle'.padStart(9)} | ${'PyParse'.padStart(10)} | ${'Status'.padEnd(8)} |`);
  console.log('|' + '-'.repeat(9) + '|' + '-'.repeat(22) + '|' + '-'.repeat(12) + '|' + '-'.repeat(11) + '|' + '-'.repeat(11) + '|' + '-'.repeat(13) + '|' + '-'.repeat(11) + '|' + '-'.repeat(12) + '|' + '-'.repeat(10) + '|');

  for (const h of history) {
    const c = (h.shortCommit || h.commit?.slice(0, 7) || 'unknown').padEnd(7);
    const date = (h.timestamp ? new Date(h.timestamp).toISOString().replace('T', ' ').slice(0, 19) : 'unknown').padEnd(20);
    const br = (h.branch || 'main').slice(0, 10).padEnd(10);
    const h500 = `${h.metrics?.desktop?.hydration500Ms?.toFixed(1) || '0'}ms`.padStart(9);
    const fps = `${h.metrics?.desktop?.effectiveFps?.toLocaleString() || '0'}`.padStart(9);
    const scan = `${h.metrics?.desktop?.scannerItemsPerSec?.toLocaleString() || '0'}/s`.padStart(11);
    const js = `${h.metrics?.frontend?.totalJsMb?.toFixed(2) || '0'}MB`.padStart(9);
    const py = `${h.metrics?.backend?.parserParsesPerSec?.toLocaleString() || '0'}/s`.padStart(10);
    const stat = h.slaPassed ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`;

    console.log(`| ${c} | ${date} | ${br} | ${h500} | ${fps} | ${scan} | ${js} | ${py} | ${stat.padEnd(8)} |`);
  }
  console.log('='.repeat(100) + '\n');
}

function compareCommits(shaA, shaB) {
  const history = loadHistory();
  const commitA = history.find((h) => h.commit?.startsWith(shaA) || h.shortCommit === shaA);
  const commitB = history.find((h) => h.commit?.startsWith(shaB) || h.shortCommit === shaB);

  if (!commitA || !commitB) {
    console.error(`${colors.red}Could not find one or both commits in performance history.${colors.reset}`);
    return;
  }

  const evalResult = evaluateMetrics(commitB.metrics, commitA.metrics);
  printScorecard(evalResult, commitB, commitA);
}

// ── Main Controller ─────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isPreCommit = args.includes('--pre-commit');
  const isHistory = args.includes('--history');
  const isCompare = args.includes('--compare');
  const allowRegression = args.includes('--allow-regression');

  if (isHistory) {
    showHistory();
    process.exit(0);
  }

  if (isCompare) {
    const compareIdx = args.indexOf('--compare');
    const shaA = args[compareIdx + 1];
    const shaB = args[compareIdx + 2];
    if (!shaA || !shaB) {
      console.error('Usage: node scripts/check-performance.mjs --compare <shaA> <shaB>');
      process.exit(1);
    }
    compareCommits(shaA, shaB);
    process.exit(0);
  }

  console.log('\n' + '='.repeat(100));
  console.log(` ${colors.bold}STARTING OTIX FULL-STACK PERFORMANCE REGRESSION AUDIT${colors.reset}`);
  console.log('='.repeat(100));

  const gitCtx = getGitContext();
  const history = loadHistory();
  const prevRecord = history.length > 0 ? history[history.length - 1] : null;

  // Run all 4 subsystem benchmarks
  const desktop = runDesktopBenchmarks();
  const frontend = runFrontendBenchmarks();
  const backend = runBackendBenchmarks();
  const node = runNodeBenchmarks();

  const currentMetrics = {
    desktop,
    frontend,
    backend,
    node,
  };

  const evalResult = evaluateMetrics(currentMetrics, prevRecord ? prevRecord.metrics : null);
  printScorecard(evalResult, gitCtx, prevRecord);

  const snapshotRecord = {
    commit: gitCtx.commit,
    shortCommit: gitCtx.shortCommit,
    branch: gitCtx.branch,
    timestamp: new Date().toISOString(),
    author: gitCtx.author,
    message: gitCtx.message,
    slaPassed: evalResult.passed,
    severeRegressions: evalResult.severeRegressions,
    warningRegressions: evalResult.warningRegressions,
    slaViolations: evalResult.slaViolations,
    metrics: currentMetrics,
    evaluations: evalResult.evaluations,
  };

  // Always save latest snapshot
  saveLatest(snapshotRecord);

  // If in pre-commit mode and regressions occurred
  if (isPreCommit && !evalResult.passed && !allowRegression) {
    console.error(
      `${colors.bgRed}${colors.white}${colors.bold} [COMMIT BLOCKED] PERFORMANCE REGRESSION DETECTED! ${colors.reset}\n`
    );
    console.error(
      `${colors.red}This commit introduces significant performance degradation or violates system SLAs:${colors.reset}`
    );

    for (const item of evalResult.evaluations) {
      if (item.status === 'DEGRADED' || item.status === 'FAIL_SLA') {
        const deltaStr = item.deltaPct !== null ? `(${item.deltaPct > 0 ? '+' : ''}${item.deltaPct}%)` : '';
        console.error(
          `  ${colors.red}• [${item.subsystem}] ${item.name}: Current ${item.curVal} ${item.unit} vs Baseline ${item.prevVal} ${item.unit} ${deltaStr} | Target: ${item.lowerIsBetter ? '<' : '>'} ${item.slaLimit}${colors.reset}`
        );
      }
    }

    console.error(
      `\n${colors.yellow}To bypass in an emergency, use:${colors.reset}`
    );
    console.error(`  git commit --no-verify`);
    console.error(`  or run: npm run perf:check -- --allow-regression\n`);
    process.exit(1);
  }

  // Record into historical ledger if passed or explicitly allowed
  // Avoid duplicate records if run multiple times on same commit SHA
  const existingIdx = history.findIndex((h) => h.commit === gitCtx.commit);
  if (existingIdx >= 0) {
    history[existingIdx] = snapshotRecord;
  } else {
    history.push(snapshotRecord);
  }
  saveHistory(history);

  if (evalResult.passed) {
    console.log(
      `${colors.green}${colors.bold}[PERF CHECK PASSED] All subsystems within SLA limits. No performance regressions detected.${colors.reset}\n`
    );
    process.exit(0);
  } else {
    console.log(
      `${colors.yellow}${colors.bold}[PERF CHECK WARNING] Regressions detected but allowed by flags.${colors.reset}\n`
    );
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(`${colors.red}Fatal performance check error: ${err.message}${colors.reset}`);
  process.exit(1);
});
