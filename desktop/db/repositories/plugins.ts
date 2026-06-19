// desktop/db/repositories/plugins.ts
import type Database from 'better-sqlite3'
import { getConnection } from '../connection'

export interface PluginRegistryRow {
  id: string
  name: string
  version: string
  description: string
  author: string
  repository: string
  source_path: string | null
  status: string
  manifest_json: string
  installed_at: string
  enabled_at: string | null
  updated_at: string
}

export class PluginsRepository {
  private db: Database.Database

  constructor() {
    this.db = getConnection('plugins')
  }

  getAll(): PluginRegistryRow[] {
    return this.db.prepare('SELECT * FROM plugin_registry ORDER BY name').all() as PluginRegistryRow[]
  }

  getById(id: string): PluginRegistryRow | null {
    return (this.db.prepare('SELECT * FROM plugin_registry WHERE id = ?').get(id) as PluginRegistryRow) || null
  }

  insert(row: Omit<PluginRegistryRow, 'installed_at' | 'updated_at'>): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO plugin_registry
        (id, name, version, description, author, repository, source_path, status, manifest_json, enabled_at, updated_at)
      VALUES
        (@id, @name, @version, @description, @author, @repository, @source_path, @status, @manifest_json, @enabled_at, datetime('now'))
    `).run(row)
  }

  updateStatus(id: string, status: string, error?: string): void {
    this.db.prepare(`
      UPDATE plugin_registry SET status = ?, error = ?, updated_at = datetime('now') WHERE id = ?
    `).run(status, error ?? null, id)
  }

  setEnabled(id: string): void {
    this.db.prepare(`
      UPDATE plugin_registry SET status = 'enabled', enabled_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
    `).run(id)
  }

  setDisabled(id: string): void {
    this.db.prepare(`
      UPDATE plugin_registry SET status = 'disabled', updated_at = datetime('now') WHERE id = ?
    `).run(id)
  }

  updateManifest(id: string, manifestJson: string, version: string): void {
    this.db.prepare(`
      UPDATE plugin_registry SET manifest_json = ?, version = ?, updated_at = datetime('now') WHERE id = ?
    `).run(manifestJson, version, id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM plugin_registry WHERE id = ?').run(id)
  }

  // ── Permissions ──
  getPermissions(pluginId: string): { permission: string; duration: string; granted_at: string }[] {
    return this.db.prepare(
      'SELECT permission, duration, granted_at FROM plugin_permissions WHERE plugin_id = ?'
    ).all(pluginId) as { permission: string; duration: string; granted_at: string }[]
  }

  grantPermission(pluginId: string, permission: string, duration: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO plugin_permissions (plugin_id, permission, duration, granted_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(pluginId, permission, duration)
  }

  revokePermission(pluginId: string, permission: string): void {
    this.db.prepare(
      'DELETE FROM plugin_permissions WHERE plugin_id = ? AND permission = ?'
    ).run(pluginId, permission)
  }

  deleteAllPermissions(pluginId: string): void {
    this.db.prepare('DELETE FROM plugin_permissions WHERE plugin_id = ?').run(pluginId)
  }

  // ── Config ──
  getConfig(pluginId: string): Record<string, string> {
    const rows = this.db.prepare(
      'SELECT key, value FROM plugin_config WHERE plugin_id = ?'
    ).all(pluginId) as { key: string; value: string }[]
    const config: Record<string, string> = {}
    for (const row of rows) {
      config[row.key] = row.value
    }
    return config
  }

  setConfig(pluginId: string, key: string, value: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO plugin_config (plugin_id, key, value) VALUES (?, ?, ?)
    `).run(pluginId, key, value)
  }

  deleteAllConfig(pluginId: string): void {
    this.db.prepare('DELETE FROM plugin_config WHERE plugin_id = ?').run(pluginId)
  }

  // ── Repos ──
  getRepos(): { url: string; label: string | null; added_at: string }[] {
    return this.db.prepare('SELECT * FROM plugin_repos ORDER BY added_at').all() as { url: string; label: string | null; added_at: string }[]
  }

  addRepo(url: string, label?: string): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO plugin_repos (url, label, added_at) VALUES (?, ?, datetime(\'now\'))'
    ).run(url, label || null)
  }

  removeRepo(url: string): void {
    this.db.prepare('DELETE FROM plugin_repos WHERE url = ?').run(url)
  }
}
