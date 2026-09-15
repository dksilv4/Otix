/** Dedicated utility functions for Usenet (Prowlarr & SABnzbd) releases and metrics. */

import type { ServerProwlarrRelease } from './usenet-types';

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

/** Clean a dot-separated or underscore-separated scene title for clear readability. */
export function cleanReleaseTitle(raw: string): string {
  if (!raw) return '';
  const withoutExt = raw.replace(/\.(nzb|rar|iso|zip|exe)$/i, '');
  const spaceCleaned = withoutExt.replace(/[._]/g, ' ');
  return spaceCleaned.trim();
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

  // 1. Auto-clean common typo commas between alphanumeric domain characters: "server,diogodasilva.com" -> "server.diogodasilva.com"
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

/** Filter indexers by protocol ('all' | 'torrent' | 'usenet'). */
export function filterIndexersByProtocol(
  indexers: Array<{ protocol?: string }>,
  protocol: 'all' | 'torrent' | 'usenet' | string = 'all'
): Array<{ protocol?: string }> {
  const p = (protocol || 'all').toLowerCase().trim();
  if (p === 'all' || !p) return indexers;
  return indexers.filter((idx) => (idx.protocol || '').toLowerCase() === p);
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

