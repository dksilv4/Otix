import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LibraryWatcher } from '../game/library-watcher';
import type { LocalGame } from '../preload-api';

describe('LibraryWatcher - Automatic Game Detection & Folder Monitoring', () => {
  let tempDir: string;
  let testGamesDir: string;
  let testIsoDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otix-watcher-test-'));
    testGamesDir = path.join(tempDir, 'Games');
    testIsoDir = path.join(tempDir, 'ISOs');
    fs.mkdirSync(testGamesDir, { recursive: true });
    fs.mkdirSync(testIsoDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('starts and attaches watches to configured directories', () => {
    const mockScan = vi.fn().mockResolvedValue({ games: [], newGames: [] });
    const mockNotify = vi.fn();

    const watcher = new LibraryWatcher({
      getScanPaths: () => [
        { path: testGamesDir, type: 'game' },
        { path: testIsoDir, type: 'iso' },
      ],
      onPerformScan: mockScan,
      onNewGamesDetected: mockNotify,
      debounceMs: 50,
    });

    watcher.start();
    const watched = watcher.getWatchedPaths();
    expect(watched).toContain(path.resolve(testGamesDir));
    expect(watched).toContain(path.resolve(testIsoDir));
    watcher.stop();
  });

  it('updates watches dynamically when paths are added or removed', () => {
    const newDir = path.join(tempDir, 'ExtraGames');
    fs.mkdirSync(newDir, { recursive: true });

    let currentPaths = [{ path: testGamesDir, type: 'game' as const }];
    const watcher = new LibraryWatcher({
      getScanPaths: () => currentPaths,
      onPerformScan: vi.fn().mockResolvedValue({ games: [], newGames: [] }),
      debounceMs: 50,
    });

    watcher.start();
    expect(watcher.getWatchedPaths()).toEqual([path.resolve(testGamesDir)]);

    // Add new folder and remove old
    currentPaths = [{ path: newDir, type: 'game' as const }];
    watcher.updateWatches();

    expect(watcher.getWatchedPaths()).toContain(path.resolve(newDir));
    expect(watcher.getWatchedPaths()).not.toContain(path.resolve(testGamesDir));

    watcher.stop();
  });

  it('skips non-existent directories gracefully without throwing', () => {
    const nonExistent = path.join(tempDir, 'DoesNotExist');
    const watcher = new LibraryWatcher({
      getScanPaths: () => [{ path: nonExistent, type: 'game' }],
      onPerformScan: vi.fn().mockResolvedValue({ games: [], newGames: [] }),
      debounceMs: 50,
    });

    expect(() => {
      watcher.start();
    }).not.toThrow();

    expect(watcher.getWatchedPaths()).not.toContain(path.resolve(nonExistent));
    watcher.stop();
  });

  it('ignores noise files and does not schedule scans for them', () => {
    const watcher = new LibraryWatcher({
      getScanPaths: () => [{ path: testGamesDir, type: 'game' }],
      onPerformScan: vi.fn().mockResolvedValue({ games: [], newGames: [] }),
      debounceMs: 50,
    });

    expect(watcher.isNoiseFile('.git')).toBe(true);
    expect(watcher.isNoiseFile('download.tmp')).toBe(true);
    expect(watcher.isNoiseFile('game.crdownload')).toBe(true);
    expect(watcher.isNoiseFile('setup.part')).toBe(true);
    expect(watcher.isNoiseFile('test.aria2')).toBe(true);
    expect(watcher.isNoiseFile('crash.log')).toBe(true);
    expect(watcher.isNoiseFile('metadata.otix')).toBe(true);
    expect(watcher.isNoiseFile('sidecar.otixmeta')).toBe(true);
    expect(watcher.isNoiseFile('$RECYCLE.BIN\\file.bin')).toBe(true);

    expect(watcher.isNoiseFile('Doom.exe')).toBe(false);
    expect(watcher.isNoiseFile('game_data.pak')).toBe(false);
  });

  it('coalesces rapid file events and triggers scan after debounce window', async () => {
    const mockScan = vi.fn().mockResolvedValue({
      games: [],
      newGames: [],
    });
    const mockNotify = vi.fn();

    const watcher = new LibraryWatcher({
      getScanPaths: () => [{ path: testGamesDir, type: 'game' }],
      onPerformScan: mockScan,
      onNewGamesDetected: mockNotify,
      debounceMs: 60,
    });

    watcher.start();

    // Fire multiple rapid events
    watcher.handleFsEvent(testGamesDir, 'rename', 'Silksong.exe');
    watcher.handleFsEvent(testGamesDir, 'change', 'Silksong.exe');
    watcher.handleFsEvent(testGamesDir, 'change', 'Silksong_data.pak');

    expect(mockScan).not.toHaveBeenCalled();

    // Wait for debounce to elapse
    await new Promise((r) => setTimeout(r, 120));

    expect(mockScan).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it('calls onNewGamesDetected when scan returns newly detected games', async () => {
    const mockGame: LocalGame = {
      id: 'pc_silksong',
      title: 'Hollow Knight: Silksong',
      exePath: path.join(testGamesDir, 'Silksong', 'Silksong.exe'),
      installDir: path.join(testGamesDir, 'Silksong'),
      platform: 'pc',
    };

    const mockScan = vi.fn().mockResolvedValue({
      games: [mockGame],
      newGames: [mockGame],
    });
    const mockNotify = vi.fn();

    const watcher = new LibraryWatcher({
      getScanPaths: () => [{ path: testGamesDir, type: 'game' }],
      onPerformScan: mockScan,
      onNewGamesDetected: mockNotify,
      debounceMs: 40,
    });

    watcher.start();

    const result = await watcher.triggerScan();

    expect(result).not.toBeNull();
    expect(result?.newGames).toHaveLength(1);
    expect(mockNotify).toHaveBeenCalledWith([mockGame]);

    watcher.stop();
  });

  it('coalesces concurrent scan requests and executes pending rescan when running scan completes', async () => {
    let scanCallCount = 0;
    const mockScan = vi.fn().mockImplementation(async () => {
      scanCallCount++;
      await new Promise((r) => setTimeout(r, 50));
      return { games: [], newGames: [] };
    });

    const watcher = new LibraryWatcher({
      getScanPaths: () => [],
      onPerformScan: mockScan,
      debounceMs: 50,
    });

    watcher.start();

    // Trigger initial scan (takes 50ms)
    const scan1 = watcher.triggerScan();

    // While scan1 is running, trigger another scan
    const scan2 = watcher.triggerScan();
    expect(await scan2).toBeNull(); // Queued as pending

    await scan1;

    // Allow pending scan to dispatch
    await new Promise((r) => setTimeout(r, 100));

    expect(scanCallCount).toBe(2);
    watcher.stop();
  });
});
