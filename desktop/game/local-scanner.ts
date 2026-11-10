// desktop/game/local-scanner.ts
// Native local files scanner for PC games, Steam libraries, ISOs, and ROMs.

import * as fs from 'fs';
import * as path from 'path';
import { cleanGameTitle } from './parser';
import { getArtworkCacheDir } from './offline-cache';

export interface ScannedLocalGame {
  id: string;
  title: string;
  exePath: string;
  installDir: string;
  platform: string;
  localExePath?: string;
  updateFiles?: Array<{ name: string; path: string }>;
  isDlc?: boolean;
  localIconUrl?: string;
  posterUrl?: string;
  backdropUrl?: string;
  version?: string;
  titleId?: string;
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
  'mods', 'mod', 'saves', 'save', 'screenshots', 'backup', 'backups',
  'patch', 'patches', 'dlc', 'updates',
  'menu-simulations', 'menu-simulation', 'plugins', 'cleaner', 'defaultprojects', 'legacy',
]);

export const NOISE_EXE_NAMES = [
  'crash', 'unins', 'setup', 'redist', 'config', 'tool', 'cef',
  'helper', 'register', 'patch', 'dxsetup', 'vcredist', 'dotnet',
  'easyanticheat', 'battleye', 'epic_online_services', 'benchmark',
  'bugreport', 'restarter', 'dowser', 'quicksfv', 'autorun',
  'vconsole2', 'cleaner', 'sheep', 'csgo_legacy_app', 'steam_api64',
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
  'plugins', 'cleaner', 'defaultprojects', 'legacy', 'menu-simulations', 'app0',
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

    if (exeName === 'cs2' && (cleanInstallDir.includes('counterstrike') || cleanInstallDir.includes('csgo'))) {
      score += 200;
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
          if (nl.startsWith('$') || IGNORED_DIRS.has(nl) || nl.startsWith('app0') || /^[a-z]{4}\d{5}/i.test(nl)) continue;
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

  // PS5: tags, delimiters, and title IDs (PPSA, ELJS, ECAS)
  if (
    upper.includes('[PS5]') ||
    upper.includes('(PS5)') ||
    upper.includes('.PS5.') ||
    upper.includes('.PS5-') ||
    upper.includes('-PS5-') ||
    upper.includes('_PS5_') ||
    upper.includes('-PS5.') ||
    /(?:^|[._\-\s[(])(?:PPSA|ELJS|ECAS)\d{5}(?:[._\-\s\])]|$)/i.test(text)
  ) {
    return 'ps5';
  }

  // PS4: tags, delimiters, and title IDs (CUSA)
  if (
    upper.includes('[PS4]') ||
    upper.includes('(PS4)') ||
    upper.includes('.PS4.') ||
    upper.includes('.PS4-') ||
    upper.includes('-PS4-') ||
    upper.includes('_PS4_') ||
    upper.includes('-PS4.') ||
    /(?:^|[._\-\s[(])CUSA\d{5}(?:[._\-\s\])]|$)/i.test(text)
  ) {
    return 'ps4';
  }

  // PS3: tags, delimiters, and title IDs
  if (
    upper.includes('[PS3]') ||
    upper.includes('(PS3)') ||
    upper.includes('.PS3.') ||
    upper.includes('.PS3-') ||
    upper.includes('-PS3-') ||
    upper.includes('_PS3_') ||
    /(?:^|[._\-\s[(])(?:BCUS|BLES|BLUS|NPEB|NPUB|NPUA|BLAS|BCES)\d{5}(?:[._\-\s\])]|$)/i.test(text)
  ) {
    return 'ps3';
  }

  // PS2: tags, delimiters, and title IDs
  if (
    upper.includes('[PS2]') ||
    upper.includes('(PS2)') ||
    upper.includes('.PS2.') ||
    upper.includes('.PS2-') ||
    upper.includes('-PS2-') ||
    upper.includes('_PS2_') ||
    /(?:^|[._\-\s[(])(?:SLUS|SLES|SCES|SCUS|SLPM|SLPS)\d{5}(?:[._\-\s\])]|$)/i.test(text)
  ) {
    return 'ps2';
  }

  // PS1 / PSX
  if (
    upper.includes('[PS1]') ||
    upper.includes('(PS1)') ||
    upper.includes('[PSX]') ||
    upper.includes('(PSX)') ||
    upper.includes('.PS1.') ||
    upper.includes('.PSX.')
  ) {
    return 'ps1';
  }

  // PSP
  if (
    upper.includes('[PSP]') ||
    upper.includes('(PSP)') ||
    upper.includes('.PSP.') ||
    /(?:^|[._\-\s[(])(?:ULES|ULUS|UCES|UCUS|ULJM|ULJS)\d{5}(?:[._\-\s\])]|$)/i.test(text)
  ) {
    return 'psp';
  }

  // PSVita
  if (
    upper.includes('[PSVITA]') ||
    upper.includes('(PSVITA)') ||
    upper.includes('[VITA]') ||
    upper.includes('(VITA)') ||
    upper.includes('.VITA.') ||
    upper.includes('.PSVITA.') ||
    /(?:^|[._\-\s[(])(?:PCSB|PCSF|PCSE|PCSG|PCSA)\d{5}(?:[._\-\s\])]|$)/i.test(text)
  ) {
    return 'psvita';
  }

  // Switch
  if (
    upper.includes('[SWITCH]') ||
    upper.includes('(SWITCH)') ||
    upper.includes('[NSW]') ||
    upper.includes('(NSW)') ||
    upper.includes('.SWITCH.') ||
    upper.includes('.NSW.')
  ) {
    return 'switch';
  }

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

export interface Ps5DumpMetadata {
  titleId?: string;
  titleName?: string;
  version?: string;
  contentId?: string;
  localIconUrl?: string;
  posterUrl?: string;
  backdropUrl?: string;
}

const ps5MetaCache = new Map<string, Ps5DumpMetadata>();

export function clearPs5DumpMetadataCache(): void {
  ps5MetaCache.clear();
}

export function extractPs5DumpMetadata(targetPath: string): Ps5DumpMetadata {
  const normalized = path.normalize(targetPath);
  const cached = ps5MetaCache.get(normalized);
  if (cached) {
    return cached;
  }

  const result: Ps5DumpMetadata = {};
  try {
    let dumpDir = targetPath;
    try {
      const stat = fs.statSync(targetPath);
      if (!stat.isDirectory()) {
        dumpDir = path.dirname(targetPath);
      }
    } catch {
      dumpDir = path.dirname(targetPath);
    }

    const rootDir = getRootGameDir(targetPath);
    const candidateSceSysDirs = new Set<string>();

    candidateSceSysDirs.add(path.join(dumpDir, 'sce_sys'));
    candidateSceSysDirs.add(path.join(rootDir, 'sce_sys'));
    candidateSceSysDirs.add(path.join(path.dirname(dumpDir), 'sce_sys'));

    try {
      if (fs.existsSync(rootDir)) {
        const rootEntries = fs.readdirSync(rootDir, { withFileTypes: true });
        for (const re of rootEntries) {
          if (re.isDirectory()) {
            const rel = re.name.toLowerCase();
            if (rel.startsWith('app0') || /^[a-z]{4}\d{5}/i.test(rel) || rel === 'usrdir') {
              candidateSceSysDirs.add(path.join(rootDir, re.name, 'sce_sys'));
            }
          }
        }
      }
    } catch {}

    for (const sceSys of candidateSceSysDirs) {
      const paramJsonPath = path.join(sceSys, 'param.json');
      try {
        const raw = JSON.parse(fs.readFileSync(paramJsonPath, 'utf-8'));
        if (raw.titleId && !result.titleId) {
          result.titleId = String(raw.titleId);
        }
        if (raw.contentId && !result.contentId) {
          result.contentId = String(raw.contentId);
        }
        if (!result.version) {
          result.version = raw.appVersion || raw.masterVersion || raw.contentVersion || undefined;
        }
        if (!result.titleName) {
          const loc = raw.localizedParameters || {};
          for (const lang of ['en-US', 'en-GB', 'en', 'defaultLanguage']) {
            if (loc[lang]?.titleName) {
              result.titleName = loc[lang].titleName;
              break;
            }
          }
          if (!result.titleName && typeof loc === 'object') {
            for (const key of Object.keys(loc)) {
              if (loc[key]?.titleName) {
                result.titleName = loc[key].titleName;
                break;
              }
            }
          }
          if (!result.titleName && raw.titleName) {
            result.titleName = raw.titleName;
          }
        }
      } catch {}

      if (!result.localIconUrl) {
        const iconPath = path.join(sceSys, 'icon0.png');
        try {
          const stat = fs.statSync(iconPath);
          if (stat.size > 0 && stat.size <= 10 * 1024 * 1024) {
            const cacheDir = getArtworkCacheDir();
            const safeId = (result.titleId || path.basename(normalized)).replace(/[^a-zA-Z0-9_-]/g, '_');
            if (cacheDir) {
              const iconFilename = `${safeId}_icon0.png`;
              fs.copyFileSync(iconPath, path.join(cacheDir, iconFilename));
              result.localIconUrl = `media-cache://local/${iconFilename}`;
            } else {
              result.localIconUrl = `local-media://?path=${encodeURIComponent(iconPath)}`;
            }
          }
        } catch {}
      }

      if (!result.backdropUrl) {
        for (const picName of ['pic0.png', 'pic1.png', 'pic0.jpg']) {
          const picPath = path.join(sceSys, picName);
          try {
            const stat = fs.statSync(picPath);
            if (stat.size > 0 && stat.size <= 10 * 1024 * 1024) {
              const ext = picName.endsWith('.jpg') ? 'jpg' : 'png';
              const cacheDir = getArtworkCacheDir();
              const safeId = (result.titleId || path.basename(normalized)).replace(/[^a-zA-Z0-9_-]/g, '_');
              let targetUrl: string;
              if (cacheDir) {
                const backdropFilename = `${safeId}_${picName.replace(/\.[^.]+$/, '')}.${ext}`;
                fs.copyFileSync(picPath, path.join(cacheDir, backdropFilename));
                targetUrl = `media-cache://local/${backdropFilename}`;
              } else {
                targetUrl = `local-media://?path=${encodeURIComponent(picPath)}`;
              }
              result.backdropUrl = targetUrl;
              if (!result.posterUrl) {
                result.posterUrl = targetUrl;
              }
              break;
            }
          } catch {}
        }
      }

      if (result.titleName && result.localIconUrl && result.backdropUrl) {
        break;
      }
    }
  } catch {}

  ps5MetaCache.set(normalized, result);
  return result;
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
        let plat = tagged;
        if (!plat) {
          if (fs.existsSync(path.join(currentDir, 'sce_sys', 'param.json')) || fs.existsSync(path.join(currentDir, 'param.json'))) {
            plat = 'ps5';
          }
        }
        if (!plat) {
          const pl = fullPath.toLowerCase();
          plat = pl.includes('ps5') ? 'ps5' : pl.includes('ps4') ? 'ps4' : pl.includes('ps3') ? 'ps3' : 'ps5';
        }
        found.push({ path: fullPath, ext: '.bin', platform: plat });
        return;
      }

      // 2. Nested app0 PS5 dump check: if currentDir has an app0 child containing eboot.bin, index it and skip walking interior files
      const app0Child = entries.find((e) => e.isDirectory() && (e.name.toLowerCase().startsWith('app0') || /^[a-z]{4}\d{5}/i.test(e.name) || e.name.toLowerCase() === 'usrdir'));
      if (app0Child) {
        const app0Path = path.join(currentDir, app0Child.name);
        try {
          const app0Entries = await fs.promises.readdir(app0Path);
          const subEb = app0Entries.find((f) => f.toLowerCase() === 'eboot.bin');
          if (subEb) {
            const fullPath = path.join(app0Path, subEb);
            const tagged = detectPlatformFromTags(path.basename(currentDir)) || detectPlatformFromTags(app0Child.name);
            let plat = tagged;
            if (!plat) {
              if (fs.existsSync(path.join(app0Path, 'sce_sys', 'param.json')) || fs.existsSync(path.join(currentDir, 'sce_sys', 'param.json'))) {
                plat = 'ps5';
              }
            }
            if (!plat) {
              const pl = fullPath.toLowerCase();
              plat = pl.includes('ps5') ? 'ps5' : pl.includes('ps4') ? 'ps4' : pl.includes('ps3') ? 'ps3' : 'ps5';
            }
            found.push({ path: fullPath, ext: '.bin', platform: plat });
            return;
          }
        } catch {}
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          const nl = entry.name.toLowerCase();
          if (nl.startsWith('$') || IGNORED_DIRS.has(nl) || nl.startsWith('app0') || /^[a-z]{4}\d{5}/i.test(nl)) continue;
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
                } else if (upperName.includes('PPSA') || upperName.includes('ELJS') || upperName.includes('ECAS')) {
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

// Pre-compiled static patterns for update and DLC detection (avoids recreating RegExp inside loops)
const RE_UPD_GUARD1 = /(?:incl|including|includes|with|all|\+)[._\-\s]+(?:all[._\-\s]+)?(?:upd|update|patch)/i;
const RE_UPD_GUARD2 = /update[._\-\s]+(?:included|bundle|complete|pack)/i;
const RE_UPD_GUARD3 = /\[.*(?:incl|with|all|\+).*(?:upd|patch).*\]|\(.*(?:incl|with|all|\+).*(?:upd|patch).*\)/i;
const RE_UPD_TITLE_ID = /(?:\[|\()0100[0-9a-fA-F]{8,10}800(?:\)|\])/i;
const RE_UPD_TAGS = /\[(?:upd|update|patch|hotfix)[^\]]*\]|\((?:upd|update|patch|hotfix)[^)]*\)/i;
const RE_UPD_VERSION = /(?:\[|\()v(?:65536|131072|196608|262144|\d{5,})(?:\)|\])|(?:^|[._\-\s])v(?:65536|131072|196608|262144|\d{5,})\b/i;
const RE_UPD_A_CODE = /-A\d{4}-V\d{4}|-A\d{4}/i;
const RE_UPD_WORD = /(?:^|[._\-\s])(?:update|patch)[._\-\s]*v?[\d.]+\b/i;
const RE_UPD_EXT = /(?:^|[._\-\s])(?:update|patch)\.(?:pkg|nsp|xci|iso|bin|exe)$/i;

const RE_DLC_GUARD1 = /(?:incl|including|includes|with|all|\+)[._\-\s]+(?:all[._\-\s]+)?dlc/i;
const RE_DLC_GUARD2 = /dlc[._\-\s]+(?:included|bundle|complete|edition)/i;
const RE_DLC_GUARD3 = /\[.*(?:incl|with|all|\+).*dlc.*\]|\(.*(?:incl|with|all|\+).*dlc.*\)/i;
const RE_DLC_TITLE_ID = /(?:\[|\()0100[0-9a-fA-F]{8,10}(?!000|800)[0-9a-fA-F]{3}(?:\)|\])/i;
const RE_DLC_TAG1 = /\[(?:dlc|addon|expansion)\]|\((?:dlc|addon|expansion)\)/i;
const RE_DLC_TAG2 = /\[(?:dlc|addon|expansion)[._\-\s]*\d*\]/i;
const RE_DLC_WORD = /(?:^|[._\-\s])dlc[._\-\s]*\d+\b/i;
const RE_DLC_EXT = /(?:^|[._\-\s])(?:dlc|addon|expansion)\.(?:pkg|nsp|xci|iso|bin)$/i;

export function isUpdateFile(name: unknown, filePath?: unknown): boolean {
  if (typeof name !== 'string') return false;
  const nl = name.toLowerCase();
  const pl = typeof filePath === 'string' ? filePath.toLowerCase() : '';

  // Guard against full games stating they include updates
  if (RE_UPD_GUARD1.test(nl)) return false;
  if (RE_UPD_GUARD2.test(nl)) return false;
  if (RE_UPD_GUARD3.test(nl)) return false;

  if (RE_UPD_TITLE_ID.test(nl)) return true;
  if (RE_UPD_TAGS.test(nl)) return true;
  if (RE_UPD_VERSION.test(nl)) return true;
  if (RE_UPD_A_CODE.test(nl)) return true;
  if (RE_UPD_WORD.test(nl)) return true;
  if (RE_UPD_EXT.test(nl)) return true;

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
  if (RE_DLC_GUARD1.test(nl)) return false;
  if (RE_DLC_GUARD2.test(nl)) return false;
  if (RE_DLC_GUARD3.test(nl)) return false;

  if (RE_DLC_TITLE_ID.test(nl)) return true;
  if (RE_DLC_TAG1.test(nl)) return true;
  if (RE_DLC_TAG2.test(nl)) return true;
  if (RE_DLC_WORD.test(nl)) return true;
  if (RE_DLC_EXT.test(nl)) return true;

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

export function getRootGameDir(filePath: string): string {
  let cur = path.dirname(filePath);
  while (cur && path.dirname(cur) !== cur) {
    const b = path.basename(cur).toLowerCase();
    if (
      b === 'usrdir' ||
      b === 'ps3_game' ||
      b === 'ps4_game' ||
      b.startsWith('app0') ||
      /^[a-z]{4}\d{5}/i.test(b)
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
  clearPs5DumpMetadataCache();
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
        const baseImages: Array<{
          path: string;
          ext: string;
          platform: string;
          cleanTitle: string;
          localIconUrl?: string;
          posterUrl?: string;
          backdropUrl?: string;
          version?: string;
          titleId?: string;
        }> = [];
        const updateOrDlcFiles: Array<{ path: string; name: string; isDlc: boolean; platform: string; cleanTitle: string }> = [];

        for (const img of images) {
          const fn = path.basename(img.path);
          const isSfb = fn.toUpperCase() === 'PS3_DISC.SFB';
          const isEboot = fn.toLowerCase() === 'eboot.bin';
          let nameWithoutExt = path.basename(img.path, img.ext);
          let localIconUrl: string | undefined;
          let posterUrl: string | undefined;
          let backdropUrl: string | undefined;
          let version: string | undefined;

          if (isSfb || isEboot) {
            let parent = path.basename(path.dirname(img.path));
            if (GENERIC_FOLDER_NAMES.has(parent.toLowerCase()) || /^[a-z]{4}\d{5}/i.test(parent) || parent.toLowerCase().includes('app0') || parent.toLowerCase() === 'usrdir') {
              parent = path.basename(path.dirname(path.dirname(img.path)));
            }
            nameWithoutExt = parent;

            let titleId: string | undefined = undefined;
            if (isEboot) {
              const ps5Meta = extractPs5DumpMetadata(img.path);
              if (ps5Meta.titleName) {
                nameWithoutExt = ps5Meta.titleName;
              }
              if (ps5Meta.titleId || ps5Meta.titleName || ps5Meta.version) {
                img.platform = 'ps5';
              }
              if (ps5Meta.titleId) {
                titleId = ps5Meta.titleId;
              }
              localIconUrl = ps5Meta.localIconUrl;
              posterUrl = ps5Meta.posterUrl;
              backdropUrl = ps5Meta.backdropUrl;
              version = ps5Meta.version;
            }

            if (!titleId) {
              const mId = (img.path || '').match(/\b((?:PPSA|ELJS|ECAS|CUSA)\d{5})\b/i);
              if (mId) {
                titleId = mId[1].toUpperCase();
              }
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
            let titleId: string | undefined = undefined;
            const mId = (img.path || '').match(/\b((?:PPSA|ELJS|ECAS|CUSA)\d{5})\b/i);
            if (mId) {
              titleId = mId[1].toUpperCase();
            }
            baseImages.push({
              ...img,
              cleanTitle: cleaned,
              localIconUrl,
              posterUrl,
              backdropUrl,
              version,
              titleId: (img as any).titleId || titleId,
            });
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
            installDir: getRootGameDir(img.path),
            platform: img.platform || 'iso',
            titleId: (img as any).titleId,
            updateFiles: updates,
            localIconUrl: img.localIconUrl,
            posterUrl: img.posterUrl,
            backdropUrl: img.backdropUrl,
            version: img.version,
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
                      const ceLower = ce.name.toLowerCase();
                      if (ceLower.startsWith('app0') || /^[a-z]{4}\d{5}/i.test(ceLower) || ceLower === 'usrdir' || ceLower === 'sce_sys') continue;
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
              // Avoid duplicate if an ISO/ROM image or game was already discovered in or containing this directory
              const alreadyHasImage = allGames.some((g) => {
                const gDir = path.resolve(g.installDir || '').toLowerCase();
                const targetDir = path.resolve(pgd.dirPath).toLowerCase();
                return gDir === targetDir || targetDir.startsWith(gDir + path.sep) || gDir.startsWith(targetDir + path.sep);
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
                    if (ce.isDirectory() && (ce.name.toLowerCase().includes('app0') || /^[a-z]{4}\d{5}/i.test(ce.name) || ce.name.toLowerCase() === 'usrdir')) {
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
                  const dirLower = pgd.dirName.toLowerCase();
                  const fullDirLower = pgd.dirPath.toLowerCase();
                  const isInternalAssetDir =
                    ['tutorials', 'scenarios', 'plugins', 'plugin', 'data', 'base', 'x86_64', 'x64', 'x86', 'menu-simulations', 'menu-simulation', 'blueprint', 'icons', 'mods', 'mod'].includes(dirLower) ||
                    GENERIC_FOLDER_NAMES.has(dirLower) ||
                    fullDirLower.includes('steamapps') ||
                    fullDirLower.includes('menu-simulation') ||
                    fullDirLower.includes('/mods/') ||
                    fullDirLower.includes('\\mods\\');

                  if (!isInternalAssetDir) {
                    const topFiles = await fs.promises.readdir(pgd.dirPath);
                    const topArchive = topFiles.find((f) => {
                      const fl = f.toLowerCase();
                      return (fl.endsWith('.rar') || fl.endsWith('.zip') || fl.endsWith('.7z')) && !isUpdateFile(fl) && !isDlcFile(fl);
                    });
                    if (topArchive) {
                      archivePath = path.join(pgd.dirPath, topArchive);
                    }
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
                const ps5Meta = extractPs5DumpMetadata(ebootPath);
                const isPs5 = Boolean(
                  (ps5Meta.titleId && /^(?:PPSA|ELJS|ECAS)\d{5}/i.test(ps5Meta.titleId)) ||
                  detectPlatformFromTags(pgd.dirName) === 'ps5' ||
                  detectPlatformFromTags(ebootPath) === 'ps5' ||
                  pgd.dirPath.toLowerCase().includes('ps5') ||
                  (pgd.category && pgd.category.toLowerCase() === 'ps5')
                );
                const plat = isPs5
                  ? 'ps5'
                  : (detectPlatformFromTags(pgd.dirName) || (pgd.category && pgd.category.startsWith('ps') ? pgd.category : 'ps4'));
                const rootDir = getRootGameDir(ebootPath);
                allGames.push({
                  id: generateLocalGameId(ebootPath, plat),
                  title: ps5Meta.titleName || cleanGameTitle(pgd.dirName),
                  exePath: ebootPath,
                  installDir: rootDir,
                  platform: plat,
                  updateFiles: updates,
                  localIconUrl: ps5Meta.localIconUrl,
                  posterUrl: ps5Meta.posterUrl,
                  backdropUrl: ps5Meta.backdropUrl,
                  version: ps5Meta.version,
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
