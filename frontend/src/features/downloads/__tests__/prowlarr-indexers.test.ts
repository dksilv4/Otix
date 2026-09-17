import { describe, it, expect } from 'vitest';
import { filterIndexersByProtocol, calculateIndexerStats, normalizeProwlarrIndexers } from '../usenet-utils';
import type { ProwlarrIndexerItem } from '../usenet-types';
import {
  categoriesFromConfig,
  PROWLARR_CATEGORY_GROUPS,
  toggleProwlarrCategory,
} from '../prowlarr-categories';

describe('Prowlarr Indexers filtering & stats', () => {
  const mockIndexers: ProwlarrIndexerItem[] = [
    { id: 1, name: '1337x', protocol: 'torrent', enable: true, priority: 25 },
    { id: 2, name: 'NZBGeek', protocol: 'usenet', enable: true, priority: 20 },
    { id: 3, name: 'TorrentDay', protocol: 'torrent', enable: false, priority: 30 },
    { id: 4, name: 'DrunkenSlug', protocol: 'usenet', enable: true, priority: 15 },
    { id: 5, name: 'ThePirateBay', protocol: 'torrent', enable: true, priority: 40 },
  ];

  it('filters indexers by all', () => {
    const all = filterIndexersByProtocol(mockIndexers, 'all');
    expect(all).toHaveLength(5);
  });

  it('filters indexers by torrent', () => {
    const torrents = filterIndexersByProtocol(mockIndexers, 'torrent');
    expect(torrents).toHaveLength(3);
    expect(torrents.map((t) => t.name)).toEqual(['1337x', 'TorrentDay', 'ThePirateBay']);
  });

  it('filters indexers by usenet', () => {
    const usenet = filterIndexersByProtocol(mockIndexers, 'usenet');
    expect(usenet).toHaveLength(2);
    expect(usenet.map((u) => u.name)).toEqual(['NZBGeek', 'DrunkenSlug']);
  });

  it('calculates indexer statistics correctly', () => {
    const stats = calculateIndexerStats(mockIndexers);
    expect(stats.total).toBe(5);
    expect(stats.torrent).toBe(3);
    expect(stats.usenet).toBe(2);
    expect(stats.enabled).toBe(4);
  });

  it('handles empty indexers gracefully', () => {
    const filtered = filterIndexersByProtocol([], 'usenet');
    expect(filtered).toHaveLength(0);

    const stats = calculateIndexerStats([]);
    expect(stats).toEqual({ total: 0, usenet: 0, torrent: 0, enabled: 0 });
  });

  it('treats a non-array indexer payload as empty', () => {
    expect(filterIndexersByProtocol(undefined, 'all')).toEqual([]);
    expect(filterIndexersByProtocol({ indexers: [{ protocol: 'usenet' }] }, 'all')).toEqual([]);
  });
});

describe('normalizeProwlarrIndexers', () => {
  it('reads nested sync payloads and PascalCase names', () => {
    expect(normalizeProwlarrIndexers({
      message: 'Synced',
      indexers: [
        { Id: 9, Name: 'NZBGeek', Protocol: 'usenet', Enable: true },
        { id: 2, name: '1337x', protocol: 'torrent', enable: true },
      ],
    })).toEqual([
      { id: 9, name: 'NZBGeek', protocol: 'usenet', enable: true, priority: undefined },
      { id: 2, name: '1337x', protocol: 'torrent', enable: true, priority: undefined },
    ]);
  });
});

describe('Prowlarr category groups', () => {
  it('defaults to Console and PC without exposing labels as numbers', () => {
    expect(categoriesFromConfig(undefined)).toEqual([1000, 4000]);
    expect(categoriesFromConfig([])).toEqual([1000, 4000]);
    expect(PROWLARR_CATEGORY_GROUPS.map((group) => group.label)).toEqual([
      'Console',
      'Movies',
      'Audio',
      'PC',
      'TV',
      'XXX',
      'Books',
      'Other',
    ]);
  });

  it('toggles a category id in the payload set', () => {
    expect(toggleProwlarrCategory([1000, 4000], 2000)).toEqual([1000, 2000, 4000]);
    expect(toggleProwlarrCategory([1000, 4000], 1000)).toEqual([4000]);
  });

  it('keeps a saved category list instead of overwriting it', () => {
    expect(categoriesFromConfig([2000, 5000])).toEqual([2000, 5000]);
  });
});
