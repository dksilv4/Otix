/** Dedicated utility functions for Usenet (Prowlarr & SABnzbd) releases and metrics. */

import type {
  ProwlarrIndexerItem,
  ServerProwlarrConfig,
  ServerProwlarrRelease,
  ServerSabnzbdConfig,
} from './usenet-types';

export interface ReleaseBadge {
  label: string;
  bg: string;
  text: string;
}

const BADGE_PATTERNS: { pattern: RegExp; label: string; bg: string; text: string }[] = [
  { pattern: /\bgog\b/i, label: 'GOG', bg: 'bg-purple-500/15', text: 'text-purple-400' },
  { pattern: /\bfitgirl\b/i, label: 'FitGirl', bg: 'bg-pink-500/15', text: 'text-pink-400' },
  { pattern: /\bdodi\b/i, label: 'DODI', bg: 'bg-amber-500/15', text: 'text-amber-400' },
  { pattern: /\belamigos\b/i, label: 'ElAmigos', bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  { pattern: /\bflt\b/i, label: 'FLT', bg: 'bg-blue-500/15', text: 'text-blue-400' },
  { pattern: /\brune\b/i, label: 'RUNE', bg: 'bg-cyan-500/15', text: 'text-cyan-400' },
  { pattern: /\bcodex\b/i, label: 'CODEX', bg: 'bg-zinc-500/15', text: 'text-zinc-300' },
  { pattern: /\brepack\b/i, label: 'Repack', bg: 'bg-indigo-500/15', text: 'text-indigo-400' },
  { pattern: /\biso\b/i, label: 'ISO', bg: 'bg-purple-500/15', text: 'text-purple-300' },
];

/** Extract format and scene badges from a release title. */
export function extractReleaseBadges(title: string): ReleaseBadge[] {
  const badges: ReleaseBadge[] = [];
  for (const b of BADGE_PATTERNS) {
    if (b.pattern.test(title)) {
      badges.push({ label: b.label, bg: b.bg, text: b.text });
    }
  }
  return badges;
}

/** Format age in days to compact human string. */
export function formatAgeDays(days?: number | null): string {
  if (days == null || isNaN(days)) return '';
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = (days / 365).toFixed(1);
  return `${years}y ago`;
}

export interface UploadDateInfo {
  dateStr: string;
  relativeStr: string;
  display: string;
  fullTitle: string;
}

/** Format upload / publish date and relative age for a release. */
export function formatUploadDate(
  publishDate?: string | null,
  ageDays?: number | null,
): UploadDateInfo | null {
  let date: Date | null = null;

  if (publishDate) {
    const d = new Date(publishDate);
    if (!isNaN(d.getTime())) {
      date = d;
    }
  }

  if (!date && ageDays != null && !isNaN(ageDays)) {
    date = new Date(Date.now() - ageDays * 86_400_000);
  }

  if (!date && (ageDays == null || isNaN(ageDays))) {
    return null;
  }

  const dateStr = date
    ? date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '';

  const relativeStr = formatAgeDays(
    ageDays != null && !isNaN(ageDays)
      ? ageDays
      : date
        ? Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000))
        : null,
  );

  const display = dateStr && relativeStr
    ? `${dateStr} (${relativeStr})`
    : (dateStr || relativeStr);

  const fullTitle = date
    ? `Uploaded on ${date.toLocaleDateString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}`
    : `Uploaded ${relativeStr}`;

  return { dateStr, relativeStr, display, fullTitle };
}

/** Clean a dot-separated or underscore-separated scene title for clear readability. */
export function cleanReleaseTitle(raw: string): string {
  if (!raw) return '';
  const withoutExt = raw.replace(/\.(nzb|rar|iso|zip|exe)$/i, '');
  const spaceCleaned = withoutExt.replace(/[._]/g, ' ');
  return spaceCleaned.trim();
}

/** Map a Prowlarr release from either snake_case (API) or camelCase (axios interceptor). */
export function normalizeProwlarrRelease(raw: unknown): ServerProwlarrRelease | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const title = String(item.title ?? '').trim()
  if (!title) return null

  let downloadUrl = String(item.downloadUrl ?? item.download_url ?? item.magnetUrl ?? item.magnet_url ?? '')
  const guid = String(item.guid ?? item.id ?? title)
  if (!downloadUrl && guid.startsWith('magnet:')) {
    downloadUrl = guid
  }
  const infoUrl = item.infoUrl ?? item.info_url
  const publishDate = item.publishDate ?? item.publish_date
  const ageDays = item.ageDays ?? item.age_days

  return {
    guid,
    title,
    size: Number(item.size ?? 0) || 0,
    download_url: downloadUrl,
    info_url: typeof infoUrl === 'string' ? infoUrl : null,
    publish_date: typeof publishDate === 'string' ? publishDate : null,
    indexer: String(item.indexer ?? 'Indexer'),
    protocol: String(item.protocol ?? 'usenet'),
    age_days: typeof ageDays === 'number' ? ageDays : ageDays != null ? Number(ageDays) || null : null,
    seeders: typeof item.seeders === 'number' ? item.seeders : null,
  }
}

export function releaseDownloadUrl(release: ServerProwlarrRelease): string {
  return release.download_url || ''
}

/** Rank and sort search results by preferred repackers, scene tags, and size. */
export function sortReleasesByQuality(
  releases: ServerProwlarrRelease[],
  preferredRepackers: string[] = [],
): ServerProwlarrRelease[] {
  const lowerRepackers = preferredRepackers.map((r) => r.toLowerCase().trim()).filter(Boolean);

  return [...releases].sort((a, b) => {
    const titleA = a.title.toLowerCase();
    const titleB = b.title.toLowerCase();

    // 1. Check preferred repackers
    const prefA = lowerRepackers.some((r) => titleA.includes(r));
    const prefB = lowerRepackers.some((r) => titleB.includes(r));
    if (prefA && !prefB) return -1;
    if (!prefA && prefB) return 1;

    // 2. Check scene/trusted tags
    const sceneA = BADGE_PATTERNS.some((bp) => bp.pattern.test(a.title));
    const sceneB = BADGE_PATTERNS.some((bp) => bp.pattern.test(b.title));
    if (sceneA && !sceneB) return -1;
    if (!sceneA && sceneB) return 1;

    // 3. Fallback: newer releases first if age_days is known
    if (a.age_days != null && b.age_days != null) {
      return a.age_days - b.age_days;
    }

    return 0;
  });
}

export interface ParsedServiceUrl {
  host: string;
  port?: number;
  use_ssl?: boolean;
  url_base?: string;
}

/**
 * Parse a URL or host string (e.g. "server.diogodasilva.com/sabnzbd", "http://nas.local:8080/sabnzbd", "https://192.168.1.50/prowlarr", "localhost:9696")
 * into host, port, use_ssl, and url_base components.
 */
export function parseServiceAddress(rawInput: string, defaultPort?: number): ParsedServiceUrl {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { host: '' };
  }

  // 1. Auto-clean common typo commas between alphanumeric domain characters:
  // "server,diogodasilva.com" -> "server.diogodasilva.com"
  const sanitized = trimmed.replace(/([a-zA-Z0-9_-]),([a-zA-Z0-9_-])/g, '$1.$2');

  const hasScheme = /^https?:\/\//i.test(sanitized);
  const toParse = hasScheme ? sanitized : `http://${sanitized}`;

  try {
    const url = new URL(toParse);
    const host = url.hostname;
    const isDomain = host.includes('.') && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host);

    let port: number | undefined;
    let use_ssl: boolean | undefined;

    if (hasScheme) {
      use_ssl = url.protocol === 'https:';
      if (url.port) {
        port = parseInt(url.port, 10);
      } else {
        port = use_ssl ? 443 : 80;
      }
    } else if (url.port) {
      port = parseInt(url.port, 10);
      use_ssl = port === 443;
    } else if (isDomain) {
      // Custom user domain without explicit port -> standard HTTPS reverse proxy port 443
      port = 443;
      use_ssl = true;
    } else if (defaultPort != null) {
      port = defaultPort;
      use_ssl = false;
    }

    const pathname = url.pathname.replace(/^\/+|\/+$/g, '');
    const url_base = pathname ? `/${pathname}` : '';

    return {
      host,
      port,
      use_ssl,
      url_base,
    };
  } catch {
    return { host: sanitized };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Normalize Prowlarr indexer payloads from GET arrays or nested sync responses. */
export function normalizeProwlarrIndexers(raw: unknown): ProwlarrIndexerItem[] {
  const nested = asRecord(raw)
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray(nested?.indexers)
      ? nested.indexers
      : Array.isArray(nested?.Indexers)
        ? nested.Indexers
        : []

  return rows.flatMap((row, index) => {
    const item = asRecord(row)
    if (!item) return []
    const name = String(item.name ?? item.Name ?? '').trim()
    if (!name) return []
    const protocol = String(item.protocol ?? item.Protocol ?? 'usenet').toLowerCase()
    const idValue = item.id ?? item.Id ?? index
    const id = typeof idValue === 'number' ? idValue : Number(idValue) || index
    return [{
      id,
      name,
      protocol,
      enable: item.enable !== false && item.Enable !== false,
      priority: typeof item.priority === 'number'
        ? item.priority
        : typeof item.Priority === 'number'
          ? item.Priority
          : undefined,
    }]
  })
}

/** Filter indexers by protocol ('all' | 'torrent' | 'usenet'). */
export function filterIndexersByProtocol<T extends { protocol?: string }>(
  indexers?: T[] | unknown[] | Record<string, unknown> | null,
  protocol: 'all' | 'torrent' | 'usenet' | string = 'all'
): T[] {
  const list = (Array.isArray(indexers) ? indexers : []) as T[]
  const p = (protocol || 'all').toLowerCase().trim();
  if (p === 'all' || !p) return list;
  return list.filter((idx) => (idx.protocol || '').toLowerCase() === p);
}

/** Calculate summary stats for indexers breakdown. */
export function calculateIndexerStats(
  indexers: Array<{ protocol?: string; enable?: boolean }>
) {
  const total = indexers.length;
  const usenet = indexers.filter((i) => (i.protocol || '').toLowerCase() === 'usenet').length;
  const torrent = indexers.filter((i) => (i.protocol || '').toLowerCase() === 'torrent').length;
  const enabled = indexers.filter((i) => i.enable !== false).length;
  return { total, usenet, torrent, enabled };
}

/** Check if Prowlarr has host and credentials/flags configured. */
export function isProwlarrConfigured(
  prowlarr?: Partial<ServerProwlarrConfig> | null
): boolean {
  if (!prowlarr) return false;
  const host = prowlarr.host?.trim();
  if (!host) return false;
  const key = prowlarr.apiKey || prowlarr.api_key;
  const flag = prowlarr.configured || prowlarr.hasApiKey || prowlarr.has_api_key;
  return Boolean(key || flag);
}

/** Check if SABnzbd has host and credentials/flags configured. */
export function isSabnzbdConfigured(
  sabnzbd?: Partial<ServerSabnzbdConfig> | null
): boolean {
  if (!sabnzbd) return false;
  const host = sabnzbd.host?.trim();
  if (!host) return false;
  const key = sabnzbd.apiKey || sabnzbd.api_key;
  const flag = sabnzbd.configured || sabnzbd.hasApiKey || sabnzbd.has_api_key;
  return Boolean(key || flag);
}

