/* ── SaveService — data access layer for save management ──
 *
 * All database operations for the save system go through this service.
 * The save-daemon uses it for all persistence — no direct _run/_get/_all calls.
 */

import { _run, _get, _all, ensureDb } from './db';

export interface SaveProfileRow {
  id: string;
  game_id: string;
  name: string;
  is_active: number;
  created_at: string;
}

export interface VaultSaveRow {
  id: string;
  game_id: string;
  profile_id: string;
  file_name: string;
  file_size: number;
  file_hash: string;
  vault_path: string;
  origin_path: string;
  updated_at: string;
}

export interface SaveSnapshotRow {
  id: string;
  profile_id: string;
  name: string | null;
  snapshot_dir: string;
  file_count: number;
  total_size: number;
  created_at: string;
}

export interface KnownLocationRow {
  id: string;
  title_pattern: string;
  os_windows: string | null;
  os_mac: string | null;
  os_linux: string | null;
}

export interface OverrideRow {
  game_id: string;
  user_path: string;
  updated_at: string;
}

/* ── Known locations ── */

export function getAllKnownLocations(): KnownLocationRow[] {
  return _all('SELECT * FROM known_save_locations', []) as KnownLocationRow[];
}

export function upsertKnownLocation(
  id: string,
  titlePattern: string,
  osWindows: string | null,
  osMac: string | null,
  osLinux: string | null,
): void {
  _run(
    `INSERT OR REPLACE INTO known_save_locations (id, title_pattern, os_windows, os_mac, os_linux)
     VALUES (?, ?, ?, ?, ?)`,
    [id, titlePattern, osWindows, osMac, osLinux],
  );
}

/* ── Profiles ── */

export function getProfilesByGameId(gameId: string): SaveProfileRow[] {
  return _all(
    'SELECT * FROM save_profiles WHERE game_id = ? ORDER BY created_at DESC',
    [gameId],
  ) as SaveProfileRow[];
}

export function getProfileById(profileId: string): SaveProfileRow | null {
  return (_get('SELECT * FROM save_profiles WHERE id = ?', [profileId]) as SaveProfileRow | undefined) ?? null;
}

export function createProfile(id: string, gameId: string, name: string, isActive = 0): void {
  _run(
    'INSERT INTO save_profiles (id, game_id, name, is_active) VALUES (?, ?, ?, ?)',
    [id, gameId, name, isActive],
  );
}

export function getActiveProfile(gameId: string): SaveProfileRow | null {
  return (_get(
    'SELECT id FROM save_profiles WHERE game_id = ? AND is_active = 1',
    [gameId],
  ) as SaveProfileRow | undefined) ?? null;
}

export function deactivateAllProfiles(gameId: string): void {
  _run('UPDATE save_profiles SET is_active = 0 WHERE game_id = ?', [gameId]);
}

export function activateProfile(profileId: string): void {
  _run('UPDATE save_profiles SET is_active = 1 WHERE id = ?', [profileId]);
}

export function deleteProfile(profileId: string): void {
  _run('DELETE FROM save_profiles WHERE id = ?', [profileId]);
}

/* ── Vault saves ── */

export function getSavesByProfile(profileId: string): VaultSaveRow[] {
  return _all('SELECT * FROM vault_saves WHERE profile_id = ?', [profileId]) as VaultSaveRow[];
}

export function getSavesByGame(gameId: string): VaultSaveRow[] {
  return _all('SELECT * FROM vault_saves WHERE game_id = ?', [gameId]) as VaultSaveRow[];
}

export function upsertVaultSave(
  id: string,
  gameId: string,
  profileId: string,
  fileName: string,
  fileSize: number,
  fileHash: string,
  vaultPath: string,
  originPath: string,
): void {
  _run(
    `INSERT OR REPLACE INTO vault_saves (id, game_id, profile_id, file_name, file_size, file_hash, vault_path, origin_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, gameId, profileId, fileName, fileSize, fileHash, vaultPath, originPath],
  );
}

export function deleteVaultSavesByProfile(profileId: string): void {
  _run('DELETE FROM vault_saves WHERE profile_id = ?', [profileId]);
}

/* ── Snapshots ── */

export function getSnapshotsByProfile(profileId: string): SaveSnapshotRow[] {
  return _all(
    'SELECT * FROM save_snapshots WHERE profile_id = ? ORDER BY created_at DESC',
    [profileId],
  ) as SaveSnapshotRow[];
}

export function getSnapshotById(snapshotId: string): SaveSnapshotRow | null {
  return (_get('SELECT * FROM save_snapshots WHERE id = ?', [snapshotId]) as SaveSnapshotRow | undefined) ?? null;
}

export function createSnapshot(
  id: string,
  profileId: string,
  name: string | null,
  snapshotDir: string,
  fileCount: number,
  totalSize: number,
): void {
  _run(
    `INSERT INTO save_snapshots (id, profile_id, name, snapshot_dir, file_count, total_size)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, profileId, name, snapshotDir, fileCount, totalSize],
  );
}

export function deleteSnapshot(snapshotId: string): void {
  _run('DELETE FROM save_snapshots WHERE id = ?', [snapshotId]);
}

export function deleteSnapshotsByProfile(profileId: string): void {
  _run('DELETE FROM save_snapshots WHERE profile_id = ?', [profileId]);
}

/* ── Overrides ── */

export function getOverride(gameId: string): OverrideRow | null {
  return (_get('SELECT * FROM game_save_overrides WHERE game_id = ?', [gameId]) as OverrideRow | undefined) ?? null;
}

export function upsertOverride(gameId: string, userPath: string): void {
  _run(
    `INSERT OR REPLACE INTO game_save_overrides (game_id, user_path, updated_at)
     VALUES (?, ?, datetime('now'))`,
    [gameId, userPath],
  );
}

export function deleteOverride(gameId: string): void {
  _run('DELETE FROM game_save_overrides WHERE game_id = ?', [gameId]);
}

/* ── Cloud Settings ── */

export interface CloudSettingsRow {
  game_id: string;
  auto_sync: number;
  last_sync_at: string | null;
  is_path_confirmed: number;
  confirmed_path: string | null;
}

export function getCloudSettings(gameId: string): CloudSettingsRow | null {
  return (_get('SELECT * FROM game_save_cloud_settings WHERE game_id = ?', [gameId]) as CloudSettingsRow | undefined) ?? null;
}

export function upsertCloudSettings(gameId: string, autoSync: number, lastSyncAt: string | null): void {
  const exists = _get('SELECT game_id FROM game_save_cloud_settings WHERE game_id = ?', [gameId]);
  if (exists) {
    _run(
      'UPDATE game_save_cloud_settings SET auto_sync = ?, last_sync_at = ? WHERE game_id = ?',
      [autoSync, lastSyncAt, gameId],
    );
  } else {
    _run(
      'INSERT INTO game_save_cloud_settings (game_id, auto_sync, last_sync_at, is_path_confirmed, confirmed_path) VALUES (?, ?, ?, 0, NULL)',
      [gameId, autoSync, lastSyncAt],
    );
  }
}

export function confirmPath(gameId: string, isConfirmed: number, confirmedPath: string | null): void {
  const exists = _get('SELECT game_id FROM game_save_cloud_settings WHERE game_id = ?', [gameId]);
  if (exists) {
    _run(
      'UPDATE game_save_cloud_settings SET is_path_confirmed = ?, confirmed_path = ? WHERE game_id = ?',
      [isConfirmed, confirmedPath, gameId],
    );
  } else {
    _run(
      'INSERT INTO game_save_cloud_settings (game_id, auto_sync, last_sync_at, is_path_confirmed, confirmed_path) VALUES (?, 0, NULL, ?, ?)',
      [gameId, isConfirmed, confirmedPath],
    );
  }
}

export function getOtixMediaId(gameId: string): string | null {
  const row = _get('SELECT otix_media_id FROM scanned_games WHERE id = ?', [gameId]) as any;
  return row?.otix_media_id ?? null;
}

/* ── Aggregates ── */

export function getSaveCount(): number {
  const row = _get('SELECT COUNT(*) as cnt FROM vault_saves', []) as any;
  return row?.cnt ?? 0;
}

export function getDistinctGameCount(): number {
  const row = _get('SELECT COUNT(DISTINCT game_id) as cnt FROM vault_saves', []) as any;
  return row?.cnt ?? 0;
}

export function getTotalSaveSize(): number {
  const row = _get('SELECT COALESCE(SUM(file_size), 0) as total FROM vault_saves', []) as any;
  return row?.total ?? 0;
}

export function getLatestSnapshotDate(): string | null {
  const row = _get('SELECT created_at FROM save_snapshots ORDER BY created_at DESC LIMIT 1', []) as any;
  return row?.created_at ?? null;
}
