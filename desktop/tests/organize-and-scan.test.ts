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

import { findDownloadedContent } from '../downloads/organizer';
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
});
