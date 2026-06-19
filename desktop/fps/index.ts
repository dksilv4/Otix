/**
 * FPS capture using Intel PresentMon.
 *
 * Spawns PresentMon as a child process, parses the CSV frame-timing
 * stream from stdout in-memory, and computes aggregate stats when the
 * session ends.
 *
 * Design:
 *  - Zero disk writes during capture (stdout parse only)
 *  - Bounded frame history (capped at 36000 entries ~10 min @ 60 fps)
 *  - Stale ETW sessions cleaned before each capture
 *  - Pure in-memory — no CSV file written to user's drive
 */

import { ChildProcess, spawn, execSync } from 'child_process';
import * as path from 'path';
import { app } from 'electron';

// ── Constants ──────────────────────────────────────────────────────

/** Max frames kept in memory (~10 min at 60 fps = 36000 frames). */
const MAX_FRAMES = 36000;

/** Names of known ETW sessions that interfere with PresentMon. */
const INTERFERING_SESSIONS = [
  'PresentMon',
  'OtixCapture',
  'FPS_Capture',
  'GraphicsPerfMonitorSession',
];

/** Windows Gaming Services that auto-create interfering ETW sessions. */
const GAMING_SERVICES = ['GamingServices', 'GamingServicesNet'];

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
  frameTimesMs: number[];
  startWallMs: number;
  gameId: string;
  totalLines: number;
}

// ── PresentMon discovery ───────────────────────────────────────────

const BUNDLED_DIR = path.join(__dirname, '..', 'bin');

const KNOWN_PATHS: Record<string, string[]> = {
  win32: [
    path.join(BUNDLED_DIR, 'PresentMon.exe'),
    path.join(BUNDLED_DIR, 'PresentMon-2.4.1-x64.exe'),
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
      if (require('fs').existsSync(p)) {
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
    if (require('fs').existsSync(userDataPath)) {
      _presentMonPath = userDataPath;
      return userDataPath;
    }
  } catch { /* app not ready yet */ }

  _presentMonPath = null;
  return null;
}

export async function ensurePresentMon(): Promise<string | null> {
  const fs = require('fs');
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

  console.log('[PresentMon] Downloading from GitHub...');
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

// ── ETW session cleanup ───────────────────────────────────────────

/**
 * Stop stale or interfering ETW trace sessions that would starve
 * PresentMon of buffer resources.
 *
 * PresentMon's main session is "PresentMon".  Other sessions with the
 * same providers (OtixCapture, FPS_Capture, GraphicsPerfMonitor, etc.)
 * consume ETW memory and cause PresentMon's events to be dropped.
 */
/**
 * Stop stale or interfering ETW trace sessions that would starve
 * PresentMon of buffer resources.
 *
 * Also suspends Windows Gaming Services which auto-create the
 * GraphicsPerfMonitorSession ETW session that conflicts with
 * PresentMon's capture.
 *
 * Gaming Services are restarted in stopFpsCapture().
 */
function cleanupEtwSessions(): void {
  // Stop Gaming Services first so they stop recreating the session.
  // sc stop works without admin (unlike net stop which requires elevation).
  for (const name of GAMING_SERVICES) {
    try {
      execSync(`sc stop "${name}" 2>nul`, { timeout: 5000, windowsHide: true });
    } catch { /* already stopped or not available */ }
  }

  // Then remove any lingering interfering ETW sessions
  for (const name of INTERFERING_SESSIONS) {
    try {
      execSync(`logman stop "${name}" -ets 2>nul`, { timeout: 3000, windowsHide: true });
    } catch { /* not running or not ours - ignore */ }
  }
}

/** Re-enable Windows Gaming Services after FPS capture ends. */
function restoreGamingServices(): void {
  for (const name of GAMING_SERVICES) {
    try {
      execSync(`sc start "${name}" 2>nul`, { timeout: 5000, windowsHide: true });
    } catch { /* already running or not available */ }
  }
}

// ── CSV parsing ────────────────────────────────────────────────────

const CSV_COLS = new Map([
  ['application', 0],
  ['processid', 1],
  ['swapchainaddress', 2],
  ['presentruntime', 3],
  ['msbetweenpresents', 9],     // column index 9: time between consecutive presents in ms
  ['msinpresentapi', 12],
  ['msuntildisplayed', 14],
  ['mscpubusy', 20],
  ['mscpuwait', 21],
  ['msgputime', 23],
  ['msbusy', 24],
  ['msuntildisplayed', 14],
]);

function parseCsvHeader(line: string): Map<string, number> {
  const cols = line.trim().split(',');
  const map = new Map<string, number>();
  for (let i = 0; i < cols.length; i++) {
    map.set(cols[i].trim().toLowerCase(), i);
  }
  return map;
}

function parseFrameTime(
  line: string,
  colIndex: Map<string, number>,
  targetPid?: number,
): number | null {
  const cols = line.trim().split(',');

  // Filter by PID when targeting a specific process
  if (targetPid !== undefined) {
    const pidIdx = colIndex.get('processid');
    if (pidIdx === undefined) return null;
    const linePid = parseInt(cols[pidIdx], 10);
    if (linePid !== targetPid) return null;
  }

  // Try MsBetweenPresents (v2 metrics) first, then fall back to msbetweenpresents
  const msIdx = colIndex.get('msbetweenpresents');
  if (msIdx === undefined) return null;

  const val = parseFloat(cols[msIdx]);
  // Valid frame time: positive, < 500ms (2 fps floor) — filter out outliers
  return Number.isFinite(val) && val > 0 && val <= 500 ? val : null;
}

// ── Stats computation ──────────────────────────────────────────────

function computeStats(frameTimesMs: number[]): FpsStats {
  if (frameTimesMs.length === 0) {
    return {
      avgFps: 0, onePercentLow: 0, zeroPointOnePercentLow: 0,
      maxFps: 0, minFps: 0, totalFrames: 0, captureDurationMs: 0,
    };
  }

  const fpsValues = frameTimesMs
    .map((ms) => 1000 / ms)
    .sort((a, b) => a - b);

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

/**
 * When PresentMon exits on its own (game process died), we stash the
 * frame data here so stopFpsCapture() can still compute final stats.
 * Without this, the exit handler nulls activeSession and the frames
 * accumulated over the whole capture are lost.
 */
let completedFrames: number[] | null = null;

export function startFpsCapture(
  pid: number,
  gameId?: string,
  processName?: string,
): boolean {
  const exePath = findPresentMon();
  if (!exePath) return false;

  // Kill stale session
  if (activeSession) stopFpsCapture();

  const frameTimesMs: number[] = [];
  let totalLines = 0;

  const args = [
    '--output_stdout',
    '--stop_existing_session',
    '--no_console_stats',
    '--process_id', String(pid),
  ];
  if (processName) {
    args.push('--process_name', processName);
  }

  // Clean interfering ETW sessions RIGHT BEFORE PresentMon starts.
  cleanupEtwSessions();

  const child = spawn(exePath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false,
  });

  let headerParsed = false;
  let colIndex: Map<string, number> = new Map();
  const { createInterface } = require('readline');
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });

  rl.on('line', (line: string) => {
    const cleaned = line.replace(/\0/g, '');
    const trimmed = cleaned.trim();
    if (!trimmed) return;

    if (!headerParsed) {
      if (trimmed.startsWith('Application') || trimmed.startsWith('ProcessID')) {
        colIndex = new Map(
          cleaned.split(',').map((c: string, i: number) => [c.trim().toLowerCase(), i])
        );
        headerParsed = true;
        console.log(`[FPS] header parsed (${colIndex.size} cols)`);
      }
      return;
    }

    totalLines++;
    const ft = parseFrameTime(trimmed, colIndex, pid);
    if (ft !== null) {
      frameTimesMs.push(ft);
      if (frameTimesMs.length > MAX_FRAMES) {
        frameTimesMs.splice(0, frameTimesMs.length - MAX_FRAMES);
      }
    }
  });

  // Log progress every 10s to help debug empty capture
  const debugTimer = setInterval(() => {
    if (!activeSession) { clearInterval(debugTimer); return; }
    const elapsed = Date.now() - activeSession.startWallMs;
    console.log(
      `[FPS] ${frameTimesMs.length} frames, ${totalLines} lines, ${Math.round(elapsed / 1000)}s`,
    );
  }, 10000);

  // When PresentMon exits on its own (game died, etc.),
  // save the accumulated frame data before clearing the session.
  child.on('exit', (code) => {
    rl.close();
    clearInterval(debugTimer);
    if (activeSession) {
      completedFrames = activeSession.frameTimesMs;
    }
    if (code === 6 && gameId) {
      fpsPermissionListeners.forEach((fn) => fn({ pid, gameId }));
    }
    activeSession = null;
    restoreGamingServices();
    if (code !== null) {
      console.log(
        `[FPS] exit ${code} (pid ${pid}${gameId ? `, ${gameId}` : ''})`,
      );
    }
  });

  if (child.stderr) {
    child.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg && !msg.includes('warning:')) {
        console.log('[PresentMon]', msg);
      }
    });
  }

  child.on('error', () => {});

  activeSession = {
    process: child,
    frameTimesMs,
    startWallMs: Date.now(),
    gameId: gameId || '',
    totalLines,
  };

  console.log(`[FPS] started for pid ${pid}${gameId ? ` (${gameId})` : ''}`);
  return true;
}

export function stopFpsCapture(): FpsStats | null {
  let frameTimesMs: number[] | null = null;

  if (activeSession) {
    frameTimesMs = activeSession.frameTimesMs;
    try { activeSession.process.kill('SIGTERM'); } catch { /* already dead */ }
    activeSession = null;
  } else if (completedFrames) {
    frameTimesMs = completedFrames;
    completedFrames = null;
  }

  restoreGamingServices();

  return frameTimesMs ? computeStats(frameTimesMs) : null;
}

export function getLiveFps(): LiveFpsSnapshot | null {
  if (!activeSession) return null;

  const { frameTimesMs, startWallMs, gameId } = activeSession;
  const elapsed = Date.now() - startWallMs;

  // Sliding window: sum frame times within last ~1 second
  const WINDOW_MS = 1000;
  let windowSum = 0;
  let windowCount = 0;
  for (let i = frameTimesMs.length - 1; i >= 0; i--) {
    windowSum += frameTimesMs[i];
    windowCount++;
    if (windowSum >= WINDOW_MS) break;
  }

  if (windowCount === 0) {
    // Log once per 5s when no frames yet
    if (
      elapsed > 0 &&
      Math.floor(elapsed / 5000) > Math.floor((elapsed - 500) / 5000)
    ) {
      console.log(
        `[FPS] waiting for frames (${Math.round(elapsed / 1000)}s)`,
      );
    }
    return null;
  }

  const fps =
    windowSum > 0
      ? Math.round((windowCount / windowSum) * 10000) / 10
      : 0;

  // Log periodically
  if (
    elapsed > 0 &&
    Math.floor(elapsed / 5000) > Math.floor((elapsed - 500) / 5000)
  ) {
    console.log(
      `[FPS] ${fps} fps, ${frameTimesMs.length} frames (${Math.round(elapsed / 1000)}s)`,
    );
  }

  return {
    currentFps: fps,
    frameCount: frameTimesMs.length,
    captureDurationMs: elapsed,
    gameId,
  };
}

export function isCapturing(): boolean {
  return activeSession !== null;
}
