import type { PluginPermission } from './types';
import { getPluginRepos } from './plugin-db';

export interface RegistryEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  repository: string;
  path?: string;
  icon?: string;
  category?: string;
  tags?: string[];
  min_app_version?: string;
  permissions: PluginPermission[];
}

interface RegistryData {
  plugins: RegistryEntry[];
  updated_at?: string;
}

export const DEFAULT_REGISTRY_URL = 'https://raw.githubusercontent.com/dksilv4/otix-plugins/main/registry.json';

export async function fetchRegistry(registryUrl?: string): Promise<RegistryEntry[]> {
  const url = registryUrl || DEFAULT_REGISTRY_URL;

  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch registry (HTTP ${response.status})`);
  }

  const data: RegistryData = await response.json();

  if (!data.plugins || !Array.isArray(data.plugins)) {
    throw new Error('Invalid registry format: missing plugins array');
  }

  return data.plugins.filter(entry => {
    return entry.id && entry.name && entry.repository && entry.permissions;
  });
}

export async function fetchAllRegistries(): Promise<{ entries: RegistryEntry[]; errors: string[] }> {
  const allEntries: RegistryEntry[] = [];
  const errors: string[] = [];
  const seenIds = new Set<string>();

  const repos = getPluginRepos();

  if (repos.length === 0) {
    return { entries: [], errors: ['No plugin repos configured. Add a registry URL to discover plugins.'] };
  }

  for (const repo of repos) {
    try {
      const entries = await fetchRegistry(repo.url);
      for (const entry of entries) {
        if (!seenIds.has(entry.id)) {
          seenIds.add(entry.id);
          allEntries.push(entry);
        }
      }
    } catch (err) {
      errors.push(`${repo.label || repo.url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { entries: allEntries, errors };
}
