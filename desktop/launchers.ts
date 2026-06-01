import * as fs from 'fs/promises';
import { Dirent } from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import type { DetectedGame } from './scanner';

// ── Helpers ──────────────────────────────────────────────────────────────

function generateId(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readDirSafe(dir: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function execPowershell(script: string): Promise<string> {
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`,
      { timeout: 15000 },
      (error, stdout) => {
        if (error) {
          resolve('');
        } else {
          resolve(stdout.trim());
        }
      },
    );
  });
}

function registryQuery(key: string, valueName?: string): Promise<string> {
  const cmd = valueName
    ? `Get-ItemPropertyValue -Path '${key}' -Name '${valueName}' -ErrorAction SilentlyContinue`
    : `(Get-ItemProperty -Path '${key}' -ErrorAction SilentlyContinue).PSObject.Properties | Where-Object { $_.Name -notin @('PSPath','PSParentPath','PSChildName','PSDrive','PSProvider') } | ForEach-Object { "$($_.Name)=$($_.Value)" }`;
  return execPowershell(cmd);
}

// ── Epic Games ───────────────────────────────────────────────────────────

const EPIC_MANIFESTS_DIR = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';

interface EpicManifest {
  DisplayName?: string;
  InstallLocation?: string;
  LaunchExecutable?: string;
  AppName?: string;
}

export async function scanEpicGames(): Promise<DetectedGame[]> {
  const games: DetectedGame[] = [];

  const entries = await readDirSafe(EPIC_MANIFESTS_DIR);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.item')) continue;

    const content = await readFileSafe(path.join(EPIC_MANIFESTS_DIR, entry.name));
    if (!content) continue;

    try {
      const manifest: EpicManifest = JSON.parse(content);
      const title = manifest.DisplayName;
      const installDir = manifest.InstallLocation;
      let exePath = manifest.LaunchExecutable;

      if (!title || !installDir) continue;

      // Some manifests have relative exe paths
      if (exePath && !path.isAbsolute(exePath)) {
        exePath = path.join(installDir, exePath);
      }

      if (exePath && !(await pathExists(exePath))) {
        // Try finding the exe in the install directory
        try {
          const dirEntries = await fs.readdir(installDir, { withFileTypes: true });
          for (const de of dirEntries) {
            if (de.isFile() && de.name.toLowerCase().endsWith('.exe')) {
              const nameLower = de.name.toLowerCase();
              // Skip uninstallers and launcher helpers
              if (nameLower.includes('unins') || nameLower.includes('epic') || nameLower.includes('eos')) continue;
              exePath = path.join(installDir, de.name);
              break;
            }
          }
        } catch {
          // ignore
        }
      }

      const appName = manifest.AppName || entry.name.replace('.item', '');

      games.push({
        id: `epic_${appName}`,
        title,
        exePath: exePath || installDir,
        installDir,
        platform: 'epic',
      });
    } catch {
      // Corrupt manifest, skip
    }
  }

  return games;
}

// ── GOG Galaxy ───────────────────────────────────────────────────────────

const GOG_REGISTRY_PATHS = [
  'HKLM:\\SOFTWARE\\WOW6432Node\\GOG.com\\Games',
  'HKLM:\\SOFTWARE\\GOG.com\\Games',
];

const GOG_COMMON_PATHS = [
  'C:\\GOG Games',
  'C:\\Program Files (x86)\\GOG Galaxy\\Games',
  'C:\\Program Files\\GOG Galaxy\\Games',
];

async function scanGogRegistry(): Promise<DetectedGame[]> {
  const games: DetectedGame[] = [];

  for (const regPath of GOG_REGISTRY_PATHS) {
    const script = `Get-ChildItem -Path '${regPath}' -ErrorAction SilentlyContinue | ForEach-Object {
      $id = $_.PSChildName
      $name = Get-ItemPropertyValue -Path $_.PSPath -Name GAMENAME -ErrorAction SilentlyContinue
      $exe = Get-ItemPropertyValue -Path $_.PSPath -Name EXE -ErrorAction SilentlyContinue
      $path = Get-ItemPropertyValue -Path $_.PSPath -Name PATH -ErrorAction SilentlyContinue
      [PSCustomObject]@{ id = $id; name = $name; exe = $exe; path = $path }
    } | ConvertTo-Json`;

    const output = await execPowershell(script);
    if (!output) continue;

    try {
      const parsed = JSON.parse(output);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item && item.name) {
          let exePath = item.exe || '';
          if (exePath && item.path && !path.isAbsolute(exePath)) {
            exePath = path.join(item.path, exePath);
          }
          if (exePath && !(await pathExists(exePath))) {
            exePath = '';
          }

          games.push({
            id: `gog_${item.id}`,
            title: item.name,
            exePath: exePath || item.path || '',
            installDir: item.path || '',
            platform: 'gog',
          });
        }
      }
    } catch (e) {
      console.error('[scanGogRegistry] Error parsing JSON output:', e);
    }
  }

  return games;
}

async function scanGogCommonPaths(): Promise<DetectedGame[]> {
  const games: DetectedGame[] = [];

  for (const basePath of GOG_COMMON_PATHS) {
    if (!(await pathExists(basePath))) continue;

    const entries = await readDirSafe(basePath);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const gameDir = path.join(basePath, entry.name);

      // Look for executables in the game directory
      try {
        const files = await fs.readdir(gameDir, { withFileTypes: true });
        for (const file of files) {
          if (!file.isFile()) continue;
          const nameLower = file.name.toLowerCase();
          if (nameLower.endsWith('.exe') && !nameLower.includes('unins') && !nameLower.includes('redist')) {
            games.push({
              id: `gog_${generateId(gameDir)}`,
              title: entry.name,
              exePath: path.join(gameDir, file.name),
              installDir: gameDir,
              platform: 'gog',
            });
            break; // One exe per game dir
          }
        }
      } catch {
        // skip
      }
    }
  }

  return games;
}

export async function scanGogGames(): Promise<DetectedGame[]> {
  // Registry has better metadata — try that first, fall back to common paths
  const regGames = await scanGogRegistry();
  if (regGames.length > 0) return regGames;
  return scanGogCommonPaths();
}

// ── Battle.net ────────────────────────────────────────────────────────────

const BATTLENET_COMMON_PATHS = [
  'C:\\Program Files (x86)\\Battle.net\\Games',
  'C:\\Program Files\\Battle.net\\Games',
  'C:\\Battle.net\\Games',
];

export async function scanBattlenetGames(): Promise<DetectedGame[]> {
  const games: DetectedGame[] = [];

  for (const basePath of BATTLENET_COMMON_PATHS) {
    if (!(await pathExists(basePath))) continue;

    const entries = await readDirSafe(basePath);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const gameDir = path.join(basePath, entry.name);

      // Battle.net games often have a launcher subdirectory
      // e.g., Call of Duty/_retail_/cod.exe or World of Warcraft/_retail_/Wow.exe
      const candidates = [gameDir];
      try {
        const subEntries = await fs.readdir(gameDir, { withFileTypes: true });
        for (const se of subEntries) {
          if (se.isDirectory() && se.name.startsWith('_')) {
            candidates.push(path.join(gameDir, se.name));
          }
        }
      } catch {
        // skip
      }

      let found = false;
      for (const candidateDir of candidates) {
        if (found) break;
        try {
          const dirFiles = await fs.readdir(candidateDir, { withFileTypes: true });
          for (const file of dirFiles) {
            if (!file.isFile()) continue;
            const nameLower = file.name.toLowerCase();
            if (
              nameLower.endsWith('.exe') &&
              !nameLower.includes('unins') &&
              !nameLower.includes('crash') &&
              !nameLower.includes('agent')
            ) {
              games.push({
                id: `bnet_${generateId(gameDir)}`,
                title: entry.name,
                exePath: path.join(candidateDir, file.name),
                installDir: gameDir,
                platform: 'battlenet',
              });
              found = true;
              break;
            }
          }
        } catch {
          // skip
        }
      }
    }
  }

  return games;
}

// ── Ubisoft Connect ──────────────────────────────────────────────────────

const UBISOFT_REGISTRY_KEY = 'HKLM:\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs';

export async function scanUbisoftGames(): Promise<DetectedGame[]> {
  const games: DetectedGame[] = [];

  const script = `Get-ChildItem -Path '${UBISOFT_REGISTRY_KEY}' -ErrorAction SilentlyContinue | ForEach-Object {
    $id = $_.PSChildName
    $installDir = Get-ItemPropertyValue -Path $_.PSPath -Name InstallDir -ErrorAction SilentlyContinue
    [PSCustomObject]@{ id = $id; installDir = $installDir }
  } | ConvertTo-Json`;

  const output = await execPowershell(script);
  if (output) {
    try {
      const parsed = JSON.parse(output);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (!item || !item.id || !item.installDir || !(await pathExists(item.installDir))) continue;

        // Find the game executable
        let exePath = '';
        try {
          const dirEntries = await fs.readdir(item.installDir, { withFileTypes: true });
          for (const entry of dirEntries) {
            if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
              const nameLower = entry.name.toLowerCase();
              if (nameLower.includes('unins') || nameLower.includes('upc') || nameLower.includes('ubisoft')) continue;
              exePath = path.join(item.installDir, entry.name);
              break;
            }
          }
        } catch {
          // skip
        }

        const title = item.id.replace(/_/g, ' ');

        games.push({
          id: `ubi_${item.id}`,
          title,
          exePath: exePath || item.installDir,
          installDir: item.installDir,
          platform: 'ubisoft',
        });
      }
    } catch (e) {
      console.error('[scanUbisoftGames] Error parsing JSON output:', e);
    }
  }

  // Also check common paths
  const ubiCommon = 'C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games';
  if (await pathExists(ubiCommon)) {
    const entries = await readDirSafe(ubiCommon);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const gameDir = path.join(ubiCommon, entry.name);

      try {
        const dirFiles = await fs.readdir(gameDir, { withFileTypes: true });
        for (const file of dirFiles) {
          if (!file.isFile()) continue;
          const nameLower = file.name.toLowerCase();
          if (nameLower.endsWith('.exe') && !nameLower.includes('unins') && !nameLower.includes('upc')) {
            games.push({
              id: `ubi_${generateId(gameDir)}`,
              title: entry.name,
              exePath: path.join(gameDir, file.name),
              installDir: gameDir,
              platform: 'ubisoft',
            });
            break;
          }
        }
      } catch {
        // skip
      }
    }
  }

  return games;
}

// ── EA App ────────────────────────────────────────────────────────────────

const EA_COMMON_PATHS = [
  'C:\\Program Files\\EA Games',
  'C:\\Program Files (x86)\\EA Games',
  'C:\\Program Files\\Electronic Arts',
  'C:\\Program Files (x86)\\Origin Games',
];

export async function scanEAGames(): Promise<DetectedGame[]> {
  const games: DetectedGame[] = [];

  for (const basePath of EA_COMMON_PATHS) {
    if (!(await pathExists(basePath))) continue;

    const entries = await readDirSafe(basePath);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const gameDir = path.join(basePath, entry.name);

      // EA games have deep nesting sometimes: GameDir/Game/Binaries/Win64/game.exe
      const exeDirs: string[] = [gameDir];
      try {
        const subDirs = await fs.readdir(gameDir, { withFileTypes: true });
        for (const sd of subDirs) {
          if (!sd.isDirectory()) continue;
          const nameLower = sd.name.toLowerCase();
          if (nameLower === 'game' || nameLower === 'binaries' || nameLower === 'bin') {
            exeDirs.push(path.join(gameDir, sd.name));
          }
        }
      } catch {
        // skip
      }

      let found = false;
      for (const exeDir of exeDirs) {
        if (found) break;
        try {
          const walkDir = async (dir: string, depth: number) => {
            if (found || depth > 2) return;
            const dirFiles = await fs.readdir(dir, { withFileTypes: true });
            for (const file of dirFiles) {
              if (found) break;
              if (file.isDirectory()) {
                await walkDir(path.join(dir, file.name), depth + 1);
              } else if (file.isFile()) {
                const nameLower = file.name.toLowerCase();
                if (
                  nameLower.endsWith('.exe') &&
                  !nameLower.includes('unins') &&
                  !nameLower.includes('activation') &&
                  !nameLower.includes('touchup') &&
                  !nameLower.includes('cleanup') &&
                  !nameLower.includes('crash')
                ) {
                  games.push({
                    id: `ea_${generateId(gameDir)}`,
                    title: entry.name,
                    exePath: path.join(dir, file.name),
                    installDir: gameDir,
                    platform: 'ea',
                  });
                  found = true;
                }
              }
            }
          };
          await walkDir(exeDir, 0);
        } catch {
          // skip
        }
      }
    }
  }

  return games;
}

// ── Riot Games ────────────────────────────────────────────────────────────

const RIOT_COMMON_PATHS = [
  'C:\\Riot Games',
  'C:\\Program Files\\Riot Games',
];

export async function scanRiotGames(): Promise<DetectedGame[]> {
  const games: DetectedGame[] = [];

  for (const basePath of RIOT_COMMON_PATHS) {
    if (!(await pathExists(basePath))) continue;

    const entries = await readDirSafe(basePath);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const gameDir = path.join(basePath, entry.name);

      // Riot games have deep exe paths like: Riot Games/League of Legends/Game/League of Legends.exe
      let found = false;
      const walkDir = async (dir: string, depth: number) => {
        if (found || depth > 3) return;
        try {
          const dirFiles = await fs.readdir(dir, { withFileTypes: true });
          for (const file of dirFiles) {
            if (found) break;
            if (file.isDirectory()) {
              const nameLower = file.name.toLowerCase();
              // Skip launcher-specific folders, focus on the game itself
              if (nameLower === 'riot client' || nameLower === 'launcher') continue;
              await walkDir(path.join(dir, file.name), depth + 1);
            } else if (file.isFile()) {
              const nameLower = file.name.toLowerCase();
              if (
                nameLower.endsWith('.exe') &&
                !nameLower.includes('unins') &&
                !nameLower.includes('riotclient') &&
                !nameLower.includes('crash')
              ) {
                games.push({
                  id: `riot_${generateId(gameDir)}`,
                  title: entry.name,
                  exePath: path.join(dir, file.name),
                  installDir: gameDir,
                  platform: 'riot',
                });
                found = true;
              }
            }
          }
        } catch {
          // skip
        }
      };
      await walkDir(gameDir, 0);
    }
  }

  return games;
}

// ── Xbox / Microsoft Store ────────────────────────────────────────────────

export async function scanXboxGames(): Promise<DetectedGame[]> {
  const games: DetectedGame[] = [];

  const output = await execPowershell(
    'Get-AppxPackage -ErrorAction SilentlyContinue | Where-Object { $_.IsFramework -eq $false -and $_.InstallLocation -ne $null } | Select-Object Name, InstallLocation | ConvertTo-Json',
  );
  if (!output) return games;

  try {
    const packages = JSON.parse(output);
    const items = Array.isArray(packages) ? packages : [packages];

    // Known game-related publisher prefixes to filter non-game apps
    const GAME_PUBLISHERS = [
      'Microsoft.Studios', 'Microsoft.Gaming', 'Microsoft.Bethesda',
      'Microsoft.Xbox', 'Microsoft.Minecraft', 'Microsoft.SeaOfThieves',
      'Microsoft.Forza', 'Microsoft.Halo', 'Microsoft.Gears',
      'Microsoft.AgeOfEmpires', 'Microsoft.FlightSimulator',
      'XboxLive', 'XboxGame', 'BethesdaSoftworks', 'PlaygroundGames',
      'Turn10', 'UndeadLabs', 'Mojang', '343Industries', 'TheCoalition',
      'CompulsionGames', 'DoubleFine', 'InXile', 'NinjaTheory', 'Obsidian',
      'Rare', 'WorldsEdge',
    ];

    for (const pkg of items) {
      if (!pkg || !pkg.Name || !pkg.InstallLocation) continue;

      const nameLower = pkg.Name.toLowerCase();
      const isGame = GAME_PUBLISHERS.some((pub) =>
        nameLower.includes(pub.toLowerCase()),
      );

      if (!isGame) continue;

      // Extract clean title from the package name (e.g., "Microsoft.SeaOfThieves_1.0_x64" -> "Sea of Thieves")
      let cleanTitle = pkg.Name
        .replace(/^Microsoft\./, '')
        .replace(/^Xbox\./, '')
        .replace(/_\d+.*$/, '')
        .replace(/\./g, ' ');
      // Un-camelCase
      cleanTitle = cleanTitle.replace(/([a-z])([A-Z])/g, '$1 $2').trim();

      // Find the game executable
      let exePath = '';
      try {
        const walkDir = async (dir: string, depth: number) => {
          if (exePath || depth > 2) return;
          try {
            const dirFiles = await fs.readdir(dir, { withFileTypes: true });
            for (const file of dirFiles) {
              if (exePath) break;
              if (file.isDirectory()) {
                await walkDir(path.join(dir, file.name), depth + 1);
              } else if (file.isFile()) {
                const nLower = file.name.toLowerCase();
                if (nLower.endsWith('.exe') && !nLower.includes('unins') && !nLower.includes('gamingservices')) {
                  exePath = path.join(dir, file.name);
                }
              }
            }
          } catch {
            // skip - WindowsApps has restrictive permissions
          }
        };
        await walkDir(pkg.InstallLocation, 0);
      } catch {
        // skip
      }

      games.push({
        id: `xbox_${generateId(pkg.Name)}`,
        title: cleanTitle || pkg.Name,
        exePath: exePath || `shell:AppsFolder\\${pkg.Name}`,
        installDir: pkg.InstallLocation,
        platform: 'xbox',
      });
    }
  } catch {
    // JSON parse error, skip
  }

  return games;
}

// ── Itch.io ───────────────────────────────────────────────────────────────

const ITCH_APPS_DIR = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'itch', 'apps')
  : '';

export async function scanItchGames(): Promise<DetectedGame[]> {
  const games: DetectedGame[] = [];

  if (!ITCH_APPS_DIR || !(await pathExists(ITCH_APPS_DIR))) return games;

  const entries = await readDirSafe(ITCH_APPS_DIR);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const gameDir = path.join(ITCH_APPS_DIR, entry.name);

    // Each game folder has a .itch receipt file with metadata
    let title = entry.name;
    try {
      const receiptFiles = (await fs.readdir(gameDir, { withFileTypes: true }))
        .filter((f) => f.isFile() && f.name.endsWith('.itch'))
        .map((f) => f.name);
      if (receiptFiles.length > 0) {
        title = receiptFiles[0].replace('.itch', '');
      }
    } catch {
      // ignore
    }

    // Find the game executable
    let exePath = '';
    try {
      const walkDir = async (dir: string, depth: number) => {
        if (exePath || depth > 2) return;
        try {
          const dirFiles = await fs.readdir(dir, { withFileTypes: true });
          for (const file of dirFiles) {
            if (exePath) break;
            if (file.isDirectory()) {
              await walkDir(path.join(dir, file.name), depth + 1);
            } else if (file.isFile()) {
              const nameLower = file.name.toLowerCase();
              if (nameLower.endsWith('.exe') && !nameLower.includes('unins')) {
                exePath = path.join(dir, file.name);
              }
            }
          }
        } catch {
          // skip
        }
      };
      await walkDir(gameDir, 0);
    } catch {
      // skip
    }

    games.push({
      id: `itch_${generateId(gameDir)}`,
      title,
      exePath: exePath || gameDir,
      installDir: gameDir,
      platform: 'itch',
    });
  }

  return games;
}

// ── Aggregator ────────────────────────────────────────────────────────────

export interface LauncherScanResult {
  source: string;
  games: DetectedGame[];
  error?: string;
}

export async function scanAllLaunchers(): Promise<LauncherScanResult[]> {
  const scanners: Array<{ name: string; fn: () => Promise<DetectedGame[]> }> = [
    { name: 'epic', fn: scanEpicGames },
    { name: 'gog', fn: scanGogGames },
    { name: 'battlenet', fn: scanBattlenetGames },
    { name: 'ubisoft', fn: scanUbisoftGames },
    { name: 'ea', fn: scanEAGames },
    { name: 'riot', fn: scanRiotGames },
    { name: 'xbox', fn: scanXboxGames },
    { name: 'itch', fn: scanItchGames },
  ];

  const results: LauncherScanResult[] = [];

  // Run all scanners in parallel
  const scans = scanners.map(async ({ name, fn }) => {
    try {
      const games = await fn();
      return { source: name, games };
    } catch (err: any) {
      return { source: name, games: [], error: err?.message || String(err) };
    }
  });

  const settled = await Promise.all(scans);
  results.push(...settled);

  return results;
}
