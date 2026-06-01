// frontend/src/features/game-scanner/storage.ts
import type { DetectedGame } from "./types";
import { STORAGE_KEYS } from "./types";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getScanPaths(): string[] {
  return readJson<string[]>(STORAGE_KEYS.PATHS, []);
}

export function setScanPaths(paths: string[]): void {
  writeJson(STORAGE_KEYS.PATHS, paths);
}

export function getIsoPaths(): string[] {
  return readJson<string[]>(STORAGE_KEYS.ISO_PATHS, []);
}

export function setIsoPaths(paths: string[]): void {
  writeJson(STORAGE_KEYS.ISO_PATHS, paths);
}

export function getScannedGames(): DetectedGame[] {
  return readJson<DetectedGame[]>(STORAGE_KEYS.GAMES, []);
}

export function setScannedGames(games: DetectedGame[]): void {
  writeJson(STORAGE_KEYS.GAMES, games);
}

export function getLocalGamesMap(): Record<string, DetectedGame> {
  return readJson<Record<string, DetectedGame>>(STORAGE_KEYS.LOCAL_MAP, {});
}

export function setLocalGamesMapEntry(
  mediaId: string,
  game: DetectedGame | null,
): void {
  const map = getLocalGamesMap();
  if (game) {
    map[mediaId] = game;
  } else {
    delete map[mediaId];
  }
  writeJson(STORAGE_KEYS.LOCAL_MAP, map);
}

export function hasElectronAPI(): boolean {
  return (
    typeof window !== "undefined" && !!(window as any).electronAPI
  );
}
