import { spawn } from 'child_process';
import * as path from 'path';

interface RunResult {
  moduleLoadMs: number;
  timeToAppReadyMs: number;
  stage1Ms: number;
  stage2Ms: number;
  stage3Ms: number;
  stage4Ms: number;
  ttfwMs: number;
  ttiMs: number;
  totalBootMs: number;
  wallClockMs: number;
}

const electronPath = path.resolve(__dirname, '../../node_modules/electron/dist/electron.exe');
const benchmarkScript = path.resolve(__dirname, 'benchmark-boot-time.js');

function runIteration(): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const child = spawn(electronPath, [benchmarkScript], {
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      const wallClockMs = performance.now() - t0;
      if (code !== 0 && code !== null) {
        console.error('Child error:', stderr);
        return reject(new Error(`Exit code ${code}: ${stderr}`));
      }

      const getMatch = (re: RegExp) => {
        const m = stdout.match(re);
        return m ? parseFloat(m[1]) : 0;
      };

      const result: RunResult = {
        moduleLoadMs: getMatch(/Boot modules import time:\s*([\d.]+)\s*ms/),
        timeToAppReadyMs: getMatch(/Time to app\.whenReady\(\):\s*([\d.]+)\s*ms/),
        stage1Ms: getMatch(/Stage 1 \(Protocols & Session\):\s*([\d.]+)\s*ms/),
        stage2Ms: getMatch(/Stage 2 \(Database & Migrations\):\s*([\d.]+)\s*ms/),
        stage3Ms: getMatch(/Stage 3 \(Window Creation & Show\):\s*([\d.]+)\s*ms/),
        stage4Ms: getMatch(/Stage 4 \(Essential IPC Register\):\s*([\d.]+)\s*ms/),
        ttfwMs: getMatch(/Time-To-First-Window \(TTFW\):\s*([\d.]+)\s*ms/),
        ttiMs: getMatch(/Time-To-Interactive \(IPC Ready\):\s*([\d.]+)\s*ms/),
        totalBootMs: getMatch(/Total Immediate Boot Sequence:\s*([\d.]+)\s*ms/),
        wallClockMs,
      };

      resolve(result);
    });
  });
}

function stats(nums: number[]) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const p50 = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return { mean, p50, min, max };
}

async function main() {
  console.log('================================================================');
  console.log('RUNNING EMPIRICAL MULTI-RUN BOOT BENCHMARK (5 Iterations)');
  console.log('================================================================\n');

  const runs: RunResult[] = [];
  for (let i = 1; i <= 5; i++) {
    process.stdout.write(`Executing iteration ${i}/5... `);
    const r = await runIteration();
    runs.push(r);
    console.log(`TTFW: ${r.ttfwMs.toFixed(1)}ms | Process Wall-Clock: ${r.wallClockMs.toFixed(1)}ms`);
  }

  const moduleStats = stats(runs.map((r) => r.moduleLoadMs));
  const readyStats = stats(runs.map((r) => r.timeToAppReadyMs));
  const ttfwStats = stats(runs.map((r) => r.ttfwMs));
  const ttiStats = stats(runs.map((r) => r.ttiMs));
  const totalBootStats = stats(runs.map((r) => r.totalBootMs));
  const wallClockStats = stats(runs.map((r) => r.wallClockMs));

  console.log('\n================================================================');
  console.log('           FINAL EMPIRICAL BOOT BENCHMARK RESULTS (N=5)');
  console.log('================================================================');
  console.log('| Metric                          |  Mean    |   p50   |   Min   |   Max   |');
  console.log('|---------------------------------|----------|---------|---------|---------|');
  console.log(`| Boot Modules Import Time        | ${moduleStats.mean.toFixed(1).padStart(6)}ms | ${moduleStats.p50.toFixed(1).padStart(5)}ms | ${moduleStats.min.toFixed(1).padStart(5)}ms | ${moduleStats.max.toFixed(1).padStart(5)}ms |`);
  console.log(`| Time to app.whenReady()         | ${readyStats.mean.toFixed(1).padStart(6)}ms | ${readyStats.p50.toFixed(1).padStart(5)}ms | ${readyStats.min.toFixed(1).padStart(5)}ms | ${readyStats.max.toFixed(1).padStart(5)}ms |`);
  console.log(`| Time-To-First-Window (TTFW)     | ${ttfwStats.mean.toFixed(1).padStart(6)}ms | ${ttfwStats.p50.toFixed(1).padStart(5)}ms | ${ttfwStats.min.toFixed(1).padStart(5)}ms | ${ttfwStats.max.toFixed(1).padStart(5)}ms |`);
  console.log(`| Time-To-Interactive (IPC Ready) | ${ttiStats.mean.toFixed(1).padStart(6)}ms | ${ttiStats.p50.toFixed(1).padStart(5)}ms | ${ttiStats.min.toFixed(1).padStart(5)}ms | ${ttiStats.max.toFixed(1).padStart(5)}ms |`);
  console.log(`| Total Boot Sequence Execution   | ${totalBootStats.mean.toFixed(1).padStart(6)}ms | ${totalBootStats.p50.toFixed(1).padStart(5)}ms | ${totalBootStats.min.toFixed(1).padStart(5)}ms | ${totalBootStats.max.toFixed(1).padStart(5)}ms |`);
  console.log(`| Total OS Cold Process Spawn     | ${wallClockStats.mean.toFixed(1).padStart(6)}ms | ${wallClockStats.p50.toFixed(1).padStart(5)}ms | ${wallClockStats.min.toFixed(1).padStart(5)}ms | ${wallClockStats.max.toFixed(1).padStart(5)}ms |`);
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
