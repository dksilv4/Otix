import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';

// Hoisted mocks for Vitest
const { mockSend, mockNotificationInstances, MockNotification } = vi.hoisted(() => {
  const mockSend = vi.fn();
  const mockNotificationInstances: any[] = [];

  class MockNotification {
    public static isSupported = vi.fn(() => true);
    public options: any;
    public clickHandler: (() => void) | null = null;
    public show = vi.fn();

    constructor(options: any) {
      this.options = options;
      mockNotificationInstances.push(this);
    }

    public on(event: string, handler: () => void) {
      if (event === 'click') {
        this.clickHandler = handler;
      }
    }
  }

  return { mockSend, mockNotificationInstances, MockNotification };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  BrowserWindow: {
    fromWebContents: () => null,
    getFocusedWindow: () => null,
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  Notification: MockNotification,
}));

// Mock game storage
let mockStoredGames: any[] = [];
vi.mock('../game/storage', () => ({
  getAllGames: vi.fn(() => [...mockStoredGames]),
  getAllGameMatches: vi.fn(() => []),
  getScanPaths: vi.fn(() => [{ path: 'C:\\Games', type: 'game' }]),
  saveScanPaths: vi.fn(),
  upsertGames: vi.fn((games: any[]) => {
    mockStoredGames = [...games];
  }),
  flushNotifyGamesChanged: vi.fn(),
  pruneMissingGamesAsync: vi.fn().mockResolvedValue(undefined),
  findMainExecutableInFolder: vi.fn(),
  calculateDirectorySize: vi.fn(() => 1024),
  getPeVersion: vi.fn(),
}));

// Mock native scanner
let mockDiscoveredGames: any[] = [];
vi.mock('../game/local-scanner', () => ({
  scanLocalFiles: vi.fn(async () => ({
    games: [...mockDiscoveredGames],
  })),
  isUpdateFile: vi.fn(() => false),
  isDlcFile: vi.fn(() => false),
}));

import { handleNewGamesDetected, executeScan } from '../ipc/scanner';
import type { LocalGame } from '../preload-api';

describe('Scanner New Game Detection & Notifications', () => {
  let mockWindow: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNotificationInstances.length = 0;
    mockStoredGames = [];
    mockDiscoveredGames = [];

    mockWindow = {
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => false),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      webContents: {
        isDestroyed: vi.fn(() => false),
        send: mockSend,
      },
    };
  });

  describe('handleNewGamesDetected', () => {
    it('creates native Notification and dispatches IPC for a single new game', () => {
      const newGame: LocalGame = {
        id: 'pc_silksong',
        title: 'Hollow Knight: Silksong',
        installDir: 'C:\\Games\\Silksong',
        exePath: 'C:\\Games\\Silksong\\Silksong.exe',
        platform: 'pc',
      };

      handleNewGamesDetected([newGame], mockWindow);

      expect(mockNotificationInstances).toHaveLength(1);
      const notif = mockNotificationInstances[0];
      expect(notif.options.title).toBe('New game detected');
      expect(notif.options.body).toContain('Hollow Knight: Silksong');
      expect(notif.show).toHaveBeenCalled();

      expect(mockSend).toHaveBeenCalledWith('scanner:new-games-detected', {
        games: [newGame],
      });

      // Clicking notification restores & focuses window and navigates
      notif.clickHandler?.();
      expect(mockWindow.show).toHaveBeenCalled();
      expect(mockWindow.focus).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledWith('notifications:navigate', {
        type: 'game_detected',
        metadata: { gameId: 'pc_silksong' },
      });
    });

    it('creates plural native Notification for multiple new games', () => {
      const newGames: LocalGame[] = [
        { id: 'pc_game1', title: 'Game 1', platform: 'pc', exePath: 'C:\\Games\\g1\\g1.exe', installDir: 'C:\\Games\\g1' },
        { id: 'pc_game2', title: 'Game 2', platform: 'pc', exePath: 'C:\\Games\\g2\\g2.exe', installDir: 'C:\\Games\\g2' },
      ];

      handleNewGamesDetected(newGames, mockWindow);

      expect(mockNotificationInstances).toHaveLength(1);
      const notif = mockNotificationInstances[0];
      expect(notif.options.title).toBe('New games detected');
      expect(notif.options.body).toBe('2 new games were detected and added to your library.');
      expect(mockSend).toHaveBeenCalledWith('scanner:new-games-detected', {
        games: newGames,
      });
    });

    it('safely handles empty array without showing notifications', () => {
      handleNewGamesDetected([], mockWindow);
      expect(mockNotificationInstances).toHaveLength(0);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('executeScan - Diffing and New Game Detection', () => {
    it('identifies newly installed game in an already added directory', async () => {
      // 1. Existing game in DB
      mockStoredGames = [
        {
          id: 'pc_witcher3',
          title: 'The Witcher 3',
          installDir: 'C:\\Games\\Witcher3',
          exePath: 'C:\\Games\\Witcher3\\bin\\x64\\witcher3.exe',
          platform: 'pc',
        },
      ];

      // 2. Scan discovers both Witcher 3 and newly installed Silksong
      mockDiscoveredGames = [
        {
          id: 'witcher3',
          title: 'The Witcher 3',
          installDir: 'C:\\Games\\Witcher3',
          exePath: 'C:\\Games\\Witcher3\\bin\\x64\\witcher3.exe',
          platform: 'pc',
        },
        {
          id: 'silksong',
          title: 'Hollow Knight: Silksong',
          installDir: 'C:\\Games\\Silksong',
          exePath: 'C:\\Games\\Silksong\\Silksong.exe',
          platform: 'pc',
        },
      ];

      const { games, newGames } = await executeScan({
        paths: ['C:\\Games'],
        nodeDaemon: null,
      });

      expect(games).toHaveLength(2);
      expect(newGames).toHaveLength(1);
      expect(newGames[0].title).toBe('Hollow Knight: Silksong');
      expect(newGames[0].id).toBe('pc_silksong');
    });

    it('returns empty newGames when no new games were installed since last scan', async () => {
      mockStoredGames = [
        {
          id: 'pc_witcher3',
          title: 'The Witcher 3',
          installDir: 'C:\\Games\\Witcher3',
          exePath: 'C:\\Games\\Witcher3\\bin\\x64\\witcher3.exe',
          platform: 'pc',
        },
      ];

      mockDiscoveredGames = [
        {
          id: 'witcher3',
          title: 'The Witcher 3',
          installDir: 'C:\\Games\\Witcher3',
          exePath: 'C:\\Games\\Witcher3\\bin\\x64\\witcher3.exe',
          platform: 'pc',
        },
      ];

      const { games, newGames } = await executeScan({
        paths: ['C:\\Games'],
        nodeDaemon: null,
      });

      expect(games).toHaveLength(1);
      expect(newGames).toHaveLength(0);
    });
  });
});
