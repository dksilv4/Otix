import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { LocalGame } from '../preload-api';
import type { DesktopSettings } from '../desktop-settings';
import type { ServiceRegistry } from '../plugin-runtime/service-registry';

// ── Types ──────────────────────────────────────────────────────────────

export interface EmulatorDefinition {
  id: string;
  name: string;
  description?: string;
  platforms: string[];
  extensions: string[];
  defaultExecutable: string;
  executableLookup: string[];
  launchTemplate: string[];
  cores?: Record<string, string>;
  saveLocations?: string[];
  processNames?: string[];
  source?: 'builtin' | 'plugin';
  pluginId?: string;
}

export interface DetectedEmulator {
  id: string;
  name: string;
  installed: boolean;
  executablePath: string | null;
  isCustomPath: boolean;
  definition: EmulatorDefinition;
}

// ── Extension & Platform Mappings ──────────────────────────────────────

export const CONSOLE_PLATFORMS = new Set([
  'nes', 'snes', 'n64', 'gamecube', 'wii', 'wiiu', 'switch',
  'gb', 'gbc', 'gba', 'nds', '3ds',
  'ps1', 'ps2', 'ps3', 'psp', 'psvita',
  'genesis', 'mastersystem', 'gamegear', 'saturn', 'dreamcast',
  'xbox', 'xbox360', 'arcade',
]);

export const EXTENSION_PLATFORM_MAP: Record<string, string> = {
  '.sfc': 'snes',
  '.smc': 'snes',
  '.nes': 'nes',
  '.z64': 'n64',
  '.n64': 'n64',
  '.v64': 'n64',
  '.gb': 'gb',
  '.gbc': 'gbc',
  '.gba': 'gba',
  '.nds': 'nds',
  '.3ds': '3ds',
  '.cia': '3ds',
  '.rvz': 'gamecube',
  '.gcm': 'gamecube',
  '.wbfs': 'wii',
  '.wua': 'wiiu',
  '.rpx': 'wiiu',
  '.nsp': 'switch',
  '.xci': 'switch',
  '.sms': 'mastersystem',
  '.gg': 'gamegear',
  '.cdi': 'dreamcast',
  '.gdi': 'dreamcast',
  '.xex': 'xbox360',
};

export const AMBIGUOUS_EXTENSIONS: Record<string, string[]> = {
  '.iso': ['pc', 'ps2', 'gamecube', 'wii', 'psp', 'ps1', 'xbox', 'xbox360'],
  '.bin': ['ps1', 'ps2', 'saturn', 'genesis'],
  '.cue': ['ps1', 'ps2', 'saturn', 'genesis'],
  '.chd': ['ps1', 'ps2', 'dreamcast', 'saturn', 'arcade'],
  '.zip': ['arcade', 'nes', 'snes', 'gba', 'genesis'],
  '.7z': ['arcade', 'nes', 'snes', 'gba', 'genesis'],
  '.pbp': ['ps1', 'psp'],
  '.img': ['ps1', 'ps2', 'saturn'],
  '.pkg': ['ps4', 'ps3', 'psvita'],
};

// ── Built-in Canonical Emulator Profiles ───────────────────────────────

export const BUILTIN_EMULATORS: EmulatorDefinition[] = [
  {
    id: 'retroarch',
    name: 'RetroArch',
    description: 'Multi-system Libretro frontend for retro consoles',
    platforms: ['nes', 'snes', 'n64', 'gb', 'gbc', 'gba', 'genesis', 'mastersystem', 'gamegear', 'saturn', 'ps1', 'arcade'],
    extensions: ['.nes', '.sfc', '.smc', '.z64', '.n64', '.v64', '.gb', '.gbc', '.gba', '.gen', '.md', '.sms', '.gg', '.cue', '.chd', '.zip', '.7z'],
    defaultExecutable: 'retroarch.exe',
    executableLookup: [
      '%APPDATA%/RetroArch/retroarch.exe',
      '%PROGRAMFILES%/RetroArch/retroarch.exe',
      '%LOCALAPPDATA%/Programs/RetroArch/retroarch.exe',
      'C:/RetroArch-Win64/retroarch.exe',
      '/usr/bin/retroarch',
      '/app/bin/retroarch',
      '~/.var/app/org.libretro.RetroArch/data/retroarch',
      '/Applications/RetroArch.app/Contents/MacOS/RetroArch',
    ],
    launchTemplate: ['-L', '{core}', '{romPath}'],
    cores: {
      snes: 'cores/snes9x_libretro.dll',
      nes: 'cores/mesen_libretro.dll',
      gba: 'cores/mgba_libretro.dll',
      gb: 'cores/gambatte_libretro.dll',
      gbc: 'cores/gambatte_libretro.dll',
      n64: 'cores/mupen64plus_next_libretro.dll',
      genesis: 'cores/genesis_plus_gx_libretro.dll',
      mastersystem: 'cores/genesis_plus_gx_libretro.dll',
      gamegear: 'cores/genesis_plus_gx_libretro.dll',
      saturn: 'cores/mednafen_saturn_libretro.dll',
      ps1: 'cores/mednafen_psx_hw_libretro.dll',
      arcade: 'cores/fbneo_libretro.dll',
    },
    saveLocations: [
      '%APPDATA%/RetroArch/saves/',
      '%APPDATA%/RetroArch/states/',
    ],
    processNames: ['retroarch.exe', 'retroarch'],
    source: 'builtin',
  },
  {
    id: 'pcsx2',
    name: 'PCSX2',
    description: 'PlayStation 2 emulator',
    platforms: ['ps2'],
    extensions: ['.iso', '.chd', '.cso', '.bin', '.gz', '.elf'],
    defaultExecutable: 'pcsx2-qt.exe',
    executableLookup: [
      '%PROGRAMFILES%/PCSX2/pcsx2-qt.exe',
      '%LOCALAPPDATA%/Programs/PCSX2/pcsx2-qt.exe',
      '%PROGRAMFILES(X86)%/PCSX2/pcsx2-qt.exe',
      '%PROGRAMFILES(X86)%/PCSX2/pcsx2.exe',
      'C:/PCSX2/pcsx2-qt.exe',
      '/usr/bin/pcsx2-qt',
      '/Applications/PCSX2.app/Contents/MacOS/PCSX2',
    ],
    launchTemplate: ['-batch', '-fullscreen', '{romPath}'],
    saveLocations: [
      '%USERPROFILE%/Documents/PCSX2/memcards/',
      '%USERPROFILE%/Documents/PCSX2/sstates/',
    ],
    processNames: ['pcsx2-qt.exe', 'pcsx2.exe', 'pcsx2-qt'],
    source: 'builtin',
  },
  {
    id: 'dolphin',
    name: 'Dolphin',
    description: 'GameCube and Wii emulator',
    platforms: ['gamecube', 'wii'],
    extensions: ['.iso', '.rvz', '.gcm', '.wbfs', '.cso', '.elf', '.dol'],
    defaultExecutable: 'Dolphin.exe',
    executableLookup: [
      '%PROGRAMFILES%/Dolphin/Dolphin.exe',
      '%LOCALAPPDATA%/Programs/Dolphin/Dolphin.exe',
      'C:/Dolphin/Dolphin.exe',
      '/usr/bin/dolphin-emu',
      '/Applications/Dolphin.app/Contents/MacOS/Dolphin',
    ],
    launchTemplate: ['-b', '-e', '{romPath}'],
    saveLocations: [
      '%USERPROFILE%/Documents/Dolphin Emulator/GC/',
      '%USERPROFILE%/Documents/Dolphin Emulator/StateSaves/',
    ],
    processNames: ['dolphin.exe', 'dolphin-emu'],
    source: 'builtin',
  },
  {
    id: 'duckstation',
    name: 'DuckStation',
    description: 'PlayStation 1 emulator',
    platforms: ['ps1'],
    extensions: ['.iso', '.chd', '.cue', '.bin', '.pbp', '.m3u'],
    defaultExecutable: 'duckstation-qt-x64-ReleaseLTCG.exe',
    executableLookup: [
      '%LOCALAPPDATA%/Programs/DuckStation/duckstation-qt-x64-ReleaseLTCG.exe',
      '%PROGRAMFILES%/DuckStation/duckstation-qt-x64-ReleaseLTCG.exe',
      'C:/DuckStation/duckstation-qt-x64-ReleaseLTCG.exe',
      '/usr/bin/duckstation-qt',
      '/Applications/DuckStation.app/Contents/MacOS/DuckStation',
    ],
    launchTemplate: ['-batch', '-fullscreen', '{romPath}'],
    saveLocations: [
      '%USERPROFILE%/Documents/DuckStation/memcards/',
    ],
    processNames: ['duckstation-qt-x64-ReleaseLTCG.exe', 'duckstation-qt.exe', 'duckstation-qt'],
    source: 'builtin',
  },
  {
    id: 'rpcs3',
    name: 'RPCS3',
    description: 'PlayStation 3 emulator',
    platforms: ['ps3'],
    extensions: ['.iso', '.pkg', 'eboot.bin'],
    defaultExecutable: 'rpcs3.exe',
    executableLookup: [
      '%LOCALAPPDATA%/Programs/RPCS3/rpcs3.exe',
      '%PROGRAMFILES%/RPCS3/rpcs3.exe',
      'C:/RPCS3/rpcs3.exe',
      '/usr/bin/rpcs3',
      '/Applications/RPCS3.app/Contents/MacOS/RPCS3',
    ],
    launchTemplate: ['--no-gui', '{romPath}'],
    saveLocations: [
      '%APPDATA%/rpcs3/dev_hdd0/savedata/',
    ],
    processNames: ['rpcs3.exe', 'rpcs3'],
    source: 'builtin',
  },
  {
    id: 'cemu',
    name: 'Cemu',
    description: 'Wii U emulator',
    platforms: ['wiiu'],
    extensions: ['.wua', '.rpx', '.wud'],
    defaultExecutable: 'Cemu.exe',
    executableLookup: [
      '%LOCALAPPDATA%/Programs/Cemu/Cemu.exe',
      '%PROGRAMFILES%/Cemu/Cemu.exe',
      'C:/Cemu/Cemu.exe',
      '/usr/bin/cemu',
    ],
    launchTemplate: ['-f', '-g', '{romPath}'],
    saveLocations: [
      '%LOCALAPPDATA%/Cemu/mlc01/usr/save/',
    ],
    processNames: ['cemu.exe', 'cemu'],
    source: 'builtin',
  },
  {
    id: 'ryujinx',
    name: 'Ryujinx',
    description: 'Nintendo Switch emulator',
    platforms: ['switch'],
    extensions: ['.nsp', '.xci'],
    defaultExecutable: 'Ryujinx.exe',
    executableLookup: [
      '%LOCALAPPDATA%/Programs/Ryujinx/Ryujinx.exe',
      '%APPDATA%/Ryujinx/Ryujinx.exe',
      'C:/Ryujinx/Ryujinx.exe',
      '/usr/bin/ryujinx',
      '/Applications/Ryujinx.app/Contents/MacOS/Ryujinx',
    ],
    launchTemplate: ['{romPath}'],
    saveLocations: [
      '%APPDATA%/Ryujinx/bis/user/save/',
    ],
    processNames: ['ryujinx.exe', 'ryujinx'],
    source: 'builtin',
  },
  {
    id: 'ppsspp',
    name: 'PPSSPP',
    description: 'PlayStation Portable (PSP) emulator',
    platforms: ['psp'],
    extensions: ['.iso', '.cso', '.pbp'],
    defaultExecutable: 'PPSSPPWindows64.exe',
    executableLookup: [
      '%PROGRAMFILES%/PPSSPP/PPSSPPWindows64.exe',
      '%LOCALAPPDATA%/Programs/PPSSPP/PPSSPPWindows64.exe',
      'C:/PPSSPP/PPSSPPWindows64.exe',
      '/usr/bin/ppsspp',
      '/Applications/PPSSPP.app/Contents/MacOS/PPSSPP',
    ],
    launchTemplate: ['--fullscreen', '{romPath}'],
    saveLocations: [
      '%USERPROFILE%/Documents/PPSSPP/PSP/SAVEDATA/',
    ],
    processNames: ['ppssppwindows64.exe', 'ppsspp.exe', 'ppsspp'],
    source: 'builtin',
  },
  {
    id: 'citra',
    name: 'Citra / Lime3DS',
    description: 'Nintendo 3DS emulator',
    platforms: ['3ds'],
    extensions: ['.3ds', '.cia', '.cxi'],
    defaultExecutable: 'lime3ds-gui.exe',
    executableLookup: [
      '%LOCALAPPDATA%/Programs/Lime3DS/lime3ds-gui.exe',
      '%LOCALAPPDATA%/Citra/citra-qt.exe',
      '%PROGRAMFILES%/Citra/citra-qt.exe',
      'C:/Citra/citra-qt.exe',
      '/usr/bin/lime3ds',
      '/usr/bin/citra-qt',
    ],
    launchTemplate: ['{romPath}'],
    saveLocations: [
      '%APPDATA%/Citra/sdmc/Nintendo 3DS/',
      '%APPDATA%/Lime3DS/sdmc/Nintendo 3DS/',
    ],
    processNames: ['lime3ds-gui.exe', 'citra-qt.exe', 'citra-qt'],
    source: 'builtin',
  },
  {
    id: 'melonds',
    name: 'melonDS',
    description: 'Nintendo DS emulator',
    platforms: ['nds'],
    extensions: ['.nds'],
    defaultExecutable: 'melonDS.exe',
    executableLookup: [
      '%LOCALAPPDATA%/Programs/melonDS/melonDS.exe',
      '%PROGRAMFILES%/melonDS/melonDS.exe',
      'C:/melonDS/melonDS.exe',
      '/usr/bin/melonds',
    ],
    launchTemplate: ['{romPath}'],
    processNames: ['melonds.exe', 'melonds'],
    source: 'builtin',
  },
  {
    id: 'xenia',
    name: 'Xenia',
    description: 'Xbox 360 emulator',
    platforms: ['xbox360'],
    extensions: ['.iso', '.xex'],
    defaultExecutable: 'xenia_canary.exe',
    executableLookup: [
      '%LOCALAPPDATA%/Programs/Xenia/xenia_canary.exe',
      '%LOCALAPPDATA%/Programs/Xenia/xenia.exe',
      'C:/Xenia/xenia_canary.exe',
      'C:/Xenia/xenia.exe',
    ],
    launchTemplate: ['{romPath}'],
    saveLocations: [
      '%USERPROFILE%/Documents/Xenia/content/',
    ],
    processNames: ['xenia_canary.exe', 'xenia.exe'],
    source: 'builtin',
  },
  {
    id: 'flycast',
    name: 'Flycast',
    description: 'Sega Dreamcast and arcade emulator',
    platforms: ['dreamcast'],
    extensions: ['.cdi', '.gdi', '.chd'],
    defaultExecutable: 'flycast.exe',
    executableLookup: [
      '%LOCALAPPDATA%/Programs/Flycast/flycast.exe',
      '%PROGRAMFILES%/Flycast/flycast.exe',
      'C:/Flycast/flycast.exe',
      '/usr/bin/flycast',
    ],
    launchTemplate: ['{romPath}'],
    processNames: ['flycast.exe', 'flycast'],
    source: 'builtin',
  },
];

// ── Path Expansion ─────────────────────────────────────────────────────

export function expandEnvVars(rawPath: string): string {
  let resolved = rawPath;

  const home = os.homedir();
  resolved = resolved.replace(/^~(?=$|[\\/])/, home);

  // Environment variables (%VAR% or $VAR)
  resolved = resolved.replace(/%([^%]+)%/g, (_, name) => {
    return process.env[name] || process.env[name.toUpperCase()] || '';
  });

  resolved = resolved.replace(/\$([A-Za-z0-9_]+)/g, (_, name) => {
    return process.env[name] || '';
  });

  return path.normalize(resolved);
}

export function detectEmulatorPath(lookupPaths: string[]): string | null {
  for (const raw of lookupPaths) {
    try {
      const expanded = expandEnvVars(raw);
      if (fs.existsSync(expanded)) {
        return expanded;
      }
    } catch {
      /* continue looking */
    }
  }
  return null;
}

// ── Registry & Resolution ──────────────────────────────────────────────

export function getAllEmulatorDefinitions(serviceRegistry?: ServiceRegistry): EmulatorDefinition[] {
  const map = new Map<string, EmulatorDefinition>();

  // 1. Built-in emulators
  for (const emu of BUILTIN_EMULATORS) {
    map.set(emu.id, { ...emu });
  }

  // 2. Discover emulators declared via plugin services
  if (serviceRegistry) {
    try {
      const pluginServices = serviceRegistry.discover('emulator');
      for (const svc of pluginServices) {
        const meta = svc.metadata || {};
        const emuId = (meta.emulatorId as string) || svc.pluginId;
        const existing = map.get(emuId);

        const merged: EmulatorDefinition = {
          id: emuId,
          name: (meta.name as string) || existing?.name || svc.pluginId,
          description: (meta.description as string) || existing?.description,
          platforms: Array.isArray(meta.platforms) ? meta.platforms : existing?.platforms || [],
          extensions: Array.isArray(meta.extensions) ? meta.extensions : existing?.extensions || [],
          defaultExecutable: (meta.defaultExecutable as string) || existing?.defaultExecutable || `${emuId}.exe`,
          executableLookup: Array.isArray(meta.executableLookup)
            ? meta.executableLookup
            : existing?.executableLookup || [],
          launchTemplate: Array.isArray(meta.launchTemplate)
            ? meta.launchTemplate
            : existing?.launchTemplate || ['{romPath}'],
          cores: (meta.cores as Record<string, string>) || existing?.cores,
          saveLocations: Array.isArray(meta.saveLocations) ? meta.saveLocations : existing?.saveLocations,
          processNames: Array.isArray(meta.processNames) ? meta.processNames : existing?.processNames,
          source: 'plugin',
          pluginId: svc.pluginId,
        };

        map.set(emuId, merged);
      }
    } catch {
      /* fallback to builtins */
    }
  }

  return Array.from(map.values());
}

export function detectAllEmulators(
  serviceRegistry?: ServiceRegistry,
  customPaths?: Record<string, string>,
): DetectedEmulator[] {
  const definitions = getAllEmulatorDefinitions(serviceRegistry);
  const results: DetectedEmulator[] = [];

  for (const def of definitions) {
    const custom = customPaths?.[def.id];
    if (custom && custom.trim().length > 0) {
      const expanded = expandEnvVars(custom.trim());
      const exists = fs.existsSync(expanded);
      results.push({
        id: def.id,
        name: def.name,
        installed: exists,
        executablePath: exists ? expanded : null,
        isCustomPath: true,
        definition: def,
      });
      continue;
    }

    const detected = detectEmulatorPath(def.executableLookup);
    results.push({
      id: def.id,
      name: def.name,
      installed: detected != null,
      executablePath: detected,
      isCustomPath: false,
      definition: def,
    });
  }

  return results;
}

export interface RomGameLike {
  platform: string;
  gameType?: string;
  exePath?: string;
}

export function isRomGame(game: RomGameLike): boolean {
  if (game.gameType === 'rom') return true;
  if (CONSOLE_PLATFORMS.has(game.platform)) return true;

  if (game.exePath) {
    const ext = path.extname(game.exePath).toLowerCase();
    if (ext in EXTENSION_PLATFORM_MAP) return true;
    if (ext in AMBIGUOUS_EXTENSIONS && ext !== '.exe') return true;
  }

  return false;
}

export function getAmbiguousCandidates(gameOrPath: LocalGame | string): string[] {
  const filePath = typeof gameOrPath === 'string' ? gameOrPath : gameOrPath.exePath;
  if (!filePath) return [];

  const platform = typeof gameOrPath === 'object' ? gameOrPath.platform : undefined;
  if (platform && CONSOLE_PLATFORMS.has(platform) && platform !== 'ambiguous' && platform !== 'iso' && platform !== 'rom' && platform !== 'unknown') {
    // Already disambiguated
    return [];
  }

  const ext = path.extname(filePath).toLowerCase();
  return AMBIGUOUS_EXTENSIONS[ext] || [];
}

// ── Launch Resolution ──────────────────────────────────────────────────

export interface ResolvedEmulatorLaunch {
  executablePath: string;
  args: string[];
  workingDir: string;
  emulator: EmulatorDefinition;
}

export function resolveEmulatorLaunch(
  game: LocalGame,
  serviceRegistry?: ServiceRegistry,
  settings?: DesktopSettings,
): ResolvedEmulatorLaunch {
  const definitions = getAllEmulatorDefinitions(serviceRegistry);

  // Determine platform
  let platform = game.platform;
  if (!CONSOLE_PLATFORMS.has(platform) || platform === 'ambiguous' || platform === 'iso') {
    const ext = path.extname(game.exePath).toLowerCase();
    if (ext in EXTENSION_PLATFORM_MAP) {
      platform = EXTENSION_PLATFORM_MAP[ext] as any;
    }
  }

  if (!CONSOLE_PLATFORMS.has(platform) || platform === 'ambiguous' || platform === 'iso') {
    throw new Error(
      `Cannot launch "${game.title}": The platform is ambiguous or not supported by any emulator. Please set its console first.`,
    );
  }

  // Find preferred emulator for this platform
  const preferredId = settings?.defaultPlatformEmulators?.[platform];
  let emulator: EmulatorDefinition | undefined;

  if (preferredId) {
    emulator = definitions.find((d) => d.id === preferredId && d.platforms.includes(platform));
  }

  if (!emulator) {
    // Pick first emulator that supports this platform
    emulator = definitions.find((d) => d.platforms.includes(platform));
  }

  if (!emulator) {
    throw new Error(`No emulator registered for platform "${platform}".`);
  }

  // Resolve executable path
  let executablePath: string | null = null;
  const custom = settings?.emulatorPaths?.[emulator.id];
  if (custom && custom.trim().length > 0) {
    const expanded = expandEnvVars(custom.trim());
    if (fs.existsSync(expanded)) {
      executablePath = expanded;
    }
  }

  if (!executablePath) {
    executablePath = detectEmulatorPath(emulator.executableLookup);
  }

  if (!executablePath) {
    throw new Error(
      `Emulator "${emulator.name}" for ${platform.toUpperCase()} was not found on your system. Please install it or set its executable path in Settings.`,
    );
  }

  // Resolve arguments template
  const core = emulator.cores?.[platform] || '';
  const emuDir = path.dirname(executablePath);

  const args = emulator.launchTemplate.map((arg) => {
    let formatted = arg.replace('{romPath}', game.exePath);
    if (core) {
      const fullCorePath = path.isAbsolute(core) ? core : path.join(emuDir, core);
      formatted = formatted.replace('{core}', fullCorePath);
    }
    return formatted;
  });

  return {
    executablePath,
    args,
    workingDir: emuDir,
    emulator,
  };
}
