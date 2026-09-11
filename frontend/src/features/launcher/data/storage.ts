import type { LocalGame, GamesFilter } from '../types';
import { getDesktopAPI, hasDesktopAPI as checkDesktopAPI } from '@/lib/desktop/api';
import { mergeDuplicateGames } from './storage-utils';
import { OTIX_DEFAULT_GAME, OTIX_DEFAULT_GAME_ID } from './otix-default-game';

// ── In-memory cache (hot reads, invalidated on DB change) ─────────

const cache: {
  paths: string[];
  isoPaths: string[];
  games: LocalGame[];
  localMap: Record<string, LocalGame>;
  loaded: boolean;
} = {
  paths: [],
  isoPaths: [],
  games: [],
  localMap: {},
  loaded: false,
};

export function hasDesktopAPI(): boolean {
  return checkDesktopAPI();
}

/** True after first successful IPC load. */
export function isStorageReady(): boolean {
  return cache.loaded;
}

// ── Shared guard: never downgrade installed game back to ISO ──

function preserveInstallStatus(games: LocalGame[]): LocalGame[] {
  return games.map((g) => {
    if (g.platform !== 'iso') return g;
    const existing = cache.games.find((c) => c.id === g.id || c.exePath === g.exePath);
    if (existing && existing.platform !== 'iso') {
      return { ...g, platform: existing.platform, exePath: existing.exePath, installDir: existing.installDir };
    }
    return g;
  });
}

// ── Async IPC fetchers (single source of truth: SQLite) ──────────

export async function fetchGames(filter?: GamesFilter): Promise<LocalGame[]> {
  if (hasDesktopAPI()) {
    try {
      const api = getDesktopAPI()!;
      const games = await api.getLocalGames(filter);
      const deduped = mergeDuplicateGames(games);
      cache.games = deduped;
      cache.loaded = true;
      return deduped;
    } catch {
      return [];
    }
  }
  return [];
}

export async function fetchGameById(id: string): Promise<LocalGame | null> {
  if (id === OTIX_DEFAULT_GAME_ID) {
    return OTIX_DEFAULT_GAME;
  }
  if (hasDesktopAPI()) {
    try {
      const api = getDesktopAPI()!;
      const game = await api.getGameById(id);
      if (game) return game;
    } catch {
      return null;
    }
  }
  return null;
}

export async function fetchGameCount(filter?: GamesFilter): Promise<number> {
  if (hasDesktopAPI()) {
    try {
      const api = getDesktopAPI()!;
      return await api.getGameCount(filter ?? {});
    } catch {
      return 0;
    }
  }
  return 0;
}

export async function fetchScanPaths(): Promise<{ game: string[]; iso: string[] }> {
  if (!hasDesktopAPI()) return { game: [], iso: [] };
  const api = getDesktopAPI()!;
  const raw = await api.getScanPaths();
  return {
    game: raw.filter((p): p is { path: string; type: 'game' } => p.type === 'game').map((p) => p.path),
    iso: raw.filter((p): p is { path: string; type: 'iso' } => p.type === 'iso').map((p) => p.path),
  };
}

/** Fetch ISO scan paths from desktop backend and populate cache. */
export async function fetchIsoPaths(): Promise<string[]> {
  if (!hasDesktopAPI()) return [];
  const api = getDesktopAPI()!;
  const raw = await api.getScanPaths();
  cache.isoPaths = raw
    .filter((p): p is { path: string; type: 'iso' } => p.type === 'iso')
    .map((p) => p.path);
  return cache.isoPaths;
}

export async function saveScanPathsToServer(paths: string[], isoPaths: string[]): Promise<void> {
  if (!hasDesktopAPI()) return;
  const api = getDesktopAPI()!;
  const combined = [
    ...paths.map((p) => ({ path: p, type: 'game' as const })),
    ...isoPaths.map((p) => ({ path: p, type: 'iso' as const })),
  ];
  await api.saveScanPaths(combined);
}

// ── Load from SQLite into cache (call on startup) ────────────────

export async function loadFromDatabase(): Promise<void> {
  if (!hasDesktopAPI()) return;
  const api = getDesktopAPI()!;

  try {
    const [dbPaths, dbGames, dbMap] = await Promise.all([
      api.getScanPaths(),
      api.getLocalGames(),
      api.getLocalGamesMap(),
    ]);

    if (dbPaths && dbPaths.length > 0) {
      cache.paths = dbPaths.filter((p) => p.type === 'game').map((p) => p.path);
      cache.isoPaths = dbPaths.filter((p) => p.type === 'iso').map((p) => p.path);
    }

    if (dbGames && dbGames.length > 0) {
      const preserved = preserveInstallStatus(dbGames);
      cache.games = mergeDuplicateGames(preserved);
      // Write-back if dedup reduced count
      if (cache.games.length < dbGames.length) {
        api.saveScannedGames(cache.games).catch(() => {});
      }
    }

    if (dbMap && Object.keys(dbMap).length > 0) {
      cache.localMap = dbMap;
    }

    cache.loaded = true;
  } catch (err) {
    console.error('Failed to load game data from database:', err);
  }
}

// ── Sync cache readers (hot reads, may be stale) ─────────────────

export function getScanPaths(): string[] {
  return cache.paths;
}

export function getIsoPaths(): string[] {
  return cache.isoPaths;
}

export function getLocalGamesCache(): LocalGame[] {
  return cache.games;
}

export function getLocalGamesMap(): Record<string, LocalGame> {
  return cache.localMap;
}

export function invalidateCache(): void {
  cache.loaded = false;
}

// ── Sync setters (write-through to IPC) ───────────────────────────

function persistIsoPaths(isoPaths: string[]): void {
  if (!hasDesktopAPI()) return;
  const combined = [
    ...cache.paths.map((p) => ({ path: p, type: 'game' as const })),
    ...isoPaths.map((p) => ({ path: p, type: 'iso' as const })),
  ];
  getDesktopAPI()!.saveScanPaths(combined).catch(() => {});
}

export function setScanPaths(paths: string[]): void {
  cache.paths = paths;
  persistIsoPaths(cache.isoPaths);
}

/** Persist combined game + ISO paths, preserving game paths. */
async function persistPaths(isoPaths: string[]): Promise<void> {
  if (!hasDesktopAPI()) return;
  const api = getDesktopAPI()!;
  const raw = await api.getScanPaths();
  const gamePaths = raw.filter((p) => p.type === 'game').map((p) => p.path);
  const combined = [
    ...gamePaths.map((p) => ({ path: p, type: 'game' as const })),
    ...isoPaths.map((p) => ({ path: p, type: 'iso' as const })),
  ];
  await api.saveScanPaths(combined);
}

export function setIsoPaths(paths: string[]): void {
  cache.isoPaths = paths;
  persistIsoPaths(cache.isoPaths);
}

/** Replace ISO path list entirely. */
export async function setIsoPathsAsync(paths: string[]): Promise<void> {
  cache.isoPaths = [...paths];
  await persistPaths(cache.isoPaths);
}

/** Add a single ISO directory. */
export async function addIsoPath(path: string): Promise<void> {
  if (cache.isoPaths.includes(path)) return;
  cache.isoPaths = [...cache.isoPaths, path];
  await persistPaths(cache.isoPaths);
}

/** Remove a single ISO directory. */
export async function removeIsoPath(path: string): Promise<void> {
  cache.isoPaths = cache.isoPaths.filter((p) => p !== path);
  await persistPaths(cache.isoPaths);
}

/** Open native directory chooser and add selected path to ISO list. */
export async function selectAndAddIsoPath(): Promise<string | null> {
  if (!hasDesktopAPI()) return null;
  const api = getDesktopAPI()!;
  const dir = await api.selectDirectory();
  if (!dir) return null;
  await addIsoPath(dir);
  return dir;
}

/** Invalidate cache so next fetchIsoPaths() re-reads from DB. */
export function invalidateIsoCache(): void {
  cache.loaded = false;
}

/** Clear ISO paths from cache without persisting. */
export function clearIsoCache(): void {
  cache.isoPaths = [];
  cache.loaded = false;
}

export function setScannedGames(games: LocalGame[]): void {
  const guarded = preserveInstallStatus(games);
  const deduped = mergeDuplicateGames(guarded);
  cache.games = deduped;

  if (hasDesktopAPI()) {
    getDesktopAPI()!.saveScannedGames(deduped).catch(() => {});
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('game:updated', { detail: deduped }));
  }
}

export function setLocalGamesMapEntry(mediaId: string, game: LocalGame | null): void {
  if (game) cache.localMap[mediaId] = game;
  else delete cache.localMap[mediaId];

  if (hasDesktopAPI()) {
    getDesktopAPI()!.saveLocalGamesMapEntry(mediaId, game).catch(() => {});
  }
}

// ── Suggestions (forwarded to desktop service) ────────────────────

export async function acceptSuggestionOnServer(gameId: string, suggestion: Record<string, unknown>): Promise<void> {
  if (!hasDesktopAPI()) return;
  await getDesktopAPI()!.acceptSuggestion(gameId, suggestion);
  invalidateCache();
}

export async function rejectSuggestionOnServer(gameId: string, suggestionMediaId: string): Promise<void> {
  if (!hasDesktopAPI()) return;
  await getDesktopAPI()!.rejectSuggestion(gameId, suggestionMediaId);
  invalidateCache();
}

// ── ISO install helpers (sync, cache-only) ────────────────────────

export function markGameInstalled(isoExePath: string, installedExePath: string | null, installDir: string): void {
  const findIdx = (): number => {
    const exact = cache.games.findIndex((g) => g.exePath === isoExePath);
    if (exact !== -1) return exact;
    return cache.games.findIndex((g) => g.exePath.toLowerCase() === isoExePath.toLowerCase());
  };
  const idx = findIdx();
  if (idx === -1) return;

  const updated = [...cache.games];
  updated[idx] = { ...updated[idx], platform: 'pc', exePath: installedExePath ?? updated[idx].exePath, installDir };
  setScannedGames(updated);
}

export function updateGamePath(oldExePath: string, newExePath: string, newInstallDir?: string): void {
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
