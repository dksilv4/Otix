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

import { findDownloadedContent, smartOrganizePreview } from '../downloads/organizer';
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
});
