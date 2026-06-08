import { EventEmitter } from 'events';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import psList from 'ps-list';
import type { LocalGame } from './scanner';
import { updateLastPlayedAt } from './game-storage-service';

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

    if (pid) {
      this.trackedPids.add(pid);
      this.startProcessCheck();
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
    for (const [id, entry] of this.runningGames) {
      if (entry.pid) {
        try {
          process.kill(entry.pid, 0);
          alive.push(entry);
        } catch {
          this.endSession(entry);
          this.runningGames.delete(id);
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

  getPlaytimeForGame(gameId: string): { totalMinutes: number; sessionCount: number; lastPlayed: number | null } {
    try {
      const data = fs.readFileSync(this.sessionsPath, 'utf-8');
      const sessions: PlaySession[] = JSON.parse(data);
      const gameSessions = sessions.filter((s) => s.gameId === gameId && s.endTime > s.startTime);
      const totalMs = gameSessions.reduce((sum, s) => sum + (s.endTime - s.startTime), 0);
      return {
        totalMinutes: Math.round(totalMs / 60000),
        sessionCount: gameSessions.length,
        lastPlayed: gameSessions.length > 0 ? Math.max(...gameSessions.map((s) => s.endTime)) : null,
      };
    } catch {
      return { totalMinutes: 0, sessionCount: 0, lastPlayed: null };
    }
  }

  async scanRunningProcesses(): Promise<RunningGame[]> {
    if (this.library.length === 0) return [];

    try {
      const [processes, windowTitles] = await Promise.all([
        psList(),
        getWindowTitles(),
      ]);

      const runningNames = new Set(processes.map((p) => p.name.toLowerCase()));
      const currentlyRunning = new Set<string>();

      // 0. Check custom user mappings first
      this.checkMappings(processes, currentlyRunning);

      for (const game of this.library) {
        if (currentlyRunning.has(game.id)) continue;

        let found = false;

        // 1. Window title match (highest confidence)
        found = this.matchWindowTitle(game, windowTitles);

        // 2. Exact process name match
        if (!found) {
          const exeNames = this.getExeNames(game);
          for (const exeName of exeNames) {
            if (!exeName) continue;
            if (runningNames.has(exeName.toLowerCase())) {
              found = true;
              break;
            }
          }
        }

        // 3. Fuzzy process name match
        if (!found) {
          found = this.fuzzyMatch(game, runningNames);
        }

        if (found) {
          currentlyRunning.add(game.id);
          if (!this.runningGames.has(game.id)) {
            const entry: RunningGame = {
              game,
              startTime: Date.now(),
              launchedByOtix: false,
            };
            this.runningGames.set(game.id, entry);
            this.emit('game:started', entry);
          }
        }
      }

      // End sessions for game no longer detected
      for (const [id, entry] of this.runningGames) {
        if (!currentlyRunning.has(id) && !entry.launchedByOtix) {
          this.endSession(entry);
          this.runningGames.delete(id);
        }
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

  stopAll() {
    this.stopPeriodicScan();
    this.stopProcessCheck();
    for (const entry of this.runningGames.values()) {
      this.endSession(entry);
    }
    this.runningGames.clear();
  }

  // ── Manual mappings ──

  async getRunningProcesses(): Promise<DetectedProcess[]> {
    try {
      const [processes, windowTitles] = await Promise.all([
        psList(),
        getWindowTitles(),
      ]);

      return processes
        .filter((p) => !p.name.toLowerCase().startsWith('system') && p.name.toLowerCase() !== 'idle')
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
          this.emit('game:started', entry);
        }
      }
    }
  }

  // ── Private matching helpers ──

  private matchWindowTitle(game: LocalGame, windowTitles: Map<string, string>): boolean {
    const titleLower = game.title.toLowerCase();
    const normTitle = normalizeTitle(game.title);
    const titleWords = normTitle.split(/\s+/).filter((w) => w.length > 2);

    for (const [procKey, winTitle] of windowTitles) {
      const winLower = winTitle.toLowerCase();

      // Direct title match
      if (winLower.includes(titleLower)) return true;
      if (titleLower.includes(winLower) && winLower.length > 5) return true;

      // Normalized title match
      if (winLower.includes(normTitle)) return true;
      if (normTitle.length > 5 && normTitle.includes(winLower)) return true;

      // Word match: count how many title words appear in window title
      if (titleWords.length >= 2) {
        const matchCount = titleWords.filter((w) => winLower.includes(w)).length;
        if (matchCount >= Math.min(titleWords.length, 2)) return true;
      } else if (titleWords.length === 1) {
        if (winLower.includes(titleWords[0])) return true;
      }
    }

    return false;
  }

  private fuzzyMatch(game: LocalGame, runningNames: Set<string>): boolean {
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

    for (const procName of runningNames) {
      const procBase = procName.replace(/\.exe$/i, '').toLowerCase();

      // Candidate match
      if (candidates.some((c) => c.toLowerCase() === procName)) return true;

      // Normalized title as substring
      const normNoSpaces = norm.replace(/\s/g, '');
      if (normNoSpaces.length > 4 && procBase.includes(normNoSpaces)) return true;

      // Word match with lower threshold (1 match for short titles, 2 for long)
      const matchCount = titleWords.filter((w) => procBase.includes(w)).length;
      const threshold = titleWords.length <= 2 ? 1 : Math.min(2, titleWords.length);
      if (titleWords.length > 0 && matchCount >= threshold) return true;
    }

    return false;
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

  private startProcessCheck() {
    this.stopProcessCheck();
    this.processCheckTimer = setInterval(() => {
      let hasTrackedPid = false;
      for (const [id, entry] of this.runningGames) {
        if (entry.pid) {
          hasTrackedPid = true;
          try {
            process.kill(entry.pid, 0);
          } catch {
            this.endSession(entry);
            this.runningGames.delete(id);
          }
        }
      }
      if (!hasTrackedPid) {
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
    const session: PlaySession = {
      gameId: entry.game.id,
      gameTitle: entry.game.title,
      startTime: entry.startTime,
      endTime: Date.now(),
      launchedByOtix: entry.launchedByOtix,
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
