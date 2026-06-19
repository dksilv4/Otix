import { ensureDb, _run, _get, _all } from '../db';
import {
  PluginInfo,
  PluginManifest,
  PluginPermission,
  PluginStatus,
  PermissionGrant,
  PermissionDuration,
} from './types';

export async function ensurePluginDb(): Promise<void> {
  await ensureDb();

  _run(`
    CREATE TABLE IF NOT EXISTS plugin_registry (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      description TEXT NOT NULL,
      author TEXT NOT NULL,
      repository TEXT,
      source_path TEXT,
      status TEXT NOT NULL DEFAULT 'installed',
      manifest_json TEXT NOT NULL,
      installed_at TEXT NOT NULL DEFAULT (datetime('now')),
      enabled_at TEXT,
      error TEXT
    )
  `);

  // Migration for existing DBs that lack the source_path column
  try { _run('ALTER TABLE plugin_registry ADD COLUMN source_path TEXT'); } catch (_) {}

  _run(`
    CREATE TABLE IF NOT EXISTS plugin_permissions (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      permission TEXT NOT NULL,
      granted_at TEXT NOT NULL DEFAULT (datetime('now')),
      duration TEXT NOT NULL DEFAULT 'always',
      UNIQUE(plugin_id, permission)
    )
  `);

  _run(`
    CREATE TABLE IF NOT EXISTS plugin_repos (
      url TEXT PRIMARY KEY,
      label TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  _run(`
    CREATE TABLE IF NOT EXISTS plugin_config (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      UNIQUE(plugin_id, key)
    )
  `);
}

export function getAllPlugins(): PluginInfo[] {
  const rows = _all('SELECT * FROM plugin_registry ORDER BY name ASC');
  return rows.map(rowToPluginInfo);
}

export function getPlugin(id: string): PluginInfo | null {
  const row = _get('SELECT * FROM plugin_registry WHERE id = ?', [id]);
  return row ? rowToPluginInfo(row) : null;
}

export function insertPlugin(info: PluginInfo): void {
  _run(
    `INSERT OR REPLACE INTO plugin_registry
     (id, name, version, description, author, repository, source_path, status, manifest_json, installed_at, enabled_at, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      info.id,
      info.name,
      info.version,
      info.description,
      info.author,
      info.repository,
      info.sourcePath || null,
      info.status,
      JSON.stringify(info.manifest),
      info.installedAt,
      info.enabledAt || null,
      info.error || null,
    ]
  );
}

export function updatePluginStatus(id: string, status: PluginStatus, error?: string): void {
  if (status === 'enabled') {
    _run(
      "UPDATE plugin_registry SET status = ?, enabled_at = datetime('now'), error = ? WHERE id = ?",
      [status, error || null, id]
    );
  } else {
    _run(
      'UPDATE plugin_registry SET status = ?, error = ? WHERE id = ?',
      [status, error || null, id]
    );
  }
}

export function updatePluginManifest(id: string, manifest: PluginManifest): void {
  _run('UPDATE plugin_registry SET manifest_json = ? WHERE id = ?', [
    JSON.stringify(manifest),
    id,
  ]);
}

export function updatePluginVersion(id: string, version: string, manifest: PluginManifest): void {
  _run('UPDATE plugin_registry SET version = ?, manifest_json = ? WHERE id = ?', [
    version, JSON.stringify(manifest), id
  ]);
}

export function deletePlugin(id: string): void {
  _run('DELETE FROM plugin_permissions WHERE plugin_id = ?', [id]);
  _run('DELETE FROM plugin_config WHERE plugin_id = ?', [id]);
  _run('DELETE FROM plugin_registry WHERE id = ?', [id]);
}

export function getPluginRepos(): { url: string; label: string | null; added_at: string }[] {
  const rows = _all('SELECT url, label, added_at FROM plugin_repos ORDER BY added_at');
  return rows.map(row => ({
    url: row.url as string,
    label: (row.label as string) || null,
    added_at: row.added_at as string,
  }));
}

export function addPluginRepo(url: string, label?: string): void {
  _run('INSERT OR REPLACE INTO plugin_repos (url, label) VALUES (?, ?)', [url, label || null]);
}

export function removePluginRepo(url: string): void {
  _run('DELETE FROM plugin_repos WHERE url = ?', [url]);
}

export function seedDefaultRepo(defaultUrl: string): void {
  const existing = _all('SELECT url FROM plugin_repos');
  if (existing.length === 0) {
    _run('INSERT INTO plugin_repos (url, label) VALUES (?, ?)', [defaultUrl, 'Otix Default']);
  }
}

export function getGrantedPermissions(pluginId: string): PermissionGrant[] {
  const rows = _all(
    'SELECT * FROM plugin_permissions WHERE plugin_id = ?',
    [pluginId]
  );
  return rows.map(row => ({
    pluginId: row.plugin_id as string,
    permission: row.permission as PluginPermission,
    grantedAt: row.granted_at as string,
    duration: (row.duration as PermissionDuration) || 'always',
  }));
}

export function grantPermission(
  pluginId: string,
  permission: PluginPermission,
  duration: PermissionDuration = 'always'
): void {
  const id = `${pluginId}:${permission}`;
  _run(
    `INSERT OR REPLACE INTO plugin_permissions (id, plugin_id, permission, granted_at, duration)
     VALUES (?, ?, ?, datetime('now'), ?)`,
    [id, pluginId, permission, duration]
  );
}

export function revokePermission(pluginId: string, permission: PluginPermission): void {
  _run(
    'DELETE FROM plugin_permissions WHERE plugin_id = ? AND permission = ?',
    [pluginId, permission]
  );
}

export function revokeAllPermissions(pluginId: string): void {
  _run('DELETE FROM plugin_permissions WHERE plugin_id = ?', [pluginId]);
}

export function getPluginConfig(pluginId: string): Record<string, string> {
  const rows = _all(
    'SELECT key, value FROM plugin_config WHERE plugin_id = ?',
    [pluginId]
  );
  const config: Record<string, string> = {};
  for (const row of rows) {
    config[row.key as string] = row.value as string;
  }
  return config;
}

export function setPluginConfig(pluginId: string, key: string, value: string): void {
  const id = `${pluginId}:${key}`;
  _run(
    `INSERT OR REPLACE INTO plugin_config (id, plugin_id, key, value)
     VALUES (?, ?, ?, ?)`,
    [id, pluginId, key, value]
  );
}

export function clearPluginConfig(pluginId: string): void {
  _run('DELETE FROM plugin_config WHERE plugin_id = ?', [pluginId]);
}

function rowToPluginInfo(row: Record<string, unknown>): PluginInfo {
  return {
    id: row.id as string,
    name: row.name as string,
    version: row.version as string,
    description: row.description as string,
    author: row.author as string,
    repository: (row.repository as string) || '',
    sourcePath: (row.source_path as string) || undefined,
    status: row.status as PluginStatus,
    error: (row.error as string) || undefined,
    manifest: JSON.parse(row.manifest_json as string) as PluginManifest,
    installedAt: row.installed_at as string,
    enabledAt: (row.enabled_at as string) || undefined,
  };
}
