// desktop/tests/local-scanner.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  parseAcf,
  generateLocalGameId,
  pickBestExe,
  detectPlatformFromTags,
  scanLocalFiles,
  findUpdateFilesForGame,
} from '../game/local-scanner';

describe('Native Local Scanner', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otix-local-scanner-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('parseAcf', () => {
    it('parses Steam appmanifest files correctly', () => {
      const sampleAcf = `
"AppState"
{
  "appid"  "1091500"
  "name"   "Cyberpunk 2077"
  "installdir" "Cyberpunk 2077"
  "StateFlags" "4"
}
`;
      const parsed = parseAcf(sampleAcf);
      expect(parsed['appid']).toBe('1091500');
      expect(parsed['name']).toBe('Cyberpunk 2077');
      expect(parsed['installdir']).toBe('Cyberpunk 2077');
    });
  });

  describe('generateLocalGameId', () => {
    it('generates deterministic prefixed ids', () => {
      const id1 = generateLocalGameId('C:\\Games\\Hades\\Hades.exe', 'pc');
      const id2 = generateLocalGameId('C:\\Games\\Hades\\Hades.exe', 'pc');
      expect(id1).toBe(id2);
      expect(id1.startsWith('pc_')).toBe(true);
    });
  });

  describe('detectPlatformFromTags', () => {
    it('detects PlayStation platforms from tag bracket formatting', () => {
      expect(detectPlatformFromTags('Elden Ring [PS5].iso')).toBe('ps5');
      expect(detectPlatformFromTags('Bloodborne (PS4).pkg')).toBe('ps4');
      expect(detectPlatformFromTags('Metal Gear Solid 4 [PS3].iso')).toBe('ps3');
      expect(detectPlatformFromTags('Silent Hill 2 (PS2).iso')).toBe('ps2');
    });

    it('returns null when no platform tags are present', () => {
      expect(detectPlatformFromTags('RandomGame.iso')).toBe(null);
    });
  });

  describe('pickBestExe', () => {
    it('prioritizes folder name matches and shipping exes over noise exes', async () => {
      const gameDir = path.join(tmpDir, 'Witcher3');
      fs.mkdirSync(gameDir, { recursive: true });
      const crashExe = path.join(gameDir, 'crash_reporter.exe');
      const uninsExe = path.join(gameDir, 'unins000.exe');
      const gameExe = path.join(gameDir, 'witcher3.exe');
      fs.writeFileSync(crashExe, 'dummy');
      fs.writeFileSync(uninsExe, 'dummy');
      fs.writeFileSync(gameExe, 'dummy');

      const best = await pickBestExe([crashExe, uninsExe, gameExe], 'Witcher3');
      expect(best).toBe(gameExe);
    });
  });

  describe('scanLocalFiles end-to-end', () => {
    it('scans standalone PC games, Steam libraries, and ISOs natively', async () => {
      // 1. Setup standalone PC game
      const pcGamesDir = path.join(tmpDir, 'PCGames');
      const hollowKnightDir = path.join(pcGamesDir, 'Hollow Knight');
      fs.mkdirSync(hollowKnightDir, { recursive: true });
      const hkExe = path.join(hollowKnightDir, 'hollow_knight.exe');
      fs.writeFileSync(hkExe, 'dummy');

      // 2. Setup Steam library with appmanifest
      const steamDir = path.join(tmpDir, 'Steam');
      const steamAppsDir = path.join(steamDir, 'steamapps');
      const commonDir = path.join(steamAppsDir, 'common', 'Portal 2');
      fs.mkdirSync(commonDir, { recursive: true });
      fs.writeFileSync(path.join(commonDir, 'portal2.exe'), 'dummy');
      const acfContent = `
"AppState"
{
  "appid" "620"
  "name" "Portal 2"
  "installdir" "Portal 2"
}
`;
      fs.writeFileSync(path.join(steamAppsDir, 'appmanifest_620.acf'), acfContent);

      // 3. Setup ISO directory
      const isoDir = path.join(tmpDir, 'ISOs');
      fs.mkdirSync(isoDir, { recursive: true });
      const zeldaIso = path.join(isoDir, 'Zelda_Wind_Waker [GC].iso');
      fs.writeFileSync(zeldaIso, 'dummy');
      // Update file next to it
      const updateExe = path.join(isoDir, 'Zelda_patch_v1.exe');
      fs.writeFileSync(updateExe, 'dummy');

      const progressLog: Array<{ dir: string; progress: number }> = [];
      const result = await scanLocalFiles({
        scanDirectories: [pcGamesDir, steamDir],
        isoDirectories: [isoDir],
        onProgress: (dir, progress) => {
          progressLog.push({ dir, progress });
        },
      });

      expect(progressLog.length).toBeGreaterThan(0);
      expect(result.games.length).toBe(3);

      const titles = result.games.map((g) => g.title);
      expect(titles).toContain('Hollow Knight');
      expect(titles).toContain('Portal 2');
      expect(titles.some((t) => t.includes('Zelda'))).toBe(true);

      const steamGame = result.games.find((g) => g.id === '620');
      expect(steamGame).toBeDefined();
      expect(steamGame?.platform).toBe('steam');
      expect(steamGame?.exePath).toBe('steam://rungameid/620');

      const isoGame = result.games.find((g) => g.platform === 'gamecube');
      expect(isoGame).toBeDefined();
      expect(isoGame?.updateFiles?.some((u) => u.name.includes('patch'))).toBe(true);
    });

    it('scans deep nested Unreal and REDengine executables (bin/x64 and Phoenix/Binaries/Win64)', async () => {
      const pcGamesDir = path.join(tmpDir, 'DeepGames');

      // 1. Unreal structure (Hogwarts Legacy)
      const hlDir = path.join(pcGamesDir, 'Hogwarts Legacy');
      const hlExeDir = path.join(hlDir, 'Phoenix', 'Binaries', 'Win64');
      fs.mkdirSync(hlExeDir, { recursive: true });
      fs.writeFileSync(path.join(hlExeDir, 'HogwartsLegacy.exe'), 'dummy');

      // 2. REDengine structure (Witcher 3)
      const w3Dir = path.join(pcGamesDir, 'The Witcher 3');
      const w3ExeDir = path.join(w3Dir, 'bin', 'x64');
      fs.mkdirSync(w3ExeDir, { recursive: true });
      fs.writeFileSync(path.join(w3ExeDir, 'witcher3.exe'), 'dummy');

      const result = await scanLocalFiles({
        scanDirectories: [pcGamesDir],
        isoDirectories: [],
      });

      expect(result.games.length).toBe(2);
      const titles = result.games.map((g) => g.title);
      expect(titles.some((t) => t.includes('Hogwarts Legacy'))).toBe(true);
      expect(titles.some((t) => t.includes('Witcher 3'))).toBe(true);
    });

    it('scans single game directory directly configured by user (e.g. root is game folder)', async () => {
      const w3Dir = path.join(tmpDir, 'Cyberpunk 2077');
      const w3ExeDir = path.join(w3Dir, 'bin', 'x64');
      fs.mkdirSync(w3ExeDir, { recursive: true });
      fs.writeFileSync(path.join(w3ExeDir, 'Cyberpunk2077.exe'), 'dummy');

      const result = await scanLocalFiles({
        scanDirectories: [w3Dir],
        isoDirectories: [],
      });

      expect(result.games.length).toBe(1);
      expect(result.games[0].title).toBe('Cyberpunk 2077');
      expect(result.games[0].installDir).toBe(w3Dir);
      expect(result.games[0].exePath).toBe(path.join(w3ExeDir, 'Cyberpunk2077.exe'));
    });

    it('treats ROM with [DLC Included] as a base game instead of discarding as DLC', async () => {
      const romsDir = path.join(tmpDir, 'SwitchROMs');
      fs.mkdirSync(romsDir, { recursive: true });
      const marioNsp = path.join(romsDir, 'Super Mario Odyssey [DLC Included].nsp');
      fs.writeFileSync(marioNsp, 'dummy');

      const result = await scanLocalFiles({
        scanDirectories: [romsDir],
        isoDirectories: [],
      });

      expect(result.games.length).toBe(1);
      expect(result.games[0].platform).toBe('switch');
      expect(result.games[0].title).toBe('Super Mario Odyssey');
    });

    it('detects PS3 folder games with PS3_DISC.SFB', async () => {
      const ps3Dir = path.join(tmpDir, 'PS3Games');
      const tlouDir = path.join(ps3Dir, 'The Last of Us [BCUS98174]');
      fs.mkdirSync(path.join(tlouDir, 'PS3_GAME', 'USRDIR'), { recursive: true });
      fs.writeFileSync(path.join(tlouDir, 'PS3_DISC.SFB'), 'dummy');
      fs.writeFileSync(path.join(tlouDir, 'PS3_GAME', 'USRDIR', 'EBOOT.BIN'), 'dummy');

      const result = await scanLocalFiles({
        scanDirectories: [],
        isoDirectories: [ps3Dir],
      });

      expect(result.games.length).toBe(1);
      expect(result.games[0].platform).toBe('ps3');
      expect(result.games[0].title).toBe('The Last of Us');
    });

    it('optimizes PS5 game dump scanning without scanning every interior asset file', async () => {
      const ps5Lib = path.join(tmpDir, 'PS5Games');
      
      // 1. Root PS5 dump: Hollow Knight Silksong [PS5] [PPSA12544]
      const hkDir = path.join(ps5Lib, 'Hollow Knight Silksong [PS5] [PPSA12544]');
      const hkSceSys = path.join(hkDir, 'sce_sys');
      const hkMedia = path.join(hkDir, 'Media', 'assets');
      const hkModules = path.join(hkDir, 'sce_module');
      fs.mkdirSync(hkSceSys, { recursive: true });
      fs.mkdirSync(hkMedia, { recursive: true });
      fs.mkdirSync(hkModules, { recursive: true });

      fs.writeFileSync(path.join(hkDir, 'eboot.bin'), 'bin');
      const hkParamJson = JSON.stringify({
        titleId: 'PPSA12544',
        localizedParameters: {
          defaultLanguage: 'en-GB',
          'en-GB': { titleName: 'Hollow Knight: Silksong' },
        },
      });
      fs.writeFileSync(path.join(hkSceSys, 'param.json'), hkParamJson);
      // Create interior files that should not be scanned individually
      for (let i = 0; i < 20; i++) {
        fs.writeFileSync(path.join(hkMedia, `texture_${i}.dat`), 'data');
        fs.writeFileSync(path.join(hkModules, `module_${i}.prx`), 'prx');
      }

      // 2. Scene release containing nested app0: Rayman.30th.Anniversary.Edition.PS5-DUPLEX
      const raymanDir = path.join(ps5Lib, 'Rayman.30th.Anniversary.Edition.PS5-DUPLEX');
      const raymanApp0 = path.join(raymanDir, 'PPSA33016-app0');
      const raymanSceSys = path.join(raymanApp0, 'sce_sys');
      const raymanAssets = path.join(raymanApp0, 'assets');
      fs.mkdirSync(raymanSceSys, { recursive: true });
      fs.mkdirSync(raymanAssets, { recursive: true });

      fs.writeFileSync(path.join(raymanDir, 'duplex.nfo'), 'nfo');
      fs.writeFileSync(path.join(raymanApp0, 'eboot.bin'), 'bin');
      const raymanParamJson = JSON.stringify({
        titleId: 'PPSA33016',
        localizedParameters: {
          defaultLanguage: 'en-US',
          'en-US': { titleName: 'Rayman 30th Anniversary Edition' },
        },
      });
      fs.writeFileSync(path.join(raymanSceSys, 'param.json'), raymanParamJson);
      for (let i = 0; i < 20; i++) {
        fs.writeFileSync(path.join(raymanAssets, `sound_${i}.pak`), 'pak');
      }

      const result = await scanLocalFiles({
        scanDirectories: [ps5Lib],
        isoDirectories: [ps5Lib],
      });

      expect(result.games.length).toBe(2);

      const hkGame = result.games.find((g) => g.title === 'Hollow Knight: Silksong');
      expect(hkGame).toBeDefined();
      expect(hkGame?.platform).toBe('ps5');
      expect(hkGame?.exePath).toBe(path.join(hkDir, 'eboot.bin'));

      const raymanGame = result.games.find((g) => g.title === 'Rayman 30th Anniversary Edition');
      expect(raymanGame).toBeDefined();
      expect(raymanGame?.platform).toBe('ps5');
      expect(raymanGame?.exePath).toBe(path.join(raymanApp0, 'eboot.bin'));
    });
  });
});
