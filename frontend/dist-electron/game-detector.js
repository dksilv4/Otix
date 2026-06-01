"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameDetector = void 0;
const events_1 = require("events");
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ps_list_1 = __importDefault(require("ps-list"));
const MAX_SESSIONS = 100;
const SCAN_INTERVAL_MS = 30000;
function normalizeTitle(title) {
    return title
        .replace(/\s*[-–—:]\s*(Definitive|GOTY|Game of the Year|Remastered|Enhanced|Ultimate|Complete|Anniversary|Collectors|Digital Deluxe|Special|Legendary)\s*(Edition)?\s*$/i, '')
        .replace(/[^a-z0-9\s]/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}
function titleToExeCandidates(title) {
    const normalized = normalizeTitle(title);
    const words = normalized.split(/\s+/).filter((w) => w.length > 2);
    const candidates = [];
    if (words.length === 0)
        return candidates;
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
function getWindowTitles() {
    return new Promise((resolve) => {
        (0, child_process_1.exec)('powershell -NoProfile -Command "Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object ProcessName, Id, MainWindowTitle | ConvertTo-Json"', { timeout: 5000 }, (error, stdout) => {
            if (error || !stdout) {
                resolve(new Map());
                return;
            }
            try {
                const data = JSON.parse(stdout);
                const map = new Map();
                const items = Array.isArray(data) ? data : data ? [data] : [];
                for (const item of items) {
                    if (item && item.ProcessName && item.MainWindowTitle) {
                        const key = `${item.ProcessName.toLowerCase()}|${item.Id}`;
                        map.set(key, item.MainWindowTitle);
                    }
                }
                resolve(map);
            }
            catch {
                resolve(new Map());
            }
        });
    });
}
class GameDetector extends events_1.EventEmitter {
    runningGames = new Map();
    library = [];
    scanTimer = null;
    sessionsPath;
    mappingsPath;
    mappings = [];
    trackedPids = new Set();
    processCheckTimer = null;
    constructor(sessionsDir) {
        super();
        this.sessionsPath = path.join(sessionsDir, 'play-sessions.json');
        this.mappingsPath = path.join(sessionsDir, 'game-mappings.json');
        this.loadMappings();
    }
    setLibrary(games) {
        this.library = games;
    }
    getLibrary() {
        return [...this.library];
    }
    startTracking(game, pid) {
        const entry = {
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
    stopTracking(gameId) {
        const entry = this.runningGames.get(gameId);
        if (entry) {
            this.endSession(entry);
        }
    }
    getRunningGames() {
        const alive = [];
        for (const [id, entry] of this.runningGames) {
            if (entry.pid) {
                try {
                    process.kill(entry.pid, 0);
                    alive.push(entry);
                }
                catch {
                    this.endSession(entry);
                    this.runningGames.delete(id);
                }
            }
            else {
                alive.push(entry);
            }
        }
        return alive;
    }
    getRunningGame() {
        const games = this.getRunningGames();
        return games.length > 0 ? games[0] : null;
    }
    getRecentSessions(limit = 20) {
        try {
            const data = fs.readFileSync(this.sessionsPath, 'utf-8');
            const sessions = JSON.parse(data);
            return sessions.slice(-Math.min(limit, MAX_SESSIONS));
        }
        catch {
            return [];
        }
    }
    async scanRunningProcesses() {
        if (this.library.length === 0)
            return [];
        try {
            const [processes, windowTitles] = await Promise.all([
                (0, ps_list_1.default)(),
                getWindowTitles(),
            ]);
            const runningNames = new Set(processes.map((p) => p.name.toLowerCase()));
            const currentlyRunning = new Set();
            // 0. Check custom user mappings first
            this.checkMappings(processes, currentlyRunning);
            for (const game of this.library) {
                if (currentlyRunning.has(game.id))
                    continue;
                let found = false;
                // 1. Window title match (highest confidence)
                found = this.matchWindowTitle(game, windowTitles);
                // 2. Exact process name match
                if (!found) {
                    const exeNames = this.getExeNames(game);
                    for (const exeName of exeNames) {
                        if (!exeName)
                            continue;
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
                        const entry = {
                            game,
                            startTime: Date.now(),
                            launchedByOtix: false,
                        };
                        this.runningGames.set(game.id, entry);
                        this.emit('game:started', entry);
                    }
                }
            }
            // End sessions for games no longer detected
            for (const [id, entry] of this.runningGames) {
                if (!currentlyRunning.has(id) && !entry.launchedByOtix) {
                    this.endSession(entry);
                    this.runningGames.delete(id);
                }
            }
        }
        catch (err) {
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
    async getRunningProcesses() {
        try {
            const [processes, windowTitles] = await Promise.all([
                (0, ps_list_1.default)(),
                getWindowTitles(),
            ]);
            return processes
                .filter((p) => !p.name.toLowerCase().startsWith('system') && p.name.toLowerCase() !== 'idle')
                .map((p) => {
                let windowTitle = null;
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
                if (a.windowTitle && !b.windowTitle)
                    return -1;
                if (!a.windowTitle && b.windowTitle)
                    return 1;
                return a.name.localeCompare(b.name);
            });
        }
        catch (err) {
            console.error('[GameDetector] getRunningProcesses failed:', err);
            return [];
        }
    }
    addMapping(processName, gameId, gameTitle) {
        // Remove any existing mapping for this process name
        this.mappings = this.mappings.filter((m) => m.processName !== processName);
        this.mappings.push({ processName, gameId, gameTitle });
        this.saveMappings();
    }
    removeMapping(processName) {
        this.mappings = this.mappings.filter((m) => m.processName !== processName);
        this.saveMappings();
    }
    getMappings() {
        return [...this.mappings];
    }
    // ── Private helpers ──
    loadMappings() {
        try {
            if (fs.existsSync(this.mappingsPath)) {
                const data = fs.readFileSync(this.mappingsPath, 'utf-8');
                this.mappings = JSON.parse(data);
            }
        }
        catch {
            this.mappings = [];
        }
    }
    saveMappings() {
        try {
            const dir = path.dirname(this.mappingsPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.mappingsPath, JSON.stringify(this.mappings, null, 2));
        }
        catch (err) {
            console.error('[GameDetector] Failed to save mappings:', err);
        }
    }
    checkMappings(processes, currentlyRunning) {
        for (const mapping of this.mappings) {
            const proc = processes.find((p) => p.name.toLowerCase() === mapping.processName.toLowerCase());
            if (!proc)
                continue;
            currentlyRunning.add(mapping.gameId);
            if (!this.runningGames.has(mapping.gameId)) {
                const game = this.library.find((g) => g.id === mapping.gameId);
                if (game) {
                    const entry = {
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
    matchWindowTitle(game, windowTitles) {
        const titleLower = game.title.toLowerCase();
        const normTitle = normalizeTitle(game.title);
        const titleWords = normTitle.split(/\s+/).filter((w) => w.length > 2);
        for (const [procKey, winTitle] of windowTitles) {
            const winLower = winTitle.toLowerCase();
            // Direct title match
            if (winLower.includes(titleLower))
                return true;
            if (titleLower.includes(winLower) && winLower.length > 5)
                return true;
            // Normalized title match
            if (winLower.includes(normTitle))
                return true;
            if (normTitle.length > 5 && normTitle.includes(winLower))
                return true;
            // Word match: count how many title words appear in window title
            if (titleWords.length >= 2) {
                const matchCount = titleWords.filter((w) => winLower.includes(w)).length;
                if (matchCount >= Math.min(titleWords.length, 2))
                    return true;
            }
            else if (titleWords.length === 1) {
                if (winLower.includes(titleWords[0]))
                    return true;
            }
        }
        return false;
    }
    fuzzyMatch(game, runningNames) {
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
            if (candidates.some((c) => c.toLowerCase() === procName))
                return true;
            // Normalized title as substring
            const normNoSpaces = norm.replace(/\s/g, '');
            if (normNoSpaces.length > 4 && procBase.includes(normNoSpaces))
                return true;
            // Word match with lower threshold (1 match for short titles, 2 for long)
            const matchCount = titleWords.filter((w) => procBase.includes(w)).length;
            const threshold = titleWords.length <= 2 ? 1 : Math.min(2, titleWords.length);
            if (titleWords.length > 0 && matchCount >= threshold)
                return true;
        }
        return false;
    }
    getExeNames(game) {
        const names = [];
        if (game.exePath && !game.exePath.startsWith('steam://')) {
            names.push(path.basename(game.exePath));
        }
        if (game.localExePath) {
            names.push(path.basename(game.localExePath));
        }
        names.push(...titleToExeCandidates(game.title));
        return names;
    }
    startProcessCheck() {
        this.stopProcessCheck();
        this.processCheckTimer = setInterval(() => {
            let hasTrackedPid = false;
            for (const [id, entry] of this.runningGames) {
                if (entry.pid) {
                    hasTrackedPid = true;
                    try {
                        process.kill(entry.pid, 0);
                    }
                    catch {
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
    stopProcessCheck() {
        if (this.processCheckTimer) {
            clearInterval(this.processCheckTimer);
            this.processCheckTimer = null;
        }
    }
    endSession(entry) {
        const session = {
            gameId: entry.game.id,
            gameTitle: entry.game.title,
            startTime: entry.startTime,
            endTime: Date.now(),
            launchedByOtix: entry.launchedByOtix,
        };
        this.saveSession(session);
        this.emit('game:ended', session);
    }
    saveSession(session) {
        try {
            const dir = path.dirname(this.sessionsPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            let sessions = [];
            try {
                const data = fs.readFileSync(this.sessionsPath, 'utf-8');
                sessions = JSON.parse(data);
            }
            catch {
                // File doesn't exist or corrupted — start fresh
            }
            sessions.push(session);
            if (sessions.length > MAX_SESSIONS) {
                sessions = sessions.slice(-MAX_SESSIONS);
            }
            fs.writeFileSync(this.sessionsPath, JSON.stringify(sessions, null, 2));
        }
        catch (err) {
            console.error('[GameDetector] Failed to save session:', err);
        }
    }
}
exports.GameDetector = GameDetector;
