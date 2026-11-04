// desktop/game/local-scanner.ts
// Native local files scanner for PC games, Steam libraries, ISOs, and ROMs.

import * as fs from 'fs';
import * as path from 'path';
import { cleanGameTitle } from './parser';

export interface ScannedLocalGame {
  id: string;
  title: string;
  exePath: string;
  installDir: string;
  platform: string;
  localExePath?: string;
  updateFiles?: Array<{ name: string; path: string }>;
  isDlc?: boolean;
}

export interface LocalScanOptions {
  scanDirectories: string[];
  isoDirectories: string[];
  onProgress?: (dir: string, progress: number) => void;
}

export interface LocalScanResult {
  games: ScannedLocalGame[];
}

export function parseAcf(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const matches = content.matchAll(/"([^"]+)"\s+"([^"]+)"/g);
  for (const match of matches) {
    result[match[1]] = match[2];
  }
  return result;
}

export function generateLocalGameId(str: string, prefix = 'pc'): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `${prefix}_${Math.abs(hash).toString(36)}`;
}

const DOC_BASENAMES = new Set([
  'readme', 'changelog', 'install', 'installation', 'license', 'licence',
  'instructions', 'notes', 'faq', 'manual', 'help', 'history', 'todo',
  'credits', 'authors', 'version', 'info', 'guide',
]);

function isDocFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  const ext = path.extname(lower);
  if (ext === '.md' || ext === '.txt' || ext === '.nfo' || ext === '.pdf') {
    const base = path.basename(lower, ext);
    if (DOC_BASENAMES.has(base) || base.startsWith('readme') || base.startsWith('install')) {
      return true;
    }
  }
  return false;
}

export const IGNORED_DIRS = new Set([
  'node_modules', 'bower_components', '.git', '.github', '.svn', '.hg',
  'system32', 'syswow64', 'windows', 'microsoft.net', 'appdata',
  'obj', '__pycache__', '.venv', 'venv', 'env', 'windowsapps',
  '_commonredist', 'commonredist', 'redist', '_redist', 'directx',
  'vcredist', 'prerequisites', 'mono',
  'sce_module', 'sce_pfs', 'fakelib', '_duplex_',
]);

export const NOISE_EXE_NAMES = [
  'crash', 'unins', 'setup', 'redist', 'config', 'tool', 'cef',
  'helper', 'register', 'patch', 'dxsetup', 'vcredist', 'dotnet',
  'easyanticheat', 'battleye', 'epic_online_services', 'benchmark',
  'bugreport', 'restarter', 'dowser', 'quicksfv', 'autorun',
];

export const GENERIC_FOLDER_NAMES = new Set([
  'bin', 'bin32', 'bin64', 'x64', 'x86', 'x86_64',
  'win64', 'win32', 'binaries', 'binary',
  'engine', 'system', 'system32', 'shipping', 'retail',
  'release', 'debug', 'build', 'client', 'server',
  'content', 'assets', 'resources', 'res', 'data', 'game', 'games',
  'update', 'updates', 'patch', 'patches', 'dlc', 'support',
  'redist', 'commonredist', '_commonredist', 'directx', 'vcredist',
  'prerequisites', 'prereq', 'mono', 'dotnet', 'mods',
]);

export const KNOWN_ENGINE_PROJECTS = new Set([
  'phoenix', 'end', 'b1', 'oakgame', 'willowgame',
  'polaris', 'athena', 'pal', 'factorygame',
  'bendgame', 'biogame', 'xgame', 'mk12',
  'stalker2', 'deadbydaylight', 'atomicheart', 'readyornot',
]);

export const CATEGORY_CONTAINER_NAMES = new Set([
  'pc', 'ps1', 'ps2', 'ps3', 'ps4', 'ps5', 'switch', 'xbox', 'xbox360',
  'wii', 'wiiu', 'gamecube', 'nds', '3ds', 'n64', 'snes', 'nes', 'gba',
  'gbc', 'gb', 'genesis', 'psp', 'psvita', 'games', 'roms', 'isos', 'todo',
  'repacks', 'fitgirl', 'dodi', 'elamigos', 'gog', 'steam',
]);

export async function pickBestExe(exes: string[], installDirName: string): Promise<string | null> {
  if (exes.length === 0) return null;
  if (exes.length === 1) return exes[0];

  const cleanInstallDir = installDirName.toLowerCase().replace(/[^a-z0-9]/g, '');
  let bestExe: string | null = null;
  let bestScore = -1;

  for (const exe of exes) {
    const exeName = path.basename(exe, '.exe').toLowerCase();
    if (NOISE_EXE_NAMES.some((s) => exeName.includes(s))) continue;

    let score = 0;
    if (exeName.includes('shipping')) score += 80;
    if (exeName.includes('game') || exeName.includes('client')) score += 20;

    const fnLower = installDirName.toLowerCase();
    const folderIdx = exe.toLowerCase().indexOf(fnLower);
    if (folderIdx >= 0 && (exe.toLowerCase().substring(folderIdx + fnLower.length).match(/[\\/]/g) || []).length > 1) {
      score += 30;
    }

    if (exeName === cleanInstallDir || exeName === installDirName.toLowerCase()) {
      score += 100;
    } else if (exeName.includes(cleanInstallDir) || cleanInstallDir.includes(exeName)) {
      score += 50;
    }

    try {
      const s = await fs.promises.stat(exe);
      score += Math.min(30, Math.floor((s.size || 0) / (1024 * 1024)));
    } catch {
      // Ignore stat error
    }

    if (score > bestScore) {
      bestScore = score;
      bestExe = exe;
    }
  }

  return bestExe || exes[0];
}

export async function scanExecutables(dir: string, maxDepth: number = 5): Promise<string[]> {
  const exes: string[] = [];
  async function traverse(currentDir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    try {
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      // If directory is a PS5 dump, skip scanning for PC .exe files
      if (entries.some((e) => e.name.toLowerCase() === 'eboot.bin' || e.name.toLowerCase() === 'sce_sys')) {
        return;
      }
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          const nl = entry.name.toLowerCase();
          if (nl.startsWith('$') || IGNORED_DIRS.has(nl) || nl.startsWith('app0') || /^[a-z]{4}\d{5}-app\d+$/i.test(nl)) continue;
          await traverse(fullPath, depth + 1);
        } else if (entry.isFile() || entry.isSymbolicLink()) {
          if (entry.name.toLowerCase().endsWith('.exe')) {
            exes.push(fullPath);
          }
        }
      }
    } catch {
      // Ignore permission or read errors
    }
  }
  await traverse(dir, 1);
  return exes;
}

export const ROM_EXTENSIONS = new Set([
  '.nsp', '.xci', '.nsz', '.xcz', '.3ds', '.cia', '.cxi', '.nds',
  '.z64', '.n64', '.v64', '.rvz', '.wbfs', '.gcz', '.gcm', '.chd',
  '.pbp', '.cso', '.wua', '.wud', '.wux', '.rpx', '.cue', '.m3u',
  '.vpk', '.sfc', '.smc', '.nes', '.gba', '.gbc', '.gb', '.md',
  '.gen', '.pkg', '.iso', '.img', '.sfb', '.xex', '.nkit',
]);

export function detectPlatformFromTags(text: string): string | null {
  if (!text) return null;
  const upper = text.toUpperCase();
  if (upper.includes('[PS5]') || upper.includes('(PS5)')) return 'ps5';
  if (upper.includes('[PS4]') || upper.includes('(PS4)')) return 'ps4';
  if (upper.includes('[PS3]') || upper.includes('(PS3)')) return 'ps3';
  if (upper.includes('[PS2]') || upper.includes('(PS2)')) return 'ps2';
  if (upper.includes('[PS1]') || upper.includes('(PS1)') || upper.includes('[PSX]') || upper.includes('(PSX)')) return 'ps1';
  if (upper.includes('[PSP]') || upper.includes('(PSP)')) return 'psp';
  if (upper.includes('[PSVITA]') || upper.includes('(PSVITA)') || upper.includes('[VITA]') || upper.includes('(VITA)')) return 'psvita';
  if (upper.includes('[DREAMCAST]') || upper.includes('(DREAMCAST)') || upper.includes('[DC]') || upper.includes('(DC)')) return 'dreamcast';
  if (upper.includes('[SATURN]') || upper.includes('(SATURN)') || upper.includes('[SS]') || upper.includes('(SS)')) return 'saturn';
  if (upper.includes('[GAMECUBE]') || upper.includes('(GAMECUBE)') || upper.includes('[GC]') || upper.includes('(GC)')) return 'gamecube';
  if (upper.includes('[WII]') || upper.includes('(WII)')) return 'wii';
  if (upper.includes('[WIIU]') || upper.includes('(WIIU)') || upper.includes('[WII U]') || upper.includes('(WII U)')) return 'wiiu';
  if (upper.includes('[XBOX360]') || upper.includes('(XBOX360)') || upper.includes('[X360]') || upper.includes('(X360)')) return 'xbox360';
  if (upper.includes('[XBOX]') || upper.includes('(XBOX)')) return 'xbox';
  if (upper.includes('[ARCADE]') || upper.includes('(ARCADE)') || upper.includes('[MAME]') || upper.includes('(MAME)')) return 'arcade';
  return null;
}

export const ROM_PLATFORMS: Record<string, string> = {
  '.nsp': 'switch', '.xci': 'switch', '.nsz': 'switch', '.xcz': 'switch',
  '.3ds': '3ds', '.cia': '3ds', '.cxi': '3ds', '.nds': 'nds',
  '.z64': 'n64', '.n64': 'n64', '.v64': 'n64', '.rvz': 'wii',
  '.wbfs': 'wii', '.wua': 'wiiu', '.wud': 'wiiu', '.wux': 'wiiu', '.rpx': 'wiiu',
  '.gcz': 'gamecube', '.gcm': 'gamecube',
  '.cso': 'psp', '.pbp': 'psp',
  '.vpk': 'psvita', '.sfc': 'snes', '.smc': 'snes', '.nes': 'nes',
  '.gba': 'gba', '.gbc': 'gbc', '.gb': 'gb', '.md': 'genesis',
  '.gen': 'genesis', '.sfb': 'ps3', '.xex': 'xbox360',
};

export async function scanImagesAndRoms(dir: string, maxDepth: number = 5): Promise<Array<{ path: string; ext: string; platform: string }>> {
  const found: Array<{ path: string; ext: string; platform: string }> = [];
  async function traverse(currentDir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    try {
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

      // 1. Direct PS5 dump check: if currentDir contains eboot.bin, index it and skip walking interior files
      const directEboot = entries.find((e) => (e.isFile() || e.isSymbolicLink()) && e.name.toLowerCase() === 'eboot.bin');
      if (directEboot) {
        const fullPath = path.join(currentDir, directEboot.name);
        const tagged = detectPlatformFromTags(directEboot.name) || detectPlatformFromTags(path.basename(currentDir)) || detectPlatformFromTags(path.basename(path.dirname(currentDir)));
        const pl = fullPath.toLowerCase();
        const plat = tagged || (pl.includes('ps5') ? 'ps5' : pl.includes('ps4') ? 'ps4' : pl.includes('ps3') ? 'ps3' : 'ps5');
        found.push({ path: fullPath, ext: '.bin', platform: plat });
        return;
      }

      // 2. Nested app0 PS5 dump check: if currentDir has an app0 child containing eboot.bin, index it and skip walking interior files
      const app0Child = entries.find((e) => e.isDirectory() && (e.name.toLowerCase().startsWith('app0') || /^[a-z]{4}\d{5}-app\d+$/i.test(e.name)));
      if (app0Child) {
        const app0Path = path.join(currentDir, app0Child.name);
        try {
          const app0Entries = await fs.promises.readdir(app0Path);
          const subEb = app0Entries.find((f) => f.toLowerCase() === 'eboot.bin');
          if (subEb) {
            const fullPath = path.join(app0Path, subEb);
            const tagged = detectPlatformFromTags(path.basename(currentDir)) || detectPlatformFromTags(app0Child.name);
            const pl = fullPath.toLowerCase();
            const plat = tagged || (pl.includes('ps5') ? 'ps5' : pl.includes('ps4') ? 'ps4' : pl.includes('ps3') ? 'ps3' : 'ps5');
            found.push({ path: fullPath, ext: '.bin', platform: plat });
            return;
          }
        } catch {}
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          const nl = entry.name.toLowerCase();
          if (nl.startsWith('$') || IGNORED_DIRS.has(nl) || nl.startsWith('app0') || /^[a-z]{4}\d{5}-app\d+$/i.test(nl)) continue;
          await traverse(fullPath, depth + 1);
        } else if (entry.isFile() || entry.isSymbolicLink()) {
          const nl = entry.name.toLowerCase();
          let ext = path.extname(nl);
          if (nl.endsWith('.nsp.hdf')) {
            ext = '.nsp';
          }
          if (ext === '.iso' || ext === '.img' || ext === '.cso' || ext === '.wua' || ext === '.gcm' || ext === '.nkit' || ext === '.wud' || ext === '.wux') {
            const tagged = detectPlatformFromTags(entry.name) || detectPlatformFromTags(path.basename(currentDir));
            found.push({ path: fullPath, ext, platform: tagged || (ext === '.cso' ? 'psp' : (ext === '.wua' || ext === '.wud' || ext === '.wux' ? 'wiiu' : (ext === '.gcm' ? 'gamecube' : 'iso'))) });
          } else if (ROM_EXTENSIONS.has(ext)) {
            if (ext === '.md' && isDocFile(entry.name)) {
              continue;
            }
            let plat = ROM_PLATFORMS[ext];
            if (!plat) {
              if (ext === '.pkg') {
                const upperName = entry.name.toUpperCase();
                if (upperName.includes('CUSA')) {
                  plat = 'ps4';
                } else if (upperName.includes('PPSA')) {
                  plat = 'ps5';
                } else if (upperName.includes('BCUS') || upperName.includes('BLES') || upperName.includes('BLUS') || upperName.includes('NPEB') || upperName.includes('NPUB')) {
                  plat = 'ps3';
                } else if (upperName.includes('PCSB') || upperName.includes('PCSF') || upperName.includes('PCSE')) {
                  plat = 'psvita';
                }
              }
              if (!plat) {
                plat = detectPlatformFromTags(entry.name) || detectPlatformFromTags(path.basename(currentDir)) || 'ambiguous';
              }
            }
            found.push({ path: fullPath, ext, platform: plat });
          }
        }
      }
    } catch {
      // Ignore read errors
    }
  }
  await traverse(dir, 1);
  return found;
}

export function isUpdateFile(name: unknown, filePath?: unknown): boolean {
  if (typeof name !== 'string') return false;
  const nl = name.toLowerCase();
  const pl = typeof filePath === 'string' ? filePath.toLowerCase() : '';

  // Guard against full games stating they include updates
  if (/(?:incl|including|includes|with|all|\+)[._\-\s]+(?:all[._\-\s]+)?(?:upd|update|patch)/i.test(nl)) return false;
  if (/update[._\-\s]+(?:included|bundle|complete|pack)/i.test(nl)) return false;
  if (/\[.*(?:incl|with|all|\+).*(?:upd|patch).*\]/i.test(nl) || /\(.*(?:incl|with|all|\+).*(?:upd|patch).*\)/i.test(nl)) return false;

  if (/(?:\[|\()0100[0-9a-fA-F]{8,10}800(?:\)|\])/i.test(nl)) return true;
  if (/\[(?:upd|update|patch|hotfix)[^\]]*\]/i.test(nl) || /\((?:upd|update|patch|hotfix)[^)]*\)/i.test(nl)) return true;
  if (/(?:\[|\()v(?:65536|131072|196608|262144|\d{5,})(?:\)|\])|(?:^|[._\-\s])v(?:65536|131072|196608|262144|\d{5,})\b/i.test(nl)) return true;
  if (/-A\d{4}-V\d{4}/i.test(nl) || /-A\d{4}/i.test(nl)) return true;
  if (/(?:^|[._\-\s])(?:update|patch)[._\-\s]*v?[\d.]+\b/i.test(nl)) return true;
  if (/(?:^|[._\-\s])(?:update|patch)\.(?:pkg|nsp|xci|iso|bin|exe)$/i.test(nl)) return true;

  const parentFolder = path.basename(path.dirname(typeof filePath === 'string' ? filePath : ''));
  if (parentFolder.toLowerCase() === 'updates' || parentFolder.toLowerCase() === 'patches') return true;
  if (pl.includes('/updates/') || pl.includes('\\updates\\') || pl.includes('/patches/') || pl.includes('\\patches\\')) return true;

  return false;
}

export function isDlcFile(name: unknown, filePath?: unknown): boolean {
  if (typeof name !== 'string') return false;
  const nl = name.toLowerCase();
  const pl = typeof filePath === 'string' ? filePath.toLowerCase() : '';

  // Guard against full games that state they bundle DLCs
  if (/(?:incl|including|includes|with|all|\+)[._\-\s]+(?:all[._\-\s]+)?dlc/i.test(nl)) return false;
  if (/dlc[._\-\s]+(?:included|bundle|complete|edition)/i.test(nl)) return false;
  if (/\[.*(?:incl|with|all|\+).*dlc.*\]/i.test(nl) || /\(.*(?:incl|with|all|\+).*dlc.*\)/i.test(nl)) return false;

  if (/(?:\[|\()0100[0-9a-fA-F]{8,10}(?!000|800)[0-9a-fA-F]{3}(?:\)|\])/i.test(nl)) return true;
  if (/\[(?:dlc|addon|expansion)\]/i.test(nl) || /\((?:dlc|addon|expansion)\)/i.test(nl)) return true;
  if (/\[(?:dlc|addon|expansion)[._\-\s]*\d*\]/i.test(nl)) return true;
  if (/(?:^|[._\-\s])dlc[._\-\s]*\d+\b/i.test(nl)) return true;
  if (/(?:^|[._\-\s])(?:dlc|addon|expansion)\.(?:pkg|nsp|xci|iso|bin)$/i.test(nl)) return true;

  const parentFolder = path.basename(path.dirname(typeof filePath === 'string' ? filePath : ''));
  if (parentFolder.toLowerCase() === 'dlc' || parentFolder.toLowerCase() === 'dlcs') return true;
  if (pl.includes('/dlc/') || pl.includes('\\dlc\\') || pl.includes('/dlcs/') || pl.includes('\\dlcs\\')) return true;

  return false;
}

const updateFilesCache = new Map<string, Array<{ name: string; path: string }>>();

export async function findUpdateFilesForGame(gamePath: string): Promise<Array<{ name: string; path: string }>> {
  const baseDir = path.dirname(gamePath);
  if (updateFilesCache.has(baseDir)) return updateFilesCache.get(baseDir)!;
  const updates: Array<{ name: string; path: string }> = [];
  const visited = new Set<string>();
  const parentDir = path.dirname(baseDir);

  async function scanFolder(folderPath: string, depth: number): Promise<void> {
    if (depth > 2) return;
    try {
      const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(folderPath, entry.name);
        if (entry.isDirectory()) {
          const nl = entry.name.toLowerCase();
          if (nl.startsWith('$') || IGNORED_DIRS.has(nl)) continue;
          await scanFolder(fullPath, depth + 1);
        } else if (entry.isFile() || entry.isSymbolicLink()) {
          const nl = entry.name.toLowerCase();
          if (
            (nl.endsWith('.exe') && (nl.includes('update') || nl.includes('patch') || nl.includes('hotfix'))) ||
            isUpdateFile(entry.name, fullPath) ||
            isDlcFile(entry.name, fullPath)
          ) {
            if (NOISE_EXE_NAMES.some((s) => nl.includes(s) && !s.includes('patch') && !s.includes('update'))) continue;
            if (!visited.has(fullPath)) {
              visited.add(fullPath);
              updates.push({ name: entry.name, path: fullPath });
            }
          }
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  const foldersToScan = new Set<string>([baseDir]);
  try {
    const parentEntries = await fs.promises.readdir(parentDir, { withFileTypes: true });
    for (const ent of parentEntries) {
      if (ent.isDirectory()) {
        const nl = ent.name.toLowerCase();
        if (nl.includes('update') || nl.includes('patch') || nl.includes('dlc')) {
          foldersToScan.add(path.join(parentDir, ent.name));
        }
      }
    }
  } catch {
    // Parent might not be accessible
  }

  for (const f of foldersToScan) {
    await scanFolder(f, 1);
  }

  updates.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  updateFilesCache.set(baseDir, updates);
  return updates;
}

export function deduplicateGames(games: ScannedLocalGame[]): ScannedLocalGame[] {
  const seen = new Set<string>();
  const deduped: ScannedLocalGame[] = [];
  for (const g of games) {
    const key = (g.exePath || g.id || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(g);
  }
  return deduped;
}

export function getGameFolder(exePath: string, rootDir: string): string {
  let cur = path.dirname(exePath);
  const normRoot = path.resolve(rootDir).toLowerCase();
  while (cur && path.resolve(cur).toLowerCase() !== normRoot) {
    const parent = path.dirname(cur);
    if (path.resolve(parent).toLowerCase() === normRoot) {
      return cur;
    }
    cur = parent;
  }
  return path.dirname(exePath);
}

export function getRootGameDir(filePath: string): string {
  let cur = path.dirname(filePath);
  while (cur && path.dirname(cur) !== cur) {
    const b = path.basename(cur).toLowerCase();
    if (
      b === 'usrdir' ||
      b === 'ps3_game' ||
      b === 'ps4_game' ||
      b.startsWith('app0') ||
      /^[a-z]{4}\d{5}-app\d+$/i.test(b)
    ) {
      cur = path.dirname(cur);
    } else if (cur.toLowerCase().includes('app0')) {
      // Still inside an internal subfolder of an app0 package (e.g. app0/pancake, app0/sce_sys)
      cur = path.dirname(cur);
    } else {
      break;
    }
  }
  return cur;
}

export async function scanLocalFiles(options: LocalScanOptions): Promise<LocalScanResult> {
  const scanDirs = (options.scanDirectories || []).filter(Boolean);
  const isoDirs = (options.isoDirectories || []).filter(Boolean);
  const allDirs = Array.from(new Set([...scanDirs, ...isoDirs]));
  const allGames: ScannedLocalGame[] = [];
  const total = allDirs.length;
  let idx = 0;

  const emit = (dir: string) => {
    if (options.onProgress) {
      options.onProgress(dir, total > 0 ? Math.round((idx / total) * 100) : 100);
    }
  };

  const knownSteamInstallDirs = new Set<string>();

  for (const dir of allDirs) {
    emit(dir);
    try {
      try {
        await fs.promises.access(dir);
      } catch {
        idx++;
        continue;
      }

      const filesInDir = await fs.promises.readdir(dir, { withFileTypes: true });

      // ── 1. Steam Library Detection ──
      const hasSA = filesInDir.some((e) => e.name.toLowerCase() === 'steamapps' && e.isDirectory());
      const isSA = dir.toLowerCase().endsWith('steamapps');
      const isCommon = path.basename(dir).toLowerCase() === 'common' && path.basename(path.dirname(dir)).toLowerCase() === 'steamapps';
      const saPath = hasSA ? path.join(dir, 'steamapps') : isSA ? dir : isCommon ? path.dirname(dir) : null;

      if (saPath) {
        try {
          const saEntries = await fs.promises.readdir(saPath, { withFileTypes: true });
          for (const file of saEntries) {
            if (!file.name.startsWith('appmanifest_') || !file.name.endsWith('.acf')) continue;
            try {
              const content = await fs.promises.readFile(path.join(saPath, file.name), 'utf-8');
              const data = parseAcf(content);
              const { appid, name, installdir } = data;
              if (!appid || !name || !installdir) continue;
              const commonDir = path.join(saPath, 'common', installdir);
              knownSteamInstallDirs.add(path.resolve(commonDir).toLowerCase());
              let localExePath: string | undefined;

              try {
                const subExes = await scanExecutables(commonDir, 5);
                const exe = await pickBestExe(subExes, installdir);
                if (exe) localExePath = exe;
              } catch {
                // Ignore exe scan error
              }

              allGames.push({
                id: appid,
                title: name,
                exePath: `steam://rungameid/${appid}`,
                localExePath,
                installDir: commonDir,
                platform: 'steam',
              });
            } catch {
              // Ignore invalid manifest
            }
          }
        } catch {
          // Ignore steamapps read error
        }
      }

      // ── 2. Disc Images & ROMs Scan ──
      try {
        const images = await scanImagesAndRoms(dir, 5);
        const baseImages: Array<{ path: string; ext: string; platform: string; cleanTitle: string }> = [];
        const updateOrDlcFiles: Array<{ path: string; name: string; isDlc: boolean; platform: string; cleanTitle: string }> = [];

        for (const img of images) {
          const fn = path.basename(img.path);
          const isSfb = fn.toUpperCase() === 'PS3_DISC.SFB';
          const isEboot = fn.toLowerCase() === 'eboot.bin';
          let nameWithoutExt = path.basename(img.path, img.ext);
          if (isSfb || isEboot) {
            let parent = path.basename(path.dirname(img.path));
            if (GENERIC_FOLDER_NAMES.has(parent.toLowerCase()) || /^[a-z]{4}\d{5}-app\d+$/i.test(parent) || parent.toLowerCase().includes('app0') || parent.toLowerCase() === 'usrdir') {
              parent = path.basename(path.dirname(path.dirname(img.path)));
            }
            nameWithoutExt = parent;

            if (isEboot) {
              try {
                const dumpDir = path.dirname(img.path);
                const parentDir = path.dirname(dumpDir);
                const candidates = [
                  path.join(dumpDir, 'sce_sys', 'param.json'),
                  path.join(parentDir, 'sce_sys', 'param.json'),
                ];
                for (const cand of candidates) {
                  if (fs.existsSync(cand)) {
                    const raw = JSON.parse(fs.readFileSync(cand, 'utf-8'));
                    const loc = raw.localizedParameters || {};
                    for (const lang of ['en-GB', 'en-US', 'defaultLanguage', 'en']) {
                      if (loc[lang]?.titleName) {
                        nameWithoutExt = loc[lang].titleName;
                        break;
                      }
                    }
                    break;
                  }
                }
              } catch {}
            }
          } else if (fn.toLowerCase().endsWith('.nsp.hdf')) {
            nameWithoutExt = fn.substring(0, fn.length - '.nsp.hdf'.length);
          }
          const cleaned = cleanGameTitle(nameWithoutExt);

          if (!isSfb && !isEboot && isUpdateFile(fn, img.path)) {
            updateOrDlcFiles.push({ path: img.path, name: fn, isDlc: false, platform: img.platform, cleanTitle: cleaned });
          } else if (!isSfb && !isEboot && isDlcFile(fn, img.path)) {
            updateOrDlcFiles.push({ path: img.path, name: fn, isDlc: true, platform: img.platform, cleanTitle: cleaned });
          } else {
            baseImages.push({ ...img, cleanTitle: cleaned });
          }
        }

        const dedupedBaseImages: typeof baseImages = [];
        const seenConsoleDirs = new Set<string>();

        // Sort so console package executables (PS3_DISC.SFB, eboot.bin) come before internal disc images
        baseImages.sort((a, b) => {
          const aName = path.basename(a.path).toLowerCase();
          const bName = path.basename(b.path).toLowerCase();
          const aPriority = aName === 'ps3_disc.sfb' ? 1 : aName === 'eboot.bin' ? 2 : 3;
          const bPriority = bName === 'ps3_disc.sfb' ? 1 : bName === 'eboot.bin' ? 2 : 3;
          return aPriority - bPriority;
        });

        for (const img of baseImages) {
          const fn = path.basename(img.path);
          const isConsolePackage = fn.toUpperCase() === 'PS3_DISC.SFB' || fn.toLowerCase() === 'eboot.bin' || img.path.toLowerCase().includes('app0');
          if (isConsolePackage) {
            const rootKey = getRootGameDir(img.path).toLowerCase();
            if (seenConsoleDirs.has(rootKey)) continue;
            seenConsoleDirs.add(rootKey);
          }
          dedupedBaseImages.push(img);
        }

        for (const img of dedupedBaseImages) {
          const updates = await findUpdateFilesForGame(img.path);
          const matchedUpdates = updateOrDlcFiles.filter((u) => {
            if (path.dirname(u.path).toLowerCase() === path.dirname(img.path).toLowerCase()) return true;
            if (u.cleanTitle && img.cleanTitle && u.cleanTitle.toLowerCase() === img.cleanTitle.toLowerCase()) return true;
            return false;
          });

          for (const mu of matchedUpdates) {
            if (!updates.some((up) => up.path.toLowerCase() === mu.path.toLowerCase())) {
              updates.push({ name: mu.name, path: mu.path });
            }
          }

          allGames.push({
            id: generateLocalGameId(img.path, img.platform || 'iso'),
            title: img.cleanTitle || cleanGameTitle(path.basename(img.path, img.ext)),
            exePath: img.path,
            installDir: path.dirname(img.path),
            platform: img.platform || 'iso',
            updateFiles: updates,
          });
        }
      } catch (imgErr: any) {
        console.warn(`[local-scanner] Error scanning images/ROMs in ${dir}:`, imgErr.message);
      }

      // ── 3. Standalone PC Games Scan ──
      if (!isSA) {
        try {
          const validEntries = filesInDir.filter((e) => {
            const nl = e.name.toLowerCase();
            return !nl.startsWith('$') && !nl.startsWith('.') && !IGNORED_DIRS.has(nl);
          });
          const subdirs = validEntries.filter((e) => e.isDirectory());
          const directFiles = validEntries.filter((e) => e.isFile() || e.isSymbolicLink());

          const genericSubdirCount = subdirs.filter((d) => {
            const nl = d.name.toLowerCase();
            return GENERIC_FOLDER_NAMES.has(nl) || KNOWN_ENGINE_PROJECTS.has(nl);
          }).length;

          const directExes = directFiles
            .filter((f) => f.name.toLowerCase().endsWith('.exe'))
            .map((f) => path.join(dir, f.name))
            .filter((p) => {
              const fn = path.basename(p).toLowerCase();
              return !NOISE_EXE_NAMES.some((noise) => fn.includes(noise)) && !isUpdateFile(fn, p) && !isDlcFile(fn, p);
            });

          const dirNameClean = cleanGameTitle(path.basename(dir)).toLowerCase().replace(/[^a-z0-9]/g, '');
          const hasDirectMatchingExe = directExes.some((p) => {
            const stem = path.basename(p, '.exe').toLowerCase().replace(/[^a-z0-9]/g, '');
            return stem.includes(dirNameClean) || dirNameClean.includes(stem);
          });

          const isSingleGameDir =
            !CATEGORY_CONTAINER_NAMES.has(path.basename(dir).toLowerCase()) &&
            ((genericSubdirCount > 0 && genericSubdirCount >= subdirs.length / 2) ||
            (subdirs.length === 0 && directExes.length > 0) ||
            hasDirectMatchingExe);

          if (isSingleGameDir && !knownSteamInstallDirs.has(path.resolve(dir).toLowerCase())) {
            const allExes = await scanExecutables(dir, 5);
            const validExes = allExes.filter((p) => {
              const fn = path.basename(p).toLowerCase();
              return !NOISE_EXE_NAMES.some((noise) => fn.includes(noise)) && !isUpdateFile(fn, p) && !isDlcFile(fn, p);
            });
            const best = await pickBestExe(validExes, path.basename(dir));
            if (best) {
              allGames.push({
                id: generateLocalGameId(best),
                title: cleanGameTitle(path.basename(dir)),
                exePath: best,
                installDir: dir,
                platform: 'pc',
              });
            }
          } else {
            // Container directory containing multiple games (e.g. D:\Games, C:\SteamLibrary\steamapps\common)
            // 1. Scan subdirectories (expanding category containers like PC, Switch, PS5, TODO)
            const potentialGameDirs: Array<{ dirPath: string; dirName: string; category?: string }> = [];
            for (const sub of subdirs) {
              const nl = sub.name.toLowerCase();
              if (nl === 'steamapps' || (nl === 'common' && saPath)) continue;
              const gf = path.join(dir, sub.name);
              if (knownSteamInstallDirs.has(path.resolve(gf).toLowerCase())) continue;

              if (CATEGORY_CONTAINER_NAMES.has(nl)) {
                try {
                  const catEntries = await fs.promises.readdir(gf, { withFileTypes: true });
                  for (const ce of catEntries) {
                    if (ce.isDirectory() && !ce.name.startsWith('.') && !ce.name.startsWith('$') && !IGNORED_DIRS.has(ce.name.toLowerCase())) {
                      potentialGameDirs.push({ dirPath: path.join(gf, ce.name), dirName: ce.name, category: nl });
                    }
                  }
                } catch {
                  // Ignore read error
                }
              } else {
                potentialGameDirs.push({ dirPath: gf, dirName: sub.name });
              }
            }

            for (const pgd of potentialGameDirs) {
              // Avoid duplicate if an ISO/ROM image was already discovered in this directory
              const alreadyHasImage = allGames.some((g) => {
                const gDir = path.resolve(g.installDir || '').toLowerCase();
                const targetDir = path.resolve(pgd.dirPath).toLowerCase();
                return gDir === targetDir || gDir.startsWith(targetDir + path.sep);
              });
              if (alreadyHasImage) continue;

              const subExes = await scanExecutables(pgd.dirPath, 5);
              const validExes = subExes.filter((p) => {
                const fn = path.basename(p).toLowerCase();
                return !NOISE_EXE_NAMES.some((noise) => fn.includes(noise)) && !isUpdateFile(fn, p) && !isDlcFile(fn, p);
              });

              let best: string | null = null;
              if (validExes.length > 0) {
                best = await pickBestExe(validExes, pgd.dirName);
              } else {
                // Repack / installer fallback (e.g. setup.exe)
                const setupExe = subExes.find((p) => {
                  const fn = path.basename(p).toLowerCase();
                  return (fn === 'setup.exe' || fn.startsWith('setup') || fn.startsWith('install')) && !isUpdateFile(fn, p) && !isDlcFile(fn, p);
                });
                if (setupExe) {
                  best = setupExe;
                }
              }

              let ebootPath: string | null = null;
              if (!best) {
                try {
                  const checkEntries = await fs.promises.readdir(pgd.dirPath, { withFileTypes: true });
                  for (const ce of checkEntries) {
                    if (ce.name.toLowerCase() === 'eboot.bin') {
                      ebootPath = path.join(pgd.dirPath, ce.name);
                      break;
                    }
                    if (ce.isDirectory() && (ce.name.toLowerCase().includes('app0') || ce.name.toLowerCase() === 'usrdir')) {
                      const subEb = path.join(pgd.dirPath, ce.name, 'eboot.bin');
                      if (fs.existsSync(subEb)) {
                        ebootPath = subEb;
                        break;
                      }
                    }
                  }
                } catch {}
              }

              let archivePath: string | null = null;
              if (!best && !ebootPath) {
                try {
                  const topFiles = await fs.promises.readdir(pgd.dirPath);
                  const topArchive = topFiles.find((f) => {
                    const fl = f.toLowerCase();
                    return (fl.endsWith('.rar') || fl.endsWith('.zip') || fl.endsWith('.7z')) && !isUpdateFile(fl) && !isDlcFile(fl);
                  });
                  if (topArchive) {
                    archivePath = path.join(pgd.dirPath, topArchive);
                  }
                } catch {}
              }

              if (best) {
                const updates = await findUpdateFilesForGame(best);
                allGames.push({
                  id: generateLocalGameId(best),
                  title: cleanGameTitle(pgd.dirName),
                  exePath: best,
                  installDir: pgd.dirPath,
                  platform: pgd.category && pgd.category.startsWith('ps') ? pgd.category : 'pc',
                  updateFiles: updates,
                });
              } else if (ebootPath) {
                const updates = await findUpdateFilesForGame(ebootPath);
                const plat = pgd.category && pgd.category.startsWith('ps') ? pgd.category : (pgd.dirPath.toLowerCase().includes('ps5') ? 'ps5' : 'ps4');
                allGames.push({
                  id: generateLocalGameId(ebootPath, plat),
                  title: cleanGameTitle(pgd.dirName),
                  exePath: ebootPath,
                  installDir: pgd.dirPath,
                  platform: plat,
                  updateFiles: updates,
                });
              } else if (archivePath) {
                allGames.push({
                  id: generateLocalGameId(archivePath),
                  title: cleanGameTitle(pgd.dirName),
                  exePath: archivePath,
                  installDir: pgd.dirPath,
                  platform: 'pc',
                });
              }
            }

            // 2. Loose executables directly in dir
            for (const looseExe of directExes) {
              const baseName = path.basename(looseExe, '.exe');
              allGames.push({
                id: generateLocalGameId(looseExe),
                title: cleanGameTitle(baseName),
                exePath: looseExe,
                installDir: dir,
                platform: 'pc',
              });
            }
          }
        } catch (pcErr: any) {
          console.warn(`[local-scanner] Error scanning PC games in ${dir}:`, pcErr.message);
        }
      }
    } catch (e: any) {
      console.warn(`[local-scanner] Error scanning ${dir}:`, e.message);
    }
    idx++;
  }

  if (options.onProgress) {
    options.onProgress('Done', 100);
  }

  return { games: deduplicateGames(allGames) };
}
