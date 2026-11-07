import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveUncPath,
  unresolveUncPath,
  registerMachineMapping,
  syncMachineMappings,
  getRegisteredMachineMappings,
  syncMachineMappingsFromBackend,
  clearMachineMappingSyncCache,
} from '../unc-resolver';

describe('UNC Resolver', () => {
  beforeEach(() => {
    registerMachineMapping('SERVER', '192.168.1.58');
  });

  it('resolves machine hostname in Windows UNC path to machine IP address', () => {
    const raw = '\\\\SERVER\\Games\\';
    const resolved = resolveUncPath(raw);
    expect(resolved).toBe('\\\\192.168.1.58\\Games\\');
  });

  it('resolves subdirectories and game folders with correct backslashes', () => {
    const raw = '\\\\SERVER\\Games\\God of War [PC]\\Updates\\patch.exe';
    const resolved = resolveUncPath(raw);
    expect(resolved).toBe('\\\\192.168.1.58\\Games\\God of War [PC]\\Updates\\patch.exe');
  });

  it('resolves case-insensitively', () => {
    const raw = '\\\\server\\downloads\\setup.exe';
    const resolved = resolveUncPath(raw);
    expect(resolved).toBe('\\\\192.168.1.58\\downloads\\setup.exe');
  });

  it('unresolves IP-based UNC path back to display machine name', () => {
    const ipPath = '\\\\192.168.1.58\\Games\\Kingdom Hearts III';
    const displayPath = unresolveUncPath(ipPath);
    expect(displayPath).toBe('\\\\SERVER\\Games\\Kingdom Hearts III');
  });

  it('leaves local drive paths unmodified', () => {
    expect(resolveUncPath('C:\\Games\\Steam')).toBe('C:\\Games\\Steam');
    expect(unresolveUncPath('C:\\Games\\Steam')).toBe('C:\\Games\\Steam');
    expect(resolveUncPath('D:/ISOs/file.iso')).toBe('D:/ISOs/file.iso');
  });

  it('leaves already-IP paths unmodified when resolving', () => {
    expect(resolveUncPath('\\\\192.168.1.58\\Games')).toBe('\\\\192.168.1.58\\Games');
  });

  it('supports registering new machines dynamically from nodes', () => {
    syncMachineMappings([
      { name: 'NAS-UNRAID', host: '10.0.0.15' },
      { name: 'TrueNAS-Core', smbHost: '192.168.1.99' },
      { name: 'RemoteNode', localUrl: 'http://192.168.1.200:8090' },
    ]);

    expect(resolveUncPath('\\\\NAS-UNRAID\\storage\\roms')).toBe('\\\\10.0.0.15\\storage\\roms');
    expect(resolveUncPath('\\\\TrueNAS-Core\\media\\games')).toBe('\\\\192.168.1.99\\media\\games');
    expect(resolveUncPath('\\\\RemoteNode\\library')).toBe('\\\\192.168.1.200\\library');

    expect(unresolveUncPath('\\\\10.0.0.15\\storage\\roms')).toBe('\\\\NAS-UNRAID\\storage\\roms');
    expect(unresolveUncPath('\\\\192.168.1.99\\media\\games')).toBe('\\\\TrueNAS-Core\\media\\games');
  });

  it('handles empty or non-string inputs safely', () => {
    expect(resolveUncPath('')).toBe('');
    expect(unresolveUncPath('')).toBe('');
    expect(resolveUncPath(null as any)).toBe(null);
  });

  it('correctly operates the offline host circuit breaker with TTL', async () => {
    const { isHostOffline, markHostOffline, markHostOnline, extractUncHost } = await import('../unc-resolver');
    expect(isHostOffline('MY-NAS')).toBe(false);

    markHostOffline('MY-NAS', 50); // 50ms TTL for test
    expect(isHostOffline('MY-NAS')).toBe(true);
    expect(isHostOffline('my-nas')).toBe(true);

    markHostOnline('MY-NAS');
    expect(isHostOffline('MY-NAS')).toBe(false);

    markHostOffline('MY-NAS', 10);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(isHostOffline('MY-NAS')).toBe(false);

    expect(extractUncHost('\\\\NAS-BOX\\share\\folder')).toBe('NAS-BOX');
    expect(extractUncHost('C:\\Games')).toBeNull();
  });

  it('uses LRU cache for rapid repeated path lookups', async () => {
    const { clearUncCache } = await import('../unc-resolver');
    clearUncCache();

    const p1 = '\\\\SERVER\\Games\\File1.iso';
    const r1 = resolveUncPath(p1);
    const r2 = resolveUncPath(p1);
    expect(r1).toBe('\\\\192.168.1.58\\Games\\File1.iso');
    expect(r2).toBe(r1);

    const ipP = '\\\\192.168.1.58\\Games\\File1.iso';
    const u1 = unresolveUncPath(ipP);
    const u2 = unresolveUncPath(ipP);
    expect(u1).toBe('\\\\SERVER\\Games\\File1.iso');
    expect(u2).toBe(u1);
  });

  it('supports node_name and local_endpoints in syncMachineMappings', () => {
    syncMachineMappings([
      {
        node_name: 'Otix-LivingRoom-Node',
        local_endpoints: ['http://192.168.1.77:8090'],
      },
    ]);

    expect(resolveUncPath('\\\\Otix-LivingRoom-Node\\share\\roms')).toBe('\\\\192.168.1.77\\share\\roms');
  });

  it('attempts /api/v1/library/nodes first during syncMachineMappingsFromBackend', async () => {
    clearMachineMappingSyncCache();
    const fetchCalls: string[] = [];
    const origFetch = global.fetch;

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      fetchCalls.push(url);
      if (url.includes('/api/v1/library/nodes')) {
        return {
          ok: true,
          json: async () => [
            {
              node_name: 'BackendNode1',
              host: '10.50.0.5',
            },
          ],
        } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    try {
      await syncMachineMappingsFromBackend('http://localhost:8000', 'token123', true);
      expect(fetchCalls[0]).toBe('http://localhost:8000/api/v1/library/nodes');
      expect(resolveUncPath('\\\\BackendNode1\\games')).toBe('\\\\10.50.0.5\\games');
    } finally {
      global.fetch = origFetch;
    }
  });

  it('falls back to /api/v1/library/server-machines if /nodes endpoint returns 404', async () => {
    clearMachineMappingSyncCache();
    const fetchCalls: string[] = [];
    const origFetch = global.fetch;

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      fetchCalls.push(url);
      if (url.includes('/api/v1/library/nodes')) {
        return { ok: false, status: 404 } as any;
      }
      if (url.includes('/api/v1/library/server-machines')) {
        return {
          ok: true,
          json: async () => [
            {
              name: 'LegacyServerMachine',
              host: '10.50.0.99',
            },
          ],
        } as any;
      }
      return { ok: false } as any;
    });

    try {
      await syncMachineMappingsFromBackend('http://localhost:8000', 'token123', true);
      expect(fetchCalls).toContain('http://localhost:8000/api/v1/library/nodes');
      expect(fetchCalls).toContain('http://localhost:8000/api/v1/library/server-machines');
      expect(resolveUncPath('\\\\LegacyServerMachine\\data')).toBe('\\\\10.50.0.99\\data');
    } finally {
      global.fetch = origFetch;
    }
  });
});
