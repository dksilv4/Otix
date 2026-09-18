/** Utility functions for the Otix Server File Explorer. */

import type {
  FormatCategory,
  ServerExplorerBrowseResult,
  ServerExplorerEntry,
  ServerPathBreadcrumb,
} from './server-explorer-types';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function pickValue(value: Record<string, unknown>, camel: string, snake: string): unknown {
  return value[camel] ?? value[snake]
}

function normalizeExplorerEntry(raw: unknown): ServerExplorerEntry {
  const entry = asRecord(raw)
  const format = pickValue(entry, 'formatCategory', 'format_category')
  return {
    name: String(entry.name ?? ''),
    path: String(entry.path ?? ''),
    is_dir: Boolean(pickValue(entry, 'isDir', 'is_dir')),
    size: Number(entry.size ?? 0) || 0,
    extension: String(entry.extension ?? ''),
    format_category: (typeof format === 'string' ? format : 'file') as FormatCategory,
    modified_at: (pickValue(entry, 'modifiedAt', 'modified_at') as string | null | undefined) ?? null,
    is_downloadable: Boolean(pickValue(entry, 'isDownloadable', 'is_downloadable')),
    is_download_location: Boolean(pickValue(entry, 'isDownloadLocation', 'is_download_location')),
  }
}

/** Map explorer payloads from camelCase (apiClient) or snake_case onto typed fields. */
export function normalizeExplorerBrowse(raw: unknown): ServerExplorerBrowseResult {
  const data = asRecord(raw)
  const entries = Array.isArray(data.entries) ? data.entries : []
  return {
    current_path: String(pickValue(data, 'currentPath', 'current_path') ?? '/'),
    parent_path: (pickValue(data, 'parentPath', 'parent_path') as string | null | undefined) ?? null,
    is_root: Boolean(pickValue(data, 'isRoot', 'is_root')),
    entries: entries.map(normalizeExplorerEntry),
    active_download_path: String(pickValue(data, 'activeDownloadPath', 'active_download_path') ?? ''),
    total_items: Number(pickValue(data, 'totalItems', 'total_items') ?? entries.length) || 0,
    disk_free_bytes: (pickValue(data, 'diskFreeBytes', 'disk_free_bytes') as number | null | undefined) ?? null,
    disk_total_bytes: (pickValue(data, 'diskTotalBytes', 'disk_total_bytes') as number | null | undefined) ?? null,
  }
}

/** Split a path into navigation breadcrumbs supporting Windows and POSIX separators. */
export function parseBreadcrumbs(fullPath: string): ServerPathBreadcrumb[] {
  if (!fullPath) return [];

  const isWindows = /^[a-zA-Z]:[\\/]/.test(fullPath);
  const sep = isWindows && fullPath.includes('\\') ? '\\' : '/';
  const parts = fullPath.split(/[\\/]/).filter(Boolean);

  const crumbs: ServerPathBreadcrumb[] = [];

  if (fullPath.startsWith('/') && !isWindows) {
    crumbs.push({ label: 'Root (/)', fullPath: '/' });
  }

  let accumulated = isWindows ? '' : fullPath.startsWith('/') ? '/' : '';

  parts.forEach((part, idx) => {
    if (idx === 0 && isWindows) {
      accumulated = `${part}${sep}`;
      crumbs.push({ label: part, fullPath: accumulated });
    } else {
      if (accumulated && !accumulated.endsWith(sep)) {
        accumulated += sep;
      }
      accumulated += part;
      crumbs.push({ label: part, fullPath: accumulated });
    }
  });

  return crumbs;
}

/** Check if two paths point to the same filesystem directory by normalizing separators. */
export function isPathEqual(pathA?: string | null, pathB?: string | null): boolean {
  if (!pathA || !pathB) return false;
  const normA = pathA.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const normB = pathB.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return normA === normB;
}

/** Color styles for file category badges matching Otix theme. */
export function getFormatBadgeColor(format: FormatCategory): {
  bg: string;
  text: string;
  border: string;
  label: string;
} {
  switch (format) {
    case 'iso':
      return {
        bg: 'bg-purple-500/15',
        text: 'text-purple-400',
        border: 'border-purple-500/30',
        label: 'ISO',
      };
    case 'installer':
      return {
        bg: 'bg-emerald-500/15',
        text: 'text-emerald-400',
        border: 'border-emerald-500/30',
        label: 'INSTALLER',
      };
    case 'archive':
      return {
        bg: 'bg-amber-500/15',
        text: 'text-amber-400',
        border: 'border-amber-500/30',
        label: 'ARCHIVE',
      };
    case 'rom':
      return {
        bg: 'bg-cyan-500/15',
        text: 'text-cyan-400',
        border: 'border-cyan-500/30',
        label: 'ROM',
      };
    case 'folder':
      return {
        bg: 'bg-white/5',
        text: 'text-white/70',
        border: 'border-white/10',
        label: 'FOLDER',
      };
    default:
      return {
        bg: 'bg-white/[0.04]',
        text: 'text-white/40',
        border: 'border-white/[0.08]',
        label: 'FILE',
      };
  }
}

/** Filter and sort explorer entries: folders first, then files alphabetically. */
export function sortExplorerEntries(
  entries: ServerExplorerEntry[],
  searchFilter: string = '',
): ServerExplorerEntry[] {
  let filtered = entries;
  if (searchFilter.trim()) {
    const q = searchFilter.toLowerCase().trim();
    filtered = entries.filter((e) => e.name.toLowerCase().includes(q));
  }

  return [...filtered].sort((a, b) => {
    if (a.is_dir !== b.is_dir) {
      return a.is_dir ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

/** Format ISO timestamp to compact human string. */
export function formatExplorerDate(isoDate?: string | null): string {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}
