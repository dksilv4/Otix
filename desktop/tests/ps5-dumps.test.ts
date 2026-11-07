// desktop/tests/ps5-dumps.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  detectPlatformFromTags,
  extractPs5DumpMetadata,
  getRootGameDir,
  scanLocalFiles,
} from '../game/local-scanner';
import {
  CONSOLE_PLATFORMS,
  AMBIGUOUS_EXTENSIONS,
  isRomGame,
  resolveEmulatorLaunch,
  BUILTIN_EMULATORS,
} from '../game/emulators';
import type { LocalGame } from '../preload-api';

describe('PS5 Games and Dumps Full Support', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otix-ps5-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('detectPlatformFromTags', () => {
    it('detects PS5 from tags and Title ID patterns', () => {
      expect(detectPlatformFromTags('Demon\'s Souls [PS5]')).toBe('ps5');
      expect(detectPlatformFromTags('Demon\'s Souls (PS5)')).toBe('ps5');
      expect(detectPlatformFromTags('Marvels.Spider-Man.2.PS5-DUPLEX')).toBe('ps5');
      expect(detectPlatformFromTags('Rayman 30th Anniversary Edition [PPSA33016]')).toBe('ps5');
      expect(detectPlatformFromTags('Final Fantasy XVI (PPSA01234)')).toBe('ps5');
      expect(detectPlatformFromTags('PPSA33016-app0')).toBe('ps5');
      expect(detectPlatformFromTags('Death Stranding 2 [ELJS01234]')).toBe('ps5');
    });

    it('detects PS4 from tags and CUSA Title IDs', () => {
      expect(detectPlatformFromTags('Bloodborne [PS4]')).toBe('ps4');
      expect(detectPlatformFromTags('Bloodborne [CUSA00207]')).toBe('ps4');
      expect(detectPlatformFromTags('Ghost.of.Tsushima.PS4-DUPLEX')).toBe('ps4');
    });

    it('detects PS3 from tags and BCUS/BLES Title IDs', () => {
      expect(detectPlatformFromTags('The Last of Us [BCUS98174]')).toBe('ps3');
      expect(detectPlatformFromTags('Demon\'s Souls [BLES00932]')).toBe('ps3');
    });
  });

  describe('extractPs5DumpMetadata', () => {
    it('extracts localized title, titleId, version, and artwork from sce_sys', () => {
      const dumpDir = path.join(tmpDir, 'Rayman [PPSA33016]');
      const sceSys = path.join(dumpDir, 'PPSA33016-app0', 'sce_sys');
      fs.mkdirSync(sceSys, { recursive: true });

      const paramJson = {
        titleId: 'PPSA33016',
        contentId: 'EP0001-PPSA33016_00-RAYMAN30TH000000',
        masterVersion: '01.00',
        appVersion: '01.002.000',
        localizedParameters: {
          defaultLanguage: 'en-US',
          'en-US': { titleName: 'Rayman 30th Anniversary Edition' },
          'en-GB': { titleName: 'Rayman 30th Anniversary Edition' },
        },
      };
      fs.writeFileSync(path.join(sceSys, 'param.json'), JSON.stringify(paramJson));

      // 1x1 dummy PNG buffer
      const dummyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      fs.writeFileSync(path.join(sceSys, 'icon0.png'), dummyPng);
      fs.writeFileSync(path.join(sceSys, 'pic0.png'), dummyPng);

      const ebootPath = path.join(dumpDir, 'PPSA33016-app0', 'eboot.bin');
      fs.writeFileSync(ebootPath, 'dummy');

      const meta = extractPs5DumpMetadata(ebootPath);
      expect(meta.titleId).toBe('PPSA33016');
      expect(meta.titleName).toBe('Rayman 30th Anniversary Edition');
      expect(meta.version).toBe('01.002.000');
      expect(meta.localIconUrl).toContain('data:image/png;base64,');
      expect(meta.backdropUrl).toContain('data:image/png;base64,');
      expect(meta.posterUrl).toContain('data:image/png;base64,');
    });
  });

  describe('getRootGameDir', () => {
    it('resolves the actual game root folder regardless of interior app0 subfolders', () => {
      const root = path.join(tmpDir, 'Rayman 30th Anniversary Edition [PPSA33016]');
      const ebootInApp0 = path.join(root, 'PPSA33016-app0', 'eboot.bin');
      expect(getRootGameDir(ebootInApp0)).toBe(root);

      const ebootInNestedApp0 = path.join(root, 'app0', 'pancake', 'eboot.bin');
      expect(getRootGameDir(ebootInNestedApp0)).toBe(root);

      const ebootInUsrdir = path.join(root, 'USRDIR', 'eboot.bin');
      expect(getRootGameDir(ebootInUsrdir)).toBe(root);
    });
  });

  describe('scanLocalFiles end-to-end for PS5', () => {
    it('scans PS5 folder dumps with proper root installDir, metadata, and local artwork', async () => {
      const ps5Lib = path.join(tmpDir, 'PS5Games');
      const gameRoot = path.join(ps5Lib, 'Rayman 30th Anniversary Edition [PPSA33016]');
      const app0Dir = path.join(gameRoot, 'PPSA33016-app0');
      const sceSys = path.join(app0Dir, 'sce_sys');
      fs.mkdirSync(sceSys, { recursive: true });

      const ebootPath = path.join(app0Dir, 'eboot.bin');
      fs.writeFileSync(ebootPath, 'bin');

      const paramJson = {
        titleId: 'PPSA33016',
        appVersion: '01.000.001',
        localizedParameters: {
          'en-US': { titleName: 'Rayman 30th Anniversary Edition' },
        },
      };
      fs.writeFileSync(path.join(sceSys, 'param.json'), JSON.stringify(paramJson));

      const dummyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      fs.writeFileSync(path.join(sceSys, 'icon0.png'), dummyPng);

      const result = await scanLocalFiles({
        scanDirectories: [ps5Lib],
        isoDirectories: [ps5Lib],
      });

      expect(result.games.length).toBe(1);
      const game = result.games[0];
      expect(game.title).toBe('Rayman 30th Anniversary Edition');
      expect(game.platform).toBe('ps5');
      expect(game.exePath).toBe(ebootPath);
      // installDir MUST be the true game root folder, NOT the internal app0 subfolder
      expect(game.installDir).toBe(gameRoot);
      expect(game.localIconUrl).toContain('data:image/png;base64,');
      expect(game.version).toBe('01.000.001');
      expect((game as any).titleId).toBe('PPSA33016');
    });

    it('scans PS5 .pkg packages correctly', async () => {
      const pkgDir = path.join(tmpDir, 'PS5Packages');
      fs.mkdirSync(pkgDir, { recursive: true });
      const pkgPath = path.join(pkgDir, 'Marvels.Spider-Man.2.PPSA01234.pkg');
      fs.writeFileSync(pkgPath, 'pkg');

      const result = await scanLocalFiles({
        scanDirectories: [],
        isoDirectories: [pkgDir],
      });

      expect(result.games.length).toBe(1);
      const game = result.games[0];
      expect(game.platform).toBe('ps5');
      expect(game.title).toContain('Spider');
      expect(game.exePath).toBe(pkgPath);
      expect(game.installDir).toBe(pkgDir);
      expect((game as any).titleId).toBe('PPSA01234');
    });
  });

  describe('Emulator integration for PS5', () => {
    it('includes ps4 and ps5 in CONSOLE_PLATFORMS', () => {
      expect(CONSOLE_PLATFORMS.has('ps5')).toBe(true);
      expect(CONSOLE_PLATFORMS.has('ps4')).toBe(true);
    });

    it('includes ps5 in AMBIGUOUS_EXTENSIONS for .pkg and .bin', () => {
      expect(AMBIGUOUS_EXTENSIONS['.pkg']).toContain('ps5');
      expect(AMBIGUOUS_EXTENSIONS['.bin']).toContain('ps5');
    });

    it('identifies PS5 games and eboot.bin as ROM / console games in isRomGame', () => {
      const ps5DumpGame: LocalGame = {
        id: 'ps5_rayman',
        title: 'Rayman 30th Anniversary Edition',
        exePath: 'D:/Games/PS5/Rayman [PPSA33016]/PPSA33016-app0/eboot.bin',
        installDir: 'D:/Games/PS5/Rayman [PPSA33016]',
        platform: 'ps5',
      };
      expect(isRomGame(ps5DumpGame)).toBe(true);

      const ps5PkgGame: LocalGame = {
        id: 'ps5_spiderman',
        title: 'Marvel\'s Spider-Man 2',
        exePath: 'D:/Games/PS5/Spider-Man 2.pkg',
        installDir: 'D:/Games/PS5',
        platform: 'ps5',
      };
      expect(isRomGame(ps5PkgGame)).toBe(true);
    });

    it('has shadPS4 supporting both ps4 and ps5 with eboot.bin and pkg', () => {
      const shadps4 = BUILTIN_EMULATORS.find((e) => e.id === 'shadps4');
      expect(shadps4).toBeDefined();
      expect(shadps4?.platforms).toContain('ps5');
      expect(shadps4?.platforms).toContain('ps4');
      expect(shadps4?.extensions).toContain('eboot.bin');
      expect(shadps4?.extensions).toContain('.pkg');
    });

    it('resolves emulator launch for PS5 game using custom emulator or shadPS4', () => {
      const game: LocalGame = {
        id: 'ps5_test',
        title: 'Rayman PS5',
        exePath: 'D:/Games/PS5/Rayman [PPSA33016]/PPSA33016-app0/eboot.bin',
        installDir: 'D:/Games/PS5/Rayman [PPSA33016]',
        platform: 'ps5',
      };

      const customEmuDir = path.join(tmpDir, 'shadps4');
      fs.mkdirSync(customEmuDir, { recursive: true });
      const customExe = path.join(customEmuDir, 'shadps4.exe');
      fs.writeFileSync(customExe, 'dummy');

      const settings = {
        emulatorPaths: {
          shadps4: customExe,
        },
      } as any;

      const launch = resolveEmulatorLaunch(game, undefined, settings);
      expect(launch.emulator.id).toBe('shadps4');
      expect(launch.executablePath).toBe(customExe);
      expect(launch.args).toContain('-g');
      expect(launch.args).toContain(game.exePath);
    });
  });
});
