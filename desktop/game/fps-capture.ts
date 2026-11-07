// desktop/game/fps-capture.ts
// Native FPS capture and session management using Intel PresentMon.

import { ChildProcess, spawn, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { createInterface } from 'readline';
import { app, WebContents } from 'electron';
import { eventBus } from '../plugin-runtime/event-bus';

export interface FrameSample {
  ms: number;          // Frame time in milliseconds
  ts: number;          // Timestamp in Unix ms
  isBg: boolean;       // True if game window was not focused / Alt-Tabbed
  isLobby: boolean;    // True if game was in lobby / menu
}

export interface FpsStats {
  avgFps: number;
  onePercentLow: number;
  zeroPointOnePercentLow: number;
  maxFps: number;
  minFps: number;
  totalFrames: number;
  gameplayFrames: number;
  loadingDurationMs: number;
  captureDurationMs: number;
  gameplayDurationMs?: number;
  backgroundDurationMs?: number;
  lobbyDurationMs?: number;
  unfilteredAvgFps?: number;
}

export interface LiveFpsSnapshot {
  currentFps: number;
  isLoading: boolean;
  frameCount: number;
  captureDurationMs: number;
  gameId: string;
  pid: number;
  node?: any;
  hardware?: any;
  shareEligible: boolean;
  isFocused?: boolean;
  inLobby?: boolean;
}

export interface PlaySessionRecord {
  gameId: string;
  gameTitle?: string;
  startTime: number;
  endTime: number;
  launchedByOtix?: boolean;
  fpsStats?: FpsStats | null;
  node?: any;
  hardware?: any;
  shareEligible?: boolean;
}

export interface PlaytimeRecord {
  totalMinutes: number;
  sessionCount: number;
  lastPlayed: number | null;
  lastFpsStats: FpsStats | null;
}

export interface FilterResult {
  gameplayFrames: number[];
  totalFrames: number;
  gameplayFramesCount: number;
  captureDurationMs: number;
  gameplayDurationMs: number;
  loadingDurationMs: number;
  backgroundDurationMs: number;
  lobbyDurationMs: number;
  unfilteredAvgFps: number;
}

const MAX_FRAMES = 36000; // ~10 min at 60 fps
const MAX_SESSIONS = 100;
const FPS_POLL_MS = 500;
const WINDOW_MS = 1000;

const INTERFERING_SESSIONS = [
  'PresentMon', 'OtixCapture', 'FPS_Capture', 'GraphicsPerfMonitorSession',
];
const GAMING_SERVICES = ['GamingServices', 'GamingServicesNet'];

export const TAG_BACKGROUND = 1 << 0;
export const TAG_LOADING_STALL = 1 << 1;
export const TAG_LOADING_BLOCK = 1 << 2;
export const TAG_WARMUP = 1 << 3;
export const TAG_EXPLICIT_LOBBY = 1 << 4;
export const TAG_HEURISTIC_LOBBY = 1 << 5;

// Standard menu/lobby FPS caps common across PC games (e.g. CS2, CoD, Apex, Overwatch, Fortnite)
const COMMON_MENU_CAPS = [30, 60, 120, 144, 165, 200, 240];

export interface IForegroundWatcher {
  start(): void;
  stop(): void;
  getForegroundPid(): number;
  isFocused(targetPid: number): boolean;
}

/**
 * Monitors the Windows foreground window to detect when the active game window
 * loses focus (Alt-Tab, clicked away, minimized). Uses a lightweight persistent
 * PowerShell helper with user32.dll P/Invoke, emitting only on foreground PID change.
 */
export class WindowsForegroundWatcher implements IForegroundWatcher {
  private child: ChildProcess | null = null;
  private rl: ReturnType<typeof createInterface> | null = null;
  private currentPid = 0;
  private running = false;

  public start(): void {
    if (this.running || process.platform !== 'win32') return;
    this.running = true;

    const psScript = `
$sig = @'
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
public static uint GetFg() {
    IntPtr h = GetForegroundWindow();
    uint pid = 0;
    GetWindowThreadProcessId(h, out pid);
    return pid;
}
'@
Add-Type -MemberDefinition $sig -Name "FgWin" -Namespace "OtixNative"
$last = -1
while ($true) {
    $fg = [OtixNative.FgWin]::GetFg()
    if ($fg -ne $last) {
        $last = $fg
        [Console]::WriteLine($fg)
    }
    Start-Sleep -Milliseconds 200
}
`;

    try {
      this.child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      });

      this.rl = createInterface({ input: this.child.stdout! });
      this.rl.on('line', (line) => {
        const val = parseInt(line.trim(), 10);
        if (!isNaN(val)) {
          this.currentPid = val;
        }
      });

      this.child.on('error', () => {
        this.stop();
      });

      this.child.on('exit', () => {
        if (this.rl) {
          try {
            this.rl.close();
          } catch {}
          this.rl = null;
        }
        this.child = null;
        this.running = false;
      });
    } catch {
      this.running = false;
    }
  }

  public stop(): void {
    this.running = false;
    if (this.rl) {
      try {
        this.rl.close();
      } catch {}
      this.rl = null;
    }
    if (this.child) {
      try {
        this.child.kill();
      } catch {
        // Ignore kill errors
      }
      this.child = null;
    }
  }

  public getForegroundPid(): number {
    return this.currentPid;
  }

  public isFocused(targetPid: number): boolean {
    if (process.platform !== 'win32') return true;
    if (targetPid <= 0) return true;
    // When 0 (unresolved / no foreground window), assume focused to avoid false drops
    if (this.currentPid === 0) return true;
    return this.currentPid === targetPid;
  }
}

interface InternalActiveSession {
  process: ChildProcess;
  pid: number;
  samples: FrameSample[];
  frameTimesMs: number[];
  startWallMs: number;
  gameId: string;
  sessionName: string;
  node?: any;
  hardware?: any;
  shareEligible?: boolean;
}

/**
 * Evaluates loading block candidates (contiguous low-FPS periods).
 */
function evalLoadingBlock(samples: FrameSample[], tags: Uint8Array, start: number, end: number, durationMs: number): void {
  if (durationMs < 1000.0) return;
  const count = end - start;
  if (count <= 0) return;
  const avgFps = (count / durationMs) * 1000.0;
  if (avgFps < 15.0) {
    for (let k = start; k < end; k++) {
      tags[k] |= TAG_LOADING_BLOCK;
    }
  }
}

/**
 * Filter raw frame samples to separate active gameplay from:
 * 1. Background / Alt-Tab throttled periods
 * 2. Asset loading screens & hard stalls
 * 3. Initial warmup stutter
 * 4. Lobby / Menu waiting periods (both GSI-tagged and generic statistical heuristics for ALL games)
 */
export function filterFrameSamples(samples: FrameSample[], sessionStartMs?: number): FilterResult {
  const n = samples.length;
  if (n === 0) {
    return {
      gameplayFrames: [],
      totalFrames: 0,
      gameplayFramesCount: 0,
      captureDurationMs: 0,
      gameplayDurationMs: 0,
      loadingDurationMs: 0,
      backgroundDurationMs: 0,
      lobbyDurationMs: 0,
      unfilteredAvgFps: 0,
    };
  }

  const tags = new Uint8Array(n);
  const startMs = sessionStartMs || (samples[0]?.ts ?? 0);
  let totalMs = 0;

  // 1. Tag background, warmup, explicit lobby, and hard stalls (>= 200ms)
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    totalMs += s.ms;

    if (s.isBg) {
      tags[i] |= TAG_BACKGROUND;
    }
    if (s.ms >= 200.0) {
      tags[i] |= TAG_LOADING_STALL;
    }
    if (s.isLobby) {
      tags[i] |= TAG_EXPLICIT_LOBBY;
    }
  }

  // 2. Tag sustained low-FPS loading screens (< 25 FPS spanning >= 1.0s with avg < 15 FPS)
  let blockStart = -1;
  let blockDuration = 0;
  for (let i = 0; i < n; i++) {
    if ((tags[i] & TAG_BACKGROUND) !== 0) {
      if (blockStart !== -1) {
        evalLoadingBlock(samples, tags, blockStart, i, blockDuration);
        blockStart = -1;
        blockDuration = 0;
      }
      continue;
    }

    const fps = samples[i].ms > 0 ? 1000.0 / samples[i].ms : 0;
    if (fps < 25.0) {
      if (blockStart === -1) {
        blockStart = i;
        blockDuration = 0;
      }
      blockDuration += samples[i].ms;
    } else {
      if (blockStart !== -1) {
        evalLoadingBlock(samples, tags, blockStart, i, blockDuration);
        blockStart = -1;
        blockDuration = 0;
      }
    }
  }
  if (blockStart !== -1) {
    evalLoadingBlock(samples, tags, blockStart, n, blockDuration);
  }

  // 3. Generic statistical lobby & menu detection for ALL games
  // Evaluates candidate gameplay frames in temporal blocks (~3s windows).
  // Detects:
  // (a) Locked menu FPS caps (e.g. exactly 60, 120, 144, 200 FPS with near-zero frame time variance)
  // (b) Distinct lower-FPS plateau clusters vs the active gameplay tier (e.g. CS2 lobby 120/200 vs in-game 260-300)
  interface WindowMeta {
    startIdx: number;
    endIdx: number;
    meanFps: number;
    cov: number;
    isCapLocked: boolean;
  }

  const candidateIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    // Only analyze frames that are not background, not loading, not warmup, not explicit lobby
    if ((tags[i] & (TAG_BACKGROUND | TAG_LOADING_STALL | TAG_LOADING_BLOCK | TAG_WARMUP | TAG_EXPLICIT_LOBBY)) === 0) {
      candidateIndices.push(i);
    }
  }

  if (candidateIndices.length >= 40) {
    const windows: WindowMeta[] = [];
    let curIndices: number[] = [];
    let curWindowMs = 0;

    const flushWin = () => {
      if (curIndices.length >= 15) {
        const fpsVals: number[] = [];
        let sumFps = 0;
        for (const cidx of curIndices) {
          const f = samples[cidx].ms > 0 ? 1000.0 / samples[cidx].ms : 0;
          fpsVals.push(f);
          sumFps += f;
        }
        const mean = sumFps / fpsVals.length;
        let sumSqDiff = 0;
        for (const f of fpsVals) {
          const diff = f - mean;
          sumSqDiff += diff * diff;
        }
        const variance = sumSqDiff / fpsVals.length;
        const stdDev = Math.sqrt(variance);
        const cov = mean > 0 ? stdDev / mean : 0;

        // Check if mean is within 2.5% of a standard menu cap with ultra-low variance (CoV < 3.5%)
        const isCapLocked = COMMON_MENU_CAPS.some((cap) => Math.abs(mean - cap) / cap <= 0.025) && cov < 0.035;

        windows.push({
          startIdx: curIndices[0],
          endIdx: curIndices[curIndices.length - 1],
          meanFps: mean,
          cov,
          isCapLocked,
        });
      }
      curIndices = [];
      curWindowMs = 0;
    };

    for (let ci = 0; ci < candidateIndices.length; ci++) {
      const idx = candidateIndices[ci];
      const ms = samples[idx].ms;

      if (curIndices.length >= 15) {
        const prevMs = samples[curIndices[curIndices.length - 1]].ms;
        const minMs = Math.min(ms, prevMs);
        if (minMs > 0 && Math.abs(ms - prevMs) / minMs > 0.40) {
          // Phase step change (e.g. transition from lobby to in-game match)
          flushWin();
        }
      }

      curIndices.push(idx);
      curWindowMs += ms;

      if (curWindowMs >= 2500.0 || ci === candidateIndices.length - 1) {
        flushWin();
      }
    }

    if (windows.length >= 3) {
      // Find the active gameplay performance tier (75th percentile of window means)
      const sortedMeans = [...windows.map((w) => w.meanFps)].sort((a, b) => a - b);
      const p75 = sortedMeans[Math.floor(sortedMeans.length * 0.75)];
      const minMean = sortedMeans[0];

      // Only apply lobby/menu plateau separation if a distinct higher gameplay tier exists
      // (prevents stripping gameplay in fixed 60 FPS games like Elden Ring or Fighting Games)
      const hasDistinctGameplayTier = p75 >= minMean * 1.25;

      if (hasDistinctGameplayTier) {
        let lobbyTaggedCount = 0;
        const lobbyCandidateWindows: WindowMeta[] = [];

        for (const w of windows) {
          // Window is significantly lower than the active gameplay tier (< 80% of p75)
          const isLowerPlateau = w.meanFps <= p75 * 0.80;

          if (isLowerPlateau && (w.isCapLocked || w.cov < 0.06)) {
            lobbyCandidateWindows.push(w);
            lobbyTaggedCount += (w.endIdx - w.startIdx + 1);
          }
        }

        // Guardrail: if tagging lobby windows would eliminate all or almost all candidate frames (> 85%),
        // the session was entirely spent in the menu/lobby; do not discard them from gameplay stats.
        if (lobbyTaggedCount < candidateIndices.length * 0.85 && (candidateIndices.length - lobbyTaggedCount) >= 15) {
          for (const w of lobbyCandidateWindows) {
            for (let k = w.startIdx; k <= w.endIdx; k++) {
              if ((tags[k] & (TAG_BACKGROUND | TAG_LOADING_STALL | TAG_LOADING_BLOCK)) === 0) {
                tags[k] |= TAG_HEURISTIC_LOBBY;
              }
            }
          }
        }
      }
    }
  }

  // 4. Partition frames and accumulate durations
  let backgroundMs = 0;
  let loadingMs = 0;
  let lobbyMs = 0;
  let gameplayMs = 0;
  const gameplayFrames: number[] = [];

  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const isBg = (tags[i] & TAG_BACKGROUND) !== 0;
    const isLoading = (tags[i] & (TAG_LOADING_STALL | TAG_LOADING_BLOCK)) !== 0;
    const isLobby = (tags[i] & (TAG_EXPLICIT_LOBBY | TAG_HEURISTIC_LOBBY)) !== 0;

    if (isBg) {
      backgroundMs += s.ms;
    } else if (isLoading) {
      loadingMs += s.ms;
    } else if (isLobby) {
      lobbyMs += s.ms;
    } else {
      gameplayFrames.push(s.ms);
      gameplayMs += s.ms;
    }
  }

  // Graceful fallback: if no pure gameplay frames survived filtering,
  // fall back to non-background frames so avgFps is never missing or zero
  if (gameplayFrames.length === 0) {
    for (let i = 0; i < n; i++) {
      if ((tags[i] & TAG_BACKGROUND) === 0) {
        gameplayFrames.push(samples[i].ms);
        gameplayMs += samples[i].ms;
      }
    }
    // If still empty (entire session was in background), fall back to all frames
    if (gameplayFrames.length === 0) {
      for (let i = 0; i < n; i++) {
        gameplayFrames.push(samples[i].ms);
        gameplayMs += samples[i].ms;
      }
    }
  }

  const unfilteredAvgFps = totalMs > 0 ? (n / totalMs) * 1000 : 0;

  return {
    gameplayFrames,
    totalFrames: n,
    gameplayFramesCount: gameplayFrames.length,
    captureDurationMs: Math.round(totalMs),
    gameplayDurationMs: Math.round(gameplayMs),
    loadingDurationMs: Math.round(loadingMs),
    backgroundDurationMs: Math.round(backgroundMs),
    lobbyDurationMs: Math.round(lobbyMs),
    unfilteredAvgFps: Math.round(unfilteredAvgFps * 10) / 10,
  };
}

export class FpsCaptureService {
  private presentMonPath: string | null | undefined = undefined;
  private activeSessions = new Map<string, InternalActiveSession>();
  private pollTimer: NodeJS.Timeout | null = null;
  private sessionsPath: string;
  private targetWebContents: WebContents | null = null;
  private foregroundWatcher: IForegroundWatcher = new WindowsForegroundWatcher();
  private lobbyStates = new Map<string, boolean>();

  constructor(private readonly userDataPath: string) {
    this.sessionsPath = path.join(userDataPath, 'play-sessions.json');
  }

  public setWebContents(wc: WebContents | null): void {
    this.targetWebContents = wc;
  }

  public setForegroundWatcher(watcher: IForegroundWatcher): void {
    this.foregroundWatcher = watcher;
  }

  public setLobbyState(gameId: string, inLobby: boolean): void {
    if (!gameId) return;
    this.lobbyStates.set(gameId.toLowerCase(), inLobby);
  }

  public isProcessInLobby(gameId: string, _pid?: number): boolean {
    if (!gameId) return false;
    const lower = gameId.toLowerCase();
    if (this.lobbyStates.has(lower)) {
      return Boolean(this.lobbyStates.get(lower));
    }
    // Check aliases
    for (const [key, val] of this.lobbyStates) {
      if (lower.includes(key) || key.includes(lower)) {
        return val;
      }
    }
    return false;
  }

  public isProcessFocused(pid: number): boolean {
    return this.foregroundWatcher.isFocused(pid);
  }

  /**
   * Connects Cs2GsiManager to automatically keep CS2 lobby state synchronized
   * during FPS capture.
   */
  public setCs2GsiManager(manager: { on: (event: string, cb: (state: any) => void) => any; getState?: () => any }): void {
    if (!manager || typeof manager.on !== 'function') return;

    const handleUpdate = (state: any) => {
      const inLobby = !state || !state.isInGame || state.activity === 'menu';
      this.setLobbyState('cs2', inLobby);
      this.setLobbyState('csgo', inLobby);
      this.setLobbyState('counter_strike_2', inLobby);
      this.setLobbyState('counter-strike 2', inLobby);

      for (const [gid] of this.activeSessions) {
        const lower = gid.toLowerCase();
        if (lower.includes('cs2') || lower.includes('csgo') || lower.includes('counter-strike') || lower.includes('counter_strike')) {
          this.setLobbyState(gid, inLobby);
        }
      }
    };

    manager.on('update', handleUpdate);
    if (manager.getState) {
      try {
        const current = manager.getState();
        if (current) handleUpdate(current);
      } catch {
        // Ignore
      }
    }
  }

  public findPresentMon(): string | null {
    if (process.platform !== 'win32') {
      this.presentMonPath = null;
      return null;
    }
    if (this.presentMonPath !== undefined) return this.presentMonPath;

    const paths: string[] = [];
    const userData = this.userDataPath || (app ? app.getPath('userData') : null) || path.join(process.env.APPDATA || '', 'Otix');

    if (userData) {
      paths.push(
        path.join(userData, 'bin', 'PresentMon.exe'),
        path.join(userData, 'PresentMon', 'PresentMon.exe'),
      );
    }

    try {
      if (process.resourcesPath) {
        paths.push(path.join(process.resourcesPath, 'bin', 'PresentMon.exe'));
      }
    } catch {
      // Ignore
    }

    paths.push(
      path.join(__dirname, '..', 'bin', 'PresentMon.exe'),
      path.join(process.cwd(), 'desktop', 'bin', 'PresentMon.exe'),
      path.join(process.cwd(), 'bin', 'PresentMon.exe'),
    );

    paths.push(
      path.join(process.env['LOCALAPPDATA'] || '', 'Programs', 'Otix', 'resources', 'bin', 'PresentMon.exe'),
      path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Otix', 'resources', 'bin', 'PresentMon.exe'),
      path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'PresentMon', 'PresentMon.exe'),
      path.join(process.env['LOCALAPPDATA'] || '', 'PresentMon', 'PresentMon.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Intel', 'PresentMon', 'PresentMon.exe'),
      path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'NVIDIA Corporation', 'FrameViewSDK', 'PresentMon.exe'),
    );

    for (const p of paths) {
      try {
        if (p && fs.existsSync(p)) {
          this.presentMonPath = p;
          return p;
        }
      } catch {
        // Ignore
      }
    }

    if (process.platform === 'win32') {
      try {
        const result = execSync('where PresentMon 2>nul', { encoding: 'utf-8', timeout: 3000 });
        const first = result.trim().split(/\r?\n/)[0]?.trim();
        if (first && fs.existsSync(first)) {
          this.presentMonPath = first;
          return first;
        }
      } catch {
        // Ignore
      }
    }

    this.presentMonPath = null;
    return null;
  }

  public isAvailable(): boolean {
    return this.findPresentMon() !== null;
  }

  public isCapturing(): boolean {
    return this.activeSessions.size > 0;
  }

  private cleanupEtwSessions(): void {
    for (const name of GAMING_SERVICES) {
      try { execSync(`sc stop "${name}" 2>nul`, { timeout: 5000, windowsHide: true }); } catch {}
    }
    for (const name of INTERFERING_SESSIONS) {
      try { execSync(`logman stop "${name}" -ets 2>nul`, { timeout: 3000, windowsHide: true }); } catch {}
    }
  }

  private restoreGamingServices(): void {
    for (const name of GAMING_SERVICES) {
      try { execSync(`sc start "${name}" 2>nul`, { timeout: 5000, windowsHide: true }); } catch {}
    }
  }

  private parseFrameTime(line: string, colIndex: Map<string, number>, targetPid?: number): number | null {
    const cols = line.trim().split(',');

    if (targetPid !== undefined) {
      const pidIdx = colIndex.get('processid');
      if (pidIdx === undefined) return null;
      if (parseInt(cols[pidIdx], 10) !== targetPid) return null;
    }

    const msIdx = colIndex.get('msbetweenpresents');
    if (msIdx === undefined) return null;

    const val = parseFloat(cols[msIdx]);
    return Number.isFinite(val) && val > 0 && val <= 5000 ? val : null;
  }

  /**
   * Computes comprehensive benchmark statistics. Accepts either an array of raw frame times (ms)
   * or rich FrameSample objects with background and lobby state metadata.
   */
  public computeStats(input: (number | FrameSample)[], sessionStartMs?: number): FpsStats | null {
    if (!input || input.length === 0) return null;

    let samples: FrameSample[];
    if (typeof input[0] === 'number') {
      let curTs = sessionStartMs || Date.now();
      samples = (input as number[]).map((ms) => {
        curTs += ms;
        return {
          ms,
          ts: curTs,
          isBg: false,
          isLobby: false,
        };
      });
    } else {
      samples = input as FrameSample[];
    }

    const filtered = filterFrameSamples(samples, sessionStartMs);
    const { gameplayFrames } = filtered;
    if (gameplayFrames.length === 0) return null;

    const totalGameplayMs = gameplayFrames.reduce((s, v) => s + v, 0);
    const avgFps = totalGameplayMs > 0 ? (gameplayFrames.length / totalGameplayMs) * 1000 : 0;

    const fpsValues = gameplayFrames.map((ms) => (ms > 0 ? 1000 / ms : 0)).sort((a, b) => a - b);
    const gn = fpsValues.length;

    const onePctCount = Math.max(1, Math.round(gn * 0.01));
    const onePctSlice = fpsValues.slice(0, onePctCount);
    const onePercentLow = onePctSlice.reduce((s, v) => s + v, 0) / onePctSlice.length;

    const dotOnePctCount = Math.max(1, Math.round(gn * 0.001));
    const dotOnePctSlice = fpsValues.slice(0, dotOnePctCount);
    const zeroPointOnePercentLow = dotOnePctSlice.reduce((s, v) => s + v, 0) / dotOnePctSlice.length;

    return {
      avgFps: Math.round(avgFps * 10) / 10,
      onePercentLow: Math.round(onePercentLow * 10) / 10,
      zeroPointOnePercentLow: Math.round(zeroPointOnePercentLow * 10) / 10,
      maxFps: Math.round(fpsValues[gn - 1] * 10) / 10,
      minFps: Math.round(fpsValues[0] * 10) / 10,
      totalFrames: filtered.totalFrames,
      gameplayFrames: filtered.gameplayFramesCount,
      loadingDurationMs: filtered.loadingDurationMs,
      captureDurationMs: filtered.captureDurationMs,
      gameplayDurationMs: filtered.gameplayDurationMs,
      backgroundDurationMs: filtered.backgroundDurationMs,
      lobbyDurationMs: filtered.lobbyDurationMs,
      unfilteredAvgFps: filtered.unfilteredAvgFps,
    };
  }

  public getLiveFps(gameId?: string): LiveFpsSnapshot | null {
    if (gameId && this.activeSessions.has(gameId)) {
      return this.getLiveFpsForSession(this.activeSessions.get(gameId)!);
    }
    for (const session of this.activeSessions.values()) {
      const snap = this.getLiveFpsForSession(session);
      if (snap) return snap;
    }
    return null;
  }

  private getLiveFpsForSession(session: InternalActiveSession): LiveFpsSnapshot | null {
    if (!session) return null;
    const { samples, startWallMs, gameId, pid, node, hardware, shareEligible } = session;
    const elapsed = Date.now() - startWallMs;

    let windowSum = 0;
    let windowCount = 0;
    for (let i = samples.length - 1; i >= 0; i--) {
      windowSum += samples[i].ms;
      windowCount++;
      if (windowSum >= WINDOW_MS) break;
    }

    if (windowCount === 0) return null;

    const fps = windowSum > 0 ? Math.round((windowCount / windowSum) * 10000) / 10 : 0;
    const lastSample = samples[samples.length - 1];
    const isLoading = (lastSample.ms >= 200) || (windowSum >= 800 && fps < 15);
    const isFocused = !lastSample.isBg;
    const inLobby = lastSample.isLobby;

    return {
      currentFps: fps,
      isLoading,
      frameCount: samples.length,
      captureDurationMs: elapsed,
      gameId,
      pid,
      node: node || null,
      hardware: hardware || null,
      shareEligible: Boolean(shareEligible),
      isFocused,
      inLobby,
    };
  }

  public startCapture(pid: number, gameId: string, processName?: string | null, metadata?: { node?: any; hardware?: any; shareEligible?: boolean }): boolean {
    const exePath = this.findPresentMon();
    if (!exePath) return false;

    const existing = this.activeSessions.get(gameId);
    if (existing && existing.pid === pid) {
      return true;
    }

    if (existing) {
      this.stopCapture(gameId);
    }

    // Ensure foreground watcher is running
    this.foregroundWatcher.start();

    const samples: FrameSample[] = [];
    const frameTimesMs: number[] = [];
    const sessionName = 'OtixPM_' + pid;

    const args = [
      '--output_stdout',
      '--session_name', sessionName,
      '--no_console_stats',
      '--process_id', String(pid),
    ];
    if (processName && typeof processName === 'string' && processName.toLowerCase().endsWith('.exe')) {
      args.push('--process_name', processName);
    }

    try {
      const child = spawn(exePath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let headerParsed = false;
      let colIndex = new Map<string, number>();
      const rl = createInterface({ input: child.stdout!, crlfDelay: Infinity });

      rl.on('line', (line) => {
        const cleaned = line.replace(/\0/g, '');
        const trimmed = cleaned.trim();
        if (!trimmed) return;

        if (!headerParsed) {
          if (trimmed.startsWith('Application') || trimmed.startsWith('ProcessID')) {
            colIndex = new Map(cleaned.split(',').map((c, i) => [c.trim().toLowerCase(), i]));
            headerParsed = true;
          }
          return;
        }

        const ft = this.parseFrameTime(trimmed, colIndex, pid);
        if (ft !== null) {
          const isBg = !this.isProcessFocused(pid);
          const isLobby = this.isProcessInLobby(gameId, pid);
          const sample: FrameSample = {
            ms: ft,
            ts: Date.now(),
            isBg,
            isLobby,
          };
          samples.push(sample);
          frameTimesMs.push(ft);

          if (samples.length > MAX_FRAMES) {
            samples.splice(0, samples.length - MAX_FRAMES);
            frameTimesMs.splice(0, frameTimesMs.length - MAX_FRAMES);
          }
        }
      });

      let stderrOutput = '';
      if (child.stderr) {
        child.stderr.on('data', (data) => {
          const msg = data.toString();
          stderrOutput += msg;
          const trimmed = msg.trim();
          if (trimmed && !trimmed.includes('warning:')) {
            console.log('[PresentMon]', trimmed);
          }
        });
      }

      child.on('exit', (code) => {
        rl.close();
        const isAccessDenied = code === 6 ||
          stderrOutput.toLowerCase().includes('access denied') ||
          stderrOutput.toLowerCase().includes('privilege');
        if (isAccessDenied && gameId) {
          this.emitPermissionNeeded({ pid, gameId });
        }
        this.activeSessions.delete(gameId);
        if (this.activeSessions.size === 0) {
          this.foregroundWatcher.stop();
          this.restoreGamingServices();
        }
      });

      child.on('error', (err) => {
        console.warn('[fps-capture] PresentMon spawn error:', err.message);
        this.activeSessions.delete(gameId);
        if (this.activeSessions.size === 0 && this.pollTimer) {
          clearInterval(this.pollTimer);
          this.pollTimer = null;
        }
      });

      const newSession: InternalActiveSession = {
        process: child,
        pid,
        samples,
        frameTimesMs,
        startWallMs: Date.now(),
        gameId: gameId || '',
        sessionName,
        node: metadata?.node || null,
        hardware: metadata?.hardware || null,
        shareEligible: metadata?.shareEligible ?? Boolean(metadata?.node?.installed || metadata?.hardware?.gpu),
      };
      this.activeSessions.set(gameId, newSession);

      if (!this.pollTimer) {
        this.pollTimer = setInterval(() => {
          for (const s of this.activeSessions.values()) {
            const snapshot = this.getLiveFpsForSession(s);
            if (snapshot) {
              this.emitLiveFps(snapshot);
            }
          }
          if (!this.isCapturing() && this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
          }
        }, FPS_POLL_MS);
      }

      return true;
    } catch (err: any) {
      console.warn('[fps-capture] Failed to start PresentMon:', err.message);
      return false;
    }
  }

  public stopCapture(gameId?: string): FpsStats | null {
    if (gameId) {
      const session = this.activeSessions.get(gameId);
      if (!session) return null;
      this.activeSessions.delete(gameId);
      try { session.process.kill('SIGTERM'); } catch {}
      if (this.activeSessions.size === 0) {
        this.foregroundWatcher.stop();
        this.restoreGamingServices();
        if (this.pollTimer) {
          clearInterval(this.pollTimer);
          this.pollTimer = null;
        }
      }
      if (session.samples && session.samples.length > 0) {
        return this.computeStats(session.samples, session.startWallMs);
      }
      return null;
    }

    let lastStats: FpsStats | null = null;
    for (const [, session] of this.activeSessions) {
      try { session.process.kill('SIGTERM'); } catch {}
      if (session.samples && session.samples.length > 0) {
        lastStats = this.computeStats(session.samples, session.startWallMs);
      }
    }
    this.activeSessions.clear();
    this.foregroundWatcher.stop();
    this.restoreGamingServices();
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    return lastStats;
  }

  public saveSession(session: PlaySessionRecord): void {
    try {
      const dir = path.dirname(this.sessionsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let sessions: PlaySessionRecord[] = [];
      try {
        sessions = JSON.parse(fs.readFileSync(this.sessionsPath, 'utf-8'));
      } catch {
        sessions = [];
      }

      const existingIdx = sessions.findIndex((s) => (
        s.gameId === session.gameId &&
        Math.abs((s.startTime || 0) - (session.startTime || 0)) <= 5000
      ));

      if (existingIdx >= 0) {
        sessions[existingIdx] = {
          ...sessions[existingIdx],
          ...session,
          node: session.node || sessions[existingIdx].node || null,
          hardware: session.hardware || sessions[existingIdx].hardware || null,
          fpsStats: session.fpsStats || sessions[existingIdx].fpsStats || null,
          shareEligible: session.shareEligible ?? sessions[existingIdx].shareEligible ?? false,
        };
      } else {
        sessions.push(session);
      }

      if (sessions.length > MAX_SESSIONS) {
        sessions = sessions.slice(-MAX_SESSIONS);
      }

      fs.writeFileSync(this.sessionsPath, JSON.stringify(sessions, null, 2));
    } catch (err: any) {
      console.error('[fps-capture] Failed to save session:', err.message);
    }
  }

  public getRecentSessions(limit = 20): PlaySessionRecord[] {
    try {
      const data = fs.readFileSync(this.sessionsPath, 'utf-8');
      const sessions = JSON.parse(data) as PlaySessionRecord[];
      return sessions.slice(-Math.min(limit || 20, MAX_SESSIONS));
    } catch {
      return [];
    }
  }

  public getPlaytimeForGame(gameId: string): PlaytimeRecord {
    try {
      const data = fs.readFileSync(this.sessionsPath, 'utf-8');
      const sessions = JSON.parse(data) as PlaySessionRecord[];
      const gameSessions = sessions.filter((s) => s.gameId === gameId && s.endTime > s.startTime);
      const totalMs = gameSessions.reduce((sum, s) => sum + (s.endTime - s.startTime), 0);
      const withFps = gameSessions.filter((s) => s.fpsStats).sort((a, b) => b.endTime - a.endTime);
      return {
        totalMinutes: Math.round(totalMs / 60000),
        sessionCount: gameSessions.length,
        lastPlayed: gameSessions.length > 0 ? Math.max(...gameSessions.map((s) => s.endTime)) : null,
        lastFpsStats: withFps.length > 0 ? withFps[0].fpsStats || null : null,
      };
    } catch {
      return { totalMinutes: 0, sessionCount: 0, lastPlayed: null, lastFpsStats: null };
    }
  }

  public fixPermissions(): { success: boolean; needRestart?: boolean; error?: string } {
    try {
      const userData = this.userDataPath || (app ? app.getPath('userData') : null) || path.join(process.env.APPDATA || '', 'Otix');
      if (!fs.existsSync(userData)) {
        try { fs.mkdirSync(userData, { recursive: true }); } catch {}
      }
      const psFile = path.join(userData, 'fix-fps-permissions.ps1');
      const psContent =
        'try {\n' +
        '  net localgroup "Performance Log Users" $env:USERNAME /add\n' +
        '  Write-Output "OK"\n' +
        '} catch { Write-Error $_.Exception.Message; exit 1 }\n';
      fs.writeFileSync(psFile, psContent, 'utf-8');
      execSync(
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \\"${psFile}\\"' -WindowStyle Hidden -Wait"`,
        { timeout: 120000 },
      );
      try { fs.unlinkSync(psFile); } catch {}
      return { success: true, needRestart: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public handleGameStarted(entry: { game?: any; gameId?: string; pid?: number; processName?: string; node?: any; hardware?: any; shareEligible?: boolean }): void {
    if (!entry || !entry.pid) return;
    const gameId = entry.game?.id || entry.gameId || '';
    if (!gameId) return;

    const procName = (typeof entry.processName === 'string' && entry.processName.toLowerCase().endsWith('.exe')) ? entry.processName : null;
    this.startCapture(entry.pid, gameId, procName, {
      node: entry.node || null,
      hardware: entry.hardware || null,
      shareEligible: entry.shareEligible,
    });
  }

  public handleGameStopped(entry: { game?: any; gameId?: string; gameTitle?: string; startTime?: number; endTime?: number; launchedByOtix?: boolean; node?: any; hardware?: any; shareEligible?: boolean }): void {
    const gameId = entry?.gameId || entry?.game?.id;
    if (!gameId) return;

    const existingSession = this.activeSessions.get(gameId);
    const fpsStats = this.stopCapture(gameId);

    const nodeInfo = entry.node || (existingSession ? existingSession.node : null);
    const hardwareInfo = entry.hardware || (existingSession ? existingSession.hardware : null);
    const shareEligible = entry.shareEligible ?? (existingSession ? existingSession.shareEligible : Boolean(nodeInfo?.installed || hardwareInfo?.gpu));

    const session: PlaySessionRecord = {
      gameId,
      gameTitle: entry.gameTitle || entry.game?.title || '',
      startTime: entry.startTime || (existingSession ? existingSession.startWallMs : 0),
      endTime: entry.endTime || Date.now(),
      launchedByOtix: entry.launchedByOtix || false,
      fpsStats: fpsStats || null,
      node: nodeInfo || null,
      hardware: hardwareInfo || null,
      shareEligible: Boolean(shareEligible),
    };

    this.saveSession(session);
    this.emitFpsStats({
      gameId,
      fpsStats: fpsStats || null,
      node: nodeInfo || null,
      hardware: hardwareInfo || null,
      shareEligible: Boolean(shareEligible),
    });
  }

  private emitLiveFps(payload: LiveFpsSnapshot): void {
    eventBus.emit('fps:live', payload);
    if (this.targetWebContents && !this.targetWebContents.isDestroyed()) {
      try {
        this.targetWebContents.send('game:fps', payload);
      } catch {
        // webContents destroyed
      }
    }
  }

  private emitFpsStats(payload: { gameId: string; fpsStats: FpsStats | null; node?: any; hardware?: any; shareEligible?: boolean }): void {
    eventBus.emit('fps:stats', payload);
    if (this.targetWebContents && !this.targetWebContents.isDestroyed()) {
      try {
        this.targetWebContents.send('game:fps-stats', payload);
        this.targetWebContents.send('game:sessions-updated', payload);
      } catch {
        // webContents destroyed
      }
    }
  }

  private emitPermissionNeeded(payload: { pid: number; gameId: string }): void {
    eventBus.emit('fps:permission-needed', payload);
    if (this.targetWebContents && !this.targetWebContents.isDestroyed()) {
      try {
        this.targetWebContents.send('fps:permission-needed', payload);
      } catch {
        // webContents destroyed
      }
    }
  }
}
