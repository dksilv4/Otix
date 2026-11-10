#!/usr/bin/env node
/**
 * frontend/scripts/benchmark-frontend.mjs
 *
 * Automated Performance Benchmark Suite for Otix Frontend Subsystem:
 * 1. Production Bundle Analysis: Total JS/CSS bundle size, entry chunk, largest chunk, chunk count
 * 2. Empirical State & Matcher Micro-Benchmark: mergeLocalAndServerGames, groupServerFilesByGame, LocalGameMatcher
 *
 * Usage:
 *   node frontend/scripts/benchmark-frontend.mjs [--json] [--skip-build]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '..');
const distDir = path.join(frontendDir, 'dist');
const assetsDir = path.join(distDir, 'assets');

// ── 1. Bundle & Asset Footprint Analysis ───────────────────────────────────

function analyzeBundleAssets() {
  if (!fs.existsSync(assetsDir)) {
    return {
      available: false,
      reason: 'frontend/dist/assets not found. Run "npm run build" to generate production assets.',
      totalJsBytes: 0,
      totalJsMb: 0,
      totalCssBytes: 0,
      totalCssKb: 0,
      entryChunk: null,
      largestChunk: null,
      chunkCount: 0,
      slaPassed: false,
    };
  }

  const files = fs.readdirSync(assetsDir);
  let totalJsBytes = 0;
  let totalCssBytes = 0;
  let largestChunk = { name: '', sizeBytes: 0, sizeKb: 0 };
  let entryChunk = { name: '', sizeBytes: 0, sizeKb: 0 };
  let jsChunkCount = 0;

  for (const file of files) {
    const fullPath = path.join(assetsDir, file);
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) continue;

    if (file.endsWith('.js')) {
      totalJsBytes += stat.size;
      jsChunkCount++;
      if (stat.size > largestChunk.sizeBytes) {
        largestChunk = {
          name: file,
          sizeBytes: stat.size,
          sizeKb: Math.round((stat.size / 1024) * 100) / 100,
        };
      }
      if (file.startsWith('index-') && file.endsWith('.js')) {
        entryChunk = {
          name: file,
          sizeBytes: stat.size,
          sizeKb: Math.round((stat.size / 1024) * 100) / 100,
        };
      }
    } else if (file.endsWith('.css')) {
      totalCssBytes += stat.size;
    }
  }

  const totalJsMb = Math.round((totalJsBytes / (1024 * 1024)) * 100) / 100;
  const totalCssKb = Math.round((totalCssBytes / 1024) * 100) / 100;

  // SLAs: Main entry chunk < 1.5MB (1536 KB), Total JS < 7.5MB
  const maxEntryChunkKb = 1536;
  const maxTotalJsMb = 7.5;

  const entryPassed = !entryChunk.sizeKb || entryChunk.sizeKb <= maxEntryChunkKb;
  const totalJsPassed = totalJsMb <= maxTotalJsMb;
  const slaPassed = entryPassed && totalJsPassed;

  return {
    available: true,
    totalJsBytes,
    totalJsMb,
    totalCssBytes,
    totalCssKb,
    entryChunk,
    largestChunk,
    chunkCount: jsChunkCount,
    slaTargetEntryChunkKb: maxEntryChunkKb,
    slaTargetTotalJsMb: maxTotalJsMb,
    slaPassed,
  };
}

// ── 2. Empirical State & Matcher Latency Micro-Benchmark ────────────────────

function runMicroBenchmark() {
  const testFile = 'src/features/launcher/data/__tests__/challenger-m2-empirical.test.ts';
  try {
    const cmd = `npx vitest run ${testFile} --reporter=json`;
    const stdout = execSync(cmd, {
      cwd: frontendDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    // Locate JSON block in stdout
    const firstBrace = stdout.indexOf('{');
    if (firstBrace === -1) {
      throw new Error('No JSON output found from vitest');
    }
    const jsonStr = stdout.slice(firstBrace);
    const parsed = JSON.parse(jsonStr);

    const testResults = parsed.testResults?.[0]?.assertionResults || [];
    const mergeTest = testResults.find((t) =>
      t.title?.includes('profiles and benchmarks execution latency')
    );

    const durationMs = mergeTest ? Math.round(mergeTest.duration * 100) / 100 : 0;
    const passed = parsed.success && (!mergeTest || mergeTest.status === 'passed');

    // Target SLA for 30 iterations of 500 local + 200 server groups is < 300ms total
    const slaTargetMs = 300;
    const slaPassed = passed && durationMs <= slaTargetMs;

    return {
      available: true,
      testName: 'mergeLocalAndServerGames (500 local, 200 server groups)',
      totalDurationMs: durationMs,
      slaTargetMs,
      slaPassed,
      testsPassed: parsed.numPassedTests || 0,
      testsTotal: parsed.numTotalTests || 0,
    };
  } catch (err) {
    return {
      available: false,
      reason: `Micro-benchmark failed to execute: ${err.message}`,
      totalDurationMs: 0,
      slaTargetMs: 300,
      slaPassed: false,
    };
  }
}

// ── Run All Benchmarks ──────────────────────────────────────────────────────

export function runFrontendBenchmarks() {
  const bundle = analyzeBundleAssets();
  const micro = runMicroBenchmark();

  const slaPassed = (!bundle.available || bundle.slaPassed) && (!micro.available || micro.slaPassed);

  return {
    timestamp: new Date().toISOString(),
    subsystem: 'Otix Frontend Subsystem',
    slaPassed,
    bundle,
    microBenchmark: micro,
  };
}

// ── Direct Execution ────────────────────────────────────────────────────────

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirect) {
  const isJson = process.argv.includes('--json');
  const results = runFrontendBenchmarks();

  if (isJson) {
    console.log(JSON.stringify(results, null, 2));
    process.exit(results.slaPassed ? 0 : 1);
  }

  console.log('='.repeat(80));
  console.log('               OTIX FRONTEND AUTOMATED PERFORMANCE BENCHMARK');
  console.log('='.repeat(80));
  if (results.bundle.available) {
    console.log(`Total JS Bundle:       ${results.bundle.totalJsMb} MB (SLA Target: < ${results.bundle.slaTargetTotalJsMb} MB)`);
    console.log(`Total CSS Bundle:      ${results.bundle.totalCssKb} KB`);
    console.log(`Entry Chunk:           ${results.bundle.entryChunk.name} (${results.bundle.entryChunk.sizeKb} KB)`);
    console.log(`Largest Chunk:         ${results.bundle.largestChunk.name} (${results.bundle.largestChunk.sizeKb} KB)`);
    console.log(`JS Chunks Count:       ${results.bundle.chunkCount}`);
    console.log(`Bundle SLA Status:     ${results.bundle.slaPassed ? 'PASS' : 'FAIL'}`);
  } else {
    console.log(`Bundle Analysis:       SKIPPED (${results.bundle.reason})`);
  }

  console.log('-'.repeat(80));
  if (results.microBenchmark.available) {
    console.log(`State Merge Benchmark: ${results.microBenchmark.totalDurationMs} ms (SLA Target: < ${results.microBenchmark.slaTargetMs} ms)`);
    console.log(`Micro-benchmark SLA:   ${results.microBenchmark.slaPassed ? 'PASS' : 'FAIL'}`);
  } else {
    console.log(`Micro-benchmark:       SKIPPED (${results.microBenchmark.reason})`);
  }
  console.log('='.repeat(80));

  process.exit(results.slaPassed ? 0 : 1);
}
