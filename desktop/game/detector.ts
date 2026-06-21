import { EventEmitter } from 'events';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import psList from 'ps-list';
import type { LocalGame } from './scanner';
import { updateLastPlayedAt } from './storage';
import { startFpsCapture, stopFpsCapture, isPresentMonAvailable, getLiveFps, isCapturing } from './fps';
import type { FpsStats, LiveFpsSnapshot } from './fps';

export interface RunningGame {
  game: LocalGame;
  startTime: number;
  launchedByOtix: boolean;
  pid?: number;
}

export interface PlaySession {
  gameId: string;
  gameTitle: string;
  startTime: number;
  endTime: number;
  launchedByOtix: boolean;
  fpsStats?: FpsStats | null;
}

export interface DetectedProcess {
  name: string;
  pid: number;
  windowTitle: string | null;
}

interface ProcessMapping {
  processName: string;
  gameId: string;
  gameTitle: string;
}

const MAX_SESSIONS = 100;
const SCAN_INTERVAL_MS = 30000;

/** Process names to ignore — non-game apps that shouldn't trigger FPS capture. */
const NON_GAME_PROCESSES = new Set([
  'wallpaper64.exe', 'wallpaper32.exe', 'wallpaper.exe',
  'explorer.exe', 'svchost.exe', 'runtimebroker.exe',
]);

function normalizeTitle(title: string): string {
  return title
    .replace(/\s*[-–—:]\s*(Definitive|GOTY|Game of the Year|Remastered|Enhanced|Ultimate|Complete|Anniversary|Collectors|Digital Deluxe|Special|Legendary)\s*(Edition)?\s*$/i, '')
    .replace(/[^a-z0-9\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function titleToExeCandidates(title: string): string[] {
  const normalized = normalizeTitle(title);
  const words = normalized.split(/\s+/).filter((w) => w.length > 2);
  const candidates: string[] = [];

  if (words.length === 0) return candidates;

  candidates.push(words.join('') + '.exe');
  candidates.push(words.map((w) => w[0].toUpperCase() + w.slice(1)).join('') + '.exe');

  if (words.length >= 2) {
    candidates.push(words.map((w) => w[0]).join('') + '.exe');
  }

  const mainWord = words[words.length - 1] || words[0];
  if (mainWord.length > 4) {
    candidates.push(mainWord + '.exe');
  }

  return candidates;
}

// Get processes with open windows via PowerShell
function getWindowTitles(): Promise<Map<string, string>> {
  return new Promise((resolve) => {
    exec(
      'powershell -NoProfile -Command "Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object ProcessName, Id, MainWindowTitle | ConvertTo-Json"',
      { timeout: 5000 },
      (error, stdout) => {
        if (error || !stdout) {
          resolve(new Map());
          return;
        }
        try {
          const data = JSON.parse(stdout);
          const map = new Map<string, string>();
          const items = Array.isArray(data) ? data : data ? [data] : [];
          for (const item of items) {
            if (item && item.ProcessName && item.MainWindowTitle) {
              const key = `${item.ProcessName.toLowerCase()}|${item.Id}`;
              map.set(key, item.MainWindowTitle);
            }
          }
          resolve(map);
        } catch {
          resolve(new Map());
        }
      },
    );
  });
}

export class GameDetector extends EventEmitter {
  private runningGames: Map<string, RunningGame> = new Map();
  private library: LocalGame[] = [];
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private sessionsPath: string;
  private mappingsPath: string;
  private mappings: ProcessMapping[] = [];
  private trackedPids = new Set<number>();
  private processCheckTimer: ReturnType<typeof setInterval> | null = null;
  private deadCheckTimer: ReturnType<typeof setInterval> | null = null;
  private fpsPollTimer: ReturnType<typeof setInterval> | null = null;
  /** Which game ID owns the active PresentMon FPS capture. */
  private fpsTargetGameId: string | null = null;
  /** Stashed FPS stats for games whose capture was ended by a new game taking priority. */
  private _pendingFpsStats = new Map<string, FpsStats>();

  constructor(sessionsDir: string) {
    super();
    this.sessionsPath = path.join(sessionsDir, 'play-sessions.json');
    this.mappingsPath = path.join(sessionsDir, 'game-mappings.json');
    this.loadMappings();
  }

  setLibrary(games: LocalGame[]) {
    this.library = games;
  }

  getLibrary(): LocalGame[] {
    return [...this.library];
  }

  startTracking(game: LocalGame, pid?: number) {
    const entry: RunningGame = {
      game,
      startTime: Date.now(),
      launchedByOtix: pid != null,
      pid,
    };
    this.runningGames.set(game.id, entry);

    // Mark as just played so it sorts to top immediately
    updateLastPlayedAt(game.id, new Date().toISOString());

    if (pid) {
      this.trackedPids.add(pid);
      this.startProcessCheck(); this.startDeadCheck();
      // Start FPS capture if PresentMon is available
      if (isPresentMonAvailable()) {
        const exeName = game.exePath ? path.basename(game.exePath) : game.title;
        if (startFpsCapture(pid, game.id, exeName)) {
          this.startFpsPolling(game.id);
        }
      }
    }

    this.emit('game:started', entry);
  }

  stopTracking(gameId: string) {
    const entry = this.runningGames.get(gameId);
    if (entry) {
      this.endSession(entry);
      this.runningGames.delete(gameId);
    }
  }

  getRunningGames(): RunningGame[] {
    const alive: RunningGame[] = [];
    for (const [, entry] of this.runningGames) {
      if (entry.pid) {
        try {
          process.kill(entry.pid, 0);
          alive.push(entry);
        } catch {
          // PID dead — skip. Don't endSession here: game may have
          // transitioned to a new PID (launcher → game process).
          // scanRunningProcesses will re-detect or clean up.
        }
      } else {
        alive.push(entry);
      }
    }
    return alive;
  }

  getRunningGame(): RunningGame | null {
    const games = this.getRunningGames();
    return games.length > 0 ? games[0] : null;
  }

  getRecentSessions(limit = 20): PlaySession[] {
    try {
      const data = fs.readFileSync(this.sessionsPath, 'utf-8');
      const sessions: PlaySession[] = JSON.parse(data);
      return sessions.slice(-Math.min(limit, MAX_SESSIONS));
    } catch {
      return [];
    }
  }

  getPlaytimeForGame(gameId: string): { totalMinutes: number; sessionCount: number; lastPlayed: number | null; lastFpsStats: FpsStats | null } {
    try {
      const data = fs.readFileSync(this.sessionsPath, 'utf-8');
      const sessions: PlaySession[] = JSON.parse(data);
      const gameSessions = sessions.filter((s) => s.gameId === gameId && s.endTime > s.startTime);
      const totalMs = gameSessions.reduce((sum, s) => sum + (s.endTime - s.startTime), 0);
      // Find most recent session that has FPS stats
      const withFps = gameSessions.filter((s) => s.fpsStats).sort((a, b) => b.endTime - a.endTime);
      return {
        totalMinutes: Math.round(totalMs / 60000),
        sessionCount: gameSessions.length,
        lastPlayed: gameSessions.length > 0 ? Math.max(...gameSessions.map((s) => s.endTime)) : null,
        lastFpsStats: withFps.length > 0 ? withFps[0].fpsStats! : null,
      };
    } catch {
      return { totalMinutes: 0, sessionCount: 0, lastPlayed: null, lastFpsStats: null };
    }
  }

  async scanRunningProcesses(): Promise<RunningGame[]> {
    if (this.library.length === 0) return [];

    try {
      const [processes, windowTitles] = await Promise.all([
        psList(),
        getWindowTitles(),
      ]);

      // Build set of PIDs with visible windows
      const pidsWithWindows = new Set<number>();
      for (const [key] of windowTitles) {
        const pid = parseInt(key.split('|')[1], 10);
        if (!isNaN(pid)) pidsWithWindows.add(pid);
      }

      const currentlyRunning = new Set<string>();

      // 0. Check custom user mappings first
      this.checkMappings(processes, currentlyRunning);

      // Track best FPS candidate: prefer windowed games, fallback to last detected
      let fpsCandidate: { gameId: string; pid: number } | null = null;

      for (const game of this.library) {
        if (currentlyRunning.has(game.id)) continue;

        let detectedPid: number | undefined;

        // 1. Window title match (highest confidence)
        detectedPid = this.matchWindowTitle(game, windowTitles, processes);

        // 2. Exact process name match
        if (detectedPid === undefined) {
          const exeNames = this.getExeNames(game);
          for (const exeName of exeNames) {
            if (!exeName) continue;
            const proc = processes.find((p) => p.name.toLowerCase() === exeName.toLowerCase());
            if (proc) {
              detectedPid = proc.pid;
              break;
            }
          }
        }

        // 3. Fuzzy process name match
        if (detectedPid === undefined) {
          detectedPid = this.fuzzyMatchPid(game, processes);
        }

        // If matched a launcher process, check for a better renderer PID
        // (e.g. SB.exe launches SB-Win64-Shipping.exe which does actual rendering)
        if (detectedPid !== undefined) {
          const rendererPid = this.findRendererProcess(game, processes, detectedPid);
          if (rendererPid !== undefined) detectedPid = rendererPid;
        }

        if (detectedPid !== undefined) {
          // Skip if the detected process is a known non-game (e.g. wallpaper engine)
          const proc = processes.find((p) => p.pid === detectedPid);
          if (proc && (NON_GAME_PROCESSES.has(proc.name.toLowerCase()) || NON_GAME_PROCESSES.has(proc.name.toLowerCase() + '.exe'))) {
            continue;
          }
          currentlyRunning.add(game.id);
          const existing = this.runningGames.get(game.id);
          if (!existing) {
            // New game detected — start tracking
            const entry: RunningGame = {
              game,
              startTime: Date.now(),
              launchedByOtix: false,
              pid: detectedPid,
            };
            this.runningGames.set(game.id, entry);
            this.trackedPids.add(detectedPid);
            this.startProcessCheck(); this.startDeadCheck();
            this.emit('game:started', entry);
          } else if (existing.pid !== detectedPid) {
            // PID changed (e.g. launcher → game process) — update tracking
            const oldPid = existing.pid;
            existing.pid = detectedPid;
            if (oldPid) { this.trackedPids.delete(oldPid); }
            this.trackedPids.add(detectedPid);
            // Restart FPS capture only if this game owns the active capture
            if (this.fpsTargetGameId === game.id || !isCapturing()) {
              fpsCandidate = { gameId: game.id, pid: detectedPid };
            }
          }

          // Update FPS candidate — prefer windowed, else first detected wins
          const hasWin = pidsWithWindows.has(detectedPid);
          if (!fpsCandidate) {
            fpsCandidate = { gameId: game.id, pid: detectedPid };
          } else if (hasWin && !pidsWithWindows.has(fpsCandidate.pid)) {
            fpsCandidate = { gameId: game.id, pid: detectedPid };
          }
        }
      }

      // Start FPS capture for best candidate.
      // Don't switch away from a game that's still alive (prevents wallpaper engine flip-flop).
      if (fpsCandidate && isPresentMonAvailable()) {
        const currentAlive = this.fpsTargetGameId && isCapturing() &&
          this.runningGames.get(this.fpsTargetGameId)?.pid;
        const skipFps = currentAlive
          ? this.fpsTargetGameId === fpsCandidate.gameId  // only switch if same game (new PID)
          : this.fpsTargetGameId === fpsCandidate.gameId && isCapturing();
        if (!skipFps) {
          if (isCapturing()) {
            const lastStats = stopFpsCapture();
            if (lastStats) {
              // Stash stats for the old fps target's endSession, which runs next
              const oldTarget = this.fpsTargetGameId;
              if (oldTarget) this._pendingFpsStats.set(oldTarget, lastStats);
            }
          }
          if (startFpsCapture(fpsCandidate.pid, fpsCandidate.gameId)) {
            this.startFpsPolling(fpsCandidate.gameId);
          }
        }
      }

      // End sessions for game no longer detected (verify PID dead first)
      for (const [id, entry] of this.runningGames) {
        if (currentlyRunning.has(id)) continue;
        if (entry.launchedByOtix) continue;
        // PID still alive even though scan didn't match — keep session
        if (entry.pid) {
          try {
            process.kill(entry.pid, 0);
            currentlyRunning.add(id);
            continue;
          } catch {
            // PID is dead — end session below
          }
        }
        this.endSession(entry);
        this.runningGames.delete(id);
      }
    } catch (err) {
      console.error('[GameDetector] Process scan failed:', err);
    }

    return this.getRunningGames();
  }

  startPeriodicScan() {
    this.stopPeriodicScan();
    this.scanTimer = setInterval(() => {
      this.scanRunningProcesses();
    }, SCAN_INTERVAL_MS);
    this.scanRunningProcesses();
  }

  stopPeriodicScan() {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
  }

  /** Every 2s: if a tracked game's PID is dead, end the session. */
  private startDeadCheck() {
    if (this.deadCheckTimer) return;
    this.deadCheckTimer = setInterval(() => {
      for (const [id, entry] of this.runningGames) {
        if (!entry.pid) continue;
        try {
          process.kill(entry.pid, 0);
        } catch {
          this.endSession(entry);
          this.runningGames.delete(id);
        }
      }
      if (this.runningGames.size === 0 && this.deadCheckTimer) {
        clearInterval(this.deadCheckTimer);
        this.deadCheckTimer = null;
      }
    }, 2000);
  }

  private stopDeadCheck() {
    if (this.deadCheckTimer) {
      clearInterval(this.deadCheckTimer);
      this.deadCheckTimer = null;
    }
  }

  stopAll() {
    this.stopPeriodicScan();
    this.stopProcessCheck();
    this.stopDeadCheck();
    this.stopFpsPolling();
    for (const entry of this.runningGames.values()) {
      this.endSession(entry);
    }
    this.runningGames.clear();
  }

  // ── Live FPS polling (one game at a time, set by gameId) ──

  private startFpsPolling(gameId: string) {
    this.stopFpsPolling();
    this.fpsTargetGameId = gameId;
    this.fpsPollTimer = setInterval(() => {
      if (!isCapturing()) {
        this.fpsTargetGameId = null;
        this.stopFpsPolling();
        return;
      }
      const snapshot = getLiveFps();
      if (snapshot) this.emit('game:fps', snapshot);
    }, 500);
  }

  private stopFpsPolling() {
    if (this.fpsPollTimer) {
      clearInterval(this.fpsPollTimer);
      this.fpsPollTimer = null;
    }
    this.fpsTargetGameId = null;
  }

  // ── Manual mappings ──

  async getRunningProcesses(): Promise<DetectedProcess[]> {
    try {
      const [processes, windowTitles] = await Promise.all([
        psList(),
        getWindowTitles(),
      ]);

      return processes
        .filter((p) => {
          const name = p.name.toLowerCase();
          if (name.startsWith('system') || name === 'idle') return false;
          if (NON_GAME_PROCESSES.has(name) || NON_GAME_PROCESSES.has(name + '.exe')) return false;
          return true;
        })
        .map((p) => {
          let windowTitle: string | null = null;
          for (const [key, title] of windowTitles) {
            if (key.startsWith(p.name.toLowerCase() + '|')) {
              windowTitle = title;
              break;
            }
          }
          return {
            name: p.name,
            pid: p.pid,
            windowTitle,
          };
        })
        .sort((a, b) => {
          // Windowed processes first, then alphabetically
          if (a.windowTitle && !b.windowTitle) return -1;
          if (!a.windowTitle && b.windowTitle) return 1;
          return a.name.localeCompare(b.name);
        });
    } catch (err) {
      console.error('[GameDetector] getRunningProcesses failed:', err);
      return [];
    }
  }

  addMapping(processName: string, gameId: string, gameTitle: string) {
    // Remove any existing mapping for this process name
    this.mappings = this.mappings.filter((m) => m.processName !== processName);
    this.mappings.push({ processName, gameId, gameTitle });
    this.saveMappings();
  }

  removeMapping(processName: string) {
    this.mappings = this.mappings.filter((m) => m.processName !== processName);
    this.saveMappings();
  }

  getMappings(): ProcessMapping[] {
    return [...this.mappings];
  }

  // ── Private helpers ──

  private loadMappings() {
    try {
      if (fs.existsSync(this.mappingsPath)) {
        const data = fs.readFileSync(this.mappingsPath, 'utf-8');
        this.mappings = JSON.parse(data);
      }
    } catch {
      this.mappings = [];
    }
  }

  private saveMappings() {
    try {
      const dir = path.dirname(this.mappingsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.mappingsPath, JSON.stringify(this.mappings, null, 2));
    } catch (err) {
      console.error('[GameDetector] Failed to save mappings:', err);
    }
  }

  private checkMappings(processes: { name: string; pid: number }[], currentlyRunning: Set<string>) {
    for (const mapping of this.mappings) {
      const proc = processes.find(
        (p) => p.name.toLowerCase() === mapping.processName.toLowerCase(),
      );
      if (!proc) continue;

      currentlyRunning.add(mapping.gameId);
      if (!this.runningGames.has(mapping.gameId)) {
        const game = this.library.find((g) => g.id === mapping.gameId);
        if (game) {
          const entry: RunningGame = {
            game,
            startTime: Date.now(),
            launchedByOtix: false,
            pid: proc.pid,
          };
          this.runningGames.set(mapping.gameId, entry);
          this.trackedPids.add(proc.pid);
          this.startProcessCheck(); this.startDeadCheck();
          if (isPresentMonAvailable() && !isCapturing()) {
            if (startFpsCapture(proc.pid, game.id)) {
              this.startFpsPolling(game.id);
            }
          }
          this.emit('game:started', entry);
        }
      }
    }
  }

  // ── Private matching helpers ──

  // Returns the PID of the matched process, or undefined if no match.
  private matchWindowTitle(
    game: LocalGame,
    windowTitles: Map<string, string>,
    processes: { name: string; pid: number }[],
  ): number | undefined {
    const titleLower = game.title.toLowerCase();
    const normTitle = normalizeTitle(game.title);
    const titleWords = normTitle.split(/\s+/).filter((w) => w.length > 2);

    for (const [procKey, winTitle] of windowTitles) {
      const winLower = winTitle.toLowerCase();

      let matched = false;

      // Direct title match
      if (winLower.includes(titleLower)) matched = true;
      else if (titleLower.includes(winLower) && winLower.length > 5) matched = true;
      // Normalized title match
      else if (winLower.includes(normTitle)) matched = true;
      else if (normTitle.length > 5 && normTitle.includes(winLower)) matched = true;
      // Word match (whole-word boundaries to avoid substring false positives)
      else if (titleWords.length >= 2) {
        const matchCount = titleWords.filter((w) => {
          const re = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
          return re.test(winLower);
        }).length;
        matched = matchCount >= Math.min(titleWords.length, 2);
      } else if (titleWords.length === 1) {
        const re = new RegExp('\\b' + titleWords[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        matched = re.test(winLower);
      }

      if (matched) {
        // Extract process name from key (format: "processname|pid")
        const procName = procKey.split('|')[0];
        const proc = processes.find((p) => p.name.toLowerCase() === procName.toLowerCase());
        return proc?.pid;
      }
    }

    return undefined;
  }

  // Returns PID of matched process, or undefined.
  private fuzzyMatchPid(
    game: LocalGame,
    processes: { name: string; pid: number }[],
  ): number | undefined {
    const norm = normalizeTitle(game.title);
    const titleWords = norm.split(/\s+/).filter((w) => w.length > 2);
    const candidates = titleToExeCandidates(game.title);

    // Also check install directory basename
    if (game.installDir) {
      const dirName = path.basename(game.installDir).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (dirName.length > 3) {
        candidates.push(dirName + '.exe');
      }
    }

    for (const proc of processes) {
      const procName = proc.name.toLowerCase();
      const procBase = procName.replace(/\.exe$/i, '').toLowerCase();

      // Candidate match
      if (candidates.some((c) => c.toLowerCase() === procName)) return proc.pid;

      // Normalized title as substring
      const normNoSpaces = norm.replace(/\s/g, '');
      if (normNoSpaces.length > 4 && procBase.includes(normNoSpaces)) return proc.pid;

      // Word match with whole-word boundaries (avoid substring false positives)
      const matchCount = titleWords.filter((w) => {
        const re = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        return re.test(procBase);
      }).length;
      const threshold = titleWords.length <= 2 ? 1 : Math.min(2, titleWords.length);
      if (titleWords.length > 0 && matchCount >= threshold) return proc.pid;
    }

    return undefined;
  }

  private getExeNames(game: LocalGame): string[] {
    const names: string[] = [];
    if (game.exePath && !game.exePath.startsWith('steam://')) {
      names.push(path.basename(game.exePath));
    }
    if (game.localExePath) {
      names.push(path.basename(game.localExePath));
    }
    names.push(...titleToExeCandidates(game.title));
    return names;
  }

  /**
   * Check if a matched launcher process has a known renderer child.
   * Unreal Engine games often use a launcher (SB.exe) that spawns the real
   * renderer (SB-Win64-Shipping.exe). If found, return the renderer's PID.
   */
  private findRendererProcess(
    game: LocalGame,
    processes: { name: string; pid: number }[],
    _launcherPid: number,
  ): number | undefined {
    const norm = normalizeTitle(game.title);
    const normNoSpaces = norm.replace(/\s/g, '').toLowerCase();
    const nameNoSpaces = game.title.toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const proc of processes) {
      const pn = proc.name.toLowerCase().replace(/\.exe$/i, '');

      // UE4/5 renderer pattern: *-Win64-Shipping, *-Shipping
      const isRenderer = /-win64-shipping$/.test(pn) || /-shipping$/.test(pn);
      if (!isRenderer) continue;

      // Check if renderer name contains the game title (normalized)
      // e.g. "SB-Win64-Shipping" contains "SB"
      const pnNoSuffix = pn.replace(/-(win64-)?shipping$/i, '').toLowerCase();
      if (!pnNoSuffix) continue;

      // Direct match: renderer name contains game title
      if (pn.includes(nameNoSpaces) || pn.includes(normNoSpaces)) return proc.pid;

      // Exe name match: renderer matches one of the game's exe patterns
      const exeNames = this.getExeNames(game);
      if (exeNames.some((en) => pn.includes(en.replace(/\.exe$/i, '').toLowerCase()))) return proc.pid;
    }

    return undefined;
  }

  private startProcessCheck() {
    this.stopProcessCheck();
    this.processCheckTimer = setInterval(() => {
      let hasTrackedPid = false;
      for (const [, entry] of this.runningGames) {
        if (entry.pid) {
          try {
            process.kill(entry.pid, 0);
            hasTrackedPid = true;
          } catch {
            // PID dead — end session for non-Otix games immediately.
            // Otherwise wait for next scan (game may have moved PID).
            this.trackedPids.delete(entry.pid);
            if (!entry.launchedByOtix) {
              this.endSession(entry);
              this.runningGames.delete(entry.game.id);
              continue;
            }
            entry.pid = undefined;
          }
        }
      }
      if (!hasTrackedPid && this.runningGames.size > 0) {
        // Games in runningGames have no PIDs — re-check next cycle
      }
      if (this.runningGames.size === 0) {
        this.stopProcessCheck();
      }
    }, 5000);
  }

  private stopProcessCheck() {
    if (this.processCheckTimer) {
      clearInterval(this.processCheckTimer);
      this.processCheckTimer = null;
    }
  }

  private endSession(entry: RunningGame) {
    // Stop FPS polling and capture, grab final stats before saving session
    this.stopFpsPolling();
    const fpsStats = this._pendingFpsStats.get(entry.game.id) ?? stopFpsCapture();
    this._pendingFpsStats.delete(entry.game.id);

    const session: PlaySession = {
      gameId: entry.game.id,
      gameTitle: entry.game.title,
      startTime: entry.startTime,
      endTime: Date.now(),
      launchedByOtix: entry.launchedByOtix,
      fpsStats,
    };

    this.saveSession(session);
    updateLastPlayedAt(entry.game.id, new Date(session.endTime).toISOString());
    this.emit('game:ended', session);
  }

  private saveSession(session: PlaySession) {
    try {
      const dir = path.dirname(this.sessionsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let sessions: PlaySession[] = [];
      try {
        const data = fs.readFileSync(this.sessionsPath, 'utf-8');
        sessions = JSON.parse(data);
      } catch {
        // File doesn't exist or corrupted — start fresh
      }

      sessions.push(session);
      if (sessions.length > MAX_SESSIONS) {
        sessions = sessions.slice(-MAX_SESSIONS);
      }

      fs.writeFileSync(this.sessionsPath, JSON.stringify(sessions, null, 2));
    } catch (err) {
      console.error('[GameDetector] Failed to save session:', err);
    }
  }
}
