/** Pure utility functions for the Unified Modular Provider Framework. */

import type {
  ProviderConnectionTestResult,
  ProviderInfo,
  ProviderProtocol,
} from './provider-types';

export interface ProtocolBadgeInfo {
  label: string;
  bg: string;
  text: string;
  border: string;
}

/** Returns styling and label for a provider's protocol. */
export function getProtocolBadgeInfo(protocol?: ProviderProtocol): ProtocolBadgeInfo {
  const norm = (protocol || '').toLowerCase().trim();
  switch (norm) {
    case 'usenet':
      return {
        label: 'USENET',
        bg: 'bg-blue-500/10',
        text: 'text-blue-400',
        border: 'border-blue-500/30',
      };
    case 'torrent':
      return {
        label: 'TORRENT',
        bg: 'bg-red-500/10',
        text: 'text-red-400',
        border: 'border-red-500/30',
      };
    case 'direct':
    case 'http':
    case 'https':
      return {
        label: 'DIRECT',
        bg: 'bg-emerald-500/10',
        text: 'text-emerald-400',
        border: 'border-emerald-500/30',
      };
    default:
      return {
        label: norm ? norm.toUpperCase() : 'UNKNOWN',
        bg: 'bg-muted/40',
        text: 'text-muted-foreground',
        border: 'border-border',
      };
  }
}

/** Filters a list of providers to only those marked active. */
export function filterActiveProviders(providers: ProviderInfo[] = []): ProviderInfo[] {
  return providers.filter((p) => p.is_active);
}

/** Filters a list of providers to only those marked configured. */
export function filterConfiguredProviders(providers: ProviderInfo[] = []): ProviderInfo[] {
  return providers.filter((p) => p.configured);
}

/** Finds a provider by its machine name. */
export function findProviderByName(
  providers: ProviderInfo[] = [],
  name: string
): ProviderInfo | undefined {
  const target = (name || '').toLowerCase().trim();
  return providers.find((p) => p.name.toLowerCase() === target);
}

/** Formats or cleans speed string. */
export function normalizeQueueSpeed(speed?: string | number | null): string {
  if (speed == null) return '0 B/s';
  const str = String(speed).trim();
  if (!str || str === '0' || str === '0.0') return '0 B/s';
  if (str.endsWith('/s')) return str;
  return `${str}/s`;
}

/** Normalizes time left / ETA strings. */
export function normalizeQueueEta(timeLeft?: string | number | null): string {
  if (!timeLeft) return '00:00:00';
  const str = String(timeLeft).trim();
  if (str === '0' || str === '00:00:00') return 'Complete';
  return str;
}

/** Checks whether a connection test result succeeded. */
export function isProviderHealthy(testResult?: ProviderConnectionTestResult | null): boolean {
  return !!testResult && testResult.ok === true;
}

function providerFlag(provider: ProviderInfo, key: 'configured' | 'is_active'): boolean {
  const raw = provider as ProviderInfo & {
    is_configured?: boolean
    isConfigured?: boolean
    isActive?: boolean
  }
  if (key === 'configured') {
    return Boolean(raw.configured ?? raw.is_configured ?? raw.isConfigured)
  }
  return Boolean(raw.is_active ?? raw.isActive)
}

/** True when a downloader has credentials and can handle this protocol. */
export function hasConfiguredDownloader(
  downloaders: ProviderInfo[] | undefined,
  protocol: string,
): boolean {
  const wanted = (protocol || '').toLowerCase().trim()
  if (!wanted) return false
  return (downloaders ?? []).some((provider) => {
    if ((provider.provider_type || (provider as { type?: string }).type) === 'search-provider') {
      return false
    }
    if (!providerFlag(provider, 'configured')) return false
    const proto = (provider.protocol || '').toLowerCase()
    return proto === wanted || proto === 'multi'
  })
}

/** Infer usenet vs torrent from the indexer protocol or the download URL. */
export function inferReleaseProtocol(release: {
  protocol?: string | null
  download_url?: string | null
}): string {
  const proto = (release.protocol || '').toLowerCase().trim()
  if (proto === 'torrent' || proto === 'usenet') return proto
  const url = (release.download_url || '').toLowerCase()
  if (url.startsWith('magnet:') || /\.torrent(\?|#|$)/.test(url)) return 'torrent'
  if (/\.nzb(\?|#|$)/.test(url)) return 'usenet'
  return proto || 'usenet'
}

/** Why a release cannot be queued, or null when Download should stay enabled. */
export function releaseQueueBlockReason(
  release: { protocol?: string | null; download_url?: string | null },
  options: { torrentConfigured: boolean; usenetConfigured: boolean },
): string | null {
  if (!release.download_url) return 'No download URL from this indexer'
  const protocol = inferReleaseProtocol(release)
  if (protocol === 'torrent' && !options.torrentConfigured) {
    return 'No torrent client is configured on this server'
  }
  if (protocol === 'usenet' && !options.usenetConfigured) {
    return 'No Usenet client is configured on this server'
  }
  return null
}
