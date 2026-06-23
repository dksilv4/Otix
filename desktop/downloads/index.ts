/**
 * Downloads module — shared DB access for download tracking and config.
 *
 * Plugin-specific operations (SABnzbd, NZBPlanet, search/download orchestration)
 * have been moved to the plugin system under extensions/otix-plugins/plugins/.
 *
 * This file retains only shared database CRUD functions.
 */

import path from 'path';
import fs from 'fs';
import { getConnection } from '../db';
import type Database from 'better-sqlite3';

let __db: Database.Database | null = null;
function db(): Database.Database {
  if (!__db) __db = getConnection('downloads');
  return __db;
}

type DbRow = Record<string, any>;
const __get = (sql: string, ...params: any[]) => db().prepare(sql).get(...params) as any;
const __all = (sql: string, ...params: any[]) => db().prepare(sql).all(...params) as any[];

function genId(): string {
  return 'dl_' + Math.random().toString(36).substring(2, 14);
}

// ── Download config CRUD ──────────────────────────────────────────────────

export interface DownloadConfig {
  id: string;
  userId: string;
  sabnzbdHost: string | null;
  sabnzbdPort: number | null;
  sabnzbdApiKey: string | null;
  sabnzbdUseSsl: boolean;
  nzbplanetApiKey: string | null;
  sabnzbdCompletePath: string | null;
  downloadPath: string | null;
  postProcessEnabled: boolean;
  autoSearchWishlist: boolean;
  wishlistIntervalHours: number;
  preferredRepackers: string | null;
  allowHypervisor?: boolean;
  autoOrganizeEnabled?: boolean;
  namingTemplate?: string | null;
}

function configRowToObj(row: DbRow): DownloadConfig {
  return {
    id: row.id,
    userId: row.user_id,
    sabnzbdHost: row.sabnzbd_host,
    sabnzbdPort: row.sabnzbd_port,
    sabnzbdApiKey: row.sabnzbd_api_key,
    sabnzbdUseSsl: row.sabnzbd_use_ssl === 1,
    nzbplanetApiKey: row.nzbplanet_api_key,
    sabnzbdCompletePath: row.sabnzbd_complete_path,
    downloadPath: row.download_path,
    postProcessEnabled: row.post_process_enabled === 1,
    autoSearchWishlist: row.auto_search_wishlist === 1,
    wishlistIntervalHours: row.wishlist_interval_hours,
    preferredRepackers: row.preferred_repackers ?? null,
    allowHypervisor: row.allow_hypervisor === 1,
    autoOrganizeEnabled: row.auto_organize_enabled === 1,
    namingTemplate: row.naming_template ?? null,
  };
}

export async function getConfig(_userId?: string): Promise<DownloadConfig | null> {
  // Desktop app: single user, return first config regardless of user_id
  const row = __get('SELECT * FROM download_configs ORDER BY updated_at DESC LIMIT 1', []);
  return row ? configRowToObj(row) : null;
}

export async function saveConfig(config: Omit<DownloadConfig, 'id'> & { id?: string }): Promise<DownloadConfig> {
  // Desktop app: single config. Check for any existing row regardless of user_id
  const existing = __get('SELECT id, user_id FROM download_configs LIMIT 1', []);

  if (existing) {
    db().prepare(`
      UPDATE download_configs SET
        user_id = ?,
        sabnzbd_host = ?, sabnzbd_port = ?, sabnzbd_api_key = ?,
        sabnzbd_use_ssl = ?, nzbplanet_api_key = ?,
        sabnzbd_complete_path = ?, download_path = ?, post_process_enabled = ?,
        auto_search_wishlist = ?, wishlist_interval_hours = ?,
        preferred_repackers = ?, allow_hypervisor = ?,
        auto_organize_enabled = ?, naming_template = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      config.userId,
      config.sabnzbdHost, config.sabnzbdPort, config.sabnzbdApiKey,
      config.sabnzbdUseSsl ? 1 : 0, config.nzbplanetApiKey,
      config.sabnzbdCompletePath, config.downloadPath, config.postProcessEnabled ? 1 : 0,
      config.autoSearchWishlist ? 1 : 0, config.wishlistIntervalHours,
      config.preferredRepackers, config.allowHypervisor ? 1 : 0,
      config.autoOrganizeEnabled ? 1 : 0, config.namingTemplate ?? null,
      existing.id,
    );
    const cfg = await getConfig();
    if (!cfg) throw new Error('Failed to retrieve saved config');
    return cfg;
  }

  const id = config.id || genId();
  db().prepare(`
    INSERT INTO download_configs (id, user_id, sabnzbd_host, sabnzbd_port, sabnzbd_api_key,
      sabnzbd_use_ssl, nzbplanet_api_key, sabnzbd_complete_path, download_path,
      post_process_enabled, auto_search_wishlist, wishlist_interval_hours, preferred_repackers, allow_hypervisor,
      auto_organize_enabled, naming_template)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, config.userId, config.sabnzbdHost, config.sabnzbdPort, config.sabnzbdApiKey,
    config.sabnzbdUseSsl ? 1 : 0, config.nzbplanetApiKey,
    config.sabnzbdCompletePath, config.downloadPath, config.postProcessEnabled ? 1 : 0,
    config.autoSearchWishlist ? 1 : 0, config.wishlistIntervalHours,
    config.preferredRepackers, config.allowHypervisor ? 1 : 0,
    config.autoOrganizeEnabled ? 1 : 0, config.namingTemplate ?? null,
  );

  const cfg = await getConfig();
  if (!cfg) throw new Error('Failed to retrieve saved config');
  return cfg;
}


export interface Download {
  id: string;
  userId: string;
  mediaItemId: string | null;
  mediaItemTitle: string | null;
  sabnzbdNzoId: string | null;
  status: string;
  nzbName: string | null;
  nzbSize: number | null;
  nzbUrl: string | null;
  isoPath: string | null;
  errorMessage: string | null;
  percentage: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function downloadRowToObj(row: DbRow): Download {
  return {
    id: row.id,
    userId: row.user_id,
    mediaItemId: row.media_item_id,
    mediaItemTitle: row.media_item_title ?? null,
    sabnzbdNzoId: row.sabnzbd_nzo_id,
    status: row.status,
    nzbName: row.nzb_name,
    nzbSize: row.nzb_size,
    nzbUrl: row.nzb_url,
    isoPath: row.iso_path,
    errorMessage: row.error_message,
    percentage: row.percentage != null ? Number(row.percentage) : null,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createDownload(
  userId: string,
  mediaItemId: string | null,
  mediaItemTitle: string | null,
  nzbTitle: string,
  nzbSize: number,
  nzbUrl: string,
  sabnzbdNzoId: string | null,
): Promise<Download> {
  const id = genId();
  db().prepare(`
    INSERT INTO downloads (id, user_id, media_item_id, media_item_title, sabnzbd_nzo_id, status,
      nzb_name, nzb_size, nzb_url)
    VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?)
  `).run(id, userId, mediaItemId, mediaItemTitle, sabnzbdNzoId, nzbTitle, nzbSize, nzbUrl);

  return (await getDownload(id))!;
}

export async function getDownload(id: string): Promise<Download | null> {
  const row = __get('SELECT * FROM downloads WHERE id = ?', [id]);
  return row ? downloadRowToObj(row) : null;
}

export async function getUserDownloads(_userId?: string): Promise<Download[]> {
  const rows = __all('SELECT * FROM downloads ORDER BY created_at DESC', []);
  return rows.map(downloadRowToObj);
}

export async function updateDownloadStatus(id: string, status: string, errorMessage?: string, percentage?: number): Promise<void> {
  if (status === 'completed') {
    db().prepare('UPDATE downloads SET status = ?, percentage = 100, completed_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?').run([status, id]);
  } else if (errorMessage) {
    db().prepare('UPDATE downloads SET status = ?, error_message = ?, percentage = ?, updated_at = datetime(\'now\') WHERE id = ?').run([status, errorMessage, percentage ?? 0, id]);
  } else {
    db().prepare('UPDATE downloads SET status = ?, percentage = ?, updated_at = datetime(\'now\') WHERE id = ?').run([status, percentage ?? 0, id]);
  }
}

export async function updateDownloadIsoPath(id: string, isoPath: string): Promise<void> {
  db().prepare('UPDATE downloads SET iso_path = ?, updated_at = datetime(\'now\') WHERE id = ?').run([isoPath, id]);
}

export async function deleteDownload(id: string): Promise<void> {
  const dl = await getDownload(id);
  if (!dl) return;

  // Delete ISO files from disk
  if (dl.isoPath) {
    const paths = dl.isoPath.split(';');
    for (const p of paths) {
      const trimmed = p.trim();
      if (trimmed) {
        try {
          if (fs.existsSync(trimmed)) {
            fs.unlinkSync(trimmed);
            console.log('[deleteDownload] Deleted ISO:', trimmed);
          }
        } catch (err: any) {
          console.error('[deleteDownload] Failed to delete ISO:', trimmed, err.message);
        }
      }
    }
  }

  // Soft-delete: mark as deleted so it shows in Deleted tab
  db().prepare("UPDATE downloads SET status = 'deleted', iso_path = NULL, updated_at = datetime('now') WHERE id = ?").run(id);
}

export async function purgeOldDeletedDownloads(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const rows = __all("SELECT id FROM downloads WHERE status = 'deleted' AND updated_at < ?", cutoff);
  for (const row of rows) {
    db().prepare('DELETE FROM downloads WHERE id = ?').run(row.id);
  }
  if (rows.length > 0) {
    console.log(`[purge] Purged ${rows.length} deleted downloads older than 30 days`);
  }
  return rows.length;
}

// ── ISO Match Cache ──────────────────────────────────────────────────────

export interface MatchCacheEntry {
  isoPath: string;
  queryTitle: string;
  mediaId: string;
  mediaTitle: string;
  mediaSlug?: string;
  confidence?: number;
  posterUrl?: string;
  logolessPosterUrl?: string;
  logoUrl?: string;
}

export function batchCheckMatchCache(isoPaths: string[]): Record<string, MatchCacheEntry | null> {
  const result: Record<string, MatchCacheEntry | null> = {};
  for (const p of isoPaths) {
    const row = __get('SELECT * FROM iso_match_cache WHERE iso_path = ?', [p]);
    if (row) {
      result[p] = {
        isoPath: row.iso_path,
        queryTitle: row.query_title,
        mediaId: row.media_id,
        mediaTitle: row.media_title,
        mediaSlug: row.media_slug,
        confidence: row.confidence,
        posterUrl: row.poster_url,
        logolessPosterUrl: row.logoless_poster_url,
        logoUrl: row.logo_url,
      };
    } else {
      result[p] = null;
    }
  }
  return result;
}

export function saveMatchCache(entries: MatchCacheEntry[]): void {
  const now = new Date().toISOString();
  for (const e of entries) {
    db().prepare(`
      INSERT INTO iso_match_cache (iso_path, query_title, media_id, media_title, media_slug, confidence, poster_url, logoless_poster_url, logo_url, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(iso_path) DO UPDATE SET
        query_title = excluded.query_title,
        media_id = excluded.media_id,
        media_title = excluded.media_title,
        media_slug = excluded.media_slug,
        confidence = excluded.confidence,
        poster_url = excluded.poster_url,
        logoless_poster_url = excluded.logoless_poster_url,
        logo_url = excluded.logo_url,
        checked_at = excluded.checked_at
    `).run(
      e.isoPath, e.queryTitle, e.mediaId, e.mediaTitle, e.mediaSlug ?? null,
      e.confidence ?? null, e.posterUrl ?? null, e.logolessPosterUrl ?? null,
      e.logoUrl ?? null, now,
    );
  }
}

// ── Path mappings CRUD ───────────────────────────────────────────────────

export interface PathMapping {
  id: string;
  configId: string;
  sourcePath: string;
  destPath: string;
  createdAt: string;
}

export async function getPathMappings(configId: string): Promise<PathMapping[]> {
  const rows = __all('SELECT * FROM download_path_mappings WHERE config_id = ? ORDER BY created_at', [configId]);
  return rows.map((r: DbRow) => ({
    id: r.id,
    configId: r.config_id,
    sourcePath: r.source_path,
    destPath: r.dest_path,
    createdAt: r.created_at,
  }));
}

export async function addPathMapping(configId: string, sourcePath: string, destPath: string): Promise<PathMapping> {
  const id = genId();
  db().prepare('INSERT INTO download_path_mappings (id, config_id, source_path, dest_path) VALUES (?, ?, ?, ?)').run([id, configId, sourcePath, destPath]);
  const row = __get('SELECT * FROM download_path_mappings WHERE id = ?', [id]);
  if (!row) throw new Error('Failed to create path mapping');
  return {
    id: row.id,
    configId: row.config_id,
    sourcePath: row.source_path,
    destPath: row.dest_path,
    createdAt: row.created_at,
  };
}

export async function removePathMapping(id: string): Promise<void> {
  db().prepare('DELETE FROM download_path_mappings WHERE id = ?').run(id);
}

// ── Wishlist tracking ─────────────────────────────────────────────────────

export async function recordWishlistSearch(userId: string, mediaItemId: string, downloadId: string | null): Promise<void> {
  const existing = __get('SELECT id, attempts FROM wishlist_download_tracking WHERE media_item_id = ?', [mediaItemId]);

  if (existing) {
    db().prepare(`
      UPDATE wishlist_download_tracking SET
        last_searched_at = datetime('now'), last_download_id = ?,
        attempts = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(downloadId, (existing.attempts ?? 0) + 1, existing.id);
  } else {
    db().prepare(`
      INSERT INTO wishlist_download_tracking (id, user_id, media_item_id, last_searched_at, last_download_id, attempts)
      VALUES (?, ?, ?, datetime('now'), ?, 1)
    `).run(genId(), userId, mediaItemId, downloadId);
  }
}

export async function getWishlistTracking(userId: string): Promise<{ mediaItemId: string; attempts: number; lastSearchedAt: string | null }[]> {
  const rows = __all('SELECT media_item_id, attempts, last_searched_at FROM wishlist_download_tracking WHERE skipped = 0', []);
  return rows.map((r: DbRow) => ({
    mediaItemId: r.media_item_id,
    attempts: r.attempts,
    lastSearchedAt: r.last_searched_at,
  }));
}

export async function skipWishlistItem(userId: string, mediaItemId: string): Promise<void> {
  const existing = __get('SELECT id FROM wishlist_download_tracking WHERE media_item_id = ?', [mediaItemId]);
  if (existing) {
    db().prepare('UPDATE wishlist_download_tracking SET skipped = 1 WHERE id = ?').run(existing.id);
  } else {
    db().prepare('INSERT INTO wishlist_download_tracking (id, user_id, media_item_id, skipped) VALUES (?, ?, ?, 1)').run([genId(), userId, mediaItemId]);
  }
}

// ── Game and ISO scan database handlers ──

export async function getScannedGamesFromDb(): Promise<any[]> {
  const rows = __all('SELECT * FROM scanned_games', []);
  return rows.map((r: DbRow) => ({
    id: r.id,
    title: r.title,
    exePath: r.exe_path,
    localExePath: r.local_exe_path || undefined,
    installDir: r.install_dir,
    platform: r.platform,
    iconUrl: r.icon_url || undefined,
    posterUrl: r.poster_url || undefined,
    updateFiles: r.update_files ? JSON.parse(r.update_files) : undefined,
    otixMediaId: r.otix_media_id || undefined,
    otixMediaTitle: r.otix_media_title || undefined,
    otixMediaSlug: r.otix_media_slug || undefined,
    otixConfidence: r.otix_confidence != null ? Number(r.otix_confidence) : undefined,
    otixPosterUrl: r.otix_poster_url || undefined,
    otixBackdropUrl: r.otix_backdrop_url || undefined,
    otixTextlessPosterUrl: r.otix_textless_poster_url || undefined,
    otixLogoUrl: r.otix_logo_url || undefined,
    otixIconUrl: r.otix_icon_url || undefined,
    otixMatchSuggestion: r.otix_match_suggestion ? JSON.parse(r.otix_match_suggestion) : undefined,
    seeded: r.seeded === 1,
  }));
}

export async function saveScannedGamesToDb(games: any[]): Promise<void> {
  // Preserve `seeded` flag for games that were already in the DB.
  // The DELETE-then-INSERT pattern would lose it, so we snapshot first.
  const existingSeeded = new Map<string, number>();
  const existingRows = __all('SELECT id, seeded FROM scanned_games');
  for (const r of existingRows) {
    existingSeeded.set(r.id, r.seeded as number);
  }

  // Delete games that are no longer present in this scan batch
  const newIds = [...new Set(games.map((g) => g.id))];
  if (newIds.length > 0) {
    const placeholders = newIds.map(() => '?').join(',');
    db().prepare(`DELETE FROM scanned_games WHERE id NOT IN (${placeholders})`).run(newIds);
  } else {
    db().prepare('DELETE FROM scanned_games').run();
  }

  // Upsert each game, restoring the seeded flag when the game already existed
  for (const g of games) {
    const seeded = existingSeeded.get(g.id) ?? 0;
    db().prepare(`
      INSERT OR REPLACE INTO scanned_games (
        id, title, exe_path, local_exe_path, install_dir, platform, icon_url, poster_url,
        update_files, otix_media_id, otix_media_title, otix_media_slug,
        otix_confidence, otix_match_suggestion, sources, seeded
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      g.id,
      g.title,
      g.exePath,
      g.localExePath || null,
      g.installDir,
      g.platform,
      g.iconUrl || null,
      g.posterUrl || null,
      g.updateFiles ? JSON.stringify(g.updateFiles) : null,
      g.otixMediaId || null,
      g.otixMediaTitle || null,
      g.otixMediaSlug || null,
      g.otixConfidence != null ? g.otixConfidence : null,
      g.otixMatchSuggestion ? JSON.stringify(g.otixMatchSuggestion) : null,
      g.sources ? JSON.stringify(g.sources) : '[]',
      seeded,
    );
  }
}

/**
 * Update a scanned game's paths in the local DB after a file move.
 * Searches by exe_path and updates exe_path + install_dir.
 */
export async function updateGamePathInDb(oldExePath: string, newExePath: string, newInstallDir?: string): Promise<void> {
  db().prepare('UPDATE scanned_games SET exe_path = ?, install_dir = ? WHERE exe_path = ?').run(newExePath, newInstallDir || newExePath.replace(/\/[^/]*$/, ''), oldExePath);
}

export async function getScanPathsFromDb(): Promise<{ path: string; type: 'game' | 'iso' }[]> {
  const rows = __all('SELECT * FROM game_scan_paths');
  return rows.map((r: DbRow) => ({
    path: r.path,
    type: r.type,
  }));
}

export async function saveScanPathsToDb(paths: { path: string; type: 'game' | 'iso' }[]): Promise<void> {
  db().prepare('DELETE FROM game_scan_paths').run();
  for (const p of paths) {
    db().prepare('INSERT OR REPLACE INTO game_scan_paths (path, type) VALUES (?, ?)').run([p.path, p.type]);
  }
}

// ── Seed tracking ─────────────────────────────────────────────────────────

export interface UnseededGame {
  title: string;
  platform: string | null;
  steam_app_id: number | null;
}

/** Return unseeded games from scanned_games, grouped by normalized title.
 *  For Steam games, extracts the numeric Steam App ID from the game's id. */
export function getUnseededGames(): UnseededGame[] {
  const rows = __all('SELECT DISTINCT id, title, platform FROM scanned_games WHERE seeded = 0') as Array<{ id: string; title: string; platform: string }>;

  // Group by normalized title, preferring Steam entries (which have an app ID)
  const byTitle = new Map<string, UnseededGame>();
  for (const row of rows) {
    const key = row.title.toLowerCase().trim();
    const existing = byTitle.get(key);
    // Keep the Steam entry if we already have one
    if (existing && existing.steam_app_id !== null) continue;

    const steamAppId =
      row.platform === 'steam' ? parseInt(row.id, 10) : null;
    byTitle.set(key, {
      title: row.title,
      platform: row.platform,
      steam_app_id: isNaN(steamAppId as number) ? null : steamAppId,
    });
  }

  return Array.from(byTitle.values());
}

/** Mark the given games as seeded in scanned_games (matches by title). */
export function markGamesAsSeeded(games: UnseededGame[]): void {
  if (!games.length) return;
  const titles = games.map(g => g.title);
  const placeholders = titles.map(() => '?').join(',');
  db().prepare(`UPDATE scanned_games SET seeded = 1 WHERE title IN (${placeholders})`).run(titles);
}

/** @deprecated Use getUnseededGames() instead. */
export function getUnseededTitles(): string[] {
  return getUnseededGames().map(g => g.title);
}

/** @deprecated Use markGamesAsSeeded() instead. */
export function markTitlesAsSeeded(titles: string[]): void {
  if (!titles.length) return;
  const placeholders = titles.map(() => '?').join(',');
  db().prepare(`UPDATE scanned_games SET seeded = 1 WHERE title IN (${placeholders})`).run(titles);
}

export async function getLocalGamesMapFromDb(): Promise<Record<string, any>> {
  const rows = __all('SELECT * FROM local_games_map');
  const map: Record<string, any> = {};
  for (const r of rows) {
    try {
      map[r.media_id] = JSON.parse(r.game_json);
    } catch (_) {}
  }
  return map;
}

export async function saveLocalGamesMapEntryToDb(mediaId: string, game: any | null): Promise<void> {
  if (game) {
    db().prepare('INSERT OR REPLACE INTO local_games_map (media_id, game_json) VALUES (?, ?)').run([mediaId, JSON.stringify(game)]);
  } else {
    db().prepare('DELETE FROM local_games_map WHERE media_id = ?').run(mediaId);
  }
}

// ── Config migration ──────────────────────────────────────────────────────

/**
 * Check whether a legacy monolithic config exists in the DB.
 * The actual migration to plugin-level configs is manual for now.
 */
export async function migrateLegacyConfigToPlugins(): Promise<{ migrated: boolean; errors: string[] }> {
  const row = __get('SELECT * FROM download_configs ORDER BY updated_at DESC LIMIT 1');
  if (!row) return { migrated: false, errors: ['No legacy config found'] };
  return { migrated: true, errors: [] };
}
