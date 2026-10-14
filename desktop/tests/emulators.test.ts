import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  expandEnvVars,
  getAllEmulatorDefinitions,
  detectAllEmulators,
  isRomGame,
  getAmbiguousCandidates,
  resolveEmulatorLaunch,
  BUILTIN_EMULATORS,
} from '../game/emulators';
import { ServiceRegistry } from '../plugin-runtime/service-registry';
import type { LocalGame } from '../preload-api';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

describe('desktop/game/emulators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('expandEnvVars', () => {
    it('expands ~ to home directory', () => {
      const res = expandEnvVars('~/emulators/test.exe');
      expect(res).not.toContain('~');
    });

    it('expands environment variables', () => {
      process.env.TEST_EMU_DIR = 'C:/CustomEmu';
      const res = expandEnvVars('%TEST_EMU_DIR%/run.exe');
      expect(res.replace(/\\/g, '/')).toContain('C:/CustomEmu/run.exe');
    });
  });

  describe('getAllEmulatorDefinitions', () => {
    it('returns all builtin emulators when no serviceRegistry is given', () => {
      const all = getAllEmulatorDefinitions();
      expect(all.length).toBe(BUILTIN_EMULATORS.length);
      expect(all.some((e) => e.id === 'pcsx2')).toBe(true);
      expect(all.some((e) => e.id === 'dolphin')).toBe(true);
      expect(all.some((e) => e.id === 'retroarch')).toBe(true);
    });

    it('merges emulators registered by plugins via serviceRegistry', () => {
      const registry = new ServiceRegistry();
      registry.register('custom-shadps4', 'emulator', ['*'], undefined, {
        emulatorId: 'shadps4',
        name: 'shadPS4',
        platforms: ['ps4'],
        extensions: ['.pkg'],
        defaultExecutable: 'shadps4.exe',
        launchTemplate: ['-g', '{romPath}'],
      });

      const all = getAllEmulatorDefinitions(registry);
      const custom = all.find((e) => e.id === 'shadps4');
      expect(custom).toBeDefined();
      expect(custom?.name).toBe('shadPS4');
      expect(custom?.source).toBe('plugin');
      expect(custom?.pluginId).toBe('custom-shadps4');
    });
  });

  describe('isRomGame', () => {
    it('recognizes games with console platforms', () => {
      const game: LocalGame = {
        id: '1',
        title: 'Super Mario World',
        exePath: 'C:/Games/smw.sfc',
        installDir: 'C:/Games',
        platform: 'snes' as any,
      };
      expect(isRomGame(game)).toBe(true);
    });

    it('recognizes games by known ROM extension even if platform is unknown', () => {
      const game: LocalGame = {
        id: '2',
        title: 'Pokemon Emerald',
        exePath: 'C:/Games/emerald.gba',
        installDir: 'C:/Games',
        platform: 'unknown' as any,
      };
      expect(isRomGame(game)).toBe(true);
    });

    it('returns false for standard PC executables', () => {
      const game: LocalGame = {
        id: '3',
        title: 'Cyberpunk 2077',
        exePath: 'C:/Games/Cyberpunk 2077/bin/x64/Cyberpunk2077.exe',
        installDir: 'C:/Games/Cyberpunk 2077',
        platform: 'pc',
      };
      expect(isRomGame(game)).toBe(false);
    });
  });

  describe('getAmbiguousCandidates', () => {
    it('returns console candidates for .iso file when platform is unknown or iso', () => {
      const candidates = getAmbiguousCandidates('C:/Games/Tekken.iso');
      expect(candidates).toContain('ps2');
      expect(candidates).toContain('gamecube');
      expect(candidates).toContain('ps1');
    });

    it('returns empty array if extension is unambiguous (.sfc)', () => {
      const candidates = getAmbiguousCandidates('C:/Games/Zelda.sfc');
      expect(candidates).toEqual([]);
    });

    it('returns empty array if game is already mapped to a console platform', () => {
      const game: LocalGame = {
        id: '4',
        title: 'Tekken 5',
        exePath: 'C:/Games/Tekken5.iso',
        installDir: 'C:/Games',
        platform: 'ps2' as any,
      };
      const candidates = getAmbiguousCandidates(game);
      expect(candidates).toEqual([]);
    });
  });

  describe('resolveEmulatorLaunch', () => {
    it('resolves PCSX2 launch command for PS2 game', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const game: LocalGame = {
        id: 'ps2-1',
        title: 'Final Fantasy X',
        exePath: 'C:/Games/FFX.iso',
        installDir: 'C:/Games',
        platform: 'ps2' as any,
      };

      const resolved = resolveEmulatorLaunch(game);
      expect(resolved.emulator.id).toBe('pcsx2');
      expect(resolved.args).toContain('C:/Games/FFX.iso');
      expect(resolved.args).toContain('-batch');
      expect(resolved.args).toContain('-fullscreen');
    });

    it('resolves RetroArch core for SNES game', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const game: LocalGame = {
        id: 'snes-1',
        title: 'Super Mario World',
        exePath: 'C:/Games/smw.sfc',
        installDir: 'C:/Games',
        platform: 'snes' as any,
      };

      const resolved = resolveEmulatorLaunch(game);
      expect(resolved.emulator.id).toBe('retroarch');
      expect(resolved.args).toContain('-L');
      expect(resolved.args.some((a) => a.includes('snes9x_libretro'))).toBe(true);
      expect(resolved.args).toContain('C:/Games/smw.sfc');
    });

    it('uses custom emulator path from settings when provided', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return String(p).includes('MyCustomPCSX2');
      });

      const game: LocalGame = {
        id: 'ps2-2',
        title: 'Kingdom Hearts',
        exePath: 'C:/Games/KH.iso',
        installDir: 'C:/Games',
        platform: 'ps2' as any,
      };

      const settings = {
        emulatorPaths: {
          pcsx2: 'D:/MyCustomPCSX2/pcsx2.exe',
        },
      } as any;

      const resolved = resolveEmulatorLaunch(game, undefined, settings);
      expect(resolved.executablePath.replace(/\\/g, '/')).toBe('D:/MyCustomPCSX2/pcsx2.exe');
    });

    it('throws descriptive error when emulator is not installed', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const game: LocalGame = {
        id: 'ps2-3',
        title: 'Shadow of the Colossus',
        exePath: 'C:/Games/SotC.iso',
        installDir: 'C:/Games',
        platform: 'ps2' as any,
      };

      expect(() => resolveEmulatorLaunch(game)).toThrow(
        /Emulator "PCSX2" for PS2 was not found on your system/,
      );
    });
  });
});
