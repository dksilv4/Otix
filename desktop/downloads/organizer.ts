/**
 * Auto game organizer — arr-style (Radarr/Sonarr/Lidarr) for game.
 *
 * Triggered after SABnzbd download completes:
 *   1. Find downloaded content (ISOs, PC game folders, update files)
 *   2. Parse release name to extract {title, year, edition, group, version}
 *   3. Apply naming template to produce clean target paths
 *   4. Execute moves via installer.ts:executeOrganization()
 *   5. Update DB with organized paths
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  cleanGameTitle,
  extractGroup,
  parseVersion,
  parseReleaseName,
  applyNamingTemplate,
  validateNamingTemplate,
  getFolderTemplate,
  sanitizePathSegment,
  VALID_TOKENS,
  type ParsedRelease,
  type FileInfo,
} from '../game/parser';
import { executeOrganization, OrganizationPreviewItem } from '../installer';
import {
  diagnoseArchiveIntegrity,
  healRepackArchive,
  type ArchiveDiagnosis,
} from './healing';
import { getDb } from '../db';
import type Database from 'better-sqlite3';

let __db: Database.Database | null = null;
function db(): Database.Database {
  if (!__db) __db = getDb();
  return __db;
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface DownloadedContent {
  /** Absolute path to the file or folder */
  path: string;
  /** Base name */
  name: string;
  /** Content type */
  type: 'iso' | 'pc_game' | 'update' | 'dlc' | 'rom' | 'crack' | 'archive_part' | 'file' | 'unknown';
  /** Detected target platform if explicit from container structure (e.g., PS3, PS4) */
  platform?: string;
  /** Size in bytes (for details) */
  size?: number;
  /** Archive integrity analysis for repack packages */
  integrity?: ArchiveDiagnosis;
  /** Direct child subdirectories if this is a directory package */
  subdirectories?: string[];
}

export interface AutoOrganizeResult {
  success: boolean;
  organized: { from: string; to: string; type: string }[];
  errors: string[];
}

// ── Naming presets ──────────────────────────────────────────────────────────

export interface NamingPreset {
  label: string;
  template: string;
}

export const NAMING_PRESETS: Record<string, NamingPreset> = {
  standard: {
    label: 'Standard',
    template: '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}',
  },
  scene: {
    label: 'Scene Standard',
    template: '{Title}/{Title}.v{Version}-{ReleaseGroup}.{ext}',
  },
  simple: {
    label: 'Simple',
    template: '{Title}/{Title}.{ext}',
  },
  yearFlat: {
    label: 'Flat by Year',
    template: '{Title} ({Year})/{Title}.{ext}',
  },
  folderOnly: {
    label: 'Smart Folder',
    template: '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}',
  },
};

// ── Ignored dirs (copy of IGNORED_DIRS from scanner.ts / ORG_IGNORED_DIRS from installer.ts) ──

const SKIP_DIRS = new Set([
  'node_modules', 'bower_components', '.git', '.github', '.svn', '.hg',
  'system32', 'syswow64', 'windows', 'microsoft.net', 'appdata',
  'obj', '__pycache__', '.venv', 'venv', 'env', 'windowsapps',
]);

// ── Release name parsing ─────────────────────────────────────────────────────

// Re-export canonical release parser from game/parser
export { parseReleaseName };

const ROM_EXTENSIONS = new Set([
  '.nsp', '.xci', '.nsz', '.xcz', '.3ds', '.cia', '.cxi', '.nds',
  '.z64', '.n64', '.v64', '.rvz', '.wbfs', '.gcz', '.chd', '.pbp',
  '.vpk', '.sfc', '.smc', '.nes', '.gba', '.gbc', '.gb', '.md',
  '.gen', '.pkg', '.cso', '.wux', '.rpx', '.wia', '.wad', '.gcm',
  '.d64', '.t64', '.tap', '.adf', '.ipf', '.crt', '.cas', '.tzx',
  '.cdi', '.gdi', '.ccd', '.sub', '.xex',
]);

const DOC_BASENAMES = new Set([
  'readme', 'changelog', 'install', 'installation', 'license', 'licence',
  'instructions', 'notes', 'faq', 'manual', 'help', 'history', 'todo',
  'credits', 'authors', 'version', 'info', 'guide',
]);

const ISO_EXTENSIONS = new Set([
  '.iso', '.img', '.bin', '.cue', '.mdf', '.mds', '.nrg',
]);

const ARCHIVE_EXTENSIONS = new Set([
  '.zip', '.rar', '.7z', '.tar', '.gz', '.xz', '.bz2', '.001',
]);

const KNOWN_GAME_SUBDIRS = new Set([
  'bin', 'binaries', 'bin32', 'bin64', 'x64', 'x86', 'win64', 'win32',
  'system', 'shipping', 'retail', 'game', 'release', 'app', 'build',
]);

// ── Content discovery ────────────────────────────────────────────────────────

function isNoiseExecutableName(nameLower: string): boolean {
  return (
    nameLower.includes('unins') ||
    nameLower.includes('crash') ||
    nameLower.includes('helper') ||
    nameLower.includes('check') ||
    nameLower.includes('hash') ||
    nameLower.includes('redist') ||
    nameLower.includes('dxsetup') ||
    nameLower.includes('vcredist') ||
    nameLower.includes('dotnet') ||
    nameLower.includes('easyanticheat') ||
    nameLower.includes('battleye') ||
    nameLower.includes('benchmark') ||
    nameLower.includes('bugreport') ||
    nameLower.includes('dowser') ||
    nameLower.includes('quicksfv') ||
    nameLower.includes('autorun')
  );
}

const CRACK_REGEX = /(?:^|[\s._\-\[(])(?:crack\s*fix|crackfix|crack\s*only|crack|cracked|online\s*fix|onlinefix|no\s*cd|nocd)(?:[\s._\-\])]|$)|\+crack/i;

function isGameExecutableName(name: string): boolean {
  const nl = name.toLowerCase();
  return (
    nl.endsWith('.exe') &&
    !isNoiseExecutableName(nl) &&
    !nl.includes('setup') &&
    !nl.includes('installer') &&
    !nl.includes('update') &&
    !nl.includes('patch') &&
    !nl.includes('hotfix') &&
    !nl.includes('dlc') &&
    !nl.includes('addon') &&
    !CRACK_REGEX.test(nl)
  );
}

async function scanForGameExecutable(dirPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = entries.filter((e) => e.isFile()).map((e) => e.name);
    if (files.some((f) => isGameExecutableName(f))) {
      return true;
    }
    const subdirs = entries.filter(
      (e) =>
        e.isDirectory() &&
        !SKIP_DIRS.has(e.name.toLowerCase()) &&
        !e.name.startsWith('.') &&
        !e.name.startsWith('$') &&
        !['updates', 'dlc', 'crack'].includes(e.name.toLowerCase()),
    );
    for (const sd of subdirs) {
      if (subdirs.length > 1 && !KNOWN_GAME_SUBDIRS.has(sd.name.toLowerCase())) {
        continue;
      }
      const subPath = path.join(dirPath, sd.name);
      try {
        const subEntries = await fs.readdir(subPath, { withFileTypes: true });
        const subFiles = subEntries.filter((e) => e.isFile()).map((e) => e.name);
        if (subFiles.some((f) => isGameExecutableName(f))) {
          return true;
        }
        const deeperSubdirs = subEntries.filter(
          (e) =>
            e.isDirectory() &&
            !SKIP_DIRS.has(e.name.toLowerCase()) &&
            !e.name.startsWith('.') &&
            !e.name.startsWith('$') &&
            !['updates', 'dlc', 'crack'].includes(e.name.toLowerCase()),
        );
        for (const dsd of deeperSubdirs) {
          if (deeperSubdirs.length > 1 && !KNOWN_GAME_SUBDIRS.has(dsd.name.toLowerCase())) {
            continue;
          }
          const deeperPath = path.join(subPath, dsd.name);
          try {
            const deeperEntries = await fs.readdir(deeperPath, { withFileTypes: true });
            if (deeperEntries.filter((e) => e.isFile()).some((e) => isGameExecutableName(e.name))) {
              return true;
            }
          } catch {}
        }
      } catch {}
    }
  } catch {}
  return false;
}

/**
 * Recursively walk a download directory and find all downloadable content.
 *
 * Returns ISO files, ROMs, PC game folders (directories containing .exe files),
 * update/patch executables, and DLC files.
 */
export async function findDownloadedContent(
  dirPath: string,
  maxDepth = 5,
  includeAllFiles = false,
): Promise<DownloadedContent[]> {
  const results: DownloadedContent[] = [];
  const seen = new Set<string>();

  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      throw new Error(`Target is not a directory: ${dirPath}`);
    }
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      throw new Error(`Folder does not exist: ${dirPath}`);
    }
    throw err;
  }

  async function traverse(currentDir: string, depth: number) {
    if (depth > maxDepth) return;
    // If currentDir is inside an already identified game package, do not inspect subfolders as separate games
    if (results.some((r) => currentDir.toLowerCase().startsWith(r.path.toLowerCase() + path.sep.toLowerCase()))) {
      return;
    }
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      let hasExe = false;
      const childDirs: string[] = [];
      const childNames = entries.map((e) => e.name);
      const childFiles = entries.filter((e) => e.isFile()).map((e) => e.name);

      // Check if currentDir itself is a container package
      const folderLower = path.basename(currentDir).toLowerCase();
      const hasSetup = childFiles.some((f) => /^(?:setup|installer).*\.exe$/i.test(f));
      const hasBins = childFiles.some((f) => /\.(bin|cab|doi)$/i.test(f));
      const hasCrackDll = childFiles.some((f) => /^(?:steam_api64?\.dll|steam_emu\.ini)$/i.test(f));
      const isPs5 = childNames.some((f) => /^ppsa\d{5}/i.test(f)) || folderLower.includes('.ps5') || folderLower.includes('-ps5') || folderLower.includes('[ps5]');
      const isPs3 = childNames.some((f) => /^(?:ps3_game|ps3_disc\.sfb)$/i.test(f));
      const isPs4 = (childNames.some((f) => /^sce_sys$/i.test(f)) || folderLower.includes('.ps4') || folderLower.includes('-ps4') || folderLower.includes('[ps4]')) && !isPs5;
      const isConsoleFolder = !hasSetup && !hasCrackDll && (isPs5 || isPs3 || isPs4);
      const consolePlatform = isConsoleFolder ? (isPs5 ? 'PS5' : isPs3 ? 'PS3' : isPs4 ? 'PS4' : undefined) : undefined;
      const isCrackFolder =
        hasCrackDll ||
        /(?:^|[\s._\-\[(])(?:crack\s*fix|crackfix|crack\s*only|crack|cracked|online\s*fix|onlinefix|no\s*cd|nocd)(?:[\s._\-\])]|$)|\+crack/i.test(folderLower) ||
        /^(?:codex|rune|flt|skidrow|empress|goldberg)$/i.test(folderLower);

      if (isCrackFolder || (hasSetup && hasBins) || isConsoleFolder) {
        let integrity: ArchiveDiagnosis | undefined;
        if (hasBins || folderLower.includes('elamigos') || folderLower.includes('fitgirl')) {
          integrity = await diagnoseArchiveIntegrity(currentDir);
        }
        results.push({
          path: currentDir,
          name: path.basename(currentDir),
          type: isCrackFolder ? 'crack' : 'pc_game',
          platform: consolePlatform,
          integrity,
          subdirectories: entries
            .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name.toLowerCase()))
            .map((e) => e.name),
        });
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (seen.has(fullPath)) continue;
        seen.add(fullPath);

        if (entry.isDirectory()) {
          const nameLower = entry.name.toLowerCase();
          if (nameLower.startsWith('$') || SKIP_DIRS.has(nameLower)) continue;

          // Check if direct child directory is a container package
          try {
            const subEntries = await fs.readdir(fullPath, { withFileTypes: true });
            const subNames = subEntries.map((e) => e.name);
            const subFiles = subEntries.filter((e) => e.isFile()).map((e) => e.name);
            const subSetup = subFiles.some((f) => /^(?:setup|installer).*\.exe$/i.test(f));
            const subBins = subFiles.some((f) => /\.(bin|cab|doi)$/i.test(f));
            const subCrackDll = subFiles.some((f) => /^(?:steam_api64?\.dll|steam_emu\.ini)$/i.test(f));
            const subIsPs5 = subNames.some((f) => /^ppsa\d{5}/i.test(f)) || nameLower.includes('.ps5') || nameLower.includes('-ps5') || nameLower.includes('[ps5]');
            const subIsPs3 = subNames.some((f) => /^(?:ps3_game|ps3_disc\.sfb)$/i.test(f));
            const subIsPs4 = (subNames.some((f) => /^sce_sys$/i.test(f)) || nameLower.includes('.ps4') || nameLower.includes('-ps4') || nameLower.includes('[ps4]')) && !subIsPs5;
            const subIsConsole = !subSetup && !subCrackDll && (subIsPs5 || subIsPs3 || subIsPs4);
            const subConsolePlatform = subIsConsole ? (subIsPs5 ? 'PS5' : subIsPs3 ? 'PS3' : subIsPs4 ? 'PS4' : undefined) : undefined;
            const isGenericContainer = nameLower === 'crack' || nameLower === 'cracks' || nameLower === 'updates' || nameLower === 'dlc';
            if (isGenericContainer) {
              if (depth < maxDepth) {
                childDirs.push(fullPath);
              }
              continue;
            }

            const subIsCrack =
              subCrackDll ||
              /crack(?:fix|\.fix|-fix|\s*only)?/i.test(nameLower) ||
              /^(?:codex|rune|flt|skidrow|empress|goldberg)$/i.test(nameLower);

            const nonNoiseSubdirs = subEntries.filter(
              (e) => e.isDirectory() && !SKIP_DIRS.has(e.name.toLowerCase()) && !e.name.startsWith('.') && !e.name.startsWith('$')
            );
            let hasOtix = subFiles.some((f) => f.toLowerCase() === '.otix');
            if (!hasOtix && nonNoiseSubdirs.length === 1) {
              try {
                const deepFiles = await fs.readdir(path.join(fullPath, nonNoiseSubdirs[0].name));
                if (deepFiles.some((f) => f.toLowerCase() === '.otix')) {
                  hasOtix = true;
                }
              } catch {}
            }
            const subHasIso = subFiles.some((f) => /\.(iso|img|mdf|bin)$/i.test(f));
            const subDirectExe = isGameExecutableName(entry.name) ? false : subFiles.some((f) => isGameExecutableName(f));
            let packagePath = fullPath;
            let packageName = entry.name;
            let hasGameExe = subDirectExe;

            // Unpack single-child redundant wrapper folders directly under the main directory
            const nonNoiseFiles = subFiles.filter((f) => {
              const fl = f.toLowerCase();
              return !fl.endsWith('.nfo') && !fl.endsWith('.sfv') && !fl.endsWith('.txt') && !fl.endsWith('.url') && fl !== '.otix';
            });
            if (depth === 1 && nonNoiseSubdirs.length === 1 && nonNoiseFiles.length === 0 && !subSetup) {
              const singleChild = nonNoiseSubdirs[0];
              const singleChildLower = singleChild.name.toLowerCase();
              const isGenericFolder = ['bin', 'x64', 'win64', 'win32', 'data', 'content', 'engine', 'system', 'updates', 'dlc', 'crack'].includes(singleChildLower);
              if (!isGenericFolder) {
                const childPath = path.join(fullPath, singleChild.name);
                if (await scanForGameExecutable(childPath)) {
                  packagePath = childPath;
                  packageName = singleChild.name;
                  hasGameExe = true;
                }
              }
            }

            if (!hasGameExe && depth === 1 && !isGenericContainer) {
              hasGameExe = await scanForGameExecutable(packagePath);
            }

            const isGameFolder = hasGameExe;
            if (
              subIsConsole ||
              subIsCrack ||
              (subSetup && subBins) ||
              hasOtix ||
              (depth === 1 && (subHasIso || isGameFolder))
            ) {
              let integrity: ArchiveDiagnosis | undefined;
              if (subBins || nameLower.includes('elamigos') || nameLower.includes('fitgirl')) {
                integrity = await diagnoseArchiveIntegrity(packagePath);
              }
              const packageEntries = packagePath === fullPath ? subEntries : await fs.readdir(packagePath, { withFileTypes: true }).catch(() => subEntries);
              results.push({
                path: packagePath,
                name: packageName,
                type: subIsCrack ? 'crack' : 'pc_game',
                platform: subConsolePlatform,
                integrity,
                subdirectories: packageEntries
                  .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name.toLowerCase()))
                  .map((e) => e.name),
              });
              continue;
            }
          } catch {}

          if (depth < maxDepth) {
            childDirs.push(fullPath);
          }
        } else if (entry.isFile()) {
          const nameLower = entry.name.toLowerCase();
          const ext = path.extname(nameLower);

          if (ISO_EXTENSIONS.has(ext)) {
            results.push({ path: fullPath, name: entry.name, type: 'iso' });
          } else if (ARCHIVE_EXTENSIONS.has(ext)) {
            const filenameNoExt = path.basename(entry.name, ext);
            const isMultiPart = /(?:\.part\d+|\.r\d{2})$/i.test(filenameNoExt) || /(?:\.part\d+|\.r\d{2})\./i.test(nameLower);
            const isFirstPart = /(?:\.part0*1|\.r00)$/i.test(filenameNoExt) || /(?:\.part0*1|\.r00)\./i.test(nameLower);

            const isUpdate = /\b(?:update|patch|hotfix)\b/i.test(nameLower.replace(/[\._\-]/g, ' '));
            const isDlc = /\b(?:dlc|addon)\b/i.test(nameLower.replace(/[\._\-]/g, ' '));
            const isCrack = /(?:^|[\s._\-\[(])(?:crack\s*fix|crackfix|crack\s*only|crack|cracked|online\s*fix|onlinefix|no\s*cd|nocd)(?:[\s._\-\])]|$)|\+crack/i.test(nameLower);

            if (isCrack) {
              results.push({ path: fullPath, name: entry.name, type: 'crack' });
            } else if (isUpdate) {
              results.push({ path: fullPath, name: entry.name, type: 'update' });
            } else if (isDlc) {
              results.push({ path: fullPath, name: entry.name, type: 'dlc' });
            } else if (isMultiPart && !isFirstPart) {
              results.push({ path: fullPath, name: entry.name, type: 'archive_part' });
            } else {
              results.push({ path: fullPath, name: entry.name, type: 'iso' });
            }
          } else if (ROM_EXTENSIONS.has(ext)) {
            const baseNoExt = path.basename(nameLower, ext);
            if (ext === '.md' && (DOC_BASENAMES.has(baseNoExt) || baseNoExt.startsWith('readme') || baseNoExt.startsWith('install'))) {
              continue;
            }
            if (nameLower.includes('[upd]') || nameLower.includes('[v131072]')) {
              results.push({ path: fullPath, name: entry.name, type: 'update' });
            } else if (nameLower.includes('[dlc]')) {
              results.push({ path: fullPath, name: entry.name, type: 'dlc' });
            } else {
              results.push({ path: fullPath, name: entry.name, type: 'rom' });
            }
          } else if (/(?:^|[\s._\-\[(])(?:crack\s*fix|crackfix|crack\s*only|crack|cracked|online\s*fix|onlinefix|no\s*cd|nocd)(?:[\s._\-\])]|$)|\+crack/i.test(nameLower)) {
            results.push({ path: fullPath, name: entry.name, type: 'crack' });
          } else if (
            nameLower.endsWith('.exe') &&
            /\b(?:update|patch|hotfix)\b/i.test(nameLower.replace(/[\._\-]/g, ' ')) &&
            !nameLower.includes('setup') &&
            !nameLower.includes('uninst') &&
            !nameLower.includes('crash') &&
            !nameLower.includes('helper')
          ) {
            results.push({ path: fullPath, name: entry.name, type: 'update' });
          } else if (nameLower.endsWith('.exe') && /\b(?:dlc|addon)\b/i.test(nameLower.replace(/[\._\-]/g, ' ')) && !nameLower.includes('setup')) {
            results.push({ path: fullPath, name: entry.name, type: 'dlc' });
          } else if (
            nameLower.endsWith('.exe') &&
            !nameLower.includes('setup') &&
            !nameLower.includes('uninst') &&
            !nameLower.includes('crash') &&
            !nameLower.includes('helper') &&
            !nameLower.includes('check') &&
            !nameLower.includes('hash') &&
            !nameLower.includes('redist')
          ) {
            hasExe = true;
            if (depth === 1 && includeAllFiles) {
              results.push({ path: fullPath, name: entry.name, type: 'pc_game' });
            }
          } else if (includeAllFiles) {
            const isMetadataOrArtwork =
              nameLower === 'folder.jpg' ||
              nameLower === 'cover.jpg' ||
              nameLower === 'icon.ico' ||
              nameLower === '.otix' ||
              ['.jpg', '.jpeg', '.png', '.webp', '.ico', '.txt', '.nfo', '.ini', '.xml', '.json', '.db', '.log', '.otix'].includes(ext);
            const isNoise =
              isMetadataOrArtwork ||
              nameLower === 'thumbs.db' ||
              nameLower === 'desktop.ini' ||
              nameLower === '.ds_store' ||
              nameLower.startsWith('._') ||
              nameLower.endsWith('.tmp') ||
              nameLower.endsWith('.part');
            if (!isNoise) {
              results.push({ path: fullPath, name: entry.name, type: 'file' });
            }
          }
        }
      }

      // If a subfolder contains game executables, mark as PC game folder if not already captured
      if (depth > 1 && hasExe) {
        if (!results.some((r) => r.path.toLowerCase() === currentDir.toLowerCase())) {
          const currentSubdirs = entries
            .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name.toLowerCase()))
            .map((e) => e.name);
          results.push({
            path: currentDir,
            name: path.basename(currentDir),
            type: 'pc_game',
            subdirectories: currentSubdirs.length > 0 ? currentSubdirs : undefined,
          });
        }
        // Once this directory is identified as a game package, do not recurse into its internal subdirectories!
        return;
      }

      // Recurse into child dirs
      for (const childDir of childDirs) {
        await traverse(childDir, depth + 1);
      }
    } catch {
      // Permission errors, etc. — skip silently
    }
  }

  await traverse(dirPath, 1);
  return results;
}

// ── Template application ────────────────────────────────────────────────────

// Re-export naming template utilities from canonical game/parser
export { applyNamingTemplate, validateNamingTemplate, getFolderTemplate, sanitizePathSegment, VALID_TOKENS };

/**
 * Resolves the canonical platform from a `.otix` sidecar.
 * Prioritizes PC/Windows whenever present in platforms; only falls back to console platforms
 * if PC is not supported or if explicit console files are detected.
 */
export function resolveSidecarPlatform(sc: any, fallback: string = 'PC'): string {
  if (sc && Array.isArray(sc.platforms) && sc.platforms.length > 0) {
    // 1. Prioritize PC if present anywhere in platforms
    const hasPc = sc.platforms.some((p: any) => {
      const name = String(p?.name || (typeof p === 'string' ? p : '')).toUpperCase();
      const slug = String(p?.slug || (typeof p === 'string' ? p : '')).toUpperCase();
      return (
        name.includes('PC') ||
        name.includes('WINDOWS') ||
        name.includes('LINUX') ||
        name.includes('MAC') ||
        slug.includes('WIN') ||
        slug.includes('PC') ||
        slug.includes('LINUX') ||
        slug.includes('MAC')
      );
    });
    if (hasPc) return 'PC';

    // 2. If no PC platform, check console platforms in order of specificity
    for (const p of sc.platforms) {
      const name = String(p?.name || (typeof p === 'string' ? p : '')).toUpperCase();
      const slug = String(p?.slug || (typeof p === 'string' ? p : '')).toUpperCase();
      const combined = `${name} ${slug}`;
      if (combined.includes('SWITCH') || combined.includes('NSW')) return 'Switch';
      if (combined.includes('PS5') || combined.includes('PLAYSTATION 5') || combined.includes('PLAYSTATION-5')) return 'PS5';
      if (combined.includes('PS4') || combined.includes('PLAYSTATION 4') || combined.includes('PLAYSTATION-4')) return 'PS4';
      if (combined.includes('PS3') || combined.includes('PLAYSTATION 3') || combined.includes('PLAYSTATION-3')) return 'PS3';
      if (combined.includes('3DS')) return '3DS';
      if (combined.includes('WII U') || combined.includes('WIIU') || combined.includes('WII-U')) return 'WiiU';
      if (combined.includes('WII')) return 'Wii';
      if (combined.includes('XBOX 360') || combined.includes('XBOX-360') || combined.includes('XBOX360')) return 'Xbox360';
      if (combined.includes('XBOX ONE') || combined.includes('XBOX-ONE') || combined.includes('XBOX SERIES') || combined.includes('SERIES-X')) return 'Xbox';
      if (combined.includes('XBOX')) return 'Xbox';
    }
  }
  return fallback;
}

/**
 * Smart-preview a directory using parseReleaseName + naming template.
 * Returns OrganizationPreviewItem[] compatible with executeOrganization.
 */
export async function smartOrganizePreview(
  directory: string,
  namingTemplate: string,
  separator?: 'space' | 'dot' | 'underscore' | 'dash',
): Promise<OrganizationPreviewItem[]> {
  if (!directory || !directory.trim()) {
    return [];
  }
  let content: DownloadedContent[] = [];
  try {
    content = await findDownloadedContent(directory, 5, true);
  } catch (err: any) {
    if (err?.code === 'ENOENT' || err?.message?.includes('Folder does not exist')) {
      return [];
    }
    throw err;
  }
  const items: OrganizationPreviewItem[] = [];

  for (const item of content) {
    const parentDirRaw = path.basename(path.dirname(item.path)).toLowerCase();
    const isAuxiliaryFolder = ['updates', 'dlc', 'crack', 'cracks'].includes(parentDirRaw);
    let parentName = path.basename(path.dirname(item.path));
    if (isAuxiliaryFolder) {
      const grandParent = path.basename(path.dirname(path.dirname(item.path)));
      if (grandParent && grandParent !== '.' && !grandParent.startsWith('..')) {
        parentName = grandParent;
      }
    }
    const release = parseReleaseName(item.name, undefined, parentName);
    if (isAuxiliaryFolder && parentName) {
      const pRel = parseReleaseName(parentName);
      if (pRel.title) {
        release.title = pRel.title;
        release.cleanTitle = pRel.cleanTitle;
      }
    }
    if (item.platform) {
      release.platform = item.platform;
    }

    // Infer platform from ancestor path if tagged [PC], [Switch], etc.
    const normPath = item.path.replace(/\\/g, '/');
    if (/(?:^|\/)\[PC\](?:\/|$)/i.test(normPath) || /(?:^|\/)\(PC\)(?:\/|$)/i.test(normPath)) {
      release.platform = 'PC';
    } else if (/(?:^|\/)\[Switch\](?:\/|$)/i.test(normPath) || /(?:^|\/)\(Switch\)(?:\/|$)/i.test(normPath)) {
      release.platform = 'Switch';
    } else if (/(?:^|\/)\[PS5\](?:\/|$)/i.test(normPath) || /(?:^|\/)\(PS5\)(?:\/|$)/i.test(normPath)) {
      release.platform = 'PS5';
    } else if (/(?:^|\/)\[PS4\](?:\/|$)/i.test(normPath) || /(?:^|\/)\(PS4\)(?:\/|$)/i.test(normPath)) {
      release.platform = 'PS4';
    } else if (/(?:^|\/)\[PS3\](?:\/|$)/i.test(normPath) || /(?:^|\/)\(PS3\)(?:\/|$)/i.test(normPath)) {
      release.platform = 'PS3';
    }

    let title = release.title;

    // For update files, strip sequence prefixes, update/patch noise and version digits from title
    if (item.type === 'update') {
      title = cleanGameTitle(title || item.name) || title;
    }

    // Apply separator to title
    if (separator && separator !== 'space') {
      const sepChar = separator === 'dot' ? '.' : separator === 'underscore' ? '_' : '-';
      title = title.replace(/\s+/g, sepChar);
    }

    const cleanTitle = (title || '').trim();
    if (!cleanTitle) {
      // Cannot organize an item with no game title
      continue;
    }

    // Default platform to PC if still unset
    if (!release.platform) {
      release.platform = 'PC';
    }

    const fileInfo: FileInfo = {
      name: item.name,
      ext: path.extname(item.name).substring(1),
      type: item.type,
    };

    if (item.type === 'pc_game') {
      try {
        let otixPath = path.join(item.path, '.otix');
        try {
          await fs.access(otixPath);
        } catch {
          const children = await fs.readdir(item.path, { withFileTypes: true });
          const nonNoiseDirs = children.filter(
            (c) => c.isDirectory() && !SKIP_DIRS.has(c.name.toLowerCase()) && !c.name.startsWith('.') && !c.name.startsWith('$')
          );
          // Only check child directory if there is EXACTLY ONE child directory.
          if (nonNoiseDirs.length === 1) {
            const deepOtix = path.join(item.path, nonNoiseDirs[0].name, '.otix');
            try {
              await fs.access(deepOtix);
              otixPath = deepOtix;
            } catch {}
          }
        }
        const otixRaw = await fs.readFile(otixPath, 'utf8');
        const sc = JSON.parse(otixRaw);
        if (sc.title) {
          const otixTitle = cleanGameTitle(sc.title);
          if (otixTitle) {
            title = otixTitle;
            release.title = otixTitle;
            release.cleanTitle = otixTitle;
          }
        }
        const sidecarPlat = resolveSidecarPlatform(sc, release.platform || 'PC');
        if (item.platform) {
          // Explicit console folder detected from structure
          release.platform = item.platform;
        } else if (sidecarPlat === 'PC' || !release.platform) {
          release.platform = 'PC';
        }
      } catch {}
    }

    const safeTitle = sanitizePathSegment(cleanTitle);
    const folderTemplate = getFolderTemplate(namingTemplate);
    const gameFolderTarget = applyNamingTemplate(
      { ...release, title: safeTitle, platform: release.platform || 'PC' },
      folderTemplate,
      fileInfo,
      directory,
    );

    let targetRaw = '';
    if (item.type === 'update') {
      const isContainerName = item.name.toLowerCase() === 'updates' || item.name.toLowerCase() === 'update';
      targetRaw = isContainerName
        ? path.join(gameFolderTarget, 'Updates')
        : path.join(gameFolderTarget, 'Updates', item.name);
    } else if (item.type === 'dlc') {
      const isContainerName = item.name.toLowerCase() === 'dlc' || item.name.toLowerCase() === 'dlcs';
      targetRaw = isContainerName
        ? path.join(gameFolderTarget, 'DLC')
        : path.join(gameFolderTarget, 'DLC', item.name);
    } else if (item.type === 'crack') {
      const isContainerName = item.name.toLowerCase() === 'crack' || item.name.toLowerCase() === 'cracks';
      targetRaw = isContainerName
        ? path.join(gameFolderTarget, 'Crack')
        : path.join(gameFolderTarget, 'Crack', item.name);
    } else if (item.type === 'archive_part') {
      targetRaw = path.join(gameFolderTarget, item.name);
    } else if (item.type === 'pc_game') {
      targetRaw = gameFolderTarget;
    } else if (item.type === 'file') {
      targetRaw = path.join(gameFolderTarget, item.name);
    } else {
      targetRaw = applyNamingTemplate({ ...release, title: safeTitle, platform: release.platform || 'PC' }, namingTemplate, fileInfo, directory);
    }

    const mappedType: string =
      item.type === 'update'
        ? 'update'
        : item.type === 'dlc'
          ? 'dlc'
          : item.type === 'crack'
            ? 'crack'
            : item.type === 'archive_part'
              ? 'archive_part'
              : item.type === 'rom'
                ? 'rom'
                : item.type === 'pc_game'
                  ? 'container_package'
                  : item.type === 'file'
                    ? 'file'
                    : 'iso';

    let status = 'rename_and_move';
    if (mappedType === 'container_package') status = 'container_package';
    else if (mappedType === 'update') status = 'secondary_update';
    else if (mappedType === 'dlc') status = 'secondary_dlc';
    else if (mappedType === 'crack') status = 'secondary_crack';
    else if (mappedType === 'archive_part') status = 'secondary_archive_part';

    const normSrc = path.resolve(item.path).toLowerCase();
    const normDst = path.resolve(targetRaw).toLowerCase();

    if (normSrc === normDst) {
      status = 'already_organized';
    } else if (normDst.startsWith(normSrc + path.sep.toLowerCase())) {
      status = 'conflict';
    } else {
      try {
        const dstStat = await fs.stat(targetRaw);
        if (dstStat.isDirectory()) {
          const entries = await fs.readdir(targetRaw);
          if (entries.length > 0) {
            status = 'conflict';
          }
        } else {
          status = 'conflict';
        }
      } catch {
        // Target does not exist, good
      }
    }

    const foldersToCreate: string[] = [];
    const targetDir = path.dirname(targetRaw);
    if (targetDir && targetDir !== directory) {
      foldersToCreate.push(path.relative(directory, targetDir));
    }

    let relSourceDir = '';
    try {
      relSourceDir = path.relative(directory, path.dirname(item.path));
    } catch {}
    const sourceSubdirectory =
      relSourceDir && relSourceDir !== '.' && !relSourceDir.startsWith('..')
        ? relSourceDir.split(path.sep).join('/')
        : undefined;

    let relTargetDir = '';
    try {
      relTargetDir = path.relative(directory, targetDir);
    } catch {}
    const targetSubdirectory =
      relTargetDir && relTargetDir !== '.' && !relTargetDir.startsWith('..')
        ? relTargetDir.split(path.sep).join('/')
        : undefined;

    items.push({
      sourcePath: item.path,
      sourceFilename: item.name,
      type: mappedType,
      matched: true,
      extracted: {
        Title: release.title,
        Year: release.year ?? '',
        Platform: release.platform ?? (mappedType === 'rom' ? '' : 'PC'),
        ReleaseGroup: release.group ?? '',
        Edition: release.edition ?? '',
        Version: release.version ?? '',
      },
      targetPath: targetRaw,
      status,
      foldersToCreate,
      anomalies: item.integrity?.anomalies.map((a) => a.message),
      suggestedRenames: item.integrity?.suggestedRenames,
      health: item.integrity?.health,
      sourceSubdirectory,
      targetSubdirectory,
      subdirectories: item.subdirectories,
    });
  }

  return items;
}

/**
 * Preview what a template would produce for a sample release name.
 */
export function previewNamingTemplate(
  template: string,
  sampleName: string,
): { valid: boolean; result?: string; error?: string } {
  const validation = validateNamingTemplate(template);
  if (!validation.valid) return validation;

  const release = parseReleaseName(sampleName);
  const ext = sampleName.includes('.iso') ? 'iso' : 'exe';
  const fileInfo: FileInfo = { name: sampleName, ext, type: 'iso' };
  const target = applyNamingTemplate(release, template, fileInfo, '/');
  return { valid: true, result: target.replace(/^\//, '') };
}

/**
 * Batch-organize all game files in a directory using configured naming template.
 *
 * Scans for ISOs + update files, parses each name, applies the template,
 * and moves files. Unlike autoOrganizeDownload, this takes a raw directory
 * path (not a download ID) — for manually organizing existing libraries.
 */
export async function batchOrganizeDirectory(
  directory: string,
  namingTemplate?: string,
): Promise<AutoOrganizeResult> {
  const result: AutoOrganizeResult = { success: false, organized: [], errors: [] };

  // Load template from config if not provided
  let template: string = namingTemplate ?? '';
  if (!template) {
    const cfg = db().prepare('SELECT naming_template FROM download_configs ORDER BY updated_at DESC LIMIT 1').get() as any;
    template = cfg?.naming_template || NAMING_PRESETS.standard.template;
  }

  const validation = validateNamingTemplate(template);
  if (!validation.valid) {
    result.errors.push(validation.error || 'Invalid naming template');
    return result;
  }

  try {
    await fs.access(directory);
  } catch {
    result.errors.push('Directory not accessible');
    return result;
  }

  // Find all content
  const content = await findDownloadedContent(directory, 5);
  if (content.length === 0) {
    result.errors.push('No game files found in directory');
    return result;
  }

  // Build organize items
  const organizeItems: { sourcePath: string; targetPath: string }[] = [];

  for (const item of content) {
    const parentDirRaw = path.basename(path.dirname(item.path)).toLowerCase();
    const isAuxiliaryFolder = ['updates', 'dlc', 'crack', 'cracks'].includes(parentDirRaw);
    let parentName = path.basename(path.dirname(item.path));
    if (isAuxiliaryFolder) {
      const grandParent = path.basename(path.dirname(path.dirname(item.path)));
      if (grandParent && grandParent !== '.' && !grandParent.startsWith('..')) {
        parentName = grandParent;
      }
    }
    const release = parseReleaseName(item.name, undefined, parentName);
    if (isAuxiliaryFolder && parentName) {
      const pRel = parseReleaseName(parentName);
      if (pRel.title) {
        release.title = pRel.title;
        release.cleanTitle = pRel.cleanTitle;
      }
    }
    if (item.platform) {
      release.platform = item.platform;
    }
    if (item.type === 'update') {
      release.title = cleanGameTitle(release.title || item.name) || release.title;
    }
    let fileInfo: FileInfo;
    let target: string;

    if (item.type === 'pc_game') {
      if (item.integrity && Object.keys(item.integrity.suggestedRenames).length > 0) {
        try {
          await healRepackArchive(item.path);
        } catch (healErr) {
          console.warn(`[batchOrganizeDirectory] Auto-heal warning for ${item.path}:`, healErr);
        }
      }
      fileInfo = { name: item.name, ext: '', type: 'pc_game' };
      const folderTemplate = getFolderTemplate(template);
      target = applyNamingTemplate(release, folderTemplate, fileInfo, directory);
      organizeItems.push({ sourcePath: item.path, targetPath: target });
    } else {
      const folderTemplate = getFolderTemplate(template);
      const gameFolderTarget = applyNamingTemplate(release, folderTemplate, { name: item.name, ext: '', type: 'pc_game' }, directory);
      if (item.type === 'crack') {
        target = path.join(gameFolderTarget, 'Crack', item.name);
        organizeItems.push({ sourcePath: item.path, targetPath: target });
      } else if (item.type === 'update') {
        target = path.join(gameFolderTarget, 'Updates', item.name);
        organizeItems.push({ sourcePath: item.path, targetPath: target });
      } else if (item.type === 'dlc') {
        target = path.join(gameFolderTarget, 'DLC', item.name);
        organizeItems.push({ sourcePath: item.path, targetPath: target });
      } else if (item.type === 'archive_part') {
        target = path.join(gameFolderTarget, item.name);
        organizeItems.push({ sourcePath: item.path, targetPath: target });
      } else {
        fileInfo = {
          name: item.name,
          ext: path.extname(item.name).substring(1),
          type: item.type,
        };
        target = applyNamingTemplate(release, template, fileInfo, directory);
        organizeItems.push({ sourcePath: item.path, targetPath: target });
      }
    }
  }

  // Execute
  const execResults = await executeOrganization(organizeItems);

  for (const r of execResults) {
    if (r.success) {
      result.organized.push({ from: r.sourcePath, to: r.targetPath, type: 'game' });
    } else {
      result.errors.push(r.error || `Failed to move ${r.sourcePath}`);
    }
  }

  result.success = result.errors.length === 0;
  return result;
}

/**
 * Preview what batchOrganizeDirectory would do (no file moves).

// ── Organizer ────────────────────────────────────────────────────────────────

/**
 * Main entry point: organize a completed download.
 *
 * Called from postProcessDownload() when autoOrganizeEnabled.
 */
export async function autoOrganizeDownload(
  downloadId: string,
  configId: string,
  fallbackSource?: string,
  fallbackDest?: string,
): Promise<AutoOrganizeResult> {
  const result: AutoOrganizeResult = { success: false, organized: [], errors: [] };

  const dl = db().prepare('SELECT * FROM downloads WHERE id = ? AND status = ?').get(downloadId, 'completed') as any;
  if (!dl) {
    result.errors.push('Download not found or not completed');
    return result;
  }

  // Get config for template settings
  const config = db().prepare('SELECT * FROM download_configs WHERE id = ?').get(configId) as any;
  const namingTemplate: string = config?.naming_template || NAMING_PRESETS.standard.template;

  // Build path translation pairs (same logic as postProcessDownload)
  const mappings = db().prepare(
    'SELECT source_path, dest_path FROM download_path_mappings WHERE config_id = ?'
  ).all(configId) as { source_path: string; dest_path: string }[];
  const pairs: { source: string; dest: string }[] = mappings.map(m => ({
    source: m.source_path,
    dest: m.dest_path,
  }));
  if (pairs.length === 0 && fallbackSource && fallbackDest) {
    pairs.push({ source: fallbackSource, dest: fallbackDest });
  }

  if (pairs.length === 0) {
    result.errors.push('No path mappings configured');
    return result;
  }

  const nzbName: string = dl.nzb_name ?? '';
  const baseName = path.basename(nzbName, path.extname(nzbName));

  // Translate source path (same as postProcessDownload translatePath)
  function translatePath(originalPath: string, pair: { source: string; dest: string }): string | null {
    const normPath = originalPath.replace(/[/\\]/g, path.sep);
    const normSource = pair.source.replace(/[/\\]/g, path.sep);
    const normDest = pair.dest.replace(/[/\\]/g, path.sep);
    if (normPath.startsWith(normSource)) {
      return normDest + normPath.substring(normSource.length);
    }
    return null;
  }

  // Find content in download location
  const sourceCandidates: string[] = [];
  for (const pair of pairs) {
    sourceCandidates.push(
      path.join(pair.source, baseName),
      path.join(pair.source, `_UNPACK_${baseName}`),
      path.join(pair.source, nzbName),
    );
    if (dl.iso_path) sourceCandidates.unshift(dl.iso_path);
  }

  let allContent: DownloadedContent[] = [];
  let effectiveDest = fallbackDest || pairs[0]?.dest || '';

  for (const candidate of sourceCandidates) {
    for (const pair of pairs) {
      const translated = translatePath(candidate, pair);
      const dirToScan = translated || candidate;
      try {
        await fs.access(dirToScan);
        const contents = await findDownloadedContent(dirToScan);
        allContent.push(...contents);
        effectiveDest = pair.dest;
      } catch {
        // dir not accessible, try next candidate
      }
    }
  }

  // Deduplicate content by path
  const seenPaths = new Set<string>();
  allContent = allContent.filter(c => {
    if (seenPaths.has(c.path)) return false;
    seenPaths.add(c.path);
    return true;
  });

  if (allContent.length === 0) {
    result.errors.push('No downloadable content found in download directory');
    return result;
  }

  // Parse release name
  const release = parseReleaseName(baseName);

  // For each content item, generate target path and organize
  const organizeItems: { sourcePath: string; targetPath: string }[] = [];

  for (const content of allContent) {
    let fileInfo: FileInfo;
    let targetDir: string;
    const itemRelease = { ...release };
    if (content.platform) {
      itemRelease.platform = content.platform;
    }

    const folderTemplate = getFolderTemplate(namingTemplate);
    const gameFolderTarget = applyNamingTemplate(
      { ...itemRelease, title: itemRelease.title || content.name },
      folderTemplate,
      fileInfo,
      effectiveDest,
    );

    if (content.type === 'pc_game') {
      // PC game folder: move entire folder
      targetDir = gameFolderTarget;
      organizeItems.push({ sourcePath: content.path, targetPath: targetDir });
    } else if (content.type === 'crack') {
      const target = path.join(gameFolderTarget, 'Crack', content.name);
      organizeItems.push({ sourcePath: content.path, targetPath: target });
    } else if (content.type === 'archive_part') {
      const target = path.join(gameFolderTarget, content.name);
      organizeItems.push({ sourcePath: content.path, targetPath: target });
    } else if (content.type === 'update') {
      const target = path.join(gameFolderTarget, 'Updates', content.name);
      organizeItems.push({ sourcePath: content.path, targetPath: target });
    } else if (content.type === 'dlc') {
      const target = path.join(gameFolderTarget, 'DLC', content.name);
      organizeItems.push({ sourcePath: content.path, targetPath: target });
    } else {
      // File-based (ISO, ROM, executable)
      fileInfo = {
        name: content.name,
        ext: path.extname(content.name).substring(1),
        type: content.type,
      };
      const target = applyNamingTemplate(itemRelease, namingTemplate, fileInfo, effectiveDest);
      organizeItems.push({ sourcePath: content.path, targetPath: target });
    }
  }

  // Execute organization
  const execResults = await executeOrganization(organizeItems);

  // Collect results
  for (const r of execResults) {
    if (r.success) {
      result.organized.push({ from: r.sourcePath, to: r.targetPath, type: 'game' });
    } else {
      result.errors.push(r.error || `Failed to move ${r.sourcePath}`);
    }
  }

  // Update DB with organized paths
  if (result.organized.length > 0) {
    const movedPaths = result.organized.map(m => m.to).join(';');
    db().prepare("UPDATE downloads SET iso_path = ?, updated_at = datetime('now') WHERE id = ?").run(movedPaths, downloadId);
  }

  result.success = result.errors.length === 0;
  return result;
}

export { diagnoseArchiveIntegrity, healRepackArchive };
