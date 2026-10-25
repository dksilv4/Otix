import type {
  ExplorerDrive,
  ExplorerShortcut,
  FormatCategory,
  NodeExplorerBrowseResult,
  NodeExplorerEntry,
  NodePathBreadcrumb,
} from './node-explorer-types';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function pickValue(value: Record<string, unknown>, camel: string, snake: string): unknown {
  return value[camel] ?? value[snake]
}

function normalizeExplorerShortcut(raw: unknown): ExplorerShortcut {
  const item = asRecord(raw)
  return {
    name: String(item.name ?? ''),
    path: String(item.path ?? ''),
    icon: String(item.icon ?? 'folder'),
    exist: Boolean(pickValue(item, 'exist', 'exist') ?? true),
  }
}

function normalizeExplorerDrive(raw: unknown): ExplorerDrive {
  const item = asRecord(raw)
  return {
    name: String(item.name ?? ''),
    path: String(item.path ?? ''),
    free_bytes: (pickValue(item, 'freeBytes', 'free_bytes') as number | null | undefined) ?? null,
    total_bytes: (pickValue(item, 'totalBytes', 'total_bytes') as number | null | undefined) ?? null,
  }
}

function normalizeExplorerEntry(raw: unknown): NodeExplorerEntry {
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
export function normalizeExplorerBrowse(raw: unknown): NodeExplorerBrowseResult {
  const data = asRecord(raw)
  const entries = Array.isArray(data.entries) ? data.entries : []
  const rawShortcuts = Array.isArray(pickValue(data, 'shortcuts', 'shortcuts'))
    ? (pickValue(data, 'shortcuts', 'shortcuts') as unknown[])
    : []
  const rawDrives = Array.isArray(pickValue(data, 'drives', 'drives'))
    ? (pickValue(data, 'drives', 'drives') as unknown[])
    : []
  const permissionDenied = Boolean(pickValue(data, 'permissionDenied', 'permission_denied'))
  const permissionMessage = pickValue(data, 'permissionMessage', 'permission_message') as string | undefined

  const shortcuts = rawShortcuts.map(normalizeExplorerShortcut)
  let drives = rawDrives.map(normalizeExplorerDrive)

  // Fallback: If no explicit drives array was sent, extract drives from shortcuts
  if (drives.length === 0 && shortcuts.length > 0) {
    for (const sc of shortcuts) {
      if (sc.icon === 'root' || /^[a-zA-Z]:[\\/]?$/.test(sc.path) || sc.name.toLowerCase().includes('drive')) {
        drives.push({
          name: sc.name.replace(/\s+Drive$/i, ''),
          path: sc.path,
        })
      }
    }
  }

  return {
    current_path: String(pickValue(data, 'currentPath', 'current_path') ?? '/'),
    parent_path: (pickValue(data, 'parentPath', 'parent_path') as string | null | undefined) ?? null,
    is_root: Boolean(pickValue(data, 'isRoot', 'is_root')),
    entries: entries.map(normalizeExplorerEntry),
    active_download_path: String(pickValue(data, 'activeDownloadPath', 'active_download_path') ?? ''),
    total_items: Number(pickValue(data, 'totalItems', 'total_items') ?? entries.length) || 0,
    disk_free_bytes: (pickValue(data, 'diskFreeBytes', 'disk_free_bytes') as number | null | undefined) ?? null,
    disk_total_bytes: (pickValue(data, 'diskTotalBytes', 'disk_total_bytes') as number | null | undefined) ?? null,
    shortcuts,
    drives,
    permission_denied: permissionDenied,
    permission_message: permissionMessage,
  }
}

/** Check if current path resides on a given drive. */
export function isPathOnDrive(currentPath: string | undefined, drivePath: string): boolean {
  if (!currentPath || !drivePath) return false
  const normCurrent = currentPath.replace(/\\/g, '/').toLowerCase()
  const normDrive = drivePath.replace(/\\/g, '/').toLowerCase()
  if (normDrive === '/' || normDrive === '') return normCurrent.startsWith('/')
  return normCurrent.startsWith(normDrive.replace(/\/+$/, ''))
}

/** Split a path into navigation breadcrumbs supporting Windows and POSIX separators. */
export function parseBreadcrumbs(fullPath: string): NodePathBreadcrumb[] {
  if (!fullPath) return [];

  const isWindows = /^[a-zA-Z]:[\\/]/.test(fullPath);
  const isUnc = fullPath.startsWith('\\\\') || fullPath.startsWith('//');
  const sep = (isWindows || isUnc) && fullPath.includes('\\') ? '\\' : '/';
  const parts = fullPath.split(/[\\/]/).filter(Boolean);

  const crumbs: NodePathBreadcrumb[] = [];

  if (isUnc) {
    if (parts.length >= 2) {
      const shareRoot = `\\\\${parts[0]}\\${parts[1]}`;
      crumbs.push({ label: shareRoot, fullPath: shareRoot });
      let accumulated = shareRoot;
      for (let i = 2; i < parts.length; i++) {
        accumulated += `\\${parts[i]}`;
        crumbs.push({ label: parts[i], fullPath: accumulated });
      }
      return crumbs;
    } else if (parts.length === 1) {
      const host = `\\\\${parts[0]}`;
      crumbs.push({ label: host, fullPath: host });
      return crumbs;
    }
  }

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
        text: 'text-purple-600 dark:text-purple-400',
        border: 'border-purple-500/30',
        label: 'ISO',
      };
    case 'installer':
      return {
        bg: 'bg-emerald-500/15',
        text: 'text-emerald-600 dark:text-emerald-400',
        border: 'border-emerald-500/30',
        label: 'INSTALLER',
      };
    case 'game':
      return {
        bg: 'bg-blue-500/15',
        text: 'text-blue-600 dark:text-blue-400',
        border: 'border-blue-500/30',
        label: 'GAME',
      };
    case 'archive':
      return {
        bg: 'bg-amber-500/15',
        text: 'text-amber-600 dark:text-amber-400',
        border: 'border-amber-500/30',
        label: 'ARCHIVE',
      };
    case 'rom':
      return {
        bg: 'bg-cyan-500/15',
        text: 'text-cyan-600 dark:text-cyan-400',
        border: 'border-cyan-500/30',
        label: 'ROM',
      };
    case 'folder':
      return {
        bg: 'bg-[var(--dk-surface-ghost)]',
        text: 'text-foreground/80',
        border: 'border-[var(--dk-separator)]',
        label: 'FOLDER',
      };
    default:
      return {
        bg: 'bg-[var(--dk-surface-ghost)]',
        text: 'text-muted-foreground',
        border: 'border-[var(--dk-separator)]',
        label: 'FILE',
      };
  }
}

/** Filter and sort explorer entries: folders first, then files alphabetically. */
export function sortExplorerEntries(
  entries: NodeExplorerEntry[],
  searchFilter: string = '',
): NodeExplorerEntry[] {
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

/**
 * Normalize network share path inputs, converting single-slash, forward-slash,
 * or bare hostname prefixes into standard Windows UNC (`\\server\share`).
 */
export function normalizeShareURLInput(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (
    /^[a-zA-Z]:/i.test(trimmed) ||
    trimmed.toLowerCase().startsWith('smb://') ||
    trimmed.toLowerCase().startsWith('cifs://')
  ) {
    return trimmed;
  }
  const stripped = trimmed.replace(/^[\\/]+/, '');
  if (stripped.includes('\\') || stripped.includes('/')) {
    return `\\\\${stripped.replace(/\//g, '\\')}`;
  }
  return trimmed;
}
