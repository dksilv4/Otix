/**
 * FPS capture using Intel PresentMon.
 *
 * Spawns PresentMon as a child process when a game starts (by PID),
 * parses the CSV frame-timing stream from stdout, and computes
 * aggregate stats (avg / 1% low / 0.1% low FPS) when the session ends.
 *
 * Falls back gracefully if PresentMon is not installed or lacks
 * ETW permissions (user not in "Performance Log Users" group).
 */

import { ChildProcess, spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createInterface } from 'readline';
import { app } from 'electron';

// ── Types ──────────────────────────────────────────────────────────

export interface FpsStats {
  avgFps: number;
  onePercentLow: number;
  zeroPointOnePercentLow: number;
  maxFps: number;
  minFps: number;
  totalFrames: number;
  captureDurationMs: number;
}

export interface LiveFpsSnapshot {
  currentFps: number;
  frameCount: number;
  captureDurationMs: number;
  gameId: string;
}

/** Emitted when PresentMon fails due to insufficient ETW permissions. */
export type FpsPermissionEvent = { pid: number; gameId: string };

const fpsPermissionListeners: Set<(evt: FpsPermissionEvent) => void> = new Set();
export function onFpsPermissionNeeded(cb: (evt: FpsPermissionEvent) => void): () => void {
  fpsPermissionListeners.add(cb);
  return () => fpsPermissionListeners.delete(cb);
}

interface FpsCaptureSession {
  process: ChildProcess;
  frameTimes: number[];
  startWallMs: number;
  gameId: string;
}

// ── PresentMon discovery ───────────────────────────────────────────

const BUNDLED_DIR = path.join(__dirname, '..', 'bin');

const KNOWN_PATHS: Record<string, string[]> = {
  win32: [
    path.join(BUNDLED_DIR, 'PresentMon.exe'),
    path.join(BUNDLED_DIR, 'PresentMon-2.4.1-x64.exe'),
    path.join(BUNDLED_DIR, 'PresentMon-2.4.0.exe'),
    path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'PresentMon', 'PresentMon.exe'),
    path.join(process.env['LOCALAPPDATA'] || '', 'PresentMon', 'PresentMon.exe'),
    'PresentMon.exe',
  ],
};

let _presentMonPath: string | null | undefined;

export function findPresentMon(): string | null {
  if (_presentMonPath !== undefined) return _presentMonPath;

  const paths = KNOWN_PATHS[process.platform] ?? [];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        _presentMonPath = p;
        return p;
      }
    } catch { /* keep looking */ }
  }

  // Try `where` on Windows
  if (process.platform === 'win32') {
    try {
      const result = execSync('where PresentMon 2>nul', { encoding: 'utf-8', timeout: 3000 });
      const first = result.trim().split('\n')[0]?.trim();
      if (first) {
        _presentMonPath = first;
        return first;
      }
    } catch { /* not in PATH */ }
  }

  // Check userData location (auto-download target)
  try {
    const userDataPath = path.join(app.getPath('userData'), 'PresentMon', 'PresentMon.exe');
    if (fs.existsSync(userDataPath)) {
      _presentMonPath = userDataPath;
      return userDataPath;
    }
  } catch { /* app not ready yet */ }

  _presentMonPath = null;
  return null;
}

export async function ensurePresentMon(): Promise<string | null> {
  const existing = findPresentMon();
  if (existing) return existing;

  const destDir = path.join(app.getPath('userData'), 'PresentMon');
  const destPath = path.join(destDir, 'PresentMon.exe');

  try { fs.mkdirSync(destDir, { recursive: true }); } catch (err) {
    console.error('[PresentMon] Cannot create download dir:', err);
    return null;
  }

  const VERSION = '2.4.1';
  const url = `https://github.com/GameTechDev/PresentMon/releases/download/v${VERSION}/PresentMon-${VERSION}-x64.exe`;

  console.log('[PresentMon] Not found — downloading from GitHub...');
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    console.log('[PresentMon] Downloaded to', destPath);
    _presentMonPath = undefined; // invalidate cache
    return findPresentMon();
  } catch (err) {
    console.error('[PresentMon] Download failed:', err);
    return null;
  }
}

export function isPresentMonAvailable(): boolean {
  return findPresentMon() !== null;
}

// ── CSV parsing ────────────────────────────────────────────────────

function parseCsvHeader(line: string): Map<string, number> {
  const cols = line.trim().split(',');
  const map = new Map<string, number>();
  for (let i = 0; i < cols.length; i++) {
    map.set(cols[i].trim().toLowerCase(), i);
  }
  return map;
}

function parseFrameTime(line: string, colIndex: Map<string, number>, targetPid?: number): number | null {
  const cols = line.trim().split(',');
  // Filter by PID when targeting a specific process
  if (targetPid !== undefined) {
    const pidIdx = colIndex.get('processid');
    if (pidIdx === undefined) return null;
    const linePid = parseInt(cols[pidIdx], 10);
    if (linePid !== targetPid) return null;
  }
  const msIdx = colIndex.get('msbetweenpresents');
  if (msIdx === undefined) return null;
  const val = parseFloat(cols[msIdx]);
  return Number.isFinite(val) && val > 0 ? val : null;
}

// ── Stats computation ──────────────────────────────────────────────

function computeStats(frameTimesMs: number[]): FpsStats {
  if (frameTimesMs.length === 0) {
    return { avgFps: 0, onePercentLow: 0, zeroPointOnePercentLow: 0, maxFps: 0, minFps: 0, totalFrames: 0, captureDurationMs: 0 };
  }

  const fpsValues = frameTimesMs.map((ms) => 1000 / ms).sort((a, b) => a - b);
  const n = fpsValues.length;
  const sumFps = fpsValues.reduce((s, v) => s + v, 0);
  const avgFps = sumFps / n;
  const totalMs = frameTimesMs.reduce((s, v) => s + v, 0);

  const onePctCount = Math.max(1, Math.floor(n * 0.01));
  const onePctSlice = fpsValues.slice(0, onePctCount);
  const onePercentLow = onePctSlice.reduce((s, v) => s + v, 0) / onePctSlice.length;

  const dotOnePctCount = Math.max(1, Math.floor(n * 0.001));
  const dotOnePctSlice = fpsValues.slice(0, dotOnePctCount);
  const zeroPointOnePercentLow = dotOnePctSlice.reduce((s, v) => s + v, 0) / dotOnePctSlice.length;

  return {
    avgFps: Math.round(avgFps * 10) / 10,
    onePercentLow: Math.round(onePercentLow * 10) / 10,
    zeroPointOnePercentLow: Math.round(zeroPointOnePercentLow * 10) / 10,
    maxFps: Math.round(fpsValues[n - 1] * 10) / 10,
    minFps: Math.round(fpsValues[0] * 10) / 10,
    totalFrames: n,
    captureDurationMs: Math.round(totalMs),
  };
}

// ── Capture lifecycle ──────────────────────────────────────────────

let activeSession: FpsCaptureSession | null = null;

export function startFpsCapture(pid: number, gameId?: string, processName?: string): boolean {
  const exePath = findPresentMon();
  if (!exePath) return false;

  // Kill stale session
  if (activeSession) stopFpsCapture();

  const frameTimes: number[] = [];

  // Pre-create ETW session with 1024 KB buffers to prevent event loss on Win11.
  // PresentMon defaults to 64 KB which overflows on this system.
  // Without --stop_existing_session, PresentMon reuses the pre-created session.
  try {
    execSync('logman stop "PresentMon" -ets 2>nul', { timeout: 3000 });
    execSync(
      'logman start "PresentMon" -ets -bs 1024 -nb 16 64 -ct perfin -rt 2>nul',
      { timeout: 3000 },
    );
  } catch { /* session config failed — PresentMon will create default-size */ }

  const args = ['--output_stdout', '--process_id', String(pid)];
  // Intentionally omit --stop_existing_session so PM reuses our larger-buffer session.
  if (processName) {
    args.push('--process_name', processName);
  }
  const child = spawn(exePath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false,
  });

  let headerParsed = false;
  let colIndex: Map<string, number> = new Map();
  let linesReceived = 0;
  const rl = createInterface({ input: child.stdout!, crlfDelay: Infinity });

  rl.on('line', (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    // Skip non-CSV lines (stats output when --no_console_stats omitted)
    if (!headerParsed && !trimmed.startsWith('ProcessID')) return;
    if (headerParsed && !/^\d/.test(trimmed)) return;

    linesReceived++;
    if (!headerParsed) {
      colIndex = parseCsvHeader(line);
      headerParsed = true;
      console.log(`[FPS] header parsed (cols: ${Array.from(colIndex.keys()).join(',')})`);
      return;
    }
    // Filter by PID in the CSV parser so we only keep frames from our target process
    const ft = parseFrameTime(line, colIndex, pid);
    if (ft !== null) frameTimes.push(ft);
  });

  // Log every 5s so we can see if lines arrive but parsing fails
  const debugTimer = setInterval(() => {
    if (!activeSession) { clearInterval(debugTimer); return; }
    console.log(`[FPS] debug: ${frameTimes.length} parsed frames, ${linesReceived} total lines from stdout`);
  }, 5000);

  // Detect access-denied (exit code 6) for ETW permission prompt
  child.on('exit', (code) => {
    if (code === 6 && gameId) {
      fpsPermissionListeners.forEach(fn => fn({ pid, gameId }));
    }
    if (code !== null) {
      console.log(`[PresentMon] exited with code ${code} (pid ${pid}, game ${gameId})`);
    }
    // Clear session so game detector can restart on next scan
    activeSession = null;
  });

  // Log errors to stderr
  if (child.stderr) {
    child.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.log('[PresentMon]', msg);
    });
  }

  child.on('error', () => {});

  activeSession = { process: child, frameTimes, startWallMs: Date.now(), gameId: gameId || '' };
  console.log(`[PresentMon] started for pid ${pid} (game ${gameId})`);
  return true;
}

export function stopFpsCapture(): FpsStats | null {
  if (!activeSession) return null;

  const { process: child, frameTimes } = activeSession;
  try { child.kill('SIGTERM'); } catch { /* already dead */ }

  activeSession = null;

  const filtered = frameTimes.filter((ms) => ms > 0 && ms <= 500);
  return computeStats(filtered);
}

export function getLiveFps(): LiveFpsSnapshot | null {
  if (!activeSession) return null;

  const { frameTimes, startWallMs, gameId } = activeSession;
  const elapsed = Date.now() - startWallMs;

  const WINDOW_MS = 1000;
  let windowSum = 0;
  let windowCount = 0;
  for (let i = frameTimes.length - 1; i >= 0; i--) {
    windowSum += frameTimes[i];
    windowCount++;
    if (windowSum >= WINDOW_MS) break;
  }

  if (windowCount === 0) {
    // Log every 5s so user can see if capture is running but empty
    if (elapsed > 0 && Math.floor(elapsed / 5000) > Math.floor((elapsed - 500) / 5000)) {
      console.log(`[FPS] no frames yet for ${gameId} after ${Math.round(elapsed / 1000)}s (total events: ${frameTimes.length})`);
    }
    return null;
  }

  const fps = windowSum > 0 ? Math.round((windowCount / windowSum) * 10000) / 10 : 0;
  // Log every 5s
  if (elapsed > 0 && Math.floor(elapsed / 5000) > Math.floor((elapsed - 500) / 5000)) {
    console.log(`[FPS] live ${fps} for ${gameId} (${frameTimes.length} frames, ${Math.round(elapsed / 1000)}s)`);
  }
  return {
    currentFps: fps,
    frameCount: frameTimes.length,
    captureDurationMs: elapsed,
    gameId,
  };
}

export function isCapturing(): boolean {
  return activeSession !== null;
}
