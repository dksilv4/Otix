import { describe, it, expect } from 'vitest';
import {
  getProtocolBadgeInfo,
  filterActiveProviders,
  filterConfiguredProviders,
  findProviderByName,
  normalizeQueueSpeed,
  normalizeQueueEta,
  isProviderHealthy,
} from '../provider-utils';
import type { ProviderInfo } from '../provider-types';

describe('Modular Provider Utilities', () => {
  describe('getProtocolBadgeInfo', () => {
    it('returns appropriate badge metadata for Usenet', () => {
      const badge = getProtocolBadgeInfo('usenet');
      expect(badge.label).toBe('USENET');
      expect(badge.text).toContain('amber');
    });

    it('returns appropriate badge metadata for Torrent', () => {
      const badge = getProtocolBadgeInfo('torrent');
      expect(badge.label).toBe('TORRENT');
      expect(badge.text).toContain('cyan');
    });

    it('returns appropriate badge metadata for Direct/HTTP', () => {
      const badge = getProtocolBadgeInfo('direct');
      expect(badge.label).toBe('DIRECT');
      expect(badge.text).toContain('emerald');
    });

    it('handles unknown or empty protocol gracefully', () => {
      const badgeEmpty = getProtocolBadgeInfo();
      expect(badgeEmpty.label).toBe('UNKNOWN');

      const badgeCustom = getProtocolBadgeInfo('custom-proto');
      expect(badgeCustom.label).toBe('CUSTOM-PROTO');
    });
  });

  describe('filterActiveProviders & filterConfiguredProviders', () => {
    const mockProviders: ProviderInfo[] = [
      {
        name: 'sabnzbd',
        display_name: 'SABnzbd',
        provider_type: 'downloader',
        protocol: 'usenet',
        is_active: true,
        configured: true,
      },
      {
        name: 'qbittorrent',
        display_name: 'qBittorrent',
        provider_type: 'downloader',
        protocol: 'torrent',
        is_active: false,
        configured: true,
      },
      {
        name: 'prowlarr',
        display_name: 'Prowlarr',
        provider_type: 'search-provider',
        protocol: 'usenet',
        is_active: true,
        configured: false,
      },
    ];

    it('filters active providers correctly', () => {
      const active = filterActiveProviders(mockProviders);
      expect(active.map((p) => p.name)).toEqual(['sabnzbd', 'prowlarr']);
    });

    it('filters configured providers correctly', () => {
      const configured = filterConfiguredProviders(mockProviders);
      expect(configured.map((p) => p.name)).toEqual(['sabnzbd', 'qbittorrent']);
    });
  });

  describe('findProviderByName', () => {
    const mockProviders: ProviderInfo[] = [
      {
        name: 'sabnzbd',
        display_name: 'SABnzbd',
        provider_type: 'downloader',
        protocol: 'usenet',
        is_active: true,
        configured: true,
      },
      {
        name: 'prowlarr',
        display_name: 'Prowlarr',
        provider_type: 'search-provider',
        protocol: 'usenet',
        is_active: true,
        configured: true,
      },
    ];

    it('finds provider case-insensitively', () => {
      const found = findProviderByName(mockProviders, 'SABnzbd');
      expect(found).toBeDefined();
      expect(found?.name).toBe('sabnzbd');
    });

    it('returns undefined if not found', () => {
      expect(findProviderByName(mockProviders, 'missing')).toBeUndefined();
    });
  });

  describe('normalizeQueueSpeed & normalizeQueueEta', () => {
    it('normalizes speeds', () => {
      expect(normalizeQueueSpeed('15.5 MB/s')).toBe('15.5 MB/s');
      expect(normalizeQueueSpeed('15.5 MB')).toBe('15.5 MB/s');
      expect(normalizeQueueSpeed('0')).toBe('0 B/s');
      expect(normalizeQueueSpeed(null)).toBe('0 B/s');
      expect(normalizeQueueSpeed(undefined)).toBe('0 B/s');
    });

    it('normalizes ETA / time left', () => {
      expect(normalizeQueueEta('00:15:30')).toBe('00:15:30');
      expect(normalizeQueueEta('0')).toBe('Complete');
      expect(normalizeQueueEta('00:00:00')).toBe('Complete');
      expect(normalizeQueueEta(null)).toBe('00:00:00');
    });
  });

  describe('isProviderHealthy', () => {
    it('evaluates health correctly', () => {
      expect(isProviderHealthy({ ok: true, message: 'Connected' })).toBe(true);
      expect(isProviderHealthy({ ok: false, message: 'Timeout' })).toBe(false);
      expect(isProviderHealthy(null)).toBe(false);
      expect(isProviderHealthy(undefined)).toBe(false);
    });
  });
});
