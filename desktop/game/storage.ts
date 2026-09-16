import { getDb } from '../db';
import type Database from 'better-sqlite3';

let __db: Database.Database | null = null;
function db(): Database.Database {
  if (!__db) __db = getDb();
  return __db;
}

type DbRow = Record<string, any>;
const __get = (sql: string, ...params: any[]) => db().prepare(sql).get(...params) as any;
const __all = (sql: string, ...params: any[]) => db().prepare(sql).all(...params) as any[];
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
  isDlc?: boolean;
  dlcOf?: string;
  isBeta?: boolean;
  betaOf?: string;
  isApp?: boolean;
  gameType?: string;
  data?: { id: string; title: string; platform: string; iconUrl?: string; posterUrl?: string; backdropUrl?: string; logoUrl?: string; textlessPosterUrl?: string };
  matchSuggestion?: { id: string; title: string; platform: string; iconUrl?: string; posterUrl?: string; _candidates?: any[] };
  otixMatchSuggestion?: { id: string; title: string; platform: string; iconUrl?: string; posterUrl?: string; _candidates?: any[] };
  updateFiles?: { name: string; path: string }[];
  lastPlayedAt?: string;
  otixMediaId?: string;
  otixMediaTitle?: string;
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

  let sources: any[] | undefined = undefined;
  let isDlc = false;
  let dlcOf: string | undefined = undefined;
  let isBeta = false;
  let betaOf: string | undefined = undefined;
  let isApp = false;
  let gameType: string | undefined = undefined;

  if (row.sources) {
    try {
      sources = JSON.parse(row.sources as string);
      if (Array.isArray(sources)) {
        for (const s of sources) {
          if (typeof s === 'object' && s !== null) {
            if (s.isDlc) isDlc = true;
            if (s.dlcOf) dlcOf = String(s.dlcOf);
            if (s.isBeta) isBeta = true;
            if (s.betaOf) betaOf = String(s.betaOf);
            if (s.isApp) isApp = true;
            if (s.gameType) gameType = String(s.gameType);
          }
        }
      }
    } catch {}
  }

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
    sources,
    isDlc,
    dlcOf,
    isBeta,
    betaOf,
    isApp,
    gameType,
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
    otixMatchSuggestion: matchSuggestion,  // alias for backward compat
    otixMediaId: (row.otix_media_id as string) || undefined,
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
  // Applications (non-game software) are stored but hidden from the library UI for now
  return __all(sql, ...params).map(rowToGame).filter((g) => !g.isApp);
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

  // Delete stale entries only within platforms in this batch
  const newIds = [...new Set(games.map((g) => g.id))];
  const platforms = [...new Set(games.map((g) => g.platform))];
  if (newIds.length > 0 && platforms.length > 0) {
    const idPlaceholders = newIds.map(() => '?').join(',');
    const platPlaceholders = platforms.map(() => '?').join(',');
    db().prepare(
      `DELETE FROM scanned_games WHERE id NOT IN (${idPlaceholders}) AND platform IN (${platPlaceholders})`
    ).run(...newIds, ...platforms);
  } else if (newIds.length === 0 && platforms.length > 0) {
    const platPlaceholders = platforms.map(() => '?').join(',');
    db().prepare(
      `DELETE FROM scanned_games WHERE platform IN (${platPlaceholders})`
    ).run(...platforms);
  }

  for (const g of games) {
    const seeded = existingSeeded.get(g.id) ?? 0
    // Preserve existing match data if the incoming row doesn't have it
    const existing = __get('SELECT otix_media_id, otix_media_title, otix_match_suggestion, otix_data, otix_poster_url, otix_backdrop_url, otix_icon_url, otix_confidence FROM scanned_games WHERE id = ?', g.id)
    const otixMediaId = g.data?.id || g.otixMediaId || (existing as any)?.otix_media_id || null
    const otixMediaTitle = g.data?.title || g.otixMediaTitle || (existing as any)?.otix_media_title || null
    const matchSuggestion = g.matchSuggestion ? JSON.stringify(g.matchSuggestion) : (existing as any)?.otix_match_suggestion || null
    // ponytail: only update otix columns if we have data — preserve existing match on re-scan
    // Merge top-level isDlc/dlcOf into source entries so DLC flags survive scans that
    // provide flags at the game level rather than inside each source object.
    let sourcesPayload: string;
    if (g.sources && g.sources.length > 0) {
      sourcesPayload = JSON.stringify(g.sources.map((s: any) => {
        if (s && s.isDlc === undefined && s.isBeta === undefined && s.isApp === undefined &&
            (g.isDlc !== undefined || g.isBeta !== undefined || g.isApp !== undefined)) {
          return { ...s, isDlc: !!g.isDlc, dlcOf: g.dlcOf || null, isBeta: !!g.isBeta, betaOf: g.betaOf || null, isApp: !!g.isApp, gameType: g.gameType || null };
        }
        return s;
      }));
    } else {
      sourcesPayload = JSON.stringify([{ source: g.platform, id: g.id, isDlc: !!g.isDlc, dlcOf: g.dlcOf || null, isBeta: !!g.isBeta, betaOf: g.betaOf || null, isApp: !!g.isApp, gameType: g.gameType || null }]);
    }

    db().prepare(
      `INSERT OR REPLACE INTO scanned_games (
        id, title, exe_path, local_exe_path, install_dir, platform,
        local_icon_url, icon_url, poster_url, sources, update_files,
        otix_media_id, otix_media_title, otix_match_suggestion,
        otix_data, otix_poster_url, otix_backdrop_url, otix_icon_url, otix_confidence, seeded
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      sourcesPayload,
      g.updateFiles ? JSON.stringify(g.updateFiles) : null,
      otixMediaId,
      otixMediaTitle,
      matchSuggestion,
      (existing as any)?.otix_data || (g.data ? JSON.stringify(g.data) : null),
      (existing as any)?.otix_poster_url || g.otixPosterUrl || null,
      (existing as any)?.otix_backdrop_url || g.otixBackdropUrl || null,
      (existing as any)?.otix_icon_url || g.otixIconUrl || null,
      (existing as any)?.otix_confidence ?? g.otixConfidence ?? null,
      seeded,
    );
  }
}

export function upsertGamesForPlatform(games: GameRow[], platform: string): void {
  const existingSeeded = new Map<string, number>();
  const existingRows = __all('SELECT id, seeded FROM scanned_games WHERE platform = ?', platform);
  for (const r of existingRows) {
    existingSeeded.set(r.id as string, r.seeded as number);
  }

  // Delete stale entries only for THIS platform (don't wipe other platforms)
  const newIds = [...new Set(games.map((g) => g.id))];
  if (newIds.length > 0) {
    const placeholders = newIds.map(() => '?').join(',');
    db().prepare(
      `DELETE FROM scanned_games WHERE platform = ? AND id NOT IN (${placeholders})`
    ).run(platform, ...newIds);
  } else {
    db().prepare('DELETE FROM scanned_games WHERE platform = ?').run(platform);
  }

  for (const g of games) {
    const seeded = existingSeeded.get(g.id) ?? 0;
    const sourcesPayload = g.sources
      ? JSON.stringify(g.sources)
      : JSON.stringify([{ source: g.platform, id: g.id, isDlc: !!g.isDlc, dlcOf: g.dlcOf || null, isBeta: !!g.isBeta, betaOf: g.betaOf || null, isApp: !!g.isApp, gameType: g.gameType || null }]);

    db().prepare(
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
      sourcesPayload,
      g.updateFiles ? JSON.stringify(g.updateFiles) : null,
      g.data?.id || null,
      g.data?.title || null,
      g.matchSuggestion ? JSON.stringify(g.matchSuggestion) : null,
      seeded,
    );
  }
}

export function saveMatchSuggestion(
  gameId: string,
  suggestion: Record<string, unknown>,
): void {
  db().prepare(
    `UPDATE scanned_games SET
      otix_match_suggestion = ?,
      updated_at = datetime('now')
    WHERE id = ?`
  ).run(JSON.stringify(suggestion), gameId);
}

export function hydrateGame(
  id: string,
  title: string,
  iconUrl: string | null,
  posterUrl: string | null,
  fullData: Record<string, unknown> | null,
  confidence?: number | null,
  mediaId?: string | null,
  backdropUrl?: string | null,
  textlessPosterUrl?: string | null,
  logoUrl?: string | null,
): void {
  const backdrop = backdropUrl || (fullData?.backdropUrl as string) || (fullData?.backdrop_url as string) || (fullData?.otixBackdropUrl as string) || null
  const textless = textlessPosterUrl || (fullData?.textlessPosterUrl as string) || (fullData?.textless_poster_url as string) || (fullData?.otixTextlessPosterUrl as string) || null
  const logo = logoUrl || (fullData?.logoUrl as string) || (fullData?.logo_url as string) || (fullData?.otixLogoUrl as string) || null
  const icon = iconUrl || (fullData?.iconUrl as string) || (fullData?.icon_url as string) || (fullData?.otixIconUrl as string) || null
  const poster = posterUrl || (fullData?.posterUrl as string) || (fullData?.poster_url as string) || (fullData?.otixPosterUrl as string) || null

  db().prepare(
    `UPDATE scanned_games SET
      otix_media_id = COALESCE(?, otix_media_id),
      otix_media_title = ?,
      otix_icon_url = COALESCE(?, otix_icon_url),
      otix_poster_url = COALESCE(?, otix_poster_url),
      otix_backdrop_url = COALESCE(?, otix_backdrop_url),
      otix_textless_poster_url = COALESCE(?, otix_textless_poster_url),
      otix_logo_url = COALESCE(?, otix_logo_url),
      otix_data = ?,
      otix_confidence = ?,
      updated_at = datetime('now')
    WHERE id = ?`
  ).run(
    mediaId ?? null,
    title,
    icon,
    poster,
    backdrop,
    textless,
    logo,
    fullData ? JSON.stringify(fullData) : null,
    confidence ?? null,
    id,
  );
}

export function getMatchedGames(): { id: string; otix_media_id: string; title: string }[] {
  return db().prepare(
    'SELECT id, otix_media_id, title FROM scanned_games WHERE otix_media_id IS NOT NULL'
  ).all() as { id: string; otix_media_id: string; title: string }[];
}

export function updateGamePath(id: string, exePath: string, installDir?: string): void {
  db().prepare(
    "UPDATE scanned_games SET exe_path = ?, install_dir = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(exePath, installDir || exePath.replace(/\/[^/]*$/, ''), id);
  notifyGamesChanged();
}

export function updateLastPlayedAt(id: string, playedAt: string): void {
  db().prepare(
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

export function unmatchGame(gameId: string): void {
  db().prepare(`
    UPDATE scanned_games SET
      otix_media_id = NULL, otix_media_title = NULL, otix_media_slug = NULL,
      otix_poster_url = NULL, otix_backdrop_url = NULL,
      otix_textless_poster_url = NULL, otix_logo_url = NULL, otix_icon_url = NULL,
      otix_match_suggestion = NULL, otix_confidence = NULL,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(gameId);
}

export function acceptSuggestion(
  gameId: string,
  suggestion?: SuggestionData,
): void {
  if (!suggestion) return;
  db().prepare(
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
    db().prepare(
      'DELETE FROM game_rejected_suggestions WHERE game_title = ? AND game_platform = ? AND suggestion_media_id = ?'
    ).run(game.title, game.platform, suggestion.id);
  }
}

export function rejectSuggestion(gameId: string, suggestionMediaId: string): void {
  const game = __get('SELECT title, platform FROM scanned_games WHERE id = ?', gameId);
  if (!game) return;
  // Store rejection so it never reappears
  db().prepare(
    `INSERT OR IGNORE INTO game_rejected_suggestions (id, game_title, game_platform, suggestion_media_id)
     VALUES (?, ?, ?, ?)`
  ).run(`rej_${gameId}_${suggestionMediaId}`, game.title, game.platform, suggestionMediaId);
  // Clear suggestion from the game row
  db().prepare(
    "UPDATE scanned_games SET otix_match_suggestion = NULL, updated_at = datetime('now') WHERE id = ?"
  ).run(gameId);
}

export function isSuggestionRejected(
  gameTitle: string,
  gamePlatform: string,
  suggestionMediaId: string,
): boolean {
  const row = db().prepare(
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

export function deleteGamesByPlatforms(platforms: string[]): void {
  if (!platforms.length) return
  const placeholders = platforms.map(() => '?').join(',')
  db().prepare(`DELETE FROM scanned_games WHERE platform IN (${placeholders})`).run(...platforms)
  db().prepare(`DELETE FROM game_matches WHERE source IN (${placeholders})`).run(...platforms)
}

export function deleteGamesByDirectory(dirPrefix: string): void {
  db().prepare("DELETE FROM scanned_games WHERE install_dir LIKE ?").run(`${dirPrefix}%`)
}

export function resetGameData(): void {
  db().prepare('DELETE FROM scanned_games').run();
  db().prepare('DELETE FROM game_matches').run();
  notifyGamesChanged();
}

export function saveScanPaths(paths: { path: string; type: 'game' | 'iso' }[]): void {
  db().prepare('DELETE FROM game_scan_paths').run();
  for (const p of paths) {
    db().prepare('INSERT OR REPLACE INTO game_scan_paths (path, type) VALUES (?, ?)').run(p.path, p.type);
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

// ── Game Matches (persistent, never cleaned on rescan) ──────────────

export interface GameMatch {
  source: string
  sourceGameId: string
  otixMediaId: string
  otixTitle?: string
  otixPosterUrl?: string
  otixBackdropUrl?: string
  otixIconUrl?: string
  otixConfidence?: number
  matchType: 'auto' | 'manual'
  status?: 'pending' | 'approved' | 'rejected'
  matchedAt?: string
}

export function ensureGameMatchesTable(): void {
  db().exec(`
    CREATE TABLE IF NOT EXISTS game_matches (
      source TEXT NOT NULL,
      source_game_id TEXT NOT NULL,
      otix_media_id TEXT NOT NULL,
      otix_title TEXT,
      otix_poster_url TEXT,
      otix_backdrop_url TEXT,
      otix_icon_url TEXT,
      otix_confidence REAL,
      match_type TEXT NOT NULL DEFAULT 'auto',
      status TEXT NOT NULL DEFAULT 'approved',
      matched_at DATETIME NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (source, source_game_id)
    )
  `);
  // Migrate: add status column if table existed before this column was added
  try { db().exec(`ALTER TABLE game_matches ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'`); } catch { /* already exists */ }
}

export function upsertGameMatch(match: GameMatch): void {
  db().prepare(`
    INSERT OR REPLACE INTO game_matches
      (source, source_game_id, otix_media_id, otix_title, otix_poster_url,
       otix_backdrop_url, otix_icon_url, otix_confidence, match_type, status, matched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    match.source, match.sourceGameId, match.otixMediaId,
    match.otixTitle || null, match.otixPosterUrl || null,
    match.otixBackdropUrl || null, match.otixIconUrl || null,
    match.otixConfidence ?? null, match.matchType,
    match.status || 'pending',
  );
}

export function getGameMatch(source: string, sourceGameId: string): GameMatch | null {
  const row = db().prepare(
    'SELECT * FROM game_matches WHERE source = ? AND source_game_id = ?'
  ).get(source, sourceGameId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    source: row.source as string,
    sourceGameId: row.source_game_id as string,
    otixMediaId: row.otix_media_id as string,
    otixTitle: (row.otix_title as string) || undefined,
    otixPosterUrl: (row.otix_poster_url as string) || undefined,
    otixBackdropUrl: (row.otix_backdrop_url as string) || undefined,
    otixIconUrl: (row.otix_icon_url as string) || undefined,
    otixConfidence: row.otix_confidence != null ? Number(row.otix_confidence) : undefined,
    matchType: row.match_type as 'auto' | 'manual',
    status: ((row.status as string) || 'approved') as GameMatch['status'],
    matchedAt: row.matched_at as string,
  };
}

export function getAllGameMatches(): GameMatch[] {
  const rows = db().prepare('SELECT * FROM game_matches ORDER BY matched_at DESC').all() as Record<string, unknown>[];
  return rows.map(row => ({
    source: row.source as string,
    sourceGameId: row.source_game_id as string,
    otixMediaId: row.otix_media_id as string,
    otixTitle: (row.otix_title as string) || undefined,
    otixPosterUrl: (row.otix_poster_url as string) || undefined,
    otixBackdropUrl: (row.otix_backdrop_url as string) || undefined,
    otixIconUrl: (row.otix_icon_url as string) || undefined,
    otixConfidence: row.otix_confidence != null ? Number(row.otix_confidence) : undefined,
    matchType: row.match_type as 'auto' | 'manual',
    status: ((row.status as string) || 'approved') as GameMatch['status'],
    matchedAt: row.matched_at as string,
  }));
}

export function deleteGameMatch(source: string, sourceGameId: string): void {
  db().prepare('DELETE FROM game_matches WHERE source = ? AND source_game_id = ?').run(source, sourceGameId);
}
