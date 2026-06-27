/* ── Launcher ISO storage — ISO scan paths with IPC write-through ── */

import { getDesktopAPI, hasDesktopAPI } from '@/lib/desktop/api';

// ── Types ────────────────────────────────────────────────────────

export interface IsoPathEntry {
  path: string;
  addedAt?: string;
  gameCount?: number;
}

// ── In-memory cache ──────────────────────────────────────────────

const cache: {
  isoPaths: string[];
  loaded: boolean;
} = {
  isoPaths: [],
  loaded: false,
};

// ── Async load from SQLite (call on startup) ─────────────────────

/** Fetch ISO scan paths from desktop backend and populate cache. */
export async function fetchIsoPaths(): Promise<string[]> {
  if (!hasDesktopAPI()) return [];
  const api = getDesktopAPI()!;
  const raw = await api.getScanPaths();
  cache.isoPaths = raw
    .filter((p): p is { path: string; type: 'iso' } => p.type === 'iso')
    .map((p) => p.path);
  cache.loaded = true;
  return cache.isoPaths;
}

// ── Sync cache readers ───────────────────────────────────────────

/** Get cached ISO scan paths (may be stale — call fetchIsoPaths first). */
export function getIsoPaths(): string[] {
  return cache.isoPaths;
}

/** True after fetchIsoPaths has completed at least once. */
export function isIsoStorageReady(): boolean {
  return cache.loaded;
}

// ── Mutations (write-through to IPC) ────────────────────────────

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

/** Replace ISO path list entirely. */
export async function setIsoPaths(paths: string[]): Promise<void> {
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

// ── Desktop directory picker ──────────────────────────────────────

/** Open native directory chooser and add selected path to ISO list. */
export async function selectAndAddIsoPath(): Promise<string | null> {
  if (!hasDesktopAPI()) return null;
  const api = getDesktopAPI()!;
  const dir = await api.selectDirectory();
  if (!dir) return null;
  await addIsoPath(dir);
  return dir;
}

// ── Cache lifecycle ──────────────────────────────────────────────

/** Invalidate cache so next fetchIsoPaths() re-reads from DB. */
export function invalidateIsoCache(): void {
  cache.loaded = false;
}

/** Clear ISO paths from cache without persisting. */
export function clearIsoCache(): void {
  cache.isoPaths = [];
  cache.loaded = false;
}
