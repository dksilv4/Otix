import { getConnection } from '../db';
const __db = getConnection('downloads');
type DbRow = Record<string, any>;
const __get = (sql: string, ...params: any[]) => __db.prepare(sql).get(...params) as any;
const __all = (sql: string, ...params: any[]) => __db.prepare(sql).all(...params) as any[];
import type { LocalGame } from '../preload-api';

// ── Types ──────────────────────────────────────────────────────────────

export type GamePlatform = LocalGame['platform'];

export interface GameRow {
  id: string;
  title: string;
  exePath: string;
  localExePath?: string;
  installDir: string;
  platform: GamePlatform;
  localIconUrl?: string;
  iconUrl?: string;
  posterUrl?: string;
  sources?: (string | Record<string, unknown>)[];
  data?: { id: string; title: string; platform: string; iconUrl?: string; posterUrl?: string; backdropUrl?: string; logoUrl?: string; textlessPosterUrl?: string };
  matchSuggestion?: { id: string; title: string; platform: string; iconUrl?: string; posterUrl?: string };
  updateFiles?: { name: string; path: string }[];
  lastPlayedAt?: string;
  otixMediaSlug?: string;
  otixConfidence?: number;
  otixPosterUrl?: string;
  otixBackdropUrl?: string;
  otixTextlessPosterUrl?: string;
  otixLogoUrl?: string;
  otixIconUrl?: string;
}

export interface GameFilter {
  platform?: string[];
  matched?: boolean;
  hasSuggestion?: boolean;
  search?: string;
  installed?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'title' | 'platform' | 'updated_at' | 'last_played_at';
  sortDir?: 'asc' | 'desc';
}

// ── Row → GameRow ─────────────────────────────────────────────────────

function rowToGame(row: DbRow): GameRow {
  const matchSuggestion = row.otix_match_suggestion
    ? JSON.parse(row.otix_match_suggestion as string)
    : undefined;

  return {
    id: row.id as string,
    title: row.title as string,
    exePath: row.exe_path as string,
    localExePath: (row.local_exe_path as string) || undefined,
    installDir: row.install_dir as string,
    platform: row.platform as GamePlatform,
    localIconUrl: (row.local_icon_url as string) || undefined,
    iconUrl: (row.icon_url as string) || undefined,
    posterUrl: (row.poster_url as string) || undefined,
    sources: row.sources ? JSON.parse(row.sources as string) : undefined,
    updateFiles: row.update_files ? JSON.parse(row.update_files as string) : undefined,
    lastPlayedAt: (row.last_played_at as string) || undefined,
    data: row.otix_media_id
      ? (() => {
          const base = {
            id: row.otix_media_id as string,
            title: (row.otix_media_title as string) || (row.title as string),
            platform: row.platform as GamePlatform,
            iconUrl: (row.otix_icon_url as string) || undefined,
            posterUrl: (row.otix_poster_url as string) || undefined,
            backdropUrl: (row.otix_backdrop_url as string) || undefined,
            logoUrl: (row.otix_logo_url as string) || undefined,
            textlessPosterUrl: (row.otix_textless_poster_url as string) || undefined,
          };
          try {
            const raw = row.otix_data as string | undefined;
            if (raw) {
              const parsed = JSON.parse(raw);
              return { ...base, ...parsed };
            }
          } catch { /* ignore parse errors */ }
          return base;
        })()
      : undefined,
    matchSuggestion,
    otixMediaSlug: (row.otix_media_slug as string) || undefined,
    otixConfidence: row.otix_confidence != null ? Number(row.otix_confidence) : undefined,
    otixPosterUrl: (row.otix_poster_url as string) || undefined,
    otixBackdropUrl: (row.otix_backdrop_url as string) || undefined,
    otixTextlessPosterUrl: (row.otix_textless_poster_url as string) || undefined,
    otixLogoUrl: (row.otix_logo_url as string) || undefined,
    otixIconUrl: (row.otix_icon_url as string) || undefined,
  };
}

// ── Queries ────────────────────────────────────────────────────────────

export function getAllGames(filter: GameFilter = {}): GameRow[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filter.platform && filter.platform.length > 0) {
    const placeholders = filter.platform.map(() => '?').join(',');
    conditions.push(`platform IN (${placeholders})`);
    params.push(...filter.platform);
  }
  if (filter.matched === true) {
    conditions.push('otix_media_id IS NOT NULL');
  } else if (filter.matched === false) {
    conditions.push('otix_media_id IS NULL AND otix_match_suggestion IS NULL');
  }
  if (filter.hasSuggestion === true) {
    conditions.push('otix_match_suggestion IS NOT NULL');
  } else if (filter.hasSuggestion === false) {
    conditions.push('otix_match_suggestion IS NULL');
  }
  if (filter.search) {
    conditions.push('(title LIKE ? OR install_dir LIKE ?)');
    params.push(`%${filter.search}%`, `%${filter.search}%`);
  }
  if (filter.installed === true) {
    conditions.push("platform != 'iso' AND exe_path != ''");
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sortBy = filter.sortBy || 'title';
  const sortDir = filter.sortDir || 'asc';

  let orderClause: string;
  if (sortBy === 'last_played_at' && sortDir === 'desc') {
    orderClause = `ORDER BY CASE WHEN last_played_at IS NULL THEN 1 ELSE 0 END, last_played_at DESC`;
  } else if (sortBy === 'last_played_at' && sortDir === 'asc') {
    orderClause = `ORDER BY last_played_at ASC`;
  } else {
    orderClause = `ORDER BY ${sortBy} ${sortDir}`;
  }
  const limit = filter.limit ? `LIMIT ${filter.limit}` : '';
  const offset = filter.offset ? `OFFSET ${filter.offset}` : '';

  const sql = `SELECT * FROM scanned_games ${where} ${orderClause} ${limit} ${offset}`;
  return __all(sql, ...params).map(rowToGame);
}

export function getGameById(id: string): GameRow | null {
  const row = __get('SELECT * FROM scanned_games WHERE id = ?', id);
  return row ? rowToGame(row) : null;
}

// ── Mutations ──────────────────────────────────────────────────────────

export function upsertGames(games: GameRow[]): void {
  const existingSeeded = new Map<string, number>();
  const existingRows = __all('SELECT id, seeded FROM scanned_games');
  for (const r of existingRows) {
    existingSeeded.set(r.id as string, r.seeded as number);
  }

  // Delete stale entries (games no longer in this scan batch)
  const newIds = [...new Set(games.map((g) => g.id))];
  if (newIds.length > 0) {
    const placeholders = newIds.map(() => '?').join(',');
    __db.prepare(`DELETE FROM scanned_games WHERE id NOT IN (${placeholders})`).run(newIds);
  } else {
    __db.prepare('DELETE FROM scanned_games').run();
  }

  for (const g of games) {
    const seeded = existingSeeded.get(g.id) ?? 0;
    __db.prepare(
      `INSERT OR REPLACE INTO scanned_games (
        id, title, exe_path, local_exe_path, install_dir, platform,
        local_icon_url, icon_url, poster_url, sources, update_files,
        otix_media_id, otix_media_title, otix_match_suggestion, seeded
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      g.id,
      g.title,
      g.exePath,
      g.localExePath || null,
      g.installDir,
      g.platform,
      g.localIconUrl || null,
      g.iconUrl || null,
      g.posterUrl || null,
      g.sources ? JSON.stringify(g.sources) : null,
      g.updateFiles ? JSON.stringify(g.updateFiles) : null,
      g.data?.id || null,
      g.data?.title || null,
      g.matchSuggestion ? JSON.stringify(g.matchSuggestion) : null,
      seeded,
    );
  }
}

export function hydrateGame(
  id: string,
  title: string,
  iconUrl: string | null,
  posterUrl: string | null,
  fullData: Record<string, unknown> | null,
): void {
  __db.prepare(
    `UPDATE scanned_games SET
      otix_media_title = ?,
      otix_icon_url = ?,
      otix_poster_url = ?,
      otix_data = ?,
      updated_at = datetime('now')
    WHERE id = ?`
  ).run(title, iconUrl, posterUrl, fullData ? JSON.stringify(fullData) : null, id);
}

export function getMatchedGames(): { id: string; otix_media_id: string; title: string }[] {
  return __db.prepare(
    'SELECT id, otix_media_id, title FROM scanned_games WHERE otix_media_id IS NOT NULL'
  ).all() as { id: string; otix_media_id: string; title: string }[];
}

export function updateGamePath(id: string, exePath: string, installDir?: string): void {
  __db.prepare(
    "UPDATE scanned_games SET exe_path = ?, install_dir = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(exePath, installDir || exePath.replace(/\/[^/]*$/, ''), id);
  notifyGamesChanged();
}

export function updateLastPlayedAt(id: string, playedAt: string): void {
  __db.prepare(
    "UPDATE scanned_games SET last_played_at = ? WHERE id = ?"
  ).run(playedAt, id);
  notifyGamesChanged();
}

// ── Suggestions ────────────────────────────────────────────────────────

interface SuggestionData {
  id: string
  title: string
  platform?: string
  slug?: string
  posterUrl?: string | null
  backdropUrl?: string | null
  textlessPosterUrl?: string | null
  logoUrl?: string | null
  iconUrl?: string | null
}

export function acceptSuggestion(
  gameId: string,
  suggestion?: SuggestionData,
): void {
  if (!suggestion) return;
  __db.prepare(
    `UPDATE scanned_games SET
      otix_media_id = ?, otix_media_title = ?, otix_media_slug = ?,
      otix_poster_url = ?, otix_backdrop_url = ?,
      otix_textless_poster_url = ?, otix_logo_url = ?, otix_icon_url = ?,
      otix_match_suggestion = NULL,
      updated_at = datetime('now')
    WHERE id = ?`
  ).run(
    suggestion.id, suggestion.title, suggestion.slug ?? null,
    suggestion.posterUrl ?? null, suggestion.backdropUrl ?? null,
    suggestion.textlessPosterUrl ?? null, suggestion.logoUrl ?? null, suggestion.iconUrl ?? null,
    gameId,
  );
  // Clear any previous rejection for this suggestion
  const game = __get('SELECT title, platform FROM scanned_games WHERE id = ?', gameId);
  if (game) {
    __db.prepare(
      'DELETE FROM game_rejected_suggestions WHERE game_title = ? AND game_platform = ? AND suggestion_media_id = ?'
    ).run(game.title, game.platform, suggestion.id);
  }
}

export function rejectSuggestion(gameId: string, suggestionMediaId: string): void {
  const game = __get('SELECT title, platform FROM scanned_games WHERE id = ?', gameId);
  if (!game) return;
  // Store rejection so it never reappears
  __db.prepare(
    `INSERT OR IGNORE INTO game_rejected_suggestions (id, game_title, game_platform, suggestion_media_id)
     VALUES (?, ?, ?, ?)`
  ).run(`rej_${gameId}_${suggestionMediaId}`, game.title, game.platform, suggestionMediaId);
  // Clear suggestion from the game row
  __db.prepare(
    "UPDATE scanned_games SET otix_match_suggestion = NULL, updated_at = datetime('now') WHERE id = ?"
  ).run(gameId);
}

export function isSuggestionRejected(
  gameTitle: string,
  gamePlatform: string,
  suggestionMediaId: string,
): boolean {
  const row = __db.prepare(
    'SELECT id FROM game_rejected_suggestions WHERE game_title = ? AND game_platform = ? AND suggestion_media_id = ?'
  ).get(gameTitle, gamePlatform, suggestionMediaId);
  return !!row;
}

// ── Count ──────────────────────────────────────────────────────────────

export function getGameCount(filter: Omit<GameFilter, 'limit' | 'offset'> = {}): number {
  return getAllGames(filter).length;
}

// ── Scan paths ─────────────────────────────────────────────────────────

export function getScanPaths(): { path: string; type: 'game' | 'iso' }[] {
  const rows = __all('SELECT * FROM game_scan_paths', );
  return rows.map((r) => ({
    path: r.path as string,
    type: r.type as 'game' | 'iso',
  }));
}

export function saveScanPaths(paths: { path: string; type: 'game' | 'iso' }[]): void {
  __db.prepare('DELETE FROM game_scan_paths').run();
  for (const p of paths) {
    __db.prepare('INSERT OR REPLACE INTO game_scan_paths (path, type) VALUES (?, ?)').run(p.path, p.type);
  }
}

// ── Change notification (broadcasts to renderer via IPC) ─────────────────

import { BrowserWindow } from 'electron';

let _notifyTarget: BrowserWindow | null = null;
let _disposeHooks: (() => void)[] = [];

export function setNotifyTarget(win: BrowserWindow): void {
  _notifyTarget = win;
}

export function notifyGamesChanged(): void {
  if (_notifyTarget && !_notifyTarget.isDestroyed()) {
    _notifyTarget.webContents.send('games-db:changed');
  }
}

export function registerDisposeHook(hook: () => void): void {
  _disposeHooks.push(hook);
}

export function disposeService(): void {
  for (const hook of _disposeHooks) hook();
  _disposeHooks = [];
  _notifyTarget = null;
}
