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

    // Priority order:
    // 1. Steam/Launcher games (official, achievements)
    // 2. Installed PC games (playable)
    // 3. ISOs (installable)
    const getPriority = (g: DetectedGame) => {
      if (g.platform === 'steam') return 4;
      if (g.platform !== 'iso') return 3; // installers (epic, gog, etc) or standard PC executables
      return 1; // ISO disk files
    };

    // Sort to choose the best base game
    const best = [...group].sort((a, b) => {
      // 1. Prefer matching otix media ID
      if (a.otixMediaId && !b.otixMediaId) return -1;
      if (!a.otixMediaId && b.otixMediaId) return 1;
      // 2. Prefer launcher/installed over ISO
      const pA = getPriority(a);
      const pB = getPriority(b);
      if (pA !== pB) return pB - pA;
      // 3. Prefer having icon URL
      if (a.iconUrl && !b.iconUrl) return -1;
      if (!a.iconUrl && b.iconUrl) return 1;
      return 0;
    })[0];

    const sources = [...new Set(group.map((g) => g.platform))];

    merged.push({
      ...best,
      sources: sources.length > 1 ? sources : undefined,
      // Keep the best exe path (prefer steam)
      exePath: group.find((g) => g.platform === "steam")?.exePath ?? best.exePath,
      installDir: best.installDir,
    });
  }

  return merged;
}

// In-memory cache for game scan data to avoid layout flashing and maintain synchronous frontend behavior
const cache = {
  paths: [] as string[],
  isoPaths: [] as string[],
  games: [] as DetectedGame[],
  localMap: {} as Record<string, DetectedGame>
};

// Helper to check if running in Electron environment
export function hasElectronAPI(): boolean {
  return (
    typeof window !== "undefined" && !!(window as any).electronAPI
  );
}

// Initialize cache synchronously from localStorage on startup (zero flash)
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

// Asynchronously sync localStorage cache with the Electron SQLite database on startup
export async function syncStorageWithDatabase(): Promise<void> {
  if (!hasElectronAPI()) return;
  const api = (window as any).electronAPI;
  
  try {
    // 1. Sync scan paths
    const dbPaths = await api.getScanPaths();
    if (dbPaths && dbPaths.length > 0) {
      const paths = dbPaths.filter((p: any) => p.type === 'game').map((p: any) => p.path);
      const isoPaths = dbPaths.filter((p: any) => p.type === 'iso').map((p: any) => p.path);
      
      cache.paths = paths;
      cache.isoPaths = isoPaths;
      
      localStorage.setItem(STORAGE_KEYS.PATHS, JSON.stringify(paths));
      localStorage.setItem(STORAGE_KEYS.ISO_PATHS, JSON.stringify(isoPaths));
    } else {
      // If database has no paths but localStorage does, seed the database
      if (cache.paths.length > 0 || cache.isoPaths.length > 0) {
        const combined = [
          ...cache.paths.map(p => ({ path: p, type: 'game' as const })),
          ...cache.isoPaths.map(p => ({ path: p, type: 'iso' as const }))
        ];
        await api.saveScanPaths(combined);
      }
    }

    // 2. Sync scanned games
    const dbGames = await api.getScannedGames();
    if (dbGames && dbGames.length > 0) {
      const deduped = mergeDuplicateGames(dbGames);
      cache.games = deduped;
      localStorage.setItem(STORAGE_KEYS.GAMES, JSON.stringify(deduped));
      
      // If duplicates were merged and pruned, save the cleaned list back to the SQLite DB!
      if (deduped.length < dbGames.length) {
        console.log(`[syncStorageWithDatabase] Pruning ${dbGames.length - deduped.length} duplicate games from SQLite DB`);
        await api.saveScannedGames(deduped);
      }
    } else {
      // Seed database if localStorage has games
      if (cache.games.length > 0) {
        await api.saveScannedGames(cache.games);
      }
    }

    // 3. Sync local games mapping
    const dbMap = await api.getLocalGamesMap();
    if (dbMap && Object.keys(dbMap).length > 0) {
      cache.localMap = dbMap;
      localStorage.setItem(STORAGE_KEYS.LOCAL_MAP, JSON.stringify(dbMap));
    } else {
      // Seed database if localStorage has mapping
      if (Object.keys(cache.localMap).length > 0) {
        for (const [mediaId, game] of Object.entries(cache.localMap)) {
          await api.saveLocalGamesMapEntry(mediaId, game);
        }
      }
    }
  } catch (err) {
    console.error("Failed to sync scanned library/paths with SQLite database:", err);
  }
}

// Auto-trigger the async SQLite synchronization block deferred to next microtask
if (typeof window !== "undefined") {
  setTimeout(() => {
    syncStorageWithDatabase().catch(err => {
      console.error("Deferred storage sync failed:", err);
    });
  }, 0);
}

// Synchronous getters from in-memory cache
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

// Setters write to cache/localStorage synchronously, and persist to SQLite asynchronously
export function setScanPaths(paths: string[]): void {
  cache.paths = paths;
  localStorage.setItem(STORAGE_KEYS.PATHS, JSON.stringify(paths));
  
  if (hasElectronAPI()) {
    const combined = [
      ...paths.map(p => ({ path: p, type: 'game' as const })),
      ...cache.isoPaths.map(p => ({ path: p, type: 'iso' as const }))
    ];
    (window as any).electronAPI.saveScanPaths(combined).catch((err: any) => {
      console.error("Failed to save scan paths to SQLite:", err);
    });
  }
}

export function setIsoPaths(paths: string[]): void {
  cache.isoPaths = paths;
  localStorage.setItem(STORAGE_KEYS.ISO_PATHS, JSON.stringify(paths));
  
  if (hasElectronAPI()) {
    const combined = [
      ...cache.paths.map(p => ({ path: p, type: 'game' as const })),
      ...paths.map(p => ({ path: p, type: 'iso' as const }))
    ];
    (window as any).electronAPI.saveScanPaths(combined).catch((err: any) => {
      console.error("Failed to save ISO scan paths to SQLite:", err);
    });
  }
}

export function setScannedGames(games: DetectedGame[]): void {
  const deduped = mergeDuplicateGames(games);
  cache.games = deduped;
  localStorage.setItem(STORAGE_KEYS.GAMES, JSON.stringify(deduped));
  
  if (hasElectronAPI()) {
    (window as any).electronAPI.saveScannedGames(deduped).catch((err: any) => {
      console.error("Failed to save scanned games to SQLite:", err);
    });
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
  
  if (hasElectronAPI()) {
    (window as any).electronAPI.saveLocalGamesMapEntry(mediaId, game).catch((err: any) => {
      console.error("Failed to save local games mapping entry to SQLite:", err);
    });
  }
}
