import { getConnection } from '../db/connection';
import { createMigrationService } from '../db/migration-service';
import pluginsMigration001 from '../db/migrations/plugins/001_initial';
import { PluginsRepository } from '../db/repositories/plugins';
import {
  PluginInfo,
  PluginManifest,
  PluginPermission,
  PluginStatus,
  PermissionGrant,
  PermissionDuration,
} from './types';

const repo = new PluginsRepository();

export async function ensurePluginDb(): Promise<void> {
  getConnection('plugins');
  const svc = createMigrationService('plugins');
  svc.runMigrations([pluginsMigration001]);
}

export function getAllPlugins(): PluginInfo[] {
  return repo.getAll().map(rowToPluginInfo);
}

export function getPlugin(id: string): PluginInfo | null {
  const row = repo.getById(id);
  return row ? rowToPluginInfo(row) : null;
}

export function insertPlugin(info: PluginInfo): void {
  repo.insert({
    id: info.id,
    name: info.name,
    version: info.version,
    description: info.description,
    author: info.author,
    repository: info.repository || '',
    source_path: info.sourcePath || null,
    status: info.status,
    manifest_json: JSON.stringify(info.manifest),
    enabled_at: info.enabledAt || null,
  });
}

export function updatePluginStatus(id: string, status: PluginStatus, error?: string): void {
  if (status === 'enabled') {
    repo.setEnabled(id);
  } else {
    repo.updateStatus(id, status, error);
  }
}

export function updatePluginManifest(id: string, manifest: PluginManifest): void {
  const existing = repo.getById(id);
  if (!existing) return;
  repo.updateManifest(id, JSON.stringify(manifest), existing.version);
}

export function updatePluginVersion(id: string, version: string, manifest: PluginManifest): void {
  repo.updateManifest(id, JSON.stringify(manifest), version);
}

export function deletePlugin(id: string): void {
  repo.deleteAllPermissions(id);
  repo.deleteAllConfig(id);
  repo.delete(id);
}

export function getPluginRepos(): { url: string; label: string | null; added_at: string }[] {
  return repo.getRepos();
}

export function addPluginRepo(url: string, label?: string): void {
  repo.addRepo(url, label);
}

export function removePluginRepo(url: string): void {
  repo.removeRepo(url);
}

export function seedDefaultRepo(defaultUrl: string): void {
  const existing = repo.getRepos();
  if (existing.length === 0) {
    repo.addRepo(defaultUrl, 'Otix Default');
  }
}

export function getGrantedPermissions(pluginId: string): PermissionGrant[] {
  return repo.getPermissions(pluginId).map(row => ({
    pluginId,
    permission: row.permission as PluginPermission,
    grantedAt: row.granted_at,
    duration: (row.duration as PermissionDuration) || 'always',
  }));
}

export function grantPermission(
  pluginId: string,
  permission: PluginPermission,
  duration: PermissionDuration = 'always'
): void {
  repo.grantPermission(pluginId, permission, duration);
}

export function revokePermission(pluginId: string, permission: PluginPermission): void {
  repo.revokePermission(pluginId, permission);
}

export function revokeAllPermissions(pluginId: string): void {
  repo.deleteAllPermissions(pluginId);
}

export function getPluginConfig(pluginId: string): Record<string, string> {
  return repo.getConfig(pluginId);
}

export function setPluginConfig(pluginId: string, key: string, value: string): void {
  repo.setConfig(pluginId, key, value);
}

export function clearPluginConfig(pluginId: string): void {
  repo.deleteAllConfig(pluginId);
}

function rowToPluginInfo(row: import('../db/repositories/plugins').PluginRegistryRow): PluginInfo {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    description: row.description,
    author: row.author,
    repository: row.repository || '',
    sourcePath: row.source_path || undefined,
    status: row.status as PluginStatus,
    error: undefined,
    manifest: JSON.parse(row.manifest_json) as PluginManifest,
    installedAt: row.installed_at,
    enabledAt: row.enabled_at || undefined,
  };
}
