import { app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getBestIconUrl, getBestGridUrl } from './steamgrid';

export interface DetectedGame {
  id: string;
  title: string;
  exePath: string;
  localExePath?: string;
  installDir: string;
  platform: 'steam' | 'pc' | 'iso' | 'epic' | 'gog' | 'battlenet' | 'ubisoft' | 'ea' | 'riot' | 'xbox' | 'itch';
  iconUrl?: string; // base64 data URL or SGDB icon URL
  posterUrl?: string; // SGDB grid (cover/poster) URL
  updateFiles?: { name: string; path: string }[];
}

// Simple ACF parser for Steam manifest files
function parseAcf(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const matches = content.matchAll(/"([^"]+)"\s+"([^"]+)"/g);
  for (const match of matches) {
    result[match[1]] = match[2];
  }
  return result;
}

// Generate a unique, deterministic ID for non-steam games based on file path
function generateId(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return 'pc_' + Math.abs(hash).toString(36);
}

export function cleanGameTitle(filename: string): string {
  let name = filename.replace(/\.iso$/i, '');
  // Replace dots, underscores, dashes with spaces
  name = name.replace(/[\._\-]/g, ' ');
  // Remove common scene tags and release descriptors (case-insensitive)
  const tags = [
    /\[repack\]/gi, /\brepack\b/gi, /\belamigos\b/gi, /\bfitgirl\b/gi, /\bdodi\b/gi,
    /\bcodex\b/gi, /\bflt\b/gi, /\bplaza\b/gi, /\bskidrow\b/gi, /\brune\b/gi, /\btenoke\b/gi,
    /\bgoldberg\b/gi, /\brazor1911\b/gi, /\bfairlight\b/gi, /\bhoodlum\b/gi,
    /\bmulti\d+\b/gi, /\bvoices\d*\b/gi, /\bv\d+(\.\d+)*\b/gi, /\bbuild\s*\d+\b/gi, /\bupdate\s*\d*\b/gi,
    /\bhbg\b/gi, /\bdlc\b/gi, /\bgog\b/gi, /\bcrack\b/gi
  ];
  for (const tag of tags) {
    name = name.replace(tag, '');
  }
  // Remove empty brackets and parentheses, or brackets/parentheses containing only spaces or non-word symbols
  name = name.replace(/\[\s*\]/g, '');
  name = name.replace(/\(\s*\)/g, '');
  name = name.replace(/\{\s*\}/g, '');
  // Remove dangling trailing punctuation symbols
  name = name.replace(/[\s\-\+\:\,]+$/, '');
  // Clean double spaces and trim
  return name.replace(/\s+/g, ' ').trim();
}

const IGNORED_DIRS = new Set([
  'node_modules', 'bower_components', '.git', '.github', '.svn', '.hg',
  'system32', 'syswow64', 'windows', 'microsoft.net', 'appdata',
  'obj', 'bin', '__pycache__', '.venv', 'venv', 'env', 'windowsapps'
]);

// Find all ISO files in a folder recursively up to a depth limit
async function findIsos(dir: string, maxDepth = 3, onWalk?: (subDir: string) => void): Promise<string[]> {
  const isos: string[] = [];
  console.log(`[findIsos] Starting scan in directory: "${dir}" with maxDepth: ${maxDepth}`);
  
  async function traverse(currentDir: string, depth: number) {
    if (depth > maxDepth) {
      console.log(`[findIsos] Reached max depth ${maxDepth} at: "${currentDir}"`);
      return;
    }
    onWalk?.(currentDir);
    try {
      console.log(`[findIsos] Reading directory: "${currentDir}" (depth: ${depth})`);
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      console.log(`[findIsos] Found ${entries.length} entries in: "${currentDir}"`);
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const isDir = entry.isDirectory();
        const isFile = entry.isFile();
        const isSymlink = entry.isSymbolicLink();
        
        console.log(`  - Entry: "${entry.name}" | isDir: ${isDir} | isFile: ${isFile} | isSymlink: ${isSymlink}`);
        
        if (isDir) {
          const nameLower = entry.name.toLowerCase();
          if (nameLower.startsWith('$') || IGNORED_DIRS.has(nameLower)) {
            console.log(`    [findIsos] Skipping ignored directory: "${entry.name}"`);
            continue;
          }
          await traverse(fullPath, depth + 1);
        } else if (isFile || isSymlink) {
          if (entry.name.toLowerCase().endsWith('.iso')) {
            console.log(`    [findIsos] MATCHED ISO: "${fullPath}"`);
            isos.push(fullPath);
          }
        }
      }
    } catch (err: any) {
      console.error(`[findIsos] Error reading directory: "${currentDir}"`, err);
    }
  }
  
  await traverse(dir, 1);
  console.log(`[findIsos] Scan complete for: "${dir}". Found ${isos.length} ISO(s):`, isos);
  return isos;
}

// Find all update files for a given ISO in its parent/sibling/child folders
export async function findUpdateFilesForIso(isoPath: string): Promise<{ name: string; path: string }[]> {
  const updates: { name: string; path: string }[] = [];
  const visited = new Set<string>();

  // Helper to scan a folder recursively (up to depth 2) for setup/update exes
  async function scanFolder(folderPath: string, depth: number) {
    if (depth > 2) return;
    try {
      const entries = await fs.readdir(folderPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(folderPath, entry.name);
        if (entry.isDirectory()) {
          const nameLower = entry.name.toLowerCase();
          if (nameLower.startsWith('$') || IGNORED_DIRS.has(nameLower)) continue;
          await scanFolder(fullPath, depth + 1);
        } else if (entry.isFile() || entry.isSymbolicLink()) {
          const nameLower = entry.name.toLowerCase();
          if (nameLower.endsWith('.exe') && (nameLower.includes('update') || nameLower.includes('patch'))) {
            // Filter out files that are obviously setup.exe or uninstalls or crash tools
            if (
              nameLower.includes('setup') ||
              nameLower.includes('uninst') ||
              nameLower.includes('crash') ||
              nameLower.includes('helper')
            ) {
              continue;
            }
            if (!visited.has(fullPath)) {
              visited.add(fullPath);
              updates.push({
                name: entry.name,
                path: fullPath
              });
            }
          }
        }
      }
    } catch {
      // ignore errors
    }
  }

  const isoDir = path.dirname(isoPath);
  const isoParentDir = path.dirname(isoDir);

  const foldersToScan = new Set<string>();
  
  // 1. Sibling folders of the ISO's directory (e.g. check standard Updates folder next to the ISO's folder)
  try {
    const parentEntries = await fs.readdir(isoParentDir, { withFileTypes: true });
    for (const ent of parentEntries) {
      if (ent.isDirectory()) {
        const nameLower = ent.name.toLowerCase();
        if (nameLower.includes('update') || nameLower.includes('patch')) {
          foldersToScan.add(path.join(isoParentDir, ent.name));
        }
      }
    }
  } catch {}

  // 2. Sibling folders of the ISO's parent folder (grandparent sibling folders)
  const grandParentDir = path.dirname(isoParentDir);
  try {
    const grandParentEntries = await fs.readdir(grandParentDir, { withFileTypes: true });
    for (const ent of grandParentEntries) {
      if (ent.isDirectory()) {
        const nameLower = ent.name.toLowerCase();
        if (nameLower.includes('update') || nameLower.includes('patch')) {
          foldersToScan.add(path.join(grandParentDir, ent.name));
        }
      }
    }
  } catch {}

  // 3. The ISO's directory itself and any subfolder inside it containing "update" or "patch"
  foldersToScan.add(isoDir);
  try {
    const subEntries = await fs.readdir(isoDir, { withFileTypes: true });
    for (const ent of subEntries) {
      if (ent.isDirectory()) {
        const nameLower = ent.name.toLowerCase();
        if (nameLower.includes('update') || nameLower.includes('patch')) {
          foldersToScan.add(path.join(isoDir, ent.name));
        }
      }
    }
  } catch {}

  // Scan all unique candidate folders
  for (const folder of foldersToScan) {
    await scanFolder(folder, 1);
  }

  // Sort updates by name numerically so that version order is correct (e.g. update 1.12 before 1.13)
  updates.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  return updates;
}

// Find all executable files in a folder recursively up to a depth limit
async function findExecutables(dir: string, maxDepth = 5, onWalk?: (subDir: string) => void): Promise<string[]> {
  const exes: string[] = [];
  
  async function traverse(currentDir: string, depth: number) {
    if (depth > maxDepth) return;
    onWalk?.(currentDir);
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          const nameLower = entry.name.toLowerCase();
          if (nameLower.startsWith('$') || IGNORED_DIRS.has(nameLower)) continue;
          await traverse(fullPath, depth + 1);
        } else if (entry.isFile()) {
          if (entry.name.toLowerCase().endsWith('.exe')) {
            exes.push(fullPath);
          }
        }
      }
    } catch (err) {
      // Ignore reading / permission errors silently
    }
  }
  
  await traverse(dir, 1);
  return exes;
}

// Pick the best executable among candidates using heuristics (size, install directory matching)
export async function pickBestExe(exes: string[], installDirName: string): Promise<string | null> {
  if (exes.length === 0) return null;
  if (exes.length === 1) return exes[0];

  const cleanInstallDir = installDirName.toLowerCase().replace(/[^a-z0-9]/g, '');

  let bestExe: string | null = null;
  let bestScore = -1;

  for (const exe of exes) {
    const exeName = path.basename(exe, '.exe').toLowerCase();
    
    // Ignore obvious utility and dependency files
    if (
      exeName.includes('crash') ||
      exeName.includes('unins') ||
      exeName.includes('setup') ||
      exeName.includes('redist') ||
      exeName.includes('config') ||
      exeName.includes('tool') ||
      exeName.includes('cef') ||
      exeName.includes('helper') ||
      exeName.includes('register') ||
      exeName.includes('patch')
    ) {
      continue;
    }

    let score = 0;

    // Bonus for Unreal Engine "Shipping" executables (actual game binary)
    if (exeName.includes('shipping')) score += 80;

    // Bonus for exes in subdirectories (binary is often in Binaries/ subfolder)
    const pathLower = exe.toLowerCase()
    const fnLower = installDirName.toLowerCase()
    const folderIdx = pathLower.indexOf(fnLower)
    if (folderIdx >= 0) {
      const afterFolder = pathLower.substring(folderIdx + fnLower.length)
      const sepCount = (afterFolder.match(/[\\/]/g) || []).length
      if (sepCount > 1) score += 30 // exe is in a subfolder, not the root game dir
    }

    // Exact or close match to folder name
    if (exeName === cleanInstallDir || exeName === installDirName.toLowerCase()) {
      score += 100;
    } else if (exeName.includes(cleanInstallDir) || cleanInstallDir.includes(exeName)) {
      score += 50;
    }

    // Size check: larger files are likely the main game executable
    try {
      const stats = await fs.stat(exe);
      const sizeMb = stats.size / (1024 * 1024);
      score += Math.min(30, Math.floor(sizeMb));
    } catch {
      // Ignore stat error
    }

    if (score > bestScore) {
      bestScore = score;
      bestExe = exe;
    }
  }

  return bestExe;
}

interface IconDataResult {
  iconUrl?: string;
  posterUrl?: string;
}

// Get icon and poster for a game — native Electron file icon with SteamGridDB fallback
async function getIconDataUrl(exePath: string, title?: string): Promise<IconDataResult> {
  const result: IconDataResult = {};

  // 1. Native file icon
  try {
    const icon = await app.getFileIcon(exePath, { size: 'large' });
    result.iconUrl = icon.toDataURL();
  } catch {
    // Native icon failed — try SteamGridDB if we have a title
  }

  // 2. SteamGridDB fallbacks
  if (title) {
    // Icon fallback
    if (!result.iconUrl) {
      try {
        const url = await getBestIconUrl(title);
        if (url) result.iconUrl = url;
      } catch (err) {
        console.error('SteamGridDB icon lookup failed for', title, err);
      }
    }

    // Poster (grid) — always try to get cover art
    try {
      const posterUrl = await getBestGridUrl(title);
      if (posterUrl) result.posterUrl = posterUrl;
    } catch (err) {
      console.error('SteamGridDB grid lookup failed for', title, err);
    }
  }

  return result;
}

// Resolve the parent game folder, skipping subdirectories like 'bin', 'x64', 'engine', etc.
function getGameFolder(exePath: string, searchRoot: string): string {
  let current = path.dirname(exePath);
  const rootLower = searchRoot.toLowerCase();
  
  const SUB_FOLDERS_TO_SKIP = new Set([
    'bin', 'x64', 'win64', 'x86', 'win32', 'release', 'build', 'dist', 
    'engine', 'win-unpacked', 'launcher', 'subsystem'
  ]);
  
  while (current.toLowerCase() !== rootLower) {
    const parent = path.dirname(current);
    const folderName = path.basename(current).toLowerCase();
    
    if (SUB_FOLDERS_TO_SKIP.has(folderName)) {
      current = parent;
    } else {
      break;
    }
  }
  
  return current;
}

// Scans directories for Steam library manifests and/or PC game executables
export async function scanPaths(
  scanDirectories: string[],
  isoDirectories: string[],
  onProgress?: (data: { currentDir: string; progress: number }) => void
): Promise<DetectedGame[]> {
  const games: DetectedGame[] = [];
  const totalPaths = scanDirectories.length + isoDirectories.length;
  let currentPathIndex = 0;

  // 1. Scan Installed Games (Steam & PC folders)
  for (const dir of scanDirectories) {
    currentPathIndex++;
    const baseProgress = Math.round(((currentPathIndex - 1) / totalPaths) * 100);
    const nextProgress = Math.round((currentPathIndex / totalPaths) * 100);

    onProgress?.({
      currentDir: dir,
      progress: baseProgress,
    });

    try {
      const stat = await fs.stat(dir);
      if (!stat.isDirectory()) continue;

      let steamappsPath: string | null = null;
      
      const filesInDir = await fs.readdir(dir);
      if (filesInDir.includes('steamapps')) {
        steamappsPath = path.join(dir, 'steamapps');
      } else if (dir.toLowerCase().endsWith('steamapps')) {
        steamappsPath = dir;
      }

      if (steamappsPath) {
        // Steam games search
        onProgress?.({
          currentDir: `${steamappsPath} (reading manifests)`,
          progress: baseProgress + Math.round((nextProgress - baseProgress) * 0.2),
        });
        const manifestFiles = await fs.readdir(steamappsPath);
        let manifestIdx = 0;
        for (const file of manifestFiles) {
          manifestIdx++;
          if (file.startsWith('appmanifest_') && file.endsWith('.acf')) {
            try {
              const fullManifestPath = path.join(steamappsPath, file);
              const content = await fs.readFile(fullManifestPath, 'utf-8');
              const data = parseAcf(content);
              
              const appid = data['appid'];
              const name = data['name'];
              const installDirName = data['installdir'];

              if (appid && name && installDirName) {
                const commonDir = path.join(steamappsPath, 'common', installDirName);
                onProgress?.({
                  currentDir: `Steam: ${name}`,
                  progress: baseProgress + Math.round((nextProgress - baseProgress) * (0.2 + (0.8 * manifestIdx / manifestFiles.length))),
                });
                let localExePath: string | undefined;
                try {
                  const exes = await findExecutables(commonDir, 3);
                  const bestExe = await pickBestExe(exes, installDirName);
                  if (bestExe) {
                    localExePath = bestExe;
                  }
                } catch {
                  // common directory might not exist yet
                }

                let iconUrl: string | undefined;
                let posterUrl: string | undefined;
                if (localExePath) {
                  const iconData = await getIconDataUrl(localExePath, name);
                  iconUrl = iconData.iconUrl;
                  posterUrl = iconData.posterUrl;
                }

                games.push({
                  id: appid,
                  title: name,
                  exePath: `steam://rungameid/${appid}`,
                  localExePath,
                  installDir: commonDir,
                  platform: 'steam',
                  iconUrl,
                  posterUrl,
                });
              }
            } catch (err) {
              console.error('Error processing manifest', file, err);
            }
          }
        }
      } else {
        // Detect if dir itself has game executables within depth 2 (single game folder)
        const selfExes = await findExecutables(dir, 2);
        const hasSelfGame = selfExes.some(exe => {
          const nameLower = path.basename(exe).toLowerCase();
          if (nameLower.includes('unins') || nameLower.includes('setup') || nameLower.includes('helper') || nameLower.includes('crash')) return false;
          // Exe must resolve back to dir (not a subdirectory) to avoid treating library folders as games
          const gameFolder = getGameFolder(exe, dir);
          return path.resolve(gameFolder).toLowerCase() === path.resolve(dir).toLowerCase();
        });

        if (hasSelfGame) {
          const bestExe = await pickBestExe(selfExes, path.basename(dir));
          if (bestExe) {
            const iconData = await getIconDataUrl(bestExe, path.basename(dir));
            const cleanTitle = cleanGameTitle(path.basename(dir));
            games.push({
              id: generateId(bestExe),
              title: cleanTitle,
              exePath: bestExe,
              installDir: dir,
              platform: 'pc',
              iconUrl: iconData.iconUrl,
              posterUrl: iconData.posterUrl,
            });
          }
        } else {
          // Treat dir as a library directory, scan each subdirectory down to depth 3
          const subdirs = await fs.readdir(dir, { withFileTypes: true });
          let subIdx = 0;
          for (const entry of subdirs) {
            subIdx++;
            if (!entry.isDirectory()) continue;
            const subName = entry.name;
            const nameLower = subName.toLowerCase();
            if (nameLower.startsWith('$') || IGNORED_DIRS.has(nameLower)) continue;

            const gameFolder = path.join(dir, subName);
            onProgress?.({
              currentDir: `Scanning: ${subName}`,
              progress: baseProgress + Math.round((nextProgress - baseProgress) * (subIdx / subdirs.length)),
            });

            const subExes = await findExecutables(gameFolder, 3);
            if (subExes.length > 0) {
              const bestExe = await pickBestExe(subExes, subName);
              if (bestExe) {
                const iconData = await getIconDataUrl(bestExe, subName);
                const cleanTitle = cleanGameTitle(subName);
                games.push({
                  id: generateId(bestExe),
                  title: cleanTitle,
                  exePath: bestExe,
                  installDir: gameFolder,
                  platform: 'pc',
                  iconUrl: iconData.iconUrl,
                  posterUrl: iconData.posterUrl,
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Error scanning PC path', dir, err);
    }
  }

  // 2. Scan ISO Installer Games (ISO folders only)
  for (const dir of isoDirectories) {
    currentPathIndex++;
    const baseProgress = Math.round(((currentPathIndex - 1) / totalPaths) * 100);
    const nextProgress = Math.round((currentPathIndex / totalPaths) * 100);

    onProgress?.({
      currentDir: dir,
      progress: baseProgress,
    });

    try {
      const stat = await fs.stat(dir);
      if (!stat.isDirectory()) continue;

      // Scan for ISO files (max depth 3 is plenty for ISO directories)
      const isos = await findIsos(dir, 3, (subDir) => {
        onProgress?.({
          currentDir: subDir,
          progress: baseProgress + Math.round((nextProgress - baseProgress) * 0.5),
        });
      });
      for (const iso of isos) {
        const filename = path.basename(iso, '.iso');
        const cleanTitle = cleanGameTitle(filename);
        const updateFiles = await findUpdateFilesForIso(iso);
        games.push({
          id: generateId(iso),
          title: cleanTitle,
          exePath: iso,
          installDir: path.dirname(iso),
          platform: 'iso',
          updateFiles,
        });
      }
    } catch (err) {
      console.error('Error scanning ISO path', dir, err);
    }
  }

  // Final 100% notification
  onProgress?.({
    currentDir: 'Finished scanning',
    progress: 100,
  });

  // Deduplicate games by ID, exePath, and non-ISO installation directories
  const uniqueGames: DetectedGame[] = [];
  const seenIds = new Set<string>();
  const seenExes = new Set<string>();
  const seenInstallDirs = new Set<string>();

  const normPath = (p: string) => {
    try {
      return path.resolve(p).toLowerCase();
    } catch {
      return p.toLowerCase();
    }
  };

  for (const g of games) {
    const id = g.id.toLowerCase();
    const exe = g.exePath.startsWith('steam://') ? g.exePath.toLowerCase() : normPath(g.exePath);
    const localExe = g.localExePath ? normPath(g.localExePath) : null;
    const installDir = normPath(g.installDir);

    if (seenIds.has(id)) continue;
    if (seenExes.has(exe)) continue;
    if (localExe && seenExes.has(localExe)) continue;
    if (g.platform !== 'iso' && seenInstallDirs.has(installDir)) continue;

    seenIds.add(id);
    seenExes.add(exe);
    if (localExe) {
      seenExes.add(localExe);
    }
    if (g.platform !== 'iso') {
      seenInstallDirs.add(installDir);
    }
    uniqueGames.push(g);
  }

  return uniqueGames;
}
