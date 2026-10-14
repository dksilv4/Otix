import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import {
  SaveDaemon,
  isEmulatorSaveFile,
} from '../saves/index';
import * as SaveService from '../saves/service';
import * as storage from '../game/storage';
import { ServiceRegistry } from '../plugin-runtime/service-registry';

// Mock fs/promises
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    readdir: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ size: 1024, mtimeMs: 123456789 }),
    unlink: vi.fn().mockResolvedValue(undefined),
    open: vi.fn().mockResolvedValue({
      read: vi.fn().mockResolvedValue({ bytesRead: 0 }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  };
});

// Mock SaveService
vi.mock('../saves/service', () => {
  return {
    getAllKnownLocations: vi.fn().mockReturnValue([]),
    upsertKnownLocation: vi.fn(),
    getProfilesByGameId: vi.fn().mockReturnValue([]),
    getProfileById: vi.fn(),
    createProfile: vi.fn(),
    getActiveProfile: vi.fn(),
    deactivateAllProfiles: vi.fn(),
    activateProfile: vi.fn(),
    deleteProfile: vi.fn(),
    getSavesByProfile: vi.fn().mockReturnValue([]),
    upsertVaultSave: vi.fn(),
    deleteVaultSavesByProfile: vi.fn(),
    deleteSnapshotsByProfile: vi.fn(),
    getOverride: vi.fn().mockReturnValue(null),
    getCloudSettings: vi.fn().mockReturnValue(null),
  };
});

// Mock game storage
vi.mock('../game/storage', () => {
  return {
    getGameById: vi.fn(),
  };
});

import * as fs from 'fs/promises';

describe('desktop/saves/emulator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isEmulatorSaveFile', () => {
    it('recognizes standard save extensions', () => {
      expect(isEmulatorSaveFile('game.sav')).toBe(true);
      expect(isEmulatorSaveFile('game.srm')).toBe(true);
      expect(isEmulatorSaveFile('game.state')).toBe(true);
      expect(isEmulatorSaveFile('game.state1')).toBe(true);
      expect(isEmulatorSaveFile('game.ss0')).toBe(true);
      expect(isEmulatorSaveFile('game.st3')).toBe(true);
      expect(isEmulatorSaveFile('game.dsv')).toBe(true);
      expect(isEmulatorSaveFile('game.p2s')).toBe(true);
    });

    it('recognizes console memory cards', () => {
      expect(isEmulatorSaveFile('Mcd001.ps2')).toBe(true);
      expect(isEmulatorSaveFile('Slot1.mcd')).toBe(true);
      expect(isEmulatorSaveFile('MemoryCardA.raw')).toBe(true);
    });

    it('rejects ROM files and executables', () => {
      expect(isEmulatorSaveFile('game.sfc')).toBe(false);
      expect(isEmulatorSaveFile('game.smc')).toBe(false);
      expect(isEmulatorSaveFile('game.iso')).toBe(false);
      expect(isEmulatorSaveFile('game.chd')).toBe(false);
      expect(isEmulatorSaveFile('game.bin')).toBe(false);
      expect(isEmulatorSaveFile('game.zip')).toBe(false);
      expect(isEmulatorSaveFile('game.exe')).toBe(false);
    });

    it('matches specific ROM base name when provided', () => {
      expect(isEmulatorSaveFile('Super Mario World.srm', 'super mario world')).toBe(true);
      expect(isEmulatorSaveFile('Super Mario World.state1', 'super mario world')).toBe(true);
      expect(isEmulatorSaveFile('Chrono Trigger.srm', 'super mario world')).toBe(false);
    });
  });

  describe('SaveDaemon emulator discovery', () => {
    it('discovers save paths for console ROM games', async () => {
      const daemon = new SaveDaemon('C:/vault');
      const registry = new ServiceRegistry();
      daemon.setServiceRegistry(registry);

      vi.mocked(storage.getGameById).mockReturnValue({
        id: 'snes-smw',
        title: 'Super Mario World',
        exePath: 'C:/Roms/SNES/Super Mario World.sfc',
        installDir: 'C:/Roms/SNES',
        platform: 'snes' as any,
      });

      // Emulate that only ROM directory exists
      vi.mocked(fs.access).mockImplementation(async (p: any) => {
        const pathStr = String(p).replace(/\\/g, '/').toLowerCase();
        if (pathStr === 'c:/roms/snes' || pathStr.endsWith('/c:/roms/snes')) {
          return undefined; // exists
        }
        throw new Error('ENOENT');
      });

      vi.mocked(fs.readdir).mockImplementation(async (p: any, options: any) => {
        const pathStr = String(p).replace(/\\/g, '/');
        if (pathStr.toLowerCase().includes('c:/roms/snes')) {
          if (options?.withFileTypes) {
            return [
              { name: 'Super Mario World.sfc', isFile: () => true, isDirectory: () => false } as any,
              { name: 'Super Mario World.srm', isFile: () => true, isDirectory: () => false } as any,
              { name: 'Super Mario World.state1', isFile: () => true, isDirectory: () => false } as any,
            ];
          }
          return [
            'Super Mario World.sfc',
            'Super Mario World.srm',
            'Super Mario World.state1',
          ] as any;
        }
        return [] as any;
      });

      const res = await daemon.discoverForGame('snes-smw', 'Super Mario World');
      expect(res.gameId).toBe('snes-smw');
      expect(res.detectedPaths.length).toBeGreaterThan(0);
      // It should count only the .srm and .state1 saves (2 files), not the .sfc ROM!
      expect(res.filesFound).toBe(2);
    });
  });

  describe('SaveDaemon backupToVault filtering for ROMs', () => {
    it('only backs up save files and skips ROM files into vault', async () => {
      const daemon = new SaveDaemon('C:/vault');

      vi.mocked(storage.getGameById).mockReturnValue({
        id: 'snes-smw',
        title: 'Super Mario World',
        exePath: 'C:/Roms/SNES/Super Mario World.sfc',
        installDir: 'C:/Roms/SNES',
        platform: 'snes' as any,
      });

      vi.mocked(SaveService.getActiveProfile).mockReturnValue({
        id: 'prof-1',
        game_id: 'snes-smw',
        name: 'default',
        is_active: 1,
        created_at: new Date().toISOString(),
      });

      vi.mocked(fs.access).mockResolvedValue(undefined);

      vi.mocked(fs.readdir).mockImplementation(async (_dir: any, options: any) => {
        if (options?.withFileTypes) {
          return [
            { name: 'Super Mario World.sfc', isFile: () => true, isDirectory: () => false } as any,
            { name: 'Super Mario World.srm', isFile: () => true, isDirectory: () => false } as any,
            { name: 'Other Game.sfc', isFile: () => true, isDirectory: () => false } as any,
          ];
        }
        return ['Super Mario World.sfc', 'Super Mario World.srm', 'Other Game.sfc'] as any;
      });

      const progress = await daemon.backupToVault('snes-smw', ['C:/Roms/SNES']);

      // Should only have backed up 1 file: Super Mario World.srm
      expect(progress.totalFiles).toBe(1);
      expect(progress.completedFiles).toBe(1);
      expect(SaveService.upsertVaultSave).toHaveBeenCalledTimes(1);
      const call = vi.mocked(SaveService.upsertVaultSave).mock.calls[0];
      expect(call[3]).toContain('Super Mario World.srm');
    });
  });
});
