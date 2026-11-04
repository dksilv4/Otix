import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveNodeSearchEndpoints,
  searchNodeIndexersDirect,
  searchModularNodeDirect,
} from '../utils/node-search';
import * as downloadsHook from '../hooks/use-node-downloads';

describe('node-search direct communication', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves direct endpoints from cached node and ensures local loopback', () => {
    vi.spyOn(downloadsHook, 'getCachedNodes').mockReturnValue([
      {
        id: 42,
        name: 'My Gaming Rig',
        primaryUrl: 'http://192.168.1.150:8090',
        localUrl: 'http://127.0.0.1:8090',
        authToken: 'secret_tok_123',
        isOnline: true,
        isLocal: true,
        totalFiles: 0,
        storageFreeBytes: 0,
        storageTotalBytes: 0,
        isActive: true,
        createdAt: '',
        updatedAt: '',
      },
    ]);

    const resolved = resolveNodeSearchEndpoints(42);
    expect(resolved.targets).toContain('http://192.168.1.150:8090');
    expect(resolved.targets).toContain('http://127.0.0.1:8090');
    expect(resolved.authToken).toBe('secret_tok_123');
    expect(resolved.nodeName).toBe('My Gaming Rig');
  });

  it('falls back to local node on port 8090 if desktop or local node has otix:// URL', () => {
    vi.spyOn(downloadsHook, 'getCachedNodes').mockReturnValue([
      {
        id: 91,
        name: 'Desktop App',
        primaryUrl: 'otix://desktop/abc',
        isLocalDesktop: true,
        isOnline: true,
        totalFiles: 0,
        storageFreeBytes: 0,
        storageTotalBytes: 0,
        isActive: true,
        createdAt: '',
        updatedAt: '',
      },
    ]);

    const resolved = resolveNodeSearchEndpoints(91);
    expect(resolved.targets).toEqual(['http://127.0.0.1:8090']);
    expect(resolved.nodeName).toBe('Desktop App');
  });

  it('queries candidate endpoint directly via fetch without touching backend', async () => {
    vi.spyOn(downloadsHook, 'getCachedNodes').mockReturnValue([
      {
        id: 10,
        name: 'Local Node',
        primaryUrl: 'http://127.0.0.1:8090',
        authToken: 'my_auth_token',
        isOnline: true,
        isLocal: true,
        totalFiles: 0,
        storageFreeBytes: 0,
        storageTotalBytes: 0,
        isActive: true,
        createdAt: '',
        updatedAt: '',
      },
    ]);

    const mockFetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          guid: 'test-guid-1',
          title: 'Cyberpunk.2077.v2.1-RUNE',
          size: 70000000000,
          download_url: 'https://g4u.to/download/1',
          indexer: 'g4u.to',
          protocol: 'usenet',
        },
      ],
    });

    const results = await searchNodeIndexersDirect(10, 'Cyberpunk', mockFetcher as any);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Cyberpunk.2077.v2.1-RUNE');
    expect(results[0].download_url).toBe('https://g4u.to/download/1');

    expect(mockFetcher).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetcher.mock.calls[0][0];
    const calledOptions = mockFetcher.mock.calls[0][1];

    expect(calledUrl).toContain('http://127.0.0.1:8090/api/v1/usenet/search');
    expect(calledUrl).toContain('query=Cyberpunk');
    expect(calledUrl).toContain('token=my_auth_token');
    expect(calledOptions.headers['Authorization']).toBe('Bearer my_auth_token');
  });

  it('fails over to secondary candidate endpoint when the first is unreachable', async () => {
    vi.spyOn(downloadsHook, 'getCachedNodes').mockReturnValue([
      {
        id: 20,
        name: 'Multi-target Node',
        localUrl: 'http://192.168.1.99:8090',
        primaryUrl: 'http://127.0.0.1:8090',
        isOnline: true,
        isLocal: true,
        totalFiles: 0,
        storageFreeBytes: 0,
        storageTotalBytes: 0,
        isActive: true,
        createdAt: '',
        updatedAt: '',
      },
    ]);

    const mockFetcher = vi
      .fn()
      // First attempt (192.168.1.99) fails
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      // Second attempt (127.0.0.1:8090) succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            guid: 'guid-recovered',
            title: 'Witcher.3.NextGen-GOG',
            size: 50000000000,
            download_url: 'https://prowlarr.lan/dl',
            indexer: 'Prowlarr',
          },
        ],
      });

    const results = await searchNodeIndexersDirect(20, 'Witcher', mockFetcher as any);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Witcher.3.NextGen-GOG');
    expect(mockFetcher).toHaveBeenCalledTimes(2);
  });

  it('searches modular providers directly on /api/v1/downloads/search', async () => {
    vi.spyOn(downloadsHook, 'getCachedNodes').mockReturnValue([
      {
        id: 30,
        name: 'Node Modular',
        primaryUrl: 'http://127.0.0.1:8090',
        isOnline: true,
        isLocal: true,
        totalFiles: 0,
        storageFreeBytes: 0,
        storageTotalBytes: 0,
        isActive: true,
        createdAt: '',
        updatedAt: '',
      },
    ]);

    const mockFetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          guid: 'mod-1',
          title: 'Direct Modular Result',
          size: 1234,
          download_url: 'https://example.com/dl',
          indexer: 'TestIndexer',
          protocol: 'torrent',
        },
      ],
    });

    const results = await searchModularNodeDirect(30, 'Elden', 'prowlarr', mockFetcher as any);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Direct Modular Result');

    const calledUrl = mockFetcher.mock.calls[0][0];
    expect(calledUrl).toContain('http://127.0.0.1:8090/api/v1/downloads/search');
    expect(calledUrl).toContain('query=Elden');
    expect(calledUrl).toContain('provider=prowlarr');
  });
});
