// frontend/src/features/game-scanner/storage.ts
import type { DetectedGame } from "./types";
import { STORAGE_KEYS } from "./types";

// ── Dedup Helper: merge games with the same title from different sources ──

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/[-.\s](goty|game of the year|definitive|enhanced|remastered|ultimate|complete|deluxe|collectors|special|legendary|anniversary|vr|directors? cut)\s*edition/gi, "")
    .replace(/\bii\b/g, '2')
    .replace(/\biii\b/g, '3')
    .replace(/\biv\b/g, '4')
    .replace(/\bv\b/g, '5')
    .replace(/\bvi\b/g, '6')
    .replace(/\bvii\b/g, '7')
    .replace(/\bviii\b/g, '8')
    .replace(/\bix\b/g, '9')
    .replace(/\bx\b/g, '10')
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function mergeDuplicateGames(games: DetectedGame[]): DetectedGame[] {
  const groups = new Map<string, DetectedGame[]>();
  for (const g of games) {
    const key = normalizeTitle(g.title);
    const existing = groups.get(key);
    if (existing) {
      existing.push(g);
    } else {
      groups.set(key, [g]);
    }
  }

  const merged: DetectedGame[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }

    const getPriority = (g: DetectedGame) => {
      if (g.platform === 'steam') return 4;
      if (g.platform !== 'iso') return 3;
      return 1;
    };

    const best = [...group].sort((a, b) => {
      if (a.otixMediaId && !b.otixMediaId) return -1;
      if (!a.otixMediaId && b.otixMediaId) return 1;
      const pA = getPriority(a);
      const pB = getPriority(b);
      if (pA !== pB) return pB - pA;
      if (a.iconUrl && !b.iconUrl) return -1;
      if (!a.iconUrl && b.iconUrl) return 1;
      return 0;
    })[0];

    const sources = [...new Set(group.map((g) => g.platform))];

    merged.push({
      ...best,
      sources: sources.length > 1 ? sources : undefined,
      exePath: group.find((g) => g.platform === "steam")?.exePath ?? best.exePath,
      installDir: best.installDir,
    });
  }

  return merged;
}

// In-memory cache — the frontend's fast synchronous read layer
const cache = {
  paths: [] as string[],
  isoPaths: [] as string[],
  games: [] as DetectedGame[],
  localMap: {} as Record<string, DetectedGame>
};

export function hasDesktopAPI(): boolean {
  return (
    typeof window !== "undefined" && !!(window as any).desktopAPI
  );
}

/** Whether the storage module has been initialised (cache populated from localStorage) */
export const storageReady = true;

/** Returns true if the in-memory cache was populated (i.e. we can read games synchronously) */
export function isStorageReady(): boolean {
  return storageReady;
}

const _lastScanKey = "otix_last_scan_time";

export function getLastScanTime(): string | null {
  try {
    return localStorage.getItem(_lastScanKey);
  } catch {
    return null;
  }
}

export function setLastScanTime(time: string): void {
  try {
    localStorage.setItem(_lastScanKey, time);
  } catch {
    // silently ignore
  }
}

// ── Initialise cache from localStorage (fast, for immediate reads) ──

if (typeof window !== "undefined") {
  try {
    const rawPaths = localStorage.getItem(STORAGE_KEYS.PATHS);
    cache.paths = rawPaths ? JSON.parse(rawPaths) : [];
  } catch {
    cache.paths = [];
  }

  try {
    const rawIsoPaths = localStorage.getItem(STORAGE_KEYS.ISO_PATHS);
    cache.isoPaths = rawIsoPaths ? JSON.parse(rawIsoPaths) : [];
  } catch {
    cache.isoPaths = [];
  }

  try {
    const rawGames = localStorage.getItem(STORAGE_KEYS.GAMES);
    cache.games = rawGames ? mergeDuplicateGames(JSON.parse(rawGames)) : [];
  } catch {
    cache.games = [];
  }

  try {
    const rawMap = localStorage.getItem(STORAGE_KEYS.LOCAL_MAP);
    cache.localMap = rawMap ? JSON.parse(rawMap) : {};
  } catch {
    cache.localMap = {};
  }
}

// ── Overwrite cache from SQLite database (the real source of truth) ──

export async function loadFromDatabase(): Promise<void> {
  if (!hasDesktopAPI()) return;
  const api = (window as any).desktopAPI;

  try {
    // Paths
    const dbPaths = await api.getScanPaths();
    if (dbPaths && dbPaths.length > 0) {
      const paths = dbPaths.filter((p: any) => p.type === 'game').map((p: any) => p.path);
      const isoPaths = dbPaths.filter((p: any) => p.type === 'iso').map((p: any) => p.path);
      cache.paths = paths;
      cache.isoPaths = isoPaths;
      localStorage.setItem(STORAGE_KEYS.PATHS, JSON.stringify(paths));
      localStorage.setItem(STORAGE_KEYS.ISO_PATHS, JSON.stringify(isoPaths));
    }

    // Games — authoritative
    const dbGames = await api.getScannedGames();
    if (dbGames && dbGames.length > 0) {
      const deduped = mergeDuplicateGames(dbGames);
      cache.games = deduped;
      localStorage.setItem(STORAGE_KEYS.GAMES, JSON.stringify(deduped));
      if (deduped.length < dbGames.length) {
        await api.saveScannedGames(deduped);
      }
    }

    // Local map
    const dbMap = await api.getLocalGamesMap();
    if (dbMap && Object.keys(dbMap).length > 0) {
      cache.localMap = dbMap;
      localStorage.setItem(STORAGE_KEYS.LOCAL_MAP, JSON.stringify(dbMap));
    }
  } catch (err) {
    console.error("Failed to load game data from SQLite database:", err);
  }
}

// Run on startup — defer so components get an initial render from localStorage first
if (typeof window !== "undefined") {
  setTimeout(() => {
    loadFromDatabase().catch((err) => {
      console.error("Database load failed:", err);
    });
  }, 0);

  // Listen for games-updated events from the main process (e.g., after file moves)
  const api = (window as any).desktopAPI;
  if (api?.onGamesUpdated) {
    const unsub = api.onGamesUpdated(() => {
      loadFromDatabase().catch((err) => {
        console.error("Games updated reload failed:", err);
      });
    });
    // No cleanup needed at module level — lives for session duration
  }
}

// ── Synchronous getters (from in-memory cache) ──

export function getScanPaths(): string[] {
  return cache.paths;
}

export function getIsoPaths(): string[] {
  return cache.isoPaths;
}

export function getScannedGames(): DetectedGame[] {
  return cache.games;
}

export function getLocalGamesMap(): Record<string, DetectedGame> {
  return cache.localMap;
}

// ── Setters — write to cache + localStorage + SQLite ──

export function setScanPaths(paths: string[]): void {
  cache.paths = paths;
  localStorage.setItem(STORAGE_KEYS.PATHS, JSON.stringify(paths));

  if (hasDesktopAPI()) {
    const combined = [
      ...paths.map(p => ({ path: p, type: 'game' as const })),
      ...cache.isoPaths.map(p => ({ path: p, type: 'iso' as const }))
    ];
    (window as any).desktopAPI.saveScanPaths(combined).catch((err: any) => {
      console.error("Failed to save scan paths to SQLite:", err);
    });
  }
}

export function setIsoPaths(paths: string[]): void {
  cache.isoPaths = paths;
  localStorage.setItem(STORAGE_KEYS.ISO_PATHS, JSON.stringify(paths));

  if (hasDesktopAPI()) {
    const combined = [
      ...cache.paths.map(p => ({ path: p, type: 'game' as const })),
      ...paths.map(p => ({ path: p, type: 'iso' as const }))
    ];
    (window as any).desktopAPI.saveScanPaths(combined).catch((err: any) => {
      console.error("Failed to save ISO scan paths to SQLite:", err);
    });
  }
}

export function setScannedGames(games: DetectedGame[]): void {
  const deduped = mergeDuplicateGames(games);
  cache.games = deduped;
  localStorage.setItem(STORAGE_KEYS.GAMES, JSON.stringify(deduped));

  if (hasDesktopAPI()) {
    (window as any).desktopAPI.saveScannedGames(deduped).catch((err: any) => {
      console.error("Failed to save scanned games to SQLite:", err);
    });
  }

  // Notify listeners that cached game data has changed
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("games:updated", { detail: deduped }));
  }
}

export function setLocalGamesMapEntry(
  mediaId: string,
  game: DetectedGame | null,
): void {
  if (game) {
    cache.localMap[mediaId] = game;
  } else {
    delete cache.localMap[mediaId];
  }
  localStorage.setItem(STORAGE_KEYS.LOCAL_MAP, JSON.stringify(cache.localMap));

  if (hasDesktopAPI()) {
    (window as any).desktopAPI.saveLocalGamesMapEntry(mediaId, game).catch((err: any) => {
      console.error("Failed to save local games mapping entry to SQLite:", err);
    });
  }
}

// ── Rejected suggestions ───────────────────────────────────────────
// Remember suggestions the user denied so they don't reappear on re-match.

type RejectedKey = string

function rejectedKey(game: { title: string; platform: string }, mediaId: string): RejectedKey {
  return `${normalizeTitle(game.title)}|${game.platform}|${mediaId}`
}

let _rejectedCache: Set<RejectedKey> | null = null

function getRejectedSet(): Set<RejectedKey> {
  if (_rejectedCache) return _rejectedCache
  try {
    const raw = localStorage.getItem("otix_rejected_suggestions")
    _rejectedCache = new Set<RejectedKey>(raw ? JSON.parse(raw) : [])
  } catch {
    _rejectedCache = new Set()
  }
  return _rejectedCache
}

function saveRejectedSet(set: Set<RejectedKey>): void {
  _rejectedCache = set
  localStorage.setItem("otix_rejected_suggestions", JSON.stringify([...set]))
}

export function rejectSuggestion(game: { title: string; platform: string }, suggestionMediaId: string): void {
  const set = getRejectedSet()
  set.add(rejectedKey(game, suggestionMediaId))
  saveRejectedSet(set)
}

export function clearRejectedSuggestion(game: { title: string; platform: string }, mediaId: string): void {
  const set = getRejectedSet()
  set.delete(rejectedKey(game, mediaId))
  saveRejectedSet(set)
}

export function filterRejectedSuggestions(games: DetectedGame[]): DetectedGame[] {
  return games.map((g) => {
    if (!g.otixMatchSuggestion) return g
    const key = rejectedKey(g, g.otixMatchSuggestion.mediaId)
    if (getRejectedSet().has(key)) {
      return { ...g, otixMatchSuggestion: undefined, otixConfidence: undefined }
    }
    return g
  })
}

/**
 * Update a scanned game's exePath and installDir after a file move
 * ("move to library"). Finds game by oldExePath, replaces both fields,
 * persists to cache + localStorage + SQLite, fires games:updated event.
 */
export function updateGamePath(
  oldExePath: string,
  newExePath: string,
  newInstallDir?: string,
): void {
  const idx = cache.games.findIndex((g) => g.exePath === oldExePath);
  if (idx === -1) return;

  const updated = [...cache.games];
  updated[idx] = {
    ...updated[idx],
    exePath: newExePath,
    installDir: newInstallDir ?? newExePath.replace(/[/\\][^/\\]*$/, ''),
  };

  setScannedGames(updated);
}
