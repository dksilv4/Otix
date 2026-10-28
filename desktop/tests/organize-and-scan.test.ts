import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

const mockGames = new Map<string, any>();

vi.mock('../db', () => ({
  getDb: () => ({
    prepare: (sql: string) => {
      if (sql.includes('SELECT id, exe_path, install_dir FROM scanned_games') || sql.includes('SELECT * FROM scanned_games')) {
        return {
          all: () => Array.from(mockGames.values()),
        };
      }
      if (sql.includes('UPDATE scanned_games')) {
        return {
          run: (...args: any[]) => {
            if (sql.includes('WHERE id = ?')) {
              const [exe, install, id] = args;
              const g = mockGames.get(id);
              if (g) {
                g.exe_path = exe;
                g.install_dir = install;
              }
            } else if (sql.includes('WHERE LOWER(REPLACE(exe_path')) {
              const [exe, install, normOld] = args;
              for (const g of mockGames.values()) {
                if ((g.exe_path || '').replace(/\\/g, '/').toLowerCase() === normOld) {
                  g.exe_path = exe;
                  g.install_dir = install;
                }
              }
            }
          },
        };
      }
      return {
        run: () => {},
        all: () => [],
        get: () => null,
      };
    },
  }),
}));

import { findDownloadedContent, smartOrganizePreview, applyNamingTemplate } from '../downloads/organizer';
import { executeOrganization } from '../installer';
import { updateGamePathInDb } from '../downloads';

describe('Production Game Organization & Scanning', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'otix-org-test-'));
    mockGames.clear();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('safely ignores README.md and documentation without classifying as Genesis ROMs', async () => {
    const gameDir = path.join(tempDir, 'Cyberpunk 2077');
    await fs.mkdir(gameDir, { recursive: true });
    await fs.writeFile(path.join(gameDir, 'Cyberpunk2077.exe'), 'dummy exe');
    await fs.writeFile(path.join(gameDir, 'README.md'), '# Cyberpunk 2077 Notes');
    await fs.writeFile(path.join(gameDir, 'INSTALL.md'), '# Installation guide');

    const content = await findDownloadedContent(tempDir, 3);
    const romItems = content.filter((c) => c.type === 'rom');
    expect(romItems.length).toBe(0);

    const pcItems = content.filter((c) => c.type === 'pc_game');
    expect(pcItems.length).toBe(1);
    expect(pcItems[0].name).toBe('Cyberpunk 2077');
  });

  it('correctly discovers legitimate Genesis ROMs with .gen and .md', async () => {
    const romsDir = path.join(tempDir, 'Genesis ROMs');
    await fs.mkdir(romsDir, { recursive: true });
    await fs.writeFile(path.join(romsDir, 'Sonic The Hedgehog (USA).md'), 'genesis rom data');
    await fs.writeFile(path.join(romsDir, 'Streets of Rage 2.gen'), 'genesis rom data');

    const content = await findDownloadedContent(romsDir, 2);
    const romItems = content.filter((c) => c.type === 'rom');
    expect(romItems.length).toBe(2);
    expect(romItems.map((r) => r.name)).toContain('Sonic The Hedgehog (USA).md');
    expect(romItems.map((r) => r.name)).toContain('Streets of Rage 2.gen');
  });

  it('rebases scanned_games paths in SQLite when an entire game folder is reorganized', async () => {
    const oldDir = 'D:/Downloads/Hollow Knight';
    const oldExe = 'D:/Downloads/Hollow Knight/hollow_knight.exe';
    const newDir = 'D:/Games/Hollow Knight (2017) [PC]/Hollow Knight';
    const expectedNewExe = 'D:/Games/Hollow Knight (2017) [PC]/Hollow Knight/hollow_knight.exe';

    mockGames.set('test_hk', {
      id: 'test_hk',
      title: 'Hollow Knight',
      exe_path: oldExe,
      install_dir: oldDir,
      platform: 'pc',
    });

    await updateGamePathInDb(oldDir, newDir);

    const row = mockGames.get('test_hk');
    expect(row).toBeDefined();
    expect(row.install_dir.replace(/\\/g, '/')).toBe(newDir);
    expect(row.exe_path.replace(/\\/g, '/')).toBe(expectedNewExe);
  });

  it('correctly discovers single and multi-part archives and auxiliary archives', async () => {
    const downloadsDir = path.join(tempDir, 'Downloads');
    await fs.mkdir(downloadsDir, { recursive: true });

    await fs.writeFile(path.join(downloadsDir, 'Elden.Ring.part01.rar'), 'part 1');
    await fs.writeFile(path.join(downloadsDir, 'Elden.Ring.part02.rar'), 'part 2');
    await fs.writeFile(path.join(downloadsDir, 'Elden.Ring.part03.rar'), 'part 3');
    await fs.writeFile(path.join(downloadsDir, 'Elden.Ring.Update.v1.10.zip'), 'update zip');
    await fs.writeFile(path.join(downloadsDir, 'Elden.Ring.DLC.Pack.7z'), 'dlc 7z');
    await fs.writeFile(path.join(downloadsDir, 'Single.Game.Release.zip'), 'single zip');

    const content = await findDownloadedContent(downloadsDir, 2);
    expect(content.length).toBe(6);

    const part1 = content.find((c) => c.name === 'Elden.Ring.part01.rar');
    expect(part1?.type).toBe('iso');

    const part2 = content.find((c) => c.name === 'Elden.Ring.part02.rar');
    expect(part2?.type).toBe('archive_part');

    const part3 = content.find((c) => c.name === 'Elden.Ring.part03.rar');
    expect(part3?.type).toBe('archive_part');

    const update = content.find((c) => c.name === 'Elden.Ring.Update.v1.10.zip');
    expect(update?.type).toBe('update');

    const dlc = content.find((c) => c.name === 'Elden.Ring.DLC.Pack.7z');
    expect(dlc?.type).toBe('dlc');

    const single = content.find((c) => c.name === 'Single.Game.Release.zip');
    expect(single?.type).toBe('iso');
  });

  it('discovers PS3 and PS4 console disc packages and preserves folder packages', async () => {
    const ps3Dir = path.join(tempDir, 'God of War Collection [BCUS98229]');
    await fs.mkdir(path.join(ps3Dir, 'PS3_GAME'), { recursive: true });
    await fs.writeFile(path.join(ps3Dir, 'PS3_DISC.SFB'), 'sfb');
    await fs.writeFile(path.join(ps3Dir, 'PS3_GAME', 'PARAM.SFO'), 'sfo');

    const ps4Dir = path.join(tempDir, 'Bloodborne [CUSA03173]');
    await fs.mkdir(path.join(ps4Dir, 'sce_sys'), { recursive: true });
    await fs.writeFile(path.join(ps4Dir, 'sce_sys', 'param.sfo'), 'sfo');

    const content = await findDownloadedContent(tempDir, 2);
    const ps3 = content.find((c) => c.name.includes('God of War Collection'));
    expect(ps3).toBeDefined();
    expect(ps3?.type).toBe('pc_game');
    expect(ps3?.platform).toBe('PS3');

    const ps4 = content.find((c) => c.name.includes('Bloodborne'));
    expect(ps4).toBeDefined();
    expect(ps4?.type).toBe('pc_game');
    expect(ps4?.platform).toBe('PS4');

    const ps5Dir = path.join(tempDir, 'Dead.Cells.PS5-DUPLEX');
    await fs.mkdir(path.join(ps5Dir, 'PPSA15552-app0'), { recursive: true });
    await fs.writeFile(path.join(ps5Dir, 'duplex.nfo'), 'nfo');

    const contentWithPs5 = await findDownloadedContent(tempDir, 2);
    const ps5 = contentWithPs5.find((c) => c.name.includes('Dead.Cells.PS5'));
    expect(ps5).toBeDefined();
    expect(ps5?.type).toBe('pc_game');
    expect(ps5?.platform).toBe('PS5');
  });

  it('generates coherent preview with multi-part archives and console packages', async () => {
    const libraryDir = path.join(tempDir, 'Library');
    const downloadsDir = path.join(tempDir, 'Downloads');
    await fs.mkdir(downloadsDir, { recursive: true });

    await fs.writeFile(path.join(downloadsDir, 'Cyberpunk.2077.part01.rar'), 'part 1');
    await fs.writeFile(path.join(downloadsDir, 'Cyberpunk.2077.part02.rar'), 'part 2');

    const preview = await smartOrganizePreview(downloadsDir, '{Title} ({Year}) [{Platform}]/{Title} ({Year}) [{Platform}]');
    expect(preview.length).toBe(2);

    const p1 = preview.find((p) => p.sourceFilename === 'Cyberpunk.2077.part01.rar');
    expect(p1?.status).toBe('rename_and_move');
    expect(p1?.targetPath.replace(/\\/g, '/')).toContain('Cyberpunk 2077 [PC]');

    const p2 = preview.find((p) => p.sourceFilename === 'Cyberpunk.2077.part02.rar');
    expect(p2?.status).toBe('secondary_archive_part');
    expect(p2?.targetPath.replace(/\\/g, '/')).toContain('Cyberpunk 2077 [PC]/Cyberpunk.2077.part02.rar');
  });

  it('cleans update filenames with sequence prefixes in smartOrganizePreview', async () => {
    const downloadsDir = path.join(tempDir, 'UpdatesTesting');
    await fs.mkdir(downloadsDir, { recursive: true });

    await fs.writeFile(path.join(downloadsDir, '1 - High On Life 2 update 20.02.2026.exe'), 'update binary');

    const preview = await smartOrganizePreview(downloadsDir, '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}');
    expect(preview.length).toBe(1);
    expect(preview[0].status).toBe('secondary_update');
    expect(preview[0].targetPath.replace(/\\/g, '/')).toBe(
      path.join(downloadsDir, 'High On Life 2 [PC]/Updates/1 - High On Life 2 update 20.02.2026.exe').replace(/\\/g, '/')
    );
  });

  it('shows all files and folders in folder test run preview', async () => {
    const testDir = path.join(tempDir, 'AllFilesFolderTest');
    await fs.mkdir(testDir, { recursive: true });

    // 1. Game folder with internal subdirectory
    const gameSubDir = path.join(testDir, 'Hades');
    await fs.mkdir(path.join(gameSubDir, 'Data'), { recursive: true });
    await fs.writeFile(path.join(gameSubDir, 'Hades.exe'), 'exe');

    // 2. Real ISO file at root (no source subdirectory)
    await fs.writeFile(path.join(testDir, 'Elden.Ring.2022.iso'), 'iso');

    // 3. Media / auxiliary file in nested source subdirectory
    const extrasDir = path.join(testDir, 'Extras', 'Audio');
    await fs.mkdir(extrasDir, { recursive: true });
    await fs.writeFile(path.join(extrasDir, 'Soundtrack.mp3'), 'audio');

    // 4. Update file in subfolder
    const updatesDir = path.join(testDir, 'Patches');
    await fs.mkdir(updatesDir, { recursive: true });
    await fs.writeFile(path.join(updatesDir, 'Elden.Ring.Patch.1.12.exe'), 'patch');

    const preview = await smartOrganizePreview(testDir, '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}');
    expect(preview.length).toBe(4);

    const names = preview.map((p) => p.sourceFilename);
    expect(names).toContain('Hades');
    expect(names).toContain('Elden.Ring.2022.iso');
    expect(names).toContain('Soundtrack.mp3');
    expect(names).toContain('Elden.Ring.Patch.1.12.exe');

    // Verify before and after target paths
    const isoItem = preview.find((p) => p.sourceFilename === 'Elden.Ring.2022.iso');
    expect(isoItem?.sourcePath).toBe(path.join(testDir, 'Elden.Ring.2022.iso'));
    expect(isoItem?.targetPath.replace(/\\/g, '/')).toContain('Elden Ring 2022 [PC]/Elden.Ring.2022.iso');
    // Root file should not have a source subdirectory
    expect(isoItem?.sourceSubdirectory).toBeUndefined();

    const folderItem = preview.find((p) => p.sourceFilename === 'Hades');
    expect(folderItem?.status).toBe('container_package');
    expect(folderItem?.subdirectories).toContain('Data');

    const audioItem = preview.find((p) => p.sourceFilename === 'Soundtrack.mp3');
    expect(audioItem?.sourceSubdirectory).toBe('Extras/Audio');

    const patchItem = preview.find((p) => p.sourceFilename === 'Elden.Ring.Patch.1.12.exe');
    expect(patchItem?.sourceSubdirectory).toBe('Patches');
    expect(patchItem?.targetSubdirectory).toContain('Updates');
  });

  it('correctly identifies PC game repack and avoids PS3 misidentification', async () => {
    const testDir = path.join(tempDir, 'RepackPcTest');
    await fs.mkdir(testDir, { recursive: true });

    const gameDir = path.join(testDir, 'Grand Theft Auto V');
    await fs.mkdir(gameDir, { recursive: true });
    await fs.writeFile(path.join(gameDir, 'setup.exe'), 'installer');
    await fs.writeFile(path.join(gameDir, 'setup-1.bin'), 'data');
    await fs.writeFile(
      path.join(gameDir, '.otix'),
      JSON.stringify({
        title: 'Grand Theft Auto V',
        year: 2013,
        platforms: [
          { id: 9, name: 'PlayStation 3', slug: 'playstation-3' },
          { id: 12, name: 'Xbox 360', slug: 'xbox-360' },
          { id: 6, name: 'PC (Microsoft Windows)', slug: 'windows' },
        ],
      })
    );

    const preview = await smartOrganizePreview(testDir, '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}');
    const item = preview.find((p) => p.sourceFilename === 'Grand Theft Auto V');
    expect(item).toBeDefined();
    expect(item?.targetPath.replace(/\\/g, '/')).toContain('[PC]');
    expect(item?.targetPath.replace(/\\/g, '/')).not.toContain('[PS3]');
  });

  it('does not recurse into internal binary subfolders of an identified game package', async () => {
    const testDir = path.join(tempDir, 'InternalBinariesTest');
    await fs.mkdir(testDir, { recursive: true });

    const gameDir = path.join(testDir, 'CyberGame');
    const binDir = path.join(gameDir, 'bin', 'x64');
    await fs.mkdir(binDir, { recursive: true });
    await fs.writeFile(path.join(gameDir, 'CyberGame.exe'), 'exe');
    await fs.writeFile(path.join(binDir, 'CyberGame-shipping.exe'), 'exe');

    const content = await findDownloadedContent(testDir, 5);
    // Should discover the game package 'CyberGame', but NOT 'CyberGame/bin/x64' as a separate game
    const paths = content.map((c) => path.resolve(c.path));
    expect(paths).toContain(path.resolve(gameDir));
    expect(paths).not.toContain(path.resolve(binDir));
    expect(content.filter((c) => c.type === 'pc_game').length).toBe(1);
  });

  it('parent folder containing multiple games does not swallow sibling games', async () => {
    const testDir = path.join(tempDir, 'MultipleGamesCollection');
    await fs.mkdir(testDir, { recursive: true });

    // Game 1 with sidecar
    const game1Dir = path.join(testDir, 'Game One');
    await fs.mkdir(game1Dir, { recursive: true });
    await fs.writeFile(path.join(game1Dir, 'game1.exe'), 'exe');
    await fs.writeFile(
      path.join(game1Dir, '.otix'),
      JSON.stringify({
        title: 'Game One',
        platforms: [{ name: 'PC (Microsoft Windows)', slug: 'windows' }],
      })
    );

    // Game 2 repack
    const game2Dir = path.join(testDir, 'Game Two');
    await fs.mkdir(game2Dir, { recursive: true });
    await fs.writeFile(path.join(game2Dir, 'setup.exe'), 'installer');
    await fs.writeFile(path.join(game2Dir, 'setup-1.bin'), 'bin');

    const preview = await smartOrganizePreview(testDir, '{Title} [{Platform}]');
    // testDir itself must NOT be in preview (which would move the whole collection into Game One [PC])
    expect(preview.some((p) => path.resolve(p.sourcePath) === path.resolve(testDir))).toBe(false);

    // Both Game One and Game Two must be recognized as distinct items
    const item1 = preview.find((p) => path.resolve(p.sourcePath) === path.resolve(game1Dir));
    const item2 = preview.find((p) => path.resolve(p.sourcePath) === path.resolve(game2Dir));
    expect(item1).toBeDefined();
    expect(item2).toBeDefined();
    expect(item1?.targetPath.replace(/\\/g, '/')).toContain('Game One [PC]');
    expect(item2?.targetPath.replace(/\\/g, '/')).toContain('Game Two [PC]');
  });

  it('applyNamingTemplate sanitizes slashes in titles to prevent nesting games inside folders', () => {
    const release = {
      title: 'Fate/stay night',
      cleanTitle: 'Fate/stay night',
      platform: 'PC',
      rawName: 'Fate/stay night',
      isScene: false,
    };
    const fileInfo = { name: 'Fate/stay night', ext: '', type: 'pc_game' as const };
    const target = applyNamingTemplate(release, '{Title} [{Platform}]', fileInfo, '/games');
    const normTarget = target.replace(/\\/g, '/');
    expect(normTarget).toBe('/games/Fate - stay night [PC]');
    expect(normTarget).not.toContain('/games/Fate/stay night');
  });

  it('executeOrganization fails when destination already exists and is not empty', async () => {
    const testDir = path.join(tempDir, 'ExecCollisionTest');
    await fs.mkdir(testDir, { recursive: true });

    const srcDir = path.join(testDir, 'Game B');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'fileB.txt'), 'b');

    const dstDir = path.join(testDir, 'Game A');
    await fs.mkdir(dstDir, { recursive: true });
    await fs.writeFile(path.join(dstDir, 'fileA.txt'), 'a');

    const results = await executeOrganization([{ sourcePath: srcDir, targetPath: dstDir }]);
    expect(results.length).toBe(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('already exists and is not empty');

    // fileB must NOT have been moved into Game A
    const dstFiles = await fs.readdir(dstDir);
    expect(dstFiles).toContain('fileA.txt');
    expect(dstFiles).not.toContain('fileB.txt');
  });

  it('discovers game with executable in nested bin/x64 at top level as single pc_game package', async () => {
    const testDir = path.join(tempDir, 'NestedExeTopLevelTest');
    const gameDir = path.join(testDir, 'Cyberpunk 2077');
    const binDir = path.join(gameDir, 'bin', 'x64');
    await fs.mkdir(binDir, { recursive: true });
    await fs.writeFile(path.join(binDir, 'Cyberpunk2077.exe'), 'exe');

    const preview = await smartOrganizePreview(testDir, '{Platform}/{Title}');
    expect(preview.length).toBe(1);
    expect(preview[0].type).toBe('container_package');
    expect(preview[0].extracted?.Title).toBe('Cyberpunk 2077');
    const normTarget = preview[0].targetPath.replace(/\\/g, '/');
    const normExpected = path.join(testDir, 'PC', 'Cyberpunk 2077').replace(/\\/g, '/');
    expect(normTarget).toBe(normExpected);
  });

  it('unwraps single-child redundant wrapper folder and follows folder structure', async () => {
    const testDir = path.join(tempDir, 'WrapperUnwrapTest');
    const wrapperDir = path.join(testDir, 'Cyberpunk.2077.v2.12.REPACK-ELAMIGOS');
    const innerDir = path.join(wrapperDir, 'Cyberpunk 2077');
    const binDir = path.join(innerDir, 'bin', 'x64');
    await fs.mkdir(binDir, { recursive: true });
    await fs.writeFile(path.join(binDir, 'Cyberpunk2077.exe'), 'exe');
    await fs.writeFile(path.join(wrapperDir, 'release.nfo'), 'nfo');

    const preview = await smartOrganizePreview(testDir, '{Platform}/{Title}');
    expect(preview.length).toBe(1);
    expect(preview[0].type).toBe('container_package');
    expect(preview[0].extracted?.Title).toBe('Cyberpunk 2077');
    const normSource = preview[0].sourcePath.replace(/\\/g, '/');
    const normInner = innerDir.replace(/\\/g, '/');
    expect(normSource).toBe(normInner);
    const normTarget = preview[0].targetPath.replace(/\\/g, '/');
    const normExpected = path.join(testDir, 'PC', 'Cyberpunk 2077').replace(/\\/g, '/');
    expect(normTarget).toBe(normExpected);
  });

  it('routes updates into configured folder structure', async () => {
    const testDir = path.join(tempDir, 'UpdatesFolderStructureTest');
    const parentDir = path.join(testDir, 'Elden Ring');
    const updatesDir = path.join(parentDir, 'Updates');
    await fs.mkdir(updatesDir, { recursive: true });
    await fs.writeFile(path.join(updatesDir, 'elden_ring_update_1.13.exe'), 'exe');

    const preview = await smartOrganizePreview(testDir, '{Platform}/{Title}');
    expect(preview.length).toBe(1);
    expect(preview[0].type).toBe('update');
    const normTarget = preview[0].targetPath.replace(/\\/g, '/');
    const normExpected = path.join(testDir, 'PC', 'Elden Ring', 'Updates', 'elden_ring_update_1.13.exe').replace(/\\/g, '/');
    expect(normTarget).toBe(normExpected);
  });

  it('scans deeply nested directories recursively without swallowing collection folders', async () => {
    const testDir = path.join(tempDir, 'DeepRecursiveCollectionTest');

    // 1. Nested collection: Downloads/Torrents/PC/Unsorted
    const unsortedDir = path.join(testDir, 'Downloads', 'Torrents', 'PC', 'Unsorted');
    const balatroDir = path.join(unsortedDir, 'Balatro');
    await fs.mkdir(balatroDir, { recursive: true });
    await fs.writeFile(path.join(balatroDir, 'Balatro.exe'), 'exe');
    await fs.writeFile(path.join(balatroDir, 'steam_api64.dll'), 'dll');
    await fs.writeFile(path.join(balatroDir, 'steam_emu.ini'), 'ini');

    // 2. Deep Steam game: Steam/steamapps/common/Cyberpunk 2077/bin/x64/Cyberpunk2077.exe
    const cyberpunkDir = path.join(testDir, 'Steam', 'steamapps', 'common', 'Cyberpunk 2077');
    const cyberpunkBin = path.join(cyberpunkDir, 'bin', 'x64');
    await fs.mkdir(cyberpunkBin, { recursive: true });
    await fs.writeFile(path.join(cyberpunkBin, 'Cyberpunk2077.exe'), 'exe');
    await fs.writeFile(path.join(cyberpunkBin, 'steam_api64.dll'), 'dll');

    // 3. Collection folder: Downloads/Updates & Cracks
    const updatesDir = path.join(testDir, 'Downloads', 'Updates & Cracks');
    await fs.mkdir(updatesDir, { recursive: true });
    await fs.writeFile(path.join(updatesDir, 'Cyberpunk 2077 update 2.12 - 2.13.exe'), 'update');
    await fs.writeFile(path.join(updatesDir, 'Elden Ring update 1.12.3 - 1.13.0.exe'), 'update');

    const preview = await smartOrganizePreview(testDir, '{Title} [{Platform}]/{OriginalName}.{ext}');

    // Ensure collection directories are never treated as packages
    const badCollections = ['Downloads', 'Torrents', 'PC', 'Unsorted', 'Steam', 'steamapps', 'common', 'Updates & Cracks'];
    for (const p of preview) {
      for (const bad of badCollections) {
        if (p.sourceFilename.toLowerCase() === bad.toLowerCase() && p.type === 'container_package') {
          throw new Error(`Collection folder '${bad}' was swallowed as a package`);
        }
      }
    }

    // Balatro at depth 5 must be discovered as a container package
    const balatroItem = preview.find((p) => p.sourceFilename === 'Balatro');
    expect(balatroItem).toBeDefined();
    expect(balatroItem?.type).toBe('container_package');

    // Cyberpunk 2077 at depth 6 must be discovered as a container package
    const cyberpunkItem = preview.find((p) => p.sourceFilename === 'Cyberpunk 2077');
    expect(cyberpunkItem).toBeDefined();
    expect(cyberpunkItem?.type).toBe('container_package');

    // Updates inside Updates & Cracks must be discovered as updates
    const cpUpdate = preview.find((p) => p.sourceFilename.includes('Cyberpunk 2077 update'));
    const erUpdate = preview.find((p) => p.sourceFilename.includes('Elden Ring update'));
    expect(cpUpdate).toBeDefined();
    expect(cpUpdate?.type).toBe('update');
    expect(erUpdate).toBeDefined();
    expect(erUpdate?.type).toBe('update');
  });

  it('scans real test_games_library recursively without swallowing collection folders', async () => {
    const libPath = path.resolve(__dirname, '../../test_games_library');
    try {
      await fs.stat(libPath);
    } catch {
      return;
    }

    const preview = await smartOrganizePreview(libPath, '{Title} [{Platform}]/{OriginalName}.{ext}');
    expect(preview.length).toBeGreaterThan(50);

    const badCollections = ['Downloads', 'Torrents', 'Games', 'Unsorted', 'Steam', 'steamapps', 'common', 'ROMs', 'GOG Installers'];
    for (const p of preview) {
      for (const bad of badCollections) {
        if (p.sourceFilename.toLowerCase() === bad.toLowerCase() && p.type === 'container_package') {
          throw new Error(`Collection folder '${bad}' was swallowed as a package`);
        }
      }
    }
  }, 30000);
});
