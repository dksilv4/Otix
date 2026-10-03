import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as os from 'os';
import * as fs from 'fs';
import {
  getHostNodeAndHardware,
  getCachedHostNodeAndHardware,
  checkNodeInstalledOnDisk,
  normalizeRamBytes,
  resetHostNodeCache,
} from '../game/node-hardware';

vi.mock('fs');

describe('node-hardware', () => {
  beforeEach(() => {
    resetHostNodeCache();
    vi.clearAllMocks();
  });

  it('detects fallback hardware when node is not running or installed', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const match = await getHostNodeAndHardware(true);
    expect(match).toBeDefined();
    expect(match.hardware).toBeDefined();
    expect(match.hardware?.ramBytes).toBeGreaterThan(0);
    expect(typeof match.hardwareSummary).toBe('string');
  });

  it('detects node when config file exists on disk', () => {
    vi.mocked(fs.existsSync).mockImplementation((filePath) => {
      return typeof filePath === 'string' && filePath.includes('config.yaml');
    });
    vi.mocked(fs.readFileSync).mockReturnValue(
      'server:\n  name: "LivingRoom-PC"\n  port: 8090\n',
    );

    const diskCheck = checkNodeInstalledOnDisk();
    expect(diskCheck.installed).toBe(true);
    expect(diskCheck.name).toBe('LivingRoom-PC');
  });

  it('returns cached snapshot via getCachedHostNodeAndHardware', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const snap = getCachedHostNodeAndHardware();
    expect(snap).toBeDefined();
    expect(snap.hardware).toBeDefined();
  });

  it('normalizes usable RAM bytes to standard installed hardware tiers', () => {
    // 33346146304 bytes (~31.05 GB usable on Windows 32GB system) -> 32 GB (34359738368 bytes)
    expect(normalizeRamBytes(33346146304)).toBe(32 * 1024 * 1024 * 1024);
    // Exact 32 GB
    expect(normalizeRamBytes(32 * 1024 * 1024 * 1024)).toBe(32 * 1024 * 1024 * 1024);
    // 16 GB with APU reserve (~14.5 GB) -> 16 GB
    expect(normalizeRamBytes(15569256448)).toBe(16 * 1024 * 1024 * 1024);
    // 64 GB (~62.8 GB usable) -> 64 GB
    expect(normalizeRamBytes(67431200000)).toBe(64 * 1024 * 1024 * 1024);
  });
});
