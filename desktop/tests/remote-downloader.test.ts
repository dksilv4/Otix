import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import { RemoteDownloadManager } from '../downloads/remote-downloader';
import { registerMachineMapping } from '../unc-resolver';
import * as desktopSettings from '../desktop-settings';
import * as downloadsIndex from '../downloads/index';
import fs from 'fs';

vi.mock('../desktop-settings', () => ({
  getSettings: vi.fn(),
}));

vi.mock('../downloads/index', () => ({
  getConfig: vi.fn(),
  createDownload: vi.fn(),
  updateDownloadStatus: vi.fn(),
  updateDownloadIsoPath: vi.fn(),
  deleteDownload: vi.fn(),
}));

vi.mock('../db', () => ({
  getDb: vi.fn(),
}));

describe('RemoteDownloadManager UNC resolution', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    registerMachineMapping('SERVER', '192.168.1.58');
  });

  it('resolves machine UNC download path before calling fs operations', async () => {
    vi.mocked(desktopSettings.getSettings).mockReturnValue({
      gamesDownloadPath: '\\\\SERVER\\Downloads',
    } as any);

    vi.mocked(downloadsIndex.getConfig).mockResolvedValue(null);
    vi.mocked(downloadsIndex.createDownload).mockResolvedValue({ id: 'dl_test_123' } as any);

    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined as any);

    const manager = new RemoteDownloadManager();
    // Intercept executeStream so it doesn't make real network calls
    (manager as any).executeStream = vi.fn();

    const id = await manager.startDownload({
      serverUrl: 'http://192.168.1.58:8090',
      fileId: 'game_file_1',
      filename: 'Game.iso',
      filesize: 1000,
      gameTitle: 'Test Game',
    });

    expect(id).toBe('dl_test_123');
    expect(existsSpy).toHaveBeenCalledWith(
      expect.stringContaining('\\\\192.168.1.58\\Downloads')
    );
    expect(existsSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('\\\\SERVER\\Downloads')
    );

    const transfer = (manager as any).activeTransfers.get('dl_test_123');
    expect(transfer.finalPath).toContain(path.join('\\\\192.168.1.58\\Downloads', 'Game.iso'));
    expect(transfer.partPath).toContain(path.join('\\\\192.168.1.58\\Downloads', 'Game.iso.otixpart'));
  });

  it('supports nodeUrl option and populates both nodeUrl and serverUrl in active transfers', async () => {
    vi.mocked(desktopSettings.getSettings).mockReturnValue({
      gamesDownloadPath: 'C:\\OtixGames',
    } as any);

    vi.mocked(downloadsIndex.getConfig).mockResolvedValue(null);
    vi.mocked(downloadsIndex.createDownload).mockResolvedValue({ id: 'dl_node_456' } as any);

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined as any);

    const manager = new RemoteDownloadManager();
    (manager as any).executeStream = vi.fn();

    const id = await manager.startDownload({
      nodeUrl: 'http://192.168.1.100:8090',
      fileId: 'game_node_pkg',
      filename: 'GameUpdate.pkg',
      filesize: 5000,
      gameTitle: 'Node Powered Game',
    });

    expect(id).toBe('dl_node_456');
    expect(downloadsIndex.createDownload).toHaveBeenCalledWith(
      'default',
      null,
      'Node Powered Game',
      'GameUpdate.pkg',
      5000,
      'http://192.168.1.100:8090/api/v1/files/game_node_pkg/download',
      null,
      'node',
    );

    const activeList = manager.getActiveTransfers();
    expect(activeList.length).toBe(1);
    expect(activeList[0].nodeUrl).toBe('http://192.168.1.100:8090');
    expect(activeList[0].serverUrl).toBe('http://192.168.1.100:8090');
  });
});
