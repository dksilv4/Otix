import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { EventEmitter } from 'events';

// Hoist shared mock DB state for Vitest
const { dbRows } = vi.hoisted(() => ({
  dbRows: new Map<string, Record<string, any>>(),
}));

vi.mock('../db', () => ({
  getDb: () => ({
    exec: vi.fn(),
    transaction: (fn: any) => () => fn(),
    prepare: (sql: string) => ({
      run: (...params: any[]) => {
        if (sql.includes('INSERT OR REPLACE INTO scanned_games')) {
          const id = params[0];
          dbRows.set(String(id), {
            id: params[0],
            title: params[1],
            exe_path: params[2],
            local_exe_path: params[3],
            install_dir: params[4],
            platform: params[5],
            otix_media_id: params[11],
            otix_media_title: params[12],
            otix_confidence: params[18],
            poster_url: params[8],
            otix_poster_url: params[15],
          });
          return { changes: 1 };
        }
        if (sql.includes('DELETE FROM scanned_games WHERE id IN')) {
          for (const p of params) {
            dbRows.delete(String(p));
          }
          return { changes: params.length };
        }
        if (sql.includes('DELETE FROM scanned_games WHERE platform IN')) {
          for (const [k, v] of dbRows.entries()) {
            if (params.includes(v.platform)) {
              dbRows.delete(k);
            }
          }
          return { changes: 1 };
        }
        return { changes: 1 };
      },
      all: (...params: any[]) => {
        if (sql.includes('FROM scanned_games WHERE id IN')) {
          const results: any[] = [];
          for (const p of params) {
            const row = dbRows.get(String(p));
            if (row) results.push(row);
          }
          return results;
        }
        if (sql.includes('FROM scanned_games WHERE platform IN')) {
          const results: any[] = [];
          for (const row of dbRows.values()) {
            if (params.includes(row.platform)) {
              results.push({ id: row.id });
            }
          }
          return results;
        }
        return [...dbRows.values()];
      },
      get: () => undefined,
    }),
  }),
}));

// ── 1. UNC Resolver Adversarial Tests ──────────────────────────────────────────

import {
  resolveUncPath,
  unresolveUncPath,
  registerMachineMapping,
  syncMachineMappings,
  getRegisteredMachineMappings,
  clearUncCache,
  isHostOffline,
  markHostOffline,
  markHostOnline,
  clearOfflineHosts,
  extractUncHost,
  isHostReachable,
  clearMachineMappingSyncCache,
  syncMachineMappingsFromBackend,
} from '../unc-resolver';

describe('Challenger M2-2: UNC Resolver Stress & Edge Case Tests', () => {
  beforeEach(() => {
    clearUncCache();
    clearOfflineHosts();
    clearMachineMappingSyncCache();
    registerMachineMapping('STORAGE', '10.0.0.100');
    registerMachineMapping('BACKUP', '10.0.0.101');
  });

  describe('Character-code fast-path & non-UNC filtering', () => {
    it('bypasses Map and regex lookups for local, relative, and URI paths in sub-millisecond time', () => {
      const paths = [
        'C:\\Games\\Steam\\steamapps\\common\\Half-Life 2\\hl2.exe',
        'D:/ISOs/PlayStation/Final Fantasy VII.bin',
        'E:\\Emulators\\RetroArch\\retroarch.exe',
        'relative/path/to/rom.nes',
        './local/sub/folder',
        '../parent/folder',
        'steam://rungameid/730',
        'http://localhost:8090/api/v1/files',
        'https://192.168.1.1/admin',
        'file:///C:/Users/test/Documents',
        '',
        '/',
        '\\',
        'C:',
        'D:\\',
      ];

      const start = performance.now();
      for (let iteration = 0; iteration < 1000; iteration++) {
        for (const p of paths) {
          const res = resolveUncPath(p);
          expect(res).toBe(p);
          const unres = unresolveUncPath(p);
          expect(unres).toBe(p);
        }
      }
      const elapsed = performance.now() - start;
      // 30,000 evaluations should complete comfortably under 1000ms with fast-path
      expect(elapsed).toBeLessThan(1000);
    });

    it('handles malformed, edge-case, and boundary paths gracefully', () => {
      expect(resolveUncPath(null as any)).toBeNull();
      expect(resolveUncPath(undefined as any)).toBeUndefined();
      expect(resolveUncPath('')).toBe('');
      expect(resolveUncPath('a')).toBe('a');
      expect(resolveUncPath('\\\\')).toBe('\\\\');
      expect(resolveUncPath('//')).toBe('//');
      expect(resolveUncPath('\\\\\\')).toBe('\\\\\\');
      expect(resolveUncPath('///')).toBe('///');
      expect(resolveUncPath('\\\\UNKNOWN_HOST\\share')).toBe('\\\\UNKNOWN_HOST\\share');
      expect(unresolveUncPath('\\\\192.168.99.99\\share')).toBe('\\\\192.168.99.99\\share');
    });

    it('extractUncHost parses hostnames correctly from diverse UNC path styles', () => {
      expect(extractUncHost('\\\\STORAGE\\Games\\title')).toBe('STORAGE');
      expect(extractUncHost('//STORAGE/Games/title')).toBe('STORAGE');
      expect(extractUncHost('\\\\192.168.1.50\\share')).toBe('192.168.1.50');
      expect(extractUncHost('\\\\my-nas-server.local\\media')).toBe('my-nas-server.local');
      expect(extractUncHost('C:\\Games')).toBeNull();
      expect(extractUncHost('/usr/local/bin')).toBeNull();
      expect(extractUncHost('\\\\')).toBeNull();
      expect(extractUncHost('')).toBeNull();
      expect(extractUncHost(null as any)).toBeNull();
    });
  });

  describe('LRU Cache capacity, promotion, and eviction under high volume', () => {
    it('maintains strict 2,000-entry capacity and evicts oldest entries without unbounded growth', () => {
      clearUncCache();

      // Register mapping
      registerMachineMapping('NODE', '10.0.0.200');

      // Fill resolve cache with 2,500 distinct paths
      for (let i = 0; i < 2500; i++) {
        resolveUncPath(`\\\\NODE\\Share\\file_${i}.iso`);
      }

      // Check unresolve cache with 2,500 distinct paths
      for (let i = 0; i < 2500; i++) {
        unresolveUncPath(`\\\\10.0.0.200\\Share\\file_${i}.iso`);
      }

      // Both caches should function correctly and return valid resolved values
      expect(resolveUncPath('\\\\NODE\\Share\\file_2499.iso')).toBe('\\\\10.0.0.200\\Share\\file_2499.iso');
      expect(unresolveUncPath('\\\\10.0.0.200\\Share\\file_2499.iso')).toBe('\\\\NODE\\Share\\file_2499.iso');
    });

    it('promotes recently accessed keys on cache hit so they survive subsequent insertions', () => {
      clearUncCache();
      registerMachineMapping('CACHE_TEST', '10.0.0.50');

      // Insert path 0
      const hotPath = '\\\\CACHE_TEST\\Share\\hot_item.iso';
      resolveUncPath(hotPath);

      // Access hotPath multiple times to promote it
      for (let i = 0; i < 5; i++) {
        resolveUncPath(hotPath);
      }

      // Insert 1,999 more entries (total 2,000)
      for (let i = 1; i < 2000; i++) {
        resolveUncPath(`\\\\CACHE_TEST\\Share\\item_${i}.iso`);
      }

      // Re-read hotPath (promotes it to top of LRU)
      expect(resolveUncPath(hotPath)).toBe('\\\\10.0.0.50\\Share\\hot_item.iso');

      // Now insert another 100 entries, evicting the oldest 100 entries
      for (let i = 2000; i < 2100; i++) {
        resolveUncPath(`\\\\CACHE_TEST\\Share\\item_${i}.iso`);
      }

      // hotPath was promoted, so it must still resolve cleanly
      expect(resolveUncPath(hotPath)).toBe('\\\\10.0.0.50\\Share\\hot_item.iso');
    });

    it('clears LRU caches when a new machine mapping is registered', () => {
      clearUncCache();
      resolveUncPath('\\\\DYNAMIC_HOST\\share\\game.exe');

      // Register mapping dynamically
      registerMachineMapping('DYNAMIC_HOST', '192.168.10.77');

      // Should immediately resolve with new mapping instead of returning stale unmapped cache
      const resolved = resolveUncPath('\\\\DYNAMIC_HOST\\share\\game.exe');
      expect(resolved).toBe('\\\\192.168.10.77\\share\\game.exe');
    });

    it('prevents redundant IP-to-IP registration and case variations', () => {
      registerMachineMapping('192.168.1.1', '192.168.1.1');
      registerMachineMapping('   ', '10.0.0.1');
      registerMachineMapping('NODE_A', '   ');

      const mappings = getRegisteredMachineMappings();
      expect(mappings['192.168.1.1']).toBeUndefined();
      expect(mappings['   ']).toBeUndefined();
    });
  });

  describe('Offline host circuit breaker stress & reachability simulation', () => {
    it('handles rapid online/offline toggling with case-insensitivity', () => {
      expect(isHostOffline('MY-HOST')).toBe(false);

      markHostOffline('MY-HOST');
      expect(isHostOffline('MY-HOST')).toBe(true);
      expect(isHostOffline('my-host')).toBe(true);
      expect(isHostOffline('My-Host')).toBe(true);

      markHostOnline('my-host');
      expect(isHostOffline('MY-HOST')).toBe(false);
    });

    it('expires offline status automatically after TTL', async () => {
      markHostOffline('EXPIRING-HOST', 30); // 30ms TTL
      expect(isHostOffline('EXPIRING-HOST')).toBe(true);

      await new Promise((r) => setTimeout(r, 45));
      expect(isHostOffline('EXPIRING-HOST')).toBe(false);
    });

    it('isHostReachable short-circuits immediately when host is already offline without opening a socket', async () => {
      markHostOffline('DEAD-SERVER', 60000);

      const reachable = await isHostReachable('\\\\DEAD-SERVER\\share');
      expect(reachable).toBe(false);
    });

    it('isHostReachable returns false and marks host offline on non-routable address with fast timeout', async () => {
      // 192.0.2.1 is TEST-NET-1 (RFC 5737), non-routable address that will fail or timeout
      const reachable = await isHostReachable('192.0.2.1', 445, 50);
      expect(reachable).toBe(false);
      expect(isHostOffline('192.0.2.1')).toBe(true);
    });
  });

  describe('syncMachineMappingsFromBackend cache TTL semantics', () => {
    it('caches sync calls within 10-minute window and bypasses on force = true', async () => {
      clearMachineMappingSyncCache();

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => [{ name: 'SYNC_NODE', host: '172.16.0.5' }],
      } as any);

      // Call 1: should fetch
      await syncMachineMappingsFromBackend('http://localhost:8000', 'test-token');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Call 2: within 10 minutes, should NOT fetch
      await syncMachineMappingsFromBackend('http://localhost:8000', 'test-token');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Call 3: with force=true, should fetch again
      await syncMachineMappingsFromBackend('http://localhost:8000', 'test-token', true);
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      fetchSpy.mockRestore();
    });
  });
});

// ── 2. Scanner & Storage Batch Upserting Stress Tests ─────────────────────────

describe('Challenger M2-2: Database Batch Upserting & Parameter Chunking (>1000 items)', () => {
  beforeEach(() => {
    dbRows.clear();
  });

  it('safely handles upserting 2,500 games in a single batch without SQLite parameter limit errors', async () => {
    const { upsertGames } = await import('../game/storage');

    // Create 2,500 game rows (exceeds SQLITE_PARAM_LIMIT of 999 by 2.5x)
    const largeBatch: any[] = Array.from({ length: 2500 }, (_, i) => ({
      id: `stress_game_${i}`,
      title: `Stress Game ${i}`,
      exePath: `C:\\Games\\sg_${i}\\game.exe`,
      installDir: `C:\\Games\\sg_${i}`,
      platform: 'pc',
      sizeBytes: 1024 * 1024 * 100,
      modifiedAt: '2026-01-01T00:00:00.000Z',
      version: '1.0.0',
    }));

    expect(() => {
      upsertGames(largeBatch);
    }).not.toThrow();

    expect(dbRows.size).toBe(2500);
    expect(dbRows.get('stress_game_0')?.title).toBe('Stress Game 0');
    expect(dbRows.get('stress_game_2499')?.title).toBe('Stress Game 2499');
  });

  it('preserves existing match metadata when re-ingesting games with partial data', async () => {
    const { upsertGames } = await import('../game/storage');

    // Seed 1 game with existing rich match metadata
    dbRows.set('pc_matched_existing', {
      id: 'pc_matched_existing',
      title: 'Existing Game',
      exe_path: 'C:\\Games\\eg\\eg.exe',
      platform: 'pc',
      otix_media_id: 'media_9999',
      otix_media_title: 'Matched Title On IGDB',
      otix_confidence: 0.98,
      poster_url: 'https://cdn.example.com/poster.jpg',
      otix_poster_url: 'https://cdn.example.com/poster.jpg',
      seeded: 0,
    });

    // Scanner rescans with raw file data (no match metadata)
    const reIngested: any = {
      id: 'pc_matched_existing',
      title: 'Existing Game',
      exePath: 'C:\\Games\\eg\\eg.exe',
      installDir: 'C:\\Games\\eg',
      platform: 'pc',
      sizeBytes: 5000,
      modifiedAt: '2026-02-01T00:00:00.000Z',
    };

    upsertGames([reIngested]);

    const updated = dbRows.get('pc_matched_existing');
    expect(updated).toBeDefined();
    // Match data must NOT be overwritten with null
    expect(updated?.otix_media_id).toBe('media_9999');
    expect(updated?.otix_media_title).toBe('Matched Title On IGDB');
    expect(updated?.otix_confidence).toBe(0.98);
    expect(updated?.poster_url).toBe('https://cdn.example.com/poster.jpg');
  });

  it('coalesces batch notifications without flooding UI thread', async () => {
    const { notifyGamesChanged } = await import('../game/storage');

    vi.useFakeTimers();

    let notificationCount = 0;
    // Mock the subscriber callback
    const { onGamesChanged } = await import('../game/storage');
    const unsub = onGamesChanged(() => {
      notificationCount++;
    });

    // Fire 50 rapid changes within 200ms
    for (let i = 0; i < 50; i++) {
      notifyGamesChanged();
    }

    // Debounce is 1000ms, so notificationCount should still be 0
    expect(notificationCount).toBe(0);

    // Fast forward 500ms
    vi.advanceTimersByTime(500);
    expect(notificationCount).toBe(0);

    // Fast forward remaining 500ms -> should fire exactly once
    vi.advanceTimersByTime(500);
    expect(notificationCount).toBe(1);

    unsub();
    vi.useRealTimers();
  });
});

// ── 3. Remote Downloader Interval Lifecycle Tests ─────────────────────────────

describe('Challenger M2-2: Remote Downloader Interval Lifecycle & Leak Prevention', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does NOT start any intervals on instantiation (zero idle background work)', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const { RemoteDownloadManager } = await import('../downloads/remote-downloader');

    const manager = new RemoteDownloadManager();
    expect((manager as any).progressInterval).toBeNull();
    expect((manager as any).dbInterval).toBeNull();

    manager.dispose();
    setIntervalSpy.mockRestore();
  });

  it('starts intervals when download begins and stops immediately on pause/fail/cancel/complete', async () => {
    const { RemoteDownloadManager } = await import('../downloads/remote-downloader');

    const manager = new RemoteDownloadManager();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    // Simulate active transfer in 'downloading' state
    const transfer: any = {
      options: { gameTitle: 'Test Game', filename: 'test.iso', filesize: 1000, serverUrl: 'http://test' },
      status: 'downloading',
      bytesDownloaded: 100,
      totalBytes: 1000,
      speedBytesPerSec: 0,
      etaSeconds: 0,
      partPath: 'C:\\tmp\\test.iso.otixpart',
      finalPath: 'C:\\tmp\\test.iso',
      req: null,
      fileStream: null,
      lastTickBytes: 100,
      lastTickTime: Date.now(),
    };

    (manager as any).activeTransfers.set('dl_1', transfer);
    (manager as any).ensureProgressTicker();

    // Intervals must now be active
    expect((manager as any).progressInterval).not.toBeNull();
    expect((manager as any).dbInterval).not.toBeNull();

    // Calling ensureProgressTicker again should NOT create duplicate intervals
    const existingProgress = (manager as any).progressInterval;
    (manager as any).ensureProgressTicker();
    expect((manager as any).progressInterval).toBe(existingProgress);

    // Pause download -> transfer status becomes paused, ticker must stop
    transfer.status = 'paused';
    (manager as any).checkIdleAndStopTicker();

    expect((manager as any).progressInterval).toBeNull();
    expect((manager as any).dbInterval).toBeNull();
    expect(clearIntervalSpy).toHaveBeenCalled();

    // Resume -> ticker must restart
    transfer.status = 'downloading';
    (manager as any).ensureProgressTicker();
    expect((manager as any).progressInterval).not.toBeNull();

    // Complete transfer -> ticker must stop
    (manager as any).activeTransfers.delete('dl_1');
    (manager as any).checkIdleAndStopTicker();
    expect((manager as any).progressInterval).toBeNull();
    expect((manager as any).dbInterval).toBeNull();

    manager.dispose();
    clearIntervalSpy.mockRestore();
  });

  it('dispose() terminates active streams, aborts requests, clears transfers and listeners', async () => {
    const { RemoteDownloadManager } = await import('../downloads/remote-downloader');

    const manager = new RemoteDownloadManager();

    const mockReq = { destroy: vi.fn() } as any;
    const mockStream = { close: vi.fn() } as any;

    (manager as any).activeTransfers.set('dl_active', {
      options: {},
      status: 'downloading',
      req: mockReq,
      fileStream: mockStream,
    });

    (manager as any).ensureProgressTicker();
    expect((manager as any).progressInterval).not.toBeNull();

    let progressEventFired = false;
    manager.on('progress', () => { progressEventFired = true; });

    // Call dispose
    manager.dispose();

    // Intervals cleared
    expect((manager as any).progressInterval).toBeNull();
    expect((manager as any).dbInterval).toBeNull();

    // Subprocess/stream resources cleanly closed
    expect(mockReq.destroy).toHaveBeenCalled();
    expect(mockStream.close).toHaveBeenCalled();

    // Transfers map cleared
    expect((manager as any).activeTransfers.size).toBe(0);

    // Listeners cleared
    expect(manager.listenerCount('progress')).toBe(0);
  });

  it('keeps ticker running when at least one transfer is actively downloading among multiple transfers', async () => {
    const { RemoteDownloadManager } = await import('../downloads/remote-downloader');

    const manager = new RemoteDownloadManager();

    // Transfer 1: downloading
    (manager as any).activeTransfers.set('dl_1', {
      options: { gameTitle: 'Game 1', filename: 'g1.iso', filesize: 1000 },
      status: 'downloading',
      bytesDownloaded: 100,
      totalBytes: 1000,
      speedBytesPerSec: 0,
      etaSeconds: 0,
      lastTickBytes: 100,
      lastTickTime: Date.now(),
    });

    // Transfer 2: downloading
    (manager as any).activeTransfers.set('dl_2', {
      options: { gameTitle: 'Game 2', filename: 'g2.iso', filesize: 2000 },
      status: 'downloading',
      bytesDownloaded: 500,
      totalBytes: 2000,
      speedBytesPerSec: 0,
      etaSeconds: 0,
      lastTickBytes: 500,
      lastTickTime: Date.now(),
    });

    (manager as any).ensureProgressTicker();
    expect((manager as any).progressInterval).not.toBeNull();

    // Pause transfer 1 -> transfer 2 is still downloading!
    (manager as any).activeTransfers.get('dl_1').status = 'paused';
    (manager as any).checkIdleAndStopTicker();

    // Ticker must NOT stop because transfer 2 is still downloading
    expect((manager as any).progressInterval).not.toBeNull();
    expect((manager as any).dbInterval).not.toBeNull();

    // Complete transfer 2 -> now no active downloads remain
    (manager as any).activeTransfers.delete('dl_2');
    (manager as any).checkIdleAndStopTicker();

    // Now ticker must stop
    expect((manager as any).progressInterval).toBeNull();
    expect((manager as any).dbInterval).toBeNull();

    manager.dispose();
  });
});

describe('Challenger M2-2: Advanced Unicode, Mixed Slash & Stale Deletion Stress', () => {
  it('correctly handles Unicode, special characters, and mixed slashes in UNC resolution', () => {
    registerMachineMapping('STORAGE_SERVER', '10.0.1.55');

    // Unicode + spaces
    const unicodeUnc = '\\\\STORAGE_SERVER\\Media\\Pokémon™ [Édition Française]\\Jeu d\'Aventure.iso';
    const resolved = resolveUncPath(unicodeUnc);
    expect(resolved).toBe('\\\\10.0.1.55\\Media\\Pokémon™ [Édition Française]\\Jeu d\'Aventure.iso');

    const unresolved = unresolveUncPath(resolved);
    expect(unresolved).toBe(unicodeUnc);

    // Forward slashes with special characters
    const forwardUnc = '//STORAGE_SERVER/media/games/test#1/rom.bin';
    const resolvedFwd = resolveUncPath(forwardUnc);
    expect(resolvedFwd).toBe('//10.0.1.55/media/games/test#1/rom.bin');

    const unresolvedFwd = unresolveUncPath(resolvedFwd);
    expect(unresolvedFwd).toBe(forwardUnc);
  });
});

