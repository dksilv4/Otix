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
        bg: 'bg-amber-500/10',
        text: 'text-amber-400',
        border: 'border-amber-500/30',
      };
    case 'torrent':
      return {
        label: 'TORRENT',
        bg: 'bg-cyan-500/10',
        text: 'text-cyan-400',
        border: 'border-cyan-500/30',
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
