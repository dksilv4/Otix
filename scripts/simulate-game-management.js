#!/usr/bin/env node
/**
 * Otix Unified Game Management Simulation Script
 *
 * Simulates game discovery, release parsing, noise filtering, and template-based
 * library reorganization on REAL folders with ZERO filesystem modifications (dry run only).
 *
 * Features:
 *   - Classifies ISOs, Repacks, Extracted Game Folders, Console/Handheld ROMs,
 *     Updates, DLCs, Preserved Metadata (NFO/SFV/artwork), and Filters Noise.
 *   - Retains folder container packages intact (never shreds multi-bin repacks or game folders).
 *   - Groups satellite updates and DLCs into parent game subfolders.
 *   - Rich metadata extraction: Title, Year, Edition, Platform, Group, Version, Region, TitleID.
 *   - Template tokens: {Title}, {CleanTitle}, {Year}, {Platform}, {ReleaseGroup}, {Edition},
 *     {Version}, {Region}, {TitleId}, {Category}, {OriginalName}, {ext}.
 *   - Collision detection & optional auto-disambiguation strategies.
 *   - Disk capacity & footprint impact simulation (dry-run bytes calculated).
 *   - Full CLI text reporting and structured JSON output for API/Web UI.
 *
 * Implements logic aligned with:
 *   - node/internal/indexer/indexer.go
 *   - node/internal/organize/organize.go & parser.go
 *   - desktop/game/parser.ts & scan-utils.ts
 *   - frontend/src/features/settings/utils/naming-template.ts
 *
 * Usage:
 *   node scripts/simulate-game-management.js --dir "D:\Games"
 *   node scripts/simulate-game-management.js --dir "C:\Downloads\Games" --preset clean_game_folder
 *   node scripts/simulate-game-management.js --sample
 *   node scripts/simulate-game-management.js --sample --json
 *   node scripts/simulate-game-management.js --help
 */

const fs = require('fs');
const path = require('path');

// ── Naming Presets ──

const PRESETS = {
  standard: '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}',
  clean_game_folder: '{Title} ({Year})/{Title}.{ext}',
  flat_title: '{Title}/{Title}.{ext}',
  scene_release: '{Title}/{Title}.v{Version}-{ReleaseGroup}.{ext}',
  year_subfolder: '{Year}/{Title}/{OriginalName}.{ext}',
  platform_subfolder: '{Platform}/{Title} ({Year})/{Title}.{ext}',
  rom_standard: '{Platform}/{Title} ({Region})/{Title}.{ext}',
};

// ── Noise & Filtering (From node/internal/indexer/indexer.go) ──

const NOISE_EXECUTABLE_PATTERNS = [
  'unins000', 'uninstall', 'uninst',
  'crashreporter', 'crash_reporter', 'crashreport', 'crashhandler', 'crash_handler',
  'unitycrashhandler', 'unitycrashhandler32', 'unitycrashhandler64', 'crashpad', 'crashing',
  'vcredist', 'dxsetup', 'dxwebsetup', 'directx', 'dotnetfx', 'oalinst', 'physx', 'redist',
  'easyanticheat', 'battleye', 'epic_online_services', 'eosbootstrapper',
  'unrealcefsubprocessor', 'cefsimple', 'dedicatedserver', 'benchmark',
  'bugreporter', 'restarter', 'dowser', 'quicksfv', 'launcher-installer',
  'ereg', 'easyinfo',
];

const NOISE_DIRECTORY_NAMES = new Set([
  '_commonredist', 'commonredist', 'redist', '_redist',
  'support', 'directx', 'vcredist', 'vc_redist',
  'prerequisites', 'prereq', 'engine', 'crashreports',
  'mono', 'dependencies', '.git', '__macosx',
  'content', 'assets', 'textures', 'sounds', 'audio',
  'video', 'movies', 'shaders', 'levels', 'maps',
  'res', 'resources', 'localization', 'languages',
  'locale', 'save', 'saves', 'cache',
  'runtimetools', 'md5', 'emulators', 'node_modules',
  '$recycle.bin', 'system volume information',
]);

const GENERIC_INSTALLER_STEMS = new Set([
  'setup', 'install', 'installer', 'autorun',
  'start', 'play', 'unins000', 'uninstall',
]);

const CORE_SKIP_WORDS = new Set([
  'repack', 'codex', 'crack', 'gog', 'elamigos', 'dodi', 'fitgirl',
  'skidrow', 'flt', 'update', 'patch', 'hotfix', 'dlc', 'addon', 'iso',
  'program', 'game', 'install', 'setup', 'files', 'data', 'content', 'unleashed',
  'rune', 'tenoke', 'delusion', 'plaza', 'goldberg', 'razor1911', 'fairlight',
  'hoodlum', 'empress', 'cpy', 'tinyiso', 'darksiders', 'reloaded', 'prophet',
]);

const EDITION_RE = /(goty|game\s*of\s*the\s*year|definitive|enhanced|remastered|ultimate|complete|deluxe|collectors|special|legendary|anniversary|director['’]?s\s*cut)\s*(?:edition)?/gi;

// Platform extension maps
const EXTENSION_PLATFORMS = {
  '.nsp': 'Switch',
  '.xci': 'Switch',
  '.nsz': 'Switch',
  '.xcz': 'Switch',
  '.3ds': '3DS',
  '.cia': '3DS',
  '.cxi': '3DS',
  '.nds': 'NDS',
  '.z64': 'N64',
  '.n64': 'N64',
  '.v64': 'N64',
  '.rvz': 'Wii',
  '.wbfs': 'Wii',
  '.gcz': 'GameCube',
  '.chd': 'PS2',
  '.pbp': 'PSP',
  '.vpk': 'PSVita',
  '.sfc': 'SNES',
  '.smc': 'SNES',
  '.nes': 'NES',
  '.gba': 'GBA',
  '.gbc': 'GBC',
  '.gb': 'GB',
  '.md': 'Genesis',
  '.gen': 'Genesis',
  '.pkg': 'PS3',
};

// Realistic built-in sample releases for demonstration & testing
const SAMPLE_RELEASES = [
  // PC ISOs & Repacks
  { raw: 'Cyberpunk.2077.v2.12.REPACK-ELAMIGOS.iso', ext: '.iso', sub: 'Downloads', size: 68719476736 },
  { raw: 'Elden.Ring.Shadow.of.the.Erdtree.REPACK-RUNE.iso', ext: '.iso', sub: 'Downloads', size: 51539607552 },
  { raw: 'The.Witcher.3.Wild.Hunt.GOTY-GOG.iso', ext: '.iso', sub: 'Downloads', size: 37580963840 },
  { raw: 'Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL', isDir: true, sub: 'Downloads', size: 73014444032, files: ['setup.exe', 'setup-fitgirl-1.bin', 'setup-fitgirl-2.bin', 'quickSFV.exe'] },
  { raw: 'Ghost.of.Tsushima.DIRECTORS.CUT.v1053.0522-TENOKE', isDir: true, sub: 'Downloads', size: 62277025792, files: ['setup.exe', 'data1.bin', 'tenoke.nfo'] },

  // Side-Case Scenarios: Repack Archive Anomalies & Standalone Crack Supplements
  { raw: 'Elden.Ring.v1.12.REPACK-ELAMIGOS', isDir: true, sub: 'Downloads', size: 51539607552, files: ['setup.exe', 'elamigos-1.bin', 'data-2.bin', 'elamigos-3 (1).bin', 'elamigos.nfo'] },
  { raw: 'Cyberpunk.2077.v2.12.Crack.Only-ELAMIGOS', isDir: true, sub: 'Downloads/Cyberpunk 2077', size: 104857600, files: ['apply_crack.exe', 'steam_api64.dll', 'steam_emu.ini', 'elamigos.nfo'] },
  { raw: 'Elden.Ring.v1.12.Crackfix.V2-RUNE', isDir: true, sub: 'Downloads/Elden Ring', size: 104857600, files: ['eldenring.exe', 'steam_api64.dll', 'steam_emu.ini', 'rune.nfo'] },
  { raw: 'Cyberpunk.2077.v2.12.Crackfix-RUNE.exe', ext: '.exe', sub: 'Downloads/Cyberpunk 2077', size: 52428800 },
  { raw: 'Ghost.of.Tsushima.REPACK-FITGIRL', isDir: true, sub: 'Downloads', size: 62277025792, files: ['setup.exe', 'setup-fitgirl-1.bin', 'setup-fitgirl-2.bin.part', 'quickSFV.exe'] },

  // PC Installed Folders & Exes
  { raw: 'Hollow Knight', isDir: true, sub: 'Games', size: 1932735283, files: ['HollowKnight.exe', 'UnityCrashHandler64.exe', 'hollow_knight_Data'] },
  { raw: 'Hades.II.v0.91024-EarlyAccess.exe', ext: '.exe', sub: 'Downloads/Hades 2', size: 4509715660 },

  // PC Updates & DLCs
  { raw: 'Cyberpunk 2077 update 2.12 - 2.13.exe', ext: '.exe', sub: 'Downloads/Cyberpunk 2077/Updates', size: 3328599654 },
  { raw: 'Elden Ring update 1.12.3 - 1.13.0.exe', ext: '.exe', sub: 'Downloads/Elden Ring/Updates', size: 1932735283 },
  { raw: 'The.Witcher.3.Wild.Hunt.Blood.and.Wine.DLC-GOG.exe', ext: '.exe', sub: 'Downloads/The Witcher 3/DLC', size: 10737418240 },

  // Console & Handheld ROMs
  { raw: 'The Legend of Zelda Tears of the Kingdom [0100F2C0115B6000][v0].nsp', ext: '.nsp', sub: 'ROMs/Switch', size: 17502797824 },
  { raw: 'The Legend of Zelda Tears of the Kingdom [0100F2C0115B6800][v131072][UPD].nsp', ext: '.nsp', sub: 'ROMs/Switch', size: 3650722201 },
  { raw: 'Super Smash Bros Ultimate [01006A800016F001][v0][DLC].nsp', ext: '.nsp', sub: 'ROMs/Switch', size: 1288490188 },
  { raw: 'Super Mario 64 (USA).z64', ext: '.z64', sub: 'ROMs/N64', size: 8388608 },
  { raw: 'Super Smash Bros. Melee (USA) (v1.02).rvz', ext: '.rvz', sub: 'ROMs/GameCube', size: 1395864371 },
  { raw: 'God of War II (USA).chd', ext: '.chd', sub: 'ROMs/PS2', size: 6871947673 },
  { raw: 'The Last of Us [BCUS98174].iso', ext: '.iso', sub: 'ROMs/PS3', size: 28991029248 },
  { raw: 'Pokemon - Emerald Version (USA, Europe).gba', ext: '.gba', sub: 'ROMs/GBA', size: 16777216 },

  // Preserved Metadata
  { raw: 'Cyberpunk.2077.v2.12.REPACK-ELAMIGOS.nfo', ext: '.nfo', sub: 'Downloads', size: 4096 },
  { raw: 'cover.jpg', ext: '.jpg', sub: 'Downloads/Cyberpunk 2077', size: 245760 },

  // Filtered Noise
  { raw: 'dxsetup.exe', ext: '.exe', sub: 'Downloads/DirectX', size: 524288 },
  { raw: 'vcredist_x64.exe', ext: '.exe', sub: 'Downloads/Redist', size: 14680064 },
  { raw: 'Thumbs.db', ext: '.db', sub: 'Downloads', size: 16384 },
];

// ── Synthetic Scale Generator (For Benchmarks & Stress Tests) ──

function generateSyntheticReleases(count = 10000, fakeBase = 'D:\\Games\\Library') {
  let s = 42;
  function rnd() {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  }
  function pick(arr) {
    return arr[Math.floor(rnd() * arr.length)];
  }
  function rndInt(min, max) {
    return Math.floor(rnd() * (max - min + 1)) + min;
  }

  const FRANCHISES = [
    { title: 'The Witcher 3 Wild Hunt', year: '2015', editions: ['GOTY', 'Complete Edition'], platform: 'PC', baseSize: 35 },
    { title: 'Cyberpunk 2077', year: '2020', editions: ['Ultimate Edition', 'Day One Edition'], platform: 'PC', baseSize: 64 },
    { title: 'Elden Ring', year: '2022', editions: ['Shadow of the Erdtree Edition', 'Deluxe Edition'], platform: 'PC', baseSize: 48 },
    { title: 'Baldurs Gate 3', year: '2023', editions: ['Digital Deluxe Edition'], platform: 'PC', baseSize: 75 },
    { title: 'Hades II', year: '2024', editions: ['Early Access'], platform: 'PC', baseSize: 4 },
    { title: 'Hollow Knight', year: '2017', editions: ['Voidheart Edition'], platform: 'PC', baseSize: 2 },
    { title: 'Ghost of Tsushima', year: '2020', editions: ["Director's Cut"], platform: 'PC', baseSize: 58 },
    { title: 'God of War', year: '2018', editions: ['Digital Deluxe Edition'], platform: 'PC', baseSize: 45 },
    { title: 'God of War Ragnarok', year: '2022', editions: ['Digital Deluxe Edition'], platform: 'PC', baseSize: 84 },
    { title: 'Spider-Man Remastered', year: '2022', editions: ['Remastered'], platform: 'PC', baseSize: 65 },
    { title: 'The Last of Us Part I', year: '2023', editions: ['Digital Deluxe Edition'], platform: 'PC', baseSize: 72 },
    { title: 'Red Dead Redemption 2', year: '2019', editions: ['Ultimate Edition', 'Special Edition'], platform: 'PC', baseSize: 115 },
    { title: 'Grand Theft Auto V', year: '2015', editions: ['Premium Edition'], platform: 'PC', baseSize: 95 },
    { title: 'The Elder Scrolls V Skyrim', year: '2011', editions: ['Special Edition', 'Anniversary Edition'], platform: 'PC', baseSize: 15 },
    { title: 'Fallout 4', year: '2015', editions: ['GOTY', 'Complete Edition'], platform: 'PC', baseSize: 32 },
    { title: 'Resident Evil 4', year: '2023', editions: ['Gold Edition', 'Deluxe Edition'], platform: 'PC', baseSize: 55 },
    { title: 'Resident Evil Village', year: '2021', editions: ['Gold Edition'], platform: 'PC', baseSize: 28 },
    { title: 'Monster Hunter World', year: '2018', editions: ['Iceborne Master Edition'], platform: 'PC', baseSize: 50 },
    { title: 'Persona 5 Royal', year: '2022', editions: ['Deluxe Edition'], platform: 'PC', baseSize: 42 },
    { title: 'Final Fantasy VII Remake Intergrade', year: '2021', editions: ['Intergrade'], platform: 'PC', baseSize: 90 },
    { title: 'Sekiro Shadows Die Twice', year: '2019', editions: ['GOTY Edition'], platform: 'PC', baseSize: 15 },
    { title: 'Dark Souls III', year: '2016', editions: ['The Fire Fades Edition'], platform: 'PC', baseSize: 25 },
    { title: 'Starfield', year: '2023', editions: ['Premium Edition'], platform: 'PC', baseSize: 125 },
    { title: 'Alan Wake 2', year: '2023', editions: ['Deluxe Edition'], platform: 'PC', baseSize: 85 },
    { title: 'Horizon Forbidden West', year: '2024', editions: ['Complete Edition'], platform: 'PC', baseSize: 120 },
    { title: 'Death Stranding', year: '2020', editions: ["Director's Cut"], platform: 'PC', baseSize: 68 },
    { title: 'Forza Horizon 5', year: '2021', editions: ['Premium Edition'], platform: 'PC', baseSize: 110 },
    { title: 'Dead Cells', year: '2018', editions: ['Return to Castlevania Edition'], platform: 'PC', baseSize: 2 },
    { title: 'Celeste', year: '2018', editions: [], platform: 'PC', baseSize: 1 },
    { title: 'Slay the Spire', year: '2019', editions: [], platform: 'PC', baseSize: 1 },
    { title: 'Sea of Stars', year: '2023', editions: [], platform: 'PC', baseSize: 4 },
    { title: 'Lies of P', year: '2023', editions: ['Deluxe Edition'], platform: 'PC', baseSize: 40 },
    { title: 'Black Myth Wukong', year: '2024', editions: ['Deluxe Edition'], platform: 'PC', baseSize: 130 },
    // Switch
    { title: 'The Legend of Zelda Tears of the Kingdom', year: '2023', platform: 'Switch', titleId: '0100F2C0115B6000', baseSize: 16 },
    { title: 'The Legend of Zelda Breath of the Wild', year: '2017', platform: 'Switch', titleId: '01007EF00011E000', baseSize: 14 },
    { title: 'Super Mario Odyssey', year: '2017', platform: 'Switch', titleId: '0100000000010000', baseSize: 6 },
    { title: 'Super Smash Bros Ultimate', year: '2018', platform: 'Switch', titleId: '01006A800016E000', baseSize: 15 },
    { title: 'Mario Kart 8 Deluxe', year: '2017', platform: 'Switch', titleId: '0100152000022000', baseSize: 7 },
    { title: 'Pokemon Scarlet', year: '2022', platform: 'Switch', titleId: '0100A3D008C5C000', baseSize: 7 },
    { title: 'Metroid Dread', year: '2021', platform: 'Switch', titleId: '010093801237C000', baseSize: 4 },
    { title: 'Metroid Prime Remastered', year: '2023', platform: 'Switch', titleId: '0100121014688000', baseSize: 7 },
    { title: 'Xenoblade Chronicles 3', year: '2022', platform: 'Switch', titleId: '0100746014358000', baseSize: 14 },
    { title: 'Animal Crossing New Horizons', year: '2020', platform: 'Switch', titleId: '01006F8002326000', baseSize: 6 },
    // Retro Consoles
    { title: 'Super Mario 64', year: '1996', platform: 'N64', ext: '.z64', region: 'USA', baseSize: 0.008 },
    { title: 'The Legend of Zelda Ocarina of Time', year: '1998', platform: 'N64', ext: '.z64', region: 'USA', baseSize: 0.032 },
    { title: 'GoldenEye 007', year: '1997', platform: 'N64', ext: '.z64', region: 'Europe', baseSize: 0.016 },
    { title: 'Super Smash Bros Melee', year: '2001', platform: 'Wii', ext: '.rvz', region: 'USA', baseSize: 1.3 },
    { title: 'The Legend of Zelda The Wind Waker', year: '2002', platform: 'GameCube', ext: '.gcz', region: 'USA', baseSize: 1.4 },
    { title: 'Super Mario Galaxy', year: '2007', platform: 'Wii', ext: '.wbfs', region: 'USA', baseSize: 3.5 },
    { title: 'God of War II', year: '2007', platform: 'PS2', ext: '.chd', region: 'USA', baseSize: 6.4 },
    { title: 'Metal Gear Solid 3 Snake Eater', year: '2004', platform: 'PS2', ext: '.chd', region: 'USA', baseSize: 4.2 },
    { title: 'Grand Theft Auto San Andreas', year: '2004', platform: 'PS2', ext: '.iso', region: 'USA', baseSize: 4.3 },
    { title: 'The Last of Us', year: '2013', platform: 'PS3', ext: '.iso', titleId: 'BCUS98174', baseSize: 27 },
    { title: 'Pokemon Emerald Version', year: '2004', platform: 'GBA', ext: '.gba', region: 'USA, Europe', baseSize: 0.016 },
    { title: 'Chrono Trigger', year: '1995', platform: 'SNES', ext: '.sfc', region: 'USA', baseSize: 0.004 },
    { title: 'Sonic the Hedgehog 2', year: '1992', platform: 'Genesis', ext: '.md', region: 'World', baseSize: 0.001 },
  ];

  const GROUPS = ['FitGirl', 'DODI', 'ElAmigos', 'RUNE', 'TENOKE', 'FLT', 'CODEX', 'SKIDROW', 'Razor1911', 'Goldberg', 'Fairlight', 'Hoodlum', 'Empress', 'CPY', 'GOG'];
  const SUBDIRS = ['Downloads', 'Games', 'Completed', 'Torrents/Done', 'Library/Incoming', 'Storage/Games', 'ROMs/Staging'];

  const items = [];

  for (let i = 0; i < count; i++) {
    const roll = rnd();
    const f = pick(FRANCHISES);
    const group = pick(GROUPS);
    const sub = pick(SUBDIRS);
    const ver = `v${rndInt(1, 4)}.${rndInt(0, 15)}.${rndInt(0, 9)}`;

    if (roll < 0.20) {
      // 1. Repack folder package (20%)
      const safeTitle = f.title.replace(/\s+/g, '.');
      const folderName = `${safeTitle}.${ver}.REPACK-${group.toUpperCase()}`;
      const sizeBytes = Math.round(f.baseSize * 1024 * 1024 * 1024 * (0.8 + rnd() * 0.4));
      
      let childFiles = ['setup.exe', 'data1.bin', 'data2.bin', `${group.toLowerCase()}.nfo`, 'quickSFV.exe'];
      if (group === 'ElAmigos') {
        const sideRoll = rnd();
        if (sideRoll < 0.25) {
          // Side Case: missing 'elamigos-' prefix on one bin file (e.g. data-2.bin)
          childFiles = ['setup.exe', 'elamigos-1.bin', 'data-2.bin', 'elamigos.nfo'];
        } else if (sideRoll < 0.40) {
          // Side Case: Windows duplicate naming collision (e.g. elamigos-2 (1).bin)
          childFiles = ['setup.exe', 'elamigos-1.bin', 'elamigos-2 (1).bin', 'elamigos.nfo'];
        } else if (sideRoll < 0.50) {
          // Side Case: Incomplete download (.part)
          childFiles = ['setup.exe', 'elamigos-1.bin', 'elamigos-2.bin.part', 'elamigos.nfo'];
        } else {
          childFiles = ['setup.exe', 'elamigos-1.bin', 'elamigos-2.bin', 'elamigos.nfo'];
        }
      } else if (group === 'FitGirl') {
        childFiles = ['setup.exe', 'setup-fitgirl-1.bin', 'setup-fitgirl-2.bin', 'quickSFV.exe'];
      }

      items.push({
        fullPath: path.join(fakeBase, sub, folderName),
        filename: folderName,
        ext: '',
        isDir: true,
        isPackage: true,
        childFiles,
        size: sizeBytes,
        isSimulated: true,
      });
    } else if (roll < 0.25) {
      // 2. Loose installed game folder (5%)
      const folderName = f.title;
      const exeName = `${f.title.replace(/[^a-zA-Z0-9]/g, '')}.exe`;
      const sizeBytes = Math.round(f.baseSize * 1024 * 1024 * 1024 * (0.9 + rnd() * 0.2));
      items.push({
        fullPath: path.join(fakeBase, sub, folderName),
        filename: folderName,
        ext: '',
        isDir: true,
        isPackage: true,
        childFiles: [exeName, 'UnityCrashHandler64.exe', 'Game_Data'],
        size: sizeBytes,
        isSimulated: true,
      });
    } else if (roll < 0.50) {
      // 3. Standalone PC ISO (25%)
      const safeTitle = f.title.replace(/\s+/g, '.');
      const ed = f.editions && f.editions.length > 0 && rnd() > 0.5 ? `.${f.editions[0].replace(/\s+/g, '.')}` : '';
      const isoName = `${safeTitle}${ed}.${ver}-${group.toUpperCase()}.iso`;
      const sizeBytes = Math.round(f.baseSize * 1024 * 1024 * 1024 * (0.9 + rnd() * 0.3));
      items.push({
        fullPath: path.join(fakeBase, sub, isoName),
        filename: isoName,
        ext: '.iso',
        isDir: false,
        isPackage: false,
        childFiles: [],
        size: sizeBytes,
        isSimulated: true,
      });
    } else if (roll < 0.55) {
      // 4. Standalone PC exe (5%)
      const safeTitle = f.title.replace(/\s+/g, '.');
      const exeName = `${safeTitle}.${ver}.exe`;
      const sizeBytes = Math.round(Math.min(f.baseSize, 5) * 1024 * 1024 * 1024 * (0.5 + rnd() * 0.5));
      items.push({
        fullPath: path.join(fakeBase, sub, exeName),
        filename: exeName,
        ext: '.exe',
        isDir: false,
        isPackage: false,
        childFiles: [],
        size: sizeBytes,
        isSimulated: true,
      });
    } else if (roll < 0.60) {
      // 5. PC Update / Patch (5%)
      const updName = `${f.title} update ${rndInt(1, 3)}.${rndInt(0, 9)} - ${rndInt(1, 3)}.${rndInt(10, 20)}.exe`;
      const sizeBytes = Math.round((0.5 + rnd() * 3.5) * 1024 * 1024 * 1024);
      items.push({
        fullPath: path.join(fakeBase, sub, f.title, 'Updates', updName),
        filename: updName,
        ext: '.exe',
        isDir: false,
        isPackage: false,
        childFiles: [],
        size: sizeBytes,
        isSimulated: true,
      });
    } else if (roll < 0.63) {
      // 6. PC DLC (3%)
      const dlcName = `${f.title.replace(/\s+/g, '.')}.Expansion.Pack.DLC-${group.toUpperCase()}.exe`;
      const sizeBytes = Math.round((1.0 + rnd() * 8.0) * 1024 * 1024 * 1024);
      items.push({
        fullPath: path.join(fakeBase, sub, f.title, 'DLC', dlcName),
        filename: dlcName,
        ext: '.exe',
        isDir: false,
        isPackage: false,
        childFiles: [],
        size: sizeBytes,
        isSimulated: true,
      });
    } else if (roll < 0.81) {
      // 7. Nintendo Switch ROM (18%)
      const swFranchises = FRANCHISES.filter((x) => x.platform === 'Switch');
      const sw = pick(swFranchises) || f;
      const swSub = 'ROMs/Switch';
      const swExt = pick(['.nsp', '.xci', '.nsz']);
      const subRoll = rnd();

      if (subRoll < 0.60) {
        // Base ROM
        const romName = `${sw.title} [${sw.titleId || '0100F2C0115B6000'}][v0]${swExt}`;
        const sizeBytes = Math.round((sw.baseSize || 10) * 1024 * 1024 * 1024 * (0.8 + rnd() * 0.4));
        items.push({
          fullPath: path.join(fakeBase, swSub, romName),
          filename: romName,
          ext: swExt,
          isDir: false,
          isPackage: false,
          childFiles: [],
          size: sizeBytes,
          isSimulated: true,
        });
      } else if (subRoll < 0.85) {
        // Switch Update
        const updName = `${sw.title} [${sw.titleId || '0100F2C0115B6000'}][v${rndInt(65536, 196608)}][UPD]${swExt}`;
        const sizeBytes = Math.round((1.0 + rnd() * 3.5) * 1024 * 1024 * 1024);
        items.push({
          fullPath: path.join(fakeBase, swSub, updName),
          filename: updName,
          ext: swExt,
          isDir: false,
          isPackage: false,
          childFiles: [],
          size: sizeBytes,
          isSimulated: true,
        });
      } else {
        // Switch DLC
        const dlcName = `${sw.title} [${sw.titleId || '0100F2C0115B6000'}][v0][DLC]${swExt}`;
        const sizeBytes = Math.round((0.5 + rnd() * 2.0) * 1024 * 1024 * 1024);
        items.push({
          fullPath: path.join(fakeBase, swSub, dlcName),
          filename: dlcName,
          ext: swExt,
          isDir: false,
          isPackage: false,
          childFiles: [],
          size: sizeBytes,
          isSimulated: true,
        });
      }
    } else if (roll < 0.91) {
      // 8. Retro / Console ROM (10%)
      const retroFranchises = FRANCHISES.filter((x) => x.platform && x.platform !== 'PC' && x.platform !== 'Switch');
      const retro = pick(retroFranchises) || f;
      const retroExt = retro.ext || pick(['.z64', '.rvz', '.chd', '.iso', '.gba', '.sfc']);
      const region = retro.region || pick(['USA', 'Europe', 'Japan', 'World']);
      const romName = `${retro.title} (${region})${retroExt}`;
      const sizeBytes = Math.round((retro.baseSize || 1) * 1024 * 1024 * 1024 * (0.8 + rnd() * 0.4));
      items.push({
        fullPath: path.join(fakeBase, `ROMs/${retro.platform || 'Retro'}`, romName),
        filename: romName,
        ext: retroExt,
        isDir: false,
        isPackage: false,
        childFiles: [],
        size: sizeBytes,
        isSimulated: true,
      });
    } else if (roll < 0.95) {
      // 9. Preserved Metadata & Artwork (4%)
      const safeTitle = f.title.replace(/\s+/g, '.');
      const metaType = pick(['nfo', 'sfv', 'cover', 'poster', 'manual']);
      let metaName = '';
      let metaExt = '';
      let sizeBytes = 4096;

      if (metaType === 'nfo') {
        metaName = `${safeTitle}-${group.toUpperCase()}.nfo`;
        metaExt = '.nfo';
        sizeBytes = rndInt(3000, 15000);
      } else if (metaType === 'sfv') {
        metaName = `${safeTitle}.sfv`;
        metaExt = '.sfv';
        sizeBytes = rndInt(500, 4000);
      } else if (metaType === 'cover') {
        metaName = 'cover.jpg';
        metaExt = '.jpg';
        sizeBytes = rndInt(150000, 800000);
      } else if (metaType === 'poster') {
        metaName = 'poster.png';
        metaExt = '.png';
        sizeBytes = rndInt(350000, 1500000);
      } else {
        metaName = 'Manual.pdf';
        metaExt = '.pdf';
        sizeBytes = rndInt(2000000, 12000000);
      }

      items.push({
        fullPath: path.join(fakeBase, sub, f.title, metaName),
        filename: metaName,
        ext: metaExt,
        isDir: false,
        isPackage: false,
        childFiles: [],
        size: sizeBytes,
        isSimulated: true,
      });
    } else {
      // 10. Filtered Noise (5%)
      const noise = pick([
        'dxsetup.exe',
        'vcredist_x64.exe',
        'vcredist_x86.exe',
        'oalinst.exe',
        'CrashReportClient.exe',
        'UnityCrashHandler64.exe',
        'Thumbs.db',
        '.DS_Store',
        'unins000.exe',
        'autorun.inf',
      ]);
      const noiseExt = path.extname(noise);
      items.push({
        fullPath: path.join(fakeBase, sub, noise),
        filename: noise,
        ext: noiseExt,
        isDir: false,
        isPackage: false,
        childFiles: [],
        size: rndInt(16384, 15000000),
        isSimulated: true,
      });
    }
  }

  return items;
}

// ── Color helpers for terminal output ──

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

// ── Helpers ──

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Parsing Functions ──

function cleanGameTitle(filename) {
  let name = filename;

  // Strip leading update/part sequence prefix like "1 - ", "2 - ", "01. "
  name = name.replace(/^\d+\s*[-_.]\s*/, '');

  // Strip full build date expressions like (build 13.06.2024)
  name = name.replace(/\(build\s*[^)]+\)/gi, '');
  name = name.replace(/\bbuild\s*[\d.]+\b/gi, '');

  // Strip date patterns (e.g. 20.02.2026, 13.03.2026 - 05.05.2026, 27.05.2025)
  name = name.replace(/\b\d{2}[._-]\d{2}[._-](?:19|20)\d{2}\b/gi, '');

  // Strip update followed by version numbers (dots, spaces, hyphens) e.g.
  // "update 4 1 1 5009956 4 1 1 5849914", "update 5849914 6758295", "update 2.12 - 2.13", "update 1.0.7 - 1.0.16"
  name = name.replace(/(^|[^a-zA-Z0-9])(?:update\s*[\d\s._-]+(?=[a-zA-Z]|$))/gi, '$1');

  // Strip version patterns preceded by 'v' or 'update'
  name = name.replace(/(^|[^a-zA-Z0-9])v\d+(?:\.\d+)+(?:[a-zA-Z]\d*)?(?![a-zA-Z0-9])/gi, '$1');
  name = name.replace(/(^|[\s._-])(?:v\d+|build\s*\d+)(?=[\s._-]|$)/gi, ' ');
  name = name.replace(/\.(iso|exe|zip|rar|7z|bin|cue|nsp|xci|3ds|nds|rvz|chd|gba|z64|sfc|pkg)$/i, '');
  name = name.replace(/\.part\d+$/i, '');

  // Strip Title IDs like [0100F2C0115B6000] or [BCUS98174] or CUSA00411 or PPSA15552
  name = name.replace(/\[[0-9A-Fa-f]{16}\]/g, '');
  name = name.replace(/\[?[A-Z]{4}\d{5}\]?/g, '');

  // Strip ROM update/DLC flags
  name = name.replace(/\[(?:UPD|DLC|v\d+)\]/gi, '');

  // Convert dots, underscores, hyphens to spaces
  name = name.replace(/[\._\-]/g, ' ');

  const tags = [
    /\[repack\]/gi, /\brepack\b/gi, /\belamigos\b/gi, /\bfitgirl\b/gi, /\bdodi\b/gi,
    /\bcodex\b/gi, /\bflt\b/gi, /\bplaza\b/gi, /\bskidrow\b/gi, /\brune\b/gi, /\btenoke\b/gi,
    /\bgoldberg\b/gi, /\brazor1911\b/gi, /\bfairlight\b/gi, /\bhoodlum\b/gi, /\bempress\b/gi, /\bcpy\b/gi,
    /\bduplex\b/gi, /\bvenom\b/gi, /\bi\s*know\b/gi, /\bvoices\d*\b/gi, /\bprophet\b/gi, /\bdelusion\b/gi,
    /\bmulti\d+\b/gi, /\bv\d+(\.\d+)*\b/gi, /\bupdate\s*\d*\b/gi, /\bpart\s*\d+\b/gi,
    /\bunleashed\b/gi, /\bdlc\b/gi, /\bincl\b/gi, /\bgog\b/gi,
    /\bcrack\s*fix(?:\s*v\d+)?\b/gi, /\bcrackfix(?:\s*v\d+)?\b/gi,
    /\bcrack\s*only\b/gi, /\bcrack\b/gi, /\bproper\b/gi, /\bearlyaccess\b/gi,
    /\bunlocker\b/gi, /\bsmall\b/gi,
    /\bwin(?:dows)?\s*(?:10|11|7|8|xp)?\b/gi,
    /\b(?:2[1-5]h[12]|x64|x86|64bit|32bit)\b/gi,
    /\b(?:ps[1-5]|nsw)\b/gi,
    /\+\s*\d+\s*(?:dlcs?|bonuses|bonus|extras?|addons?)\b/gi,
  ];
  for (const tag of tags) {
    name = name.replace(tag, '');
  }

  // Remove empty brackets or parentheses
  name = name.replace(/\[\s*\]/g, '');
  name = name.replace(/\(\s*\)/g, '');
  name = name.replace(/\{\s*\}/g, '');
  name = name.replace(/\s+(exe|iso)\s*$/gi, '');
  name = name.replace(/[\s\-\+\:\,\&]+$/, '');
  name = name.replace(/^[\s\-\+\:\,\&]+/, '');
  return name.replace(/\s+/g, ' ').trim();
}

function extractGroup(rawName) {
  const lower = rawName.toLowerCase().trim();
  const cleaned = lower.replace(/\s*password=.*$/i, '').replace(/\.(iso|exe)$/i, '').trim();
  const dashMatch = cleaned.match(/-([a-z0-9]+)$/);
  if (dashMatch && !CORE_SKIP_WORDS.has(dashMatch[1])) {
    return capitalize(dashMatch[1]);
  }
  const groups = [
    'elamigos', 'fitgirl', 'dodi', 'rune', 'flt', 'codex', 'skidrow',
    'tenoke', 'razor1911', 'goldberg', 'fairlight', 'hoodlum', 'empress', 'cpy',
    'prophet', 'unleashed', 'voices38', 'delusion', 'gog',
  ];
  for (const g of groups) {
    if (new RegExp(`\\b${g}\\b`, 'i').test(rawName)) return capitalize(g);
  }
  return null;
}

function extractRegion(rawName) {
  const match = rawName.match(/\((USA|Europe|Japan|World|En,Ja|En,Fr,De|Asia|Australia|Germany|France)\)/i);
  return match ? match[1] : '';
}

function extractTitleId(rawName) {
  const switchMatch = rawName.match(/\[([0-9A-Fa-f]{16})\]/);
  if (switchMatch) return switchMatch[1];
  const psMatch = rawName.match(/\[?([A-Z]{4}\d{5})\]?/);
  if (psMatch) return psMatch[1];
  return '';
}

function parseReleaseName(rawName, extHint = null) {
  let baseName = path.basename(rawName);
  let ext = '';
  if (extHint !== null && extHint !== undefined) {
    ext = extHint.toLowerCase();
  } else {
    const candidate = (path.extname(rawName) || '').toLowerCase();
    if (candidate && candidate.length <= 6 && !candidate.includes('-')) {
      ext = candidate;
    }
  }
  if (ext && baseName.toLowerCase().endsWith(ext)) {
    baseName = baseName.slice(0, -ext.length);
  }
  let processed = baseName
    .replace(/\(build\s*[^)]+\)/gi, '')
    .replace(/\bbuild\s*[\d.]+\b/gi, '')
    .replace(/\b\d{2}[._-]\d{2}[._-](?:19|20)\d{2}\b/gi, '')
    .replace(/^\d+\s*[-_.]\s*/, '')
    .replace(/\b[vV](\d+(?: \d+)+)/g, (m) => m.replace(/ /g, '.'))
    .replace(/\b(?:update) (\d+(?: \d+)*)/gi, (m) => m.replace(/ /g, '.'))
    .replace(/\s+incl\s+dlc\b.*?(?=-)/gi, '')
    .replace(/\s+password=.*$/i, '');

  const cleanTitle = cleanGameTitle(baseName);

  // Year detection: only in brackets or as last word before extension. Range 1980..2026.
  // Avoid matching 2077 in Cyberpunk or 1942 in Battlefield.
  let year = '';
  const yearBracket = processed.match(/[\[\(](?<year>(?:19[8-9]\d|20[0-2]\d))[\]\)]/);
  if (yearBracket?.groups?.year) {
    year = yearBracket.groups.year;
  } else {
    const yearEnd = processed.match(/(?:\s|\.)(?<year>(?:19[8-9]\d|20[0-2]\d))(?:\s*\.\w+)?$/);
    if (yearEnd?.groups?.year && !cleanTitle.endsWith(yearEnd.groups.year)) {
      year = yearEnd.groups.year;
    }
  }

  // Version detection
  const vMatch = baseName.match(/(?:^|[\s._-])v?(\d+(?:\.\d+)+)/i) || baseName.match(/build\s*(\d+)/i);
  const version = vMatch ? vMatch[1] : '';

  // Edition detection
  const edMatch = baseName.match(EDITION_RE);
  const edition = edMatch ? edMatch[0].trim() : '';

  // Group detection
  const group = extractGroup(baseName) || '';

  // Platform detection
  const isDocMd = ext === '.md' && (['readme', 'changelog', 'install', 'license', 'instructions', 'release', 'notes', 'contributing', 'info', 'faq', 'todo', 'manual'].some((b) => baseName.toLowerCase().includes(b)) || baseName.toLowerCase().startsWith('readme'));
  let platform = isDocMd ? 'PC' : (EXTENSION_PLATFORMS[ext] || '');
  if (!platform) {
    const platMatch = baseName.match(/\[(PC|Switch|NSW|PS[1-5]|Xbox|Wii|GameCube|3DS|NDS|GBA|Genesis)\]/i)
      || baseName.match(/(?:^|[\s._-])(PC|Switch|NSW|PS[1-5]|Xbox|Wii|GameCube|3DS|NDS|GBA|Genesis)(?:[\s._-]|$)/i);
    if (platMatch) {
      let p = platMatch[1].toUpperCase();
      if (p === 'NSW') p = 'Switch';
      platform = p;
    } else {
      platform = 'PC';
    }
  }

  // Region and TitleID detection
  const region = extractRegion(baseName);
  const titleId = extractTitleId(baseName);

  if (titleId) {
    if (/^(?:BCUS|BLES|BLUS)/i.test(titleId)) platform = 'PS3';
    else if (/^CUSA/i.test(titleId)) platform = 'PS4';
  } else if (/\[(?:BCUS|BLES|BLUS)\d{5}\]/i.test(baseName)) {
    platform = 'PS3';
  } else if (/\[?CUSA\d{5}\]?/i.test(baseName)) {
    platform = 'PS4';
  }

  return {
    rawName: baseName,
    title: cleanTitle || baseName,
    cleanTitle,
    year,
    version: version || '1.0',
    edition,
    releaseGroup: group || (platform === 'PC' ? 'Scene' : ''),
    platform,
    region,
    titleId,
  };
}

// ── Classification & Noise Detection ──

function isNoiseFile(filename, fullPath) {
  const lower = filename.toLowerCase();
  for (const pattern of NOISE_EXECUTABLE_PATTERNS) {
    if (lower.includes(pattern)) return true;
  }
  const segments = fullPath.toLowerCase().split(/[\\/]/);
  for (const seg of segments) {
    if (NOISE_DIRECTORY_NAMES.has(seg)) return true;
  }
  if (lower === 'thumbs.db' || lower === '.ds_store' || lower === 'desktop.ini') return true;
  return false;
}

// ── Installer Archive Integrity & Anomaly Diagnosis ──

function analyzeRepackArchiveIntegrity(childFiles = [], folderName = '', releaseGroup = '') {
  const anomalies = [];
  const suggestedRenames = {};
  const lowerFolder = folderName.toLowerCase();
  const lowerGroup = (releaseGroup || '').toLowerCase();

  // Detect release groups
  const isElAmigos = lowerGroup.includes('elamigos') || lowerFolder.includes('elamigos') ||
    childFiles.some((f) => f.toLowerCase().includes('elamigos'));
  const isFitGirl = lowerGroup.includes('fitgirl') || lowerFolder.includes('fitgirl') ||
    childFiles.some((f) => f.toLowerCase().includes('fitgirl'));
  const isDodi = lowerGroup.includes('dodi') || lowerFolder.includes('dodi') ||
    childFiles.some((f) => f.toLowerCase().includes('dodi'));

  // Collect all bin/archive candidates in the package
  const archiveFiles = childFiles.filter((f) => {
    const l = f.toLowerCase();
    return l.endsWith('.bin') || l.endsWith('.cab') || l.endsWith('.doi') ||
      /\.bin(?:\.part|\.tmp|\.crdownload|\.downloading|\.bak|\.orig|\s*\(\d+\))$/i.test(l) ||
      /\b(?:setup|elamigos|data|game|archive)[-_0-9]+.*(?:\.bin|\.cab|\.doi)/i.test(l);
  });

  if (archiveFiles.length === 0) {
    return { isRepack: false, anomalies, suggestedRenames, health: 'GENERIC' };
  }

  // 1. ElAmigos Archive Integrity
  // InnoSetup hardcodes exact names: elamigos-1.bin, elamigos-2.bin, elamigos-3.bin...
  if (isElAmigos) {
    archiveFiles.forEach((f, idx) => {
      const lower = f.toLowerCase();

      // Incomplete download check (.part, .tmp, .crdownload)
      if (/\.(part|crdownload|tmp|downloading)$/i.test(lower)) {
        anomalies.push({
          file: f,
          type: 'INCOMPLETE_DOWNLOAD',
          message: `Incomplete download part detected: '${f}'. The ElAmigos installer will fail until downloaded completely.`,
        });
        return;
      }

      // Windows duplicate download collision: elamigos-2 (1).bin, elamigos-2 - Copy.bin
      const dupMatch = lower.match(/^(el[-_]?amigos[-_]?\d+)\s*\(\d+\)\.bin$/) ||
        lower.match(/^(el[-_]?amigos[-_]?\d+)\s*-\s*copy\.bin$/);
      if (dupMatch) {
        const canonical = `${dupMatch[1].replace(/[-_]+/g, '-')}.bin`;
        suggestedRenames[f] = canonical;
        anomalies.push({
          file: f,
          type: 'DUPLICATE_NAME_COLLISION',
          suggested: canonical,
          message: `Improperly named duplicate: '${f}'. ElAmigos setup.exe will fail ('File not found: ${canonical}'). Renaming to '${canonical}' required.`,
        });
        return;
      }

      // Hyphen/underscore variations: el-amigos-1.bin, el_amigos_1.bin, elamigos_1.bin
      const varMatch = lower.match(/^el[-_]amigos[-_](\d+)\.bin$/) || lower.match(/^elamigos_(\d+)\.bin$/);
      if (varMatch) {
        const canonical = `elamigos-${varMatch[1]}.bin`;
        if (f !== canonical) {
          suggestedRenames[f] = canonical;
          anomalies.push({
            file: f,
            type: 'NAMING_VARIATION',
            suggested: canonical,
            message: `Non-canonical separator: '${f}'. ElAmigos installer expects '${canonical}'.`,
          });
        }
        return;
      }

      // Missing 'elamigos-' prefix completely: e.g. data-2.bin, 2.bin, setup-1.bin, part2.bin
      if (!lower.startsWith('elamigos-') && !lower.startsWith('elamigos.')) {
        const numMatch = lower.match(/(?:^|[-_.a-z])(\d+)\.bin$/i);
        const chunkNum = numMatch ? numMatch[1] : (archiveFiles.length === 1 ? '1' : String(idx + 1));
        const canonical = `elamigos-${chunkNum}.bin`;

        suggestedRenames[f] = canonical;
        anomalies.push({
          file: f,
          type: 'MISSING_ELAMIGOS_PREFIX',
          suggested: canonical,
          message: `ElAmigos bin file missing prefix: '${f}' does not have 'elamigos-' in its name. The installer will fail to find it ('File not found: ${canonical}'). Renaming to '${canonical}' fixes the installer.`,
        });
      }
    });

    // Sequence completeness check: e.g. 1 and 3 present, 2 missing
    const foundIndices = new Set();
    archiveFiles.forEach((f) => {
      const targetName = suggestedRenames[f] || f;
      const m = targetName.toLowerCase().match(/^elamigos-(\d+)\.bin$/);
      if (m) foundIndices.add(parseInt(m[1], 10));
    });

    if (foundIndices.size > 0) {
      const maxIndex = Math.max(...foundIndices);
      for (let i = 1; i <= maxIndex; i++) {
        if (!foundIndices.has(i)) {
          anomalies.push({
            type: 'MISSING_SEQUENCE_CHUNK',
            missing: `elamigos-${i}.bin`,
            message: `Missing archive chunk: 'elamigos-${i}.bin' is missing from the package sequence (found up to chunk ${maxIndex}). The installer will stop midway.`,
          });
        }
      }
    }
  } else if (isFitGirl) {
    // FitGirl expects: fg-01.bin / setup-fitgirl-1.bin, fg-optional-*.bin
    archiveFiles.forEach((f, idx) => {
      const lower = f.toLowerCase();
      if (!lower.startsWith('setup-fitgirl-') && !lower.startsWith('fg-') && lower.endsWith('.bin')) {
        const numMatch = lower.match(/(\d+)\.bin$/);
        const chunk = numMatch ? numMatch[1] : String(idx + 1);
        const canonical = `setup-fitgirl-${chunk}.bin`;
        suggestedRenames[f] = canonical;
        anomalies.push({
          file: f,
          type: 'MISSING_FITGIRL_PREFIX',
          suggested: canonical,
          message: `FitGirl bin file missing prefix: '${f}'. Installer expects '${canonical}'.`,
        });
      }
    });
  } else {
    // Generic InnoSetup / repack packages (setup-1.bin, setup-2.bin, ...)
    archiveFiles.forEach((f) => {
      const lower = f.toLowerCase();
      const dupMatch = lower.match(/^(setup[-_]?\d+)\s*\(\d+\)\.bin$/);
      if (dupMatch) {
        const canonical = `${dupMatch[1].replace(/[-_]+/g, '-')}.bin`;
        suggestedRenames[f] = canonical;
        anomalies.push({
          file: f,
          type: 'DUPLICATE_NAME_COLLISION',
          suggested: canonical,
          message: `Improperly named duplicate: '${f}'. Installer expects '${canonical}'.`,
        });
      }
    });
  }

  const hasIncomplete = anomalies.some((a) => a.type === 'INCOMPLETE_DOWNLOAD');
  const hasRenames = Object.keys(suggestedRenames).length > 0;
  const health = hasIncomplete ? 'INCOMPLETE_DOWNLOAD' : hasRenames ? 'CORRECTABLE_ANOMALY' : 'HEALTHY';

  return {
    isRepack: true,
    archiveType: isElAmigos ? 'ElAmigos' : isFitGirl ? 'FitGirl' : isDodi ? 'DODI' : 'InnoSetup',
    health,
    anomalies,
    suggestedRenames,
  };
}

function isPatchOrUpdate(str) {
  return /\b(?:update|patch|hotfix)\b/i.test(str.replace(/[\._\-]/g, ' '));
}

function isDlcOrAddon(str) {
  return /\b(?:dlc|unlocker|addon)\b/i.test(str.replace(/[\._\-]/g, ' '));
}

function isCrackfix(str) {
  return /\b(?:crackfix|crack\s*fix|crack\s*only)\b/i.test(str.replace(/[\._\-]/g, ' '));
}

function classifyArtifact(filename, fullPath, isDir = false, childFiles = []) {
  const ext = isDir ? '' : path.extname(filename).toLowerCase();
  const lower = filename.toLowerCase();

  if (isNoiseFile(filename, fullPath)) {
    return { category: 'noise', skip: true, isDir };
  }

  // Directory inspection: Check if this directory is a complete game package or repack
  if (isDir) {
    const lowerChildren = childFiles.map((f) => f.toLowerCase());
    const hasSetup = lowerChildren.some((f) =>
      f === 'setup.exe' || f === 'installer.exe' || (f.startsWith('setup') && f.endsWith('.exe')) || f.endsWith('setup.exe') || f.includes('crack.exe')
    );
    // Broad bin candidate recognition (including malformed bin names, Windows duplicates, or incomplete parts)
    const hasBin = lowerChildren.some((f) =>
      f.endsWith('.bin') || f.endsWith('.cab') || f.endsWith('.doi') ||
      /\.bin(?:\.part|\.tmp|\.crdownload|\.downloading|\.bak|\.orig|\s*\(\d+\))$/i.test(f) ||
      /\b(?:setup|elamigos|data|game|archive|fg)[-_0-9]+.*(?:\.bin|\.cab|\.doi)/i.test(f)
    );
    const hasCrackFiles = lowerChildren.some((f) =>
      f === 'steam_api64.dll' || f === 'steam_api.dll' || f === 'steam_emu.ini' || f === 'rld.dll' || f === 'emp.dll' || f === 'rune.ini' || f === 'onlinefix.ini'
    );
    const hasGameExe = lowerChildren.some((f) => f.endsWith('.exe') && !NOISE_EXECUTABLE_PATTERNS.some((p) => f.includes(p)));

    // Standalone crack or crackfix directory
    const isCrackNamed = lower.includes('crackfix') || lower.includes('crack.fix') || lower.includes('crack-fix') || lower.includes('crack only');
    if (isCrackNamed || (hasCrackFiles && (lower.includes('crack') || lower.includes('codex') || lower.includes('rune') || lower.includes('elamigos') || lower.includes('empress') || lower.includes('goldberg')))) {
      return { category: 'folder_crack', isPrimary: false, isDir: true, isPackage: true, isCrack: true };
    }

    // Console Disc Game Packages (PS3 / PS4 / PS5)
    const isPs5 = (lowerChildren.some((f) => f.startsWith('ppsa') || f.includes('ps5')) || lower.includes('ps5') || lower.includes('ppsa')) && !hasGameExe;
    const isPs3 = lowerChildren.some((f) => f === 'ps3_game' || f === 'ps3_disc.sfb' || f === 'param.sfo' || f === 'eboot.bin') && (lower.includes('bcus') || lower.includes('bles') || lower.includes('blus') || lower.includes('ps3') || lowerChildren.includes('ps3_game'));
    const isPs4 = (lowerChildren.some((f) => f === 'sce_sys') || lower.includes('cusa') || lower.includes('ps4')) && !hasGameExe && !isPs5;
    if (isPs5) {
      return { category: 'folder_console', platform: 'PS5', isPrimary: true, isDir: true, isPackage: true };
    }
    if (isPs3) {
      return { category: 'folder_console', platform: 'PS3', isPrimary: true, isDir: true, isPackage: true };
    }
    if (isPs4) {
      return { category: 'folder_console', platform: 'PS4', isPrimary: true, isDir: true, isPackage: true };
    }

    if (hasSetup && hasBin) {
      return { category: 'folder_repack', isPrimary: true, isDir: true, isPackage: true };
    }

    // Generic grouping subfolders (Updates, DLC, Crack, etc.)
    const isGenericSubfolder = /^(?:updates?|patches?|dlcs?|cracks?|extras?|bonus)$/i.test(lower);
    if (isGenericSubfolder) {
      return { category: 'folder_generic', isPrimary: false, isDir: true, isPackage: false };
    }

    // Specific update or DLC package folders (e.g. Cyberpunk.2077.Update.v2.12-ElAmigos)
    if (isPatchOrUpdate(lower) && !hasSetup) {
      return { category: 'update', isPrimary: false, isDir: true, isPackage: true };
    }
    if (isDlcOrAddon(lower) && !hasSetup) {
      return { category: 'dlc', isPrimary: false, isDir: true, isPackage: true };
    }

    // Store Manifests & Specific Game Indicators
    const hasStoreManifest = lowerChildren.some((f) =>
      /^goggame-\d+\.info$/i.test(f) || f === '.egstore' || f === 'uplay_install.manifest' ||
      f === 'uplay_install.state' || f === 'appxmanifest.xml' || f === 'gamelaunchhelper.exe' ||
      f === 'steam_emu.ini' || f === 'rune.ini' || f === 'hlboot.dat' || f.endsWith('_data')
    );

    // Check nested subfolders for game executable (bin/, Binaries/Win64/, etc.)
    let hasNestedExe = false;
    if (!hasGameExe && fullPath && fs.existsSync(fullPath)) {
      const checkSubdirs = ['bin', 'bin/x64', 'binaries/win64', 'game/bin', 'content'];
      for (const sub of checkSubdirs) {
        const p = path.join(fullPath, sub);
        try {
          if (fs.existsSync(p)) {
            const subEntries = fs.readdirSync(p);
            if (subEntries.some((f) => f.toLowerCase().endsWith('.exe') && !NOISE_EXECUTABLE_PATTERNS.some((np) => f.toLowerCase().includes(np)))) {
              hasNestedExe = true;
              break;
            }
          }
        } catch (e) {}
      }
    }

    if (hasGameExe || hasNestedExe || hasStoreManifest) {
      return { category: 'folder_game', isPrimary: true, isDir: true, isPackage: true };
    }
    return { category: 'folder_generic', isPrimary: false, isDir: true, isPackage: false };
  }

  // Preserved Metadata & Extras
  const DOC_BASENAMES = ['readme', 'changelog', 'install', 'license', 'instructions', 'release', 'notes', 'contributing', 'info', 'faq', 'todo', 'manual']; const baseNoExt = path.basename(filename, ext).toLowerCase(); if (['.nfo', '.sfv', '.diz', '.otixmeta'].includes(ext) || ['cover.jpg', 'poster.png', 'folder.jpg'].includes(lower) || ['.txt', '.doc', '.docx', '.pdf'].includes(ext) || (ext === '.md' && (DOC_BASENAMES.some((b) => baseNoExt.includes(b)) || baseNoExt.startsWith('readme')))) {
    return { category: 'metadata', isPrimary: false, isMetadata: true };
  }

  // Disc Images & ISOs
  if (['.iso', '.img', '.bin', '.cue', '.mdf', '.mds', '.nrg'].includes(ext)) {
    if (isPatchOrUpdate(lower)) {
      return { category: 'update', isPrimary: false };
    }
    return { category: 'iso', isPrimary: true };
  }

  // Console & Handheld ROMs
  if (Object.keys(EXTENSION_PLATFORMS).includes(ext)) {
    // Check if ROM is a Switch update or DLC
    if (lower.includes('[upd]') || lower.includes('[v131072]') || lower.includes('[v65536]')) {
      return { category: 'update', isPrimary: false, isRom: true };
    }
    if (lower.includes('[dlc]')) {
      return { category: 'dlc', isPrimary: false, isRom: true };
    }
    return { category: 'rom', isPrimary: true, isRom: true };
  }

  // Executables (PC Games, Installers, Updates, DLCs, Crackfixes)
  if (ext === '.exe') {
    if (isCrackfix(lower)) {
      return { category: 'crack', isPrimary: false, isCrack: true };
    }
    if (isPatchOrUpdate(lower)) {
      return { category: 'update', isPrimary: false };
    }
    if (isDlcOrAddon(lower)) {
      return { category: 'dlc', isPrimary: false };
    }
    const stem = path.basename(filename, ext).toLowerCase();
    if (GENERIC_INSTALLER_STEMS.has(stem) || lower.includes('setup') || lower.includes('install')) {
      return { category: 'installer', isPrimary: true };
    }
    return { category: 'game_exe', isPrimary: true };
  }

  // Archives (.zip, .rar, .7z)
  if (['.zip', '.rar', '.7z'].includes(ext)) {
    if (isCrackfix(lower)) {
      return { category: 'crack', isPrimary: false, isCrack: true };
    }
    if (isPatchOrUpdate(lower)) {
      return { category: 'update', isPrimary: false };
    }
    if (isDlcOrAddon(lower)) {
      return { category: 'dlc', isPrimary: false };
    }
    // Multi-part secondary archives (.part02.rar, .part2.rar, .r00, .r01, .7z.002, etc.)
    const partMatch = lower.match(/\.part(\d+)\.rar$/i);
    if (partMatch) {
      const partNum = parseInt(partMatch[1], 10);
      if (partNum > 1) {
        return { category: 'archive_part', isPrimary: false };
      }
      return { category: 'archive', isPrimary: true };
    }
    if (/\.r\d{2}$/i.test(lower) || /\.7z\.\d{3}$/i.test(lower)) {
      return { category: 'archive_part', isPrimary: false };
    }
    return { category: 'archive', isPrimary: true };
  }

  return { category: 'other', skip: true };
}

// ── Template Engine ──

function applyTemplate(release, template, ext) {
  let res = template;
  const tokenMap = {
    '{Title}': release.title,
    '{CleanTitle}': release.cleanTitle,
    '{Year}': release.year || '',
    '{Platform}': release.platform || 'PC',
    '{ReleaseGroup}': release.releaseGroup || '',
    '{Edition}': release.edition || '',
    '{Version}': release.version || '',
    '{Region}': release.region || '',
    '{TitleId}': release.titleId || '',
    '{OriginalName}': release.rawName,
    '{ext}': ext ? ext.replace(/^\./, '') : '',
  };

  for (const [token, val] of Object.entries(tokenMap)) {
    res = res.replace(new RegExp(token.replace(/[{}]/g, '\\$&'), 'g'), val);
  }

  // Clean empty parentheses, brackets, double spaces, and dangling slashes
  res = res
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\{\s*\}/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\//g, '/')
    .replace(/\/\s+/g, '/')
    .replace(/\s+\./g, '.')
    .replace(/[\\/]+/g, '/')
    .replace(/\/$/, '')
    .trim();

  return res;
}

// ── Folder Walker ──

function walkDirectory(dirPath, maxDepth = 4, currentDepth = 0) {
  if (currentDepth > maxDepth) return [];
  let items = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    // Inspect top-level folders to see if they are container packages (repacks / installed games)
    for (const ent of entries) {
      const full = path.join(dirPath, ent.name);
      if (ent.isDirectory()) {
        const lower = ent.name.toLowerCase();
        if (NOISE_DIRECTORY_NAMES.has(lower) || lower.startsWith('$') || lower.startsWith('.')) {
          continue;
        }

        // Check if directory is a repack or game container package
        let subEntries = [];
        try {
          subEntries = fs.readdirSync(full);
        } catch (e) {
          // ignore
        }

        const classification = classifyArtifact(ent.name, full, true, subEntries);
        if (classification.isPackage) {
          // Add directory package as a single atomic item
          let dirSize = 0;
          try {
            for (const sub of subEntries) {
              const subStat = fs.statSync(path.join(full, sub));
              if (subStat.isFile()) dirSize += subStat.size;
            }
          } catch (e) {
            dirSize = 0;
          }
          items.push({
            fullPath: full,
            filename: ent.name,
            ext: '',
            isDir: true,
            isPackage: true,
            childFiles: subEntries,
            size: dirSize,
            isSimulated: false,
          });
        } else {
          // Normal folder: recurse into it
          items = items.concat(walkDirectory(full, maxDepth, currentDepth + 1));
        }
      } else if (ent.isFile()) {
        let size = 0;
        try {
          size = fs.statSync(full).size;
        } catch (e) {
          size = 0;
        }
        items.push({
          fullPath: full,
          filename: ent.name,
          ext: path.extname(ent.name).toLowerCase(),
          isDir: false,
          isPackage: false,
          childFiles: [],
          size,
          isSimulated: false,
        });
      }
    }
  } catch (err) {
    // Ignore unreadable dirs
  }
  return items;
}

// ── Simulation Engine ──

function runSimulation(rootDir, options = {}) {
  const startTime = process.hrtime.bigint();
  const presetKey = options.preset || 'standard';
  const template = options.template || PRESETS[presetKey] || PRESETS.standard;
  let rawItems = [];
  const isScale = Boolean(options.scale && options.scale > 0);
  const isSample = options.sample || !rootDir || !fs.existsSync(rootDir) || isScale;

  if (isScale) {
    const scaleCount = parseInt(options.scale, 10) || 10000;
    const fakeBase = rootDir || 'D:\\Games\\Library';
    rawItems = generateSyntheticReleases(scaleCount, fakeBase);
  } else if (isSample) {
    const fakeBase = rootDir || 'D:\\Games\\Library';
    rawItems = SAMPLE_RELEASES.map((s) => ({
      fullPath: path.join(fakeBase, s.sub, s.raw),
      filename: s.raw,
      ext: s.ext || '',
      isDir: Boolean(s.isDir),
      isPackage: Boolean(s.isDir),
      childFiles: s.files || [],
      size: s.size || 0,
      isSimulated: true,
    }));
  } else {
    rawItems = walkDirectory(rootDir, options.depth || 4);
  }

  const results = [];
  const targetMap = new Map();
  let noiseCount = 0;
  let totalBytes = 0;
  const platformBreakdown = {};

  for (const item of rawItems) {
    const classification = classifyArtifact(item.filename, item.fullPath, item.isDir, item.childFiles);
    if (classification.skip) {
      noiseCount++;
      continue;
    }

    const release = parseReleaseName(item.filename, item.ext);
    let targetRel = '';
    let status = 'RENAME_AND_MOVE';

    if (classification.platform) {
      release.platform = classification.platform;
    }

    // If release title is empty or generic, infer parent game from parent directory path
    if (!release.cleanTitle || !release.title || /^v?\d+[\d.]*$/.test(release.title) || CORE_SKIP_WORDS.has(release.title.toLowerCase())) {
      const parentDir = path.dirname(item.fullPath);
      let parentBase = path.basename(parentDir);
      // If parent is "Updates", "DLC", "Crack", etc., look up one more level
      if (/^(?:updates?|patches?|dlcs?|cracks?|extras?|bonus)$/i.test(parentBase)) {
        parentBase = path.basename(path.dirname(parentDir));
      }
      const inferred = cleanGameTitle(parentBase);
      if (inferred) {
        release.title = inferred;
        release.cleanTitle = inferred;
      }
    }

    if (classification.category === 'update') {
      const yearPart = release.year ? ` (${release.year})` : '';
      const parentDir = `${release.title}${yearPart} [${release.platform}]/Updates`;
      targetRel = path.join(parentDir, item.filename).replace(/\\/g, '/');
      status = 'SECONDARY_UPDATE';
    } else if (classification.category === 'dlc') {
      const yearPart = release.year ? ` (${release.year})` : '';
      const parentDir = `${release.title}${yearPart} [${release.platform}]/DLC`;
      targetRel = path.join(parentDir, item.filename).replace(/\\/g, '/');
      status = 'SECONDARY_DLC';
    } else if (classification.category === 'folder_crack' || classification.category === 'crack') {
      const yearPart = release.year ? ` (${release.year})` : '';
      const parentDir = `${release.title}${yearPart} [${release.platform}]/Crack`;
      targetRel = path.join(parentDir, item.filename).replace(/\\/g, '/');
      status = 'SECONDARY_CRACK';
    } else if (classification.category === 'archive_part') {
      const yearPart = release.year ? ` (${release.year})` : '';
      const parentDir = `${release.title}${yearPart} [${release.platform}]`;
      targetRel = path.join(parentDir, item.filename).replace(/\\/g, '/');
      status = 'SECONDARY_ARCHIVE_PART';
    } else if (classification.isPackage) {
      // Reorganize container folder package as a whole unit
      const folderTemplate = template.split(/[\\/]/).slice(0, -1).join('/') || '{Title} ({Year}) [{Platform}]';
      targetRel = applyTemplate(release, folderTemplate, '');
      status = 'CONTAINER_PACKAGE';
    } else if (classification.category === 'metadata') {
      const yearPart = release.year ? ` (${release.year})` : '';
      const parentDir = `${release.title}${yearPart} [${release.platform}]`;
      targetRel = path.join(parentDir, item.filename).replace(/\\/g, '/');
      status = 'PRESERVED_METADATA';
    } else {
      targetRel = applyTemplate(release, template, item.ext);
      const simulatedSourceRel = isSample
        ? item.fullPath.replace(/^[a-zA-Z]:[\\/]/, '').replace(/\\/g, '/')
        : path.relative(rootDir, item.fullPath).replace(/\\/g, '/');

      if (simulatedSourceRel.toLowerCase() === targetRel.toLowerCase()) {
        status = 'ALREADY_ORGANIZED';
      } else if (targetMap.has(targetRel.toLowerCase())) {
        if (options.resolveConflicts === 'auto') {
          // Auto disambiguation
          const disambiguator = release.releaseGroup || release.version || '1';
          const extWithDot = item.ext ? `.${item.ext.replace(/^\./, '')}` : '';
          targetRel = targetRel.replace(new RegExp(`\\${extWithDot}$`), ` [${disambiguator}]${extWithDot}`);
          status = 'RENAME_AND_MOVE';
        } else {
          status = 'CONFLICT_COLLISION';
        }
      }
    }

    targetMap.set(targetRel.toLowerCase(), item.fullPath);
    totalBytes += item.size;

    // Tally platform stats
    const plat = release.platform || 'Other';
    if (!platformBreakdown[plat]) {
      platformBreakdown[plat] = { count: 0, bytes: 0 };
    }
    platformBreakdown[plat].count++;
    platformBreakdown[plat].bytes += item.size;

    // Perform installer archive integrity analysis on packages
    let integrity = null;
    if (classification.isPackage || item.isPackage || item.isDir) {
      integrity = analyzeRepackArchiveIntegrity(item.childFiles, item.filename, release.releaseGroup);
    }

    results.push({
      sourcePath: item.fullPath,
      sourceFilename: item.filename,
      category: classification.category,
      isDir: item.isDir,
      isPackage: Boolean(item.isPackage),
      childFiles: item.childFiles,
      size: item.size,
      sizeFormatted: formatBytes(item.size),
      parsed: release,
      targetRelative: targetRel,
      status,
      integrity,
      anomalies: integrity ? integrity.anomalies : [],
      suggestedRenames: integrity ? integrity.suggestedRenames : {},
      health: integrity ? integrity.health : 'NORMAL',
      isSimulated: item.isSimulated,
    });
  }

  const endTime = process.hrtime.bigint();
  const elapsedMs = Number(endTime - startTime) / 1e6;
  const throughput = Math.round((rawItems.length / (elapsedMs / 1000)) || 0);

  return {
    rootDir: rootDir || 'D:\\Games\\Library (Simulated)',
    isSample,
    isScale,
    scaleCount: isScale ? rawItems.length : undefined,
    preset: presetKey,
    template,
    totalScanned: rawItems.length,
    noiseFiltered: noiseCount,
    totalBytes,
    totalBytesFormatted: formatBytes(totalBytes),
    elapsedMs: Math.round(elapsedMs * 10) / 10,
    throughput,
    platformBreakdown,
    actionableItems: results,
    metrics: {
      total: results.length,
      packages: results.filter((i) => i.isPackage).length,
      singleFiles: results.filter((i) => !i.isPackage && !i.isDir && i.category !== 'update' && i.category !== 'dlc' && i.category !== 'metadata').length,
      updates: results.filter((i) => i.status === 'SECONDARY_UPDATE').length,
      dlcs: results.filter((i) => i.status === 'SECONDARY_DLC').length,
      cracks: results.filter((i) => i.status === 'SECONDARY_CRACK').length,
      metadata: results.filter((i) => i.status === 'PRESERVED_METADATA').length,
      healedPackages: results.filter((i) => i.integrity && Object.keys(i.integrity.suggestedRenames).length > 0).length,
      incompleteDownloads: results.filter((i) => i.integrity && i.integrity.health === 'INCOMPLETE_DOWNLOAD').length,
      conflicts: results.filter((i) => i.status === 'CONFLICT_COLLISION').length,
      alreadyOrganized: results.filter((i) => i.status === 'ALREADY_ORGANIZED').length,
    },
  };
}

// ── CLI Runner ──

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dir: '',
    preset: 'standard',
    template: '',
    sample: false,
    json: false,
    depth: 4,
    resolveConflicts: 'none',
    scale: 0,
    limit: 10,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dir' || arg === '-d') {
      options.dir = args[++i];
    } else if (arg === '--preset' || arg === '-p') {
      options.preset = args[++i];
    } else if (arg === '--template' || arg === '-t') {
      options.template = args[++i];
    } else if (arg === '--sample' || arg === '-s') {
      options.sample = true;
    } else if (arg === '--scale') {
      options.scale = parseInt(args[++i], 10) || 10000;
      options.sample = true;
    } else if (arg === '--limit') {
      options.limit = parseInt(args[++i], 10) || 10;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--depth') {
      options.depth = parseInt(args[++i], 10) || 4;
    } else if (arg === '--resolve-conflicts') {
      options.resolveConflicts = args[++i] || 'auto';
    } else if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    }
  }

  return options;
}

function showHelp() {
  console.log(`
${colors.bold}${colors.cyan}Otix Game & File Management Simulation CLI${colors.reset}
Simulates library discovery, release parsing, and reorganization without touching any files.

${colors.bold}Usage:${colors.reset}
  node scripts/simulate-game-management.js [options]

${colors.bold}Options:${colors.reset}
  -d, --dir <path>             Real folder path to scan (ISOs, game library, downloads)
  -p, --preset <name>          Naming preset (default: standard)
                               Available: standard, clean_game_folder, flat_title, scene_release,
                                          year_subfolder, platform_subfolder, rom_standard
  -t, --template <tmpl>        Custom naming template (e.g. "{Title} ({Year})/{Title}.{ext}")
  -s, --sample                 Run simulation with rich realistic sample releases (PC, Switch, ROMs, Repacks)
  --scale <number>             Run large-scale stress simulation with N synthetic file structures (e.g. 10000)
  --limit <number>             Number of sample preview items to show (default: 10 when scaled)
  --depth <number>             Directory scan depth (default: 4)
  --resolve-conflicts <mode>   Collision strategy: auto (disambiguate), none (flag collision)
  --json                       Output raw JSON results for machine processing
  -h, --help                   Show this help screen
`);
}

function main() {
  const options = parseArgs();
  const sim = runSimulation(options.dir, options);

  if (options.json) {
    console.log(JSON.stringify(sim, null, 2));
    return;
  }

  const isLargeScale = sim.totalScanned > 40;

  console.log('');
  console.log(`${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}             OTIX FILE MANAGEMENT SIMULATION (DRY RUN)                  ${colors.reset}`);
  console.log(`${colors.cyan}========================================================================${colors.reset}`);
  console.log(`  ${colors.bold}Scan Target:${colors.reset}     ${sim.rootDir} ${sim.isScale ? `${colors.yellow}(Scale Benchmark: ${sim.scaleCount.toLocaleString()} items)${colors.reset}` : sim.isSample ? `${colors.yellow}(Sample Mode)${colors.reset}` : ''}`);
  console.log(`  ${colors.bold}Naming Template:${colors.reset} ${colors.magenta}${sim.template}${colors.reset}`);
  console.log(`  ${colors.bold}Preset:${colors.reset}          ${sim.preset}`);
  console.log(`  ${colors.bold}Simulated Size:${colors.reset}  ${colors.yellow}${sim.totalBytesFormatted}${colors.reset}`);
  console.log(`  ${colors.bold}Mode:${colors.reset}            ${colors.green}Strict Simulation / ZERO Outcomes (No files touched)${colors.reset}`);

  if (isLargeScale) {
    const memMb = (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(1);
    console.log(`${colors.cyan}------------------------------------------------------------------------${colors.reset}`);
    console.log(`  ${colors.bold}${colors.yellow}⚡ Scale & Performance Benchmark Telemetry:${colors.reset}`);
    console.log(`  ${colors.bold}Files Inspected:${colors.reset} ${sim.totalScanned.toLocaleString()} files & directory packages`);
    console.log(`  ${colors.bold}Execution Time:${colors.reset}  ${colors.green}${sim.elapsedMs} ms${colors.reset}`);
    console.log(`  ${colors.bold}Throughput:${colors.reset}      ${colors.cyan}${sim.throughput.toLocaleString()} items / sec${colors.reset}`);
    console.log(`  ${colors.bold}Memory Heap:${colors.reset}     ${memMb} MB`);
  }

  console.log(`${colors.cyan}------------------------------------------------------------------------${colors.reset}`);
  console.log(`  ${colors.bold}Files Inspected:${colors.reset} ${sim.totalScanned.toLocaleString()}`);
  console.log(`  ${colors.bold}Noise Filtered:${colors.reset}  ${sim.noiseFiltered.toLocaleString()} (DirectX, vcredist, crash handlers, cache, etc.)`);
  console.log(`  ${colors.bold}Valid Artifacts:${colors.reset} ${sim.actionableItems.length.toLocaleString()}`);
  console.log(`    ${colors.dim}├─ Directory Packages:${colors.reset} ${sim.metrics.packages.toLocaleString()} (Repacks / Game installations kept intact)`);
  console.log(`    ${colors.dim}├─ Standalone Images:${colors.reset}  ${sim.metrics.singleFiles.toLocaleString()} (PC ISOs, GOG setups, Executables)`);
  console.log(`    ${colors.dim}├─ Secondary Updates:${colors.reset}  ${sim.metrics.updates.toLocaleString()} (Grouped into parent Updates/)`);
  console.log(`    ${colors.dim}├─ Secondary DLCs:${colors.reset}     ${sim.metrics.dlcs.toLocaleString()} (Grouped into parent DLC/)`);
  if (sim.metrics.cracks > 0) {
    console.log(`    ${colors.dim}├─ Secondary Cracks:${colors.reset}   ${sim.metrics.cracks.toLocaleString()} (Grouped into parent Crack/)`);
  }
  console.log(`    ${colors.dim}├─ Preserved Metadata:${colors.reset} ${sim.metrics.metadata ? sim.metrics.metadata.toLocaleString() : 0} (NFO, SFV, Artwork)`);
  if (sim.metrics.healedPackages > 0) {
    console.log(`    ${colors.cyan}├─ Repack Bin Healed:${colors.reset}  ${sim.metrics.healedPackages.toLocaleString()} (Malformed bin files normalized for setup.exe)`);
  }
  if (sim.metrics.incompleteDownloads > 0) {
    console.log(`    ${colors.yellow}├─ Incomplete Parts:${colors.reset}   ${sim.metrics.incompleteDownloads.toLocaleString()} (Flagged with .part/.tmp before install)`);
  }
  console.log(`    ${colors.dim}└─ Conflicts Flagged:${colors.reset}  ${sim.metrics.conflicts > 0 ? `${colors.red}${sim.metrics.conflicts.toLocaleString()}${colors.reset}` : '0'}`);

  if (isLargeScale && sim.platformBreakdown) {
    console.log(`${colors.cyan}------------------------------------------------------------------------${colors.reset}`);
    console.log(`  ${colors.bold}${colors.yellow}🎮 Platform Distribution:${colors.reset}`);
    for (const [platform, stats] of Object.entries(sim.platformBreakdown)) {
      const pct = ((stats.count / sim.actionableItems.length) * 100).toFixed(1);
      console.log(`  ${colors.bold}${platform.padEnd(10)}:${colors.reset} ${stats.count.toLocaleString().padStart(5)} items (${pct}%) | ${formatBytes(stats.bytes)}`);
    }
  }

  console.log(`${colors.cyan}========================================================================${colors.reset}`);
  console.log('');

  if (sim.actionableItems.length === 0) {
    console.log(`${colors.yellow}No actionable game artifacts found in target directory.${colors.reset}`);
    console.log(`Tip: Run with ${colors.bold}--sample${colors.reset} or ${colors.bold}--scale 10000${colors.reset} to preview.`);
    return;
  }

  if (isLargeScale) {
    console.log(`${colors.bold}Representative Archetype Samples Across the 10,000 Structures:${colors.reset}`);
    console.log('');

    // Pick 1 representative item from each archetype
    const archetypes = [
      { label: 'ElAmigos Repack with Healed Bin Sequence', match: (i) => i.isPackage && i.integrity && Object.keys(i.integrity.suggestedRenames).length > 0 },
      { label: 'Container Folder Package (Repack Multi-Bin)', match: (i) => i.isPackage && i.childFiles && i.childFiles.some((f) => f.includes('bin')) },
      { label: 'Standalone Scene Crack Supplement Folder', match: (i) => i.status === 'SECONDARY_CRACK' },
      { label: 'Installed Game Folder Package (Direct Exe + Engine Data)', match: (i) => i.isPackage && (!i.childFiles || !i.childFiles.some((f) => f.includes('bin'))) && i.status !== 'SECONDARY_CRACK' },
      { label: 'Standalone Scene PC ISO Image', match: (i) => !i.isPackage && i.category === 'iso' && i.parsed.platform === 'PC' },
      { label: 'Nintendo Switch ROM (NSP with Title ID)', match: (i) => i.parsed.platform === 'Switch' && i.category === 'rom' && i.parsed.titleId },
      { label: 'Secondary Satellite Update Installer', match: (i) => i.status === 'SECONDARY_UPDATE' },
      { label: 'Secondary Satellite DLC Installer', match: (i) => i.status === 'SECONDARY_DLC' },
      { label: 'Classic Retro Console ROM (Region-Tagged)', match: (i) => i.category === 'rom' && i.parsed.platform !== 'Switch' },
      { label: 'Preserved Scene Metadata & Artwork', match: (i) => i.status === 'PRESERVED_METADATA' },
    ];

    let sampleIdx = 1;
    for (const arch of archetypes) {
      const found = sim.actionableItems.find(arch.match);
      if (found) {
        let badgeColor = colors.green;
        if (found.status === 'ALREADY_ORGANIZED') badgeColor = colors.blue;
        if (found.status === 'CONFLICT_COLLISION') badgeColor = colors.red;
        if (found.status === 'SECONDARY_UPDATE' || found.status === 'SECONDARY_DLC' || found.status === 'SECONDARY_CRACK') badgeColor = colors.yellow;
        if (found.status === 'CONTAINER_PACKAGE') badgeColor = colors.cyan;

        console.log(`[${sampleIdx++}] ${colors.bold}${colors.cyan}${arch.label}${colors.reset}`);
        console.log(`    ${colors.gray}Source:${colors.reset}       ${found.sourceFilename}`);
        console.log(`    ${colors.gray}Clean Title:${colors.reset}  ${colors.cyan}${found.parsed.cleanTitle}${colors.reset} | Platform: ${found.parsed.platform}${found.parsed.titleId ? ` | TitleID: [${found.parsed.titleId}]` : ''}`);
        console.log(`    ${colors.gray}Proposed To:${colors.reset}  ${colors.magenta}${found.targetRelative}${colors.reset}`);
        console.log(`    ${colors.gray}Status:${colors.reset}       ${badgeColor}[${found.status}]${colors.reset}`);
        if (found.childFiles && found.childFiles.length > 0) {
          console.log(`    ${colors.gray}Protected:${colors.reset}    ${colors.dim}${found.childFiles.slice(0, 4).join(', ')}${found.childFiles.length > 4 ? '...' : ''}${colors.reset}`);
        }
        if (found.anomalies && found.anomalies.length > 0) {
          console.log(`    ${colors.yellow}⚠️  Installer Archive Diagnosis:${colors.reset}`);
          for (const a of found.anomalies) {
            console.log(`       ${colors.yellow}• [${a.type}]${colors.reset} ${a.message}`);
          }
          if (found.suggestedRenames && Object.keys(found.suggestedRenames).length > 0) {
            console.log(`    ${colors.green}✔  Auto-Healing Proposed (fixes installer):${colors.reset}`);
            for (const [orig, fixed] of Object.entries(found.suggestedRenames)) {
              console.log(`       ${colors.dim}${orig}${colors.reset} ➔ ${colors.bold}${colors.green}${fixed}${colors.reset}`);
            }
          }
        }
        console.log('');
      }
    }
  } else {
    console.log(`${colors.bold}Discovered Artifacts & Proposed Organization:${colors.reset}`);
    console.log('');

    for (let idx = 0; idx < sim.actionableItems.length; idx++) {
      const item = sim.actionableItems[idx];
      let badgeColor = colors.green;
      if (item.status === 'ALREADY_ORGANIZED') badgeColor = colors.blue;
      if (item.status === 'CONFLICT_COLLISION') badgeColor = colors.red;
      if (item.status === 'SECONDARY_UPDATE' || item.status === 'SECONDARY_DLC' || item.status === 'SECONDARY_CRACK') badgeColor = colors.yellow;
      if (item.status === 'CONTAINER_PACKAGE') badgeColor = colors.cyan;

      const typeLabel = item.isPackage ? 'FOLDER PACKAGE' : item.category.toUpperCase();
      const sizeLabel = item.sizeFormatted ? ` | ${item.sizeFormatted}` : '';

      console.log(`[${idx + 1}] ${colors.bold}${item.sourceFilename}${colors.reset}`);
      console.log(`    ${colors.gray}Type:${colors.reset}         ${typeLabel} | Platform: ${item.parsed.platform} | Group: ${item.parsed.releaseGroup || 'N/A'}${sizeLabel}`);
      if (item.parsed.edition) {
        console.log(`    ${colors.gray}Edition:${colors.reset}      ${colors.yellow}${item.parsed.edition}${colors.reset}`);
      }
      console.log(`    ${colors.gray}Clean Title:${colors.reset}  ${colors.cyan}${item.parsed.cleanTitle}${colors.reset}`);
      console.log(`    ${colors.gray}Proposed To:${colors.reset}  ${colors.magenta}${item.targetRelative}${colors.reset}`);
      console.log(`    ${colors.gray}Status:${colors.reset}       ${badgeColor}[${item.status}]${colors.reset}`);
      if (item.childFiles && item.childFiles.length > 0) {
        console.log(`    ${colors.gray}Contains:${colors.reset}     ${colors.dim}${item.childFiles.slice(0, 4).join(', ')}${item.childFiles.length > 4 ? '...' : ''}${colors.reset}`);
      }
      if (item.anomalies && item.anomalies.length > 0) {
        console.log(`    ${colors.yellow}⚠️  Installer Archive Diagnosis:${colors.reset}`);
        for (const a of item.anomalies) {
          console.log(`       ${colors.yellow}• [${a.type}]${colors.reset} ${a.message}`);
        }
        if (item.suggestedRenames && Object.keys(item.suggestedRenames).length > 0) {
          console.log(`    ${colors.green}✔  Auto-Healing Proposed (installer will find archives):${colors.reset}`);
          for (const [orig, fixed] of Object.entries(item.suggestedRenames)) {
            console.log(`       ${colors.dim}${orig}${colors.reset} ➔ ${colors.bold}${colors.green}${fixed}${colors.reset}`);
          }
        }
      }
      console.log('');
    }
  }

  console.log(`${colors.cyan}------------------------------------------------------------------------${colors.reset}`);
  console.log(`${colors.green}✔ Simulation completed successfully with zero modifications to your disk.${colors.reset}`);
  console.log(`${colors.cyan}========================================================================${colors.reset}`);
  console.log('');
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  runSimulation,
  generateSyntheticReleases,
  analyzeRepackArchiveIntegrity,
  parseReleaseName,
  classifyArtifact,
  cleanGameTitle,
  extractGroup,
  applyTemplate,
  PRESETS,
  SAMPLE_RELEASES,
  NOISE_EXECUTABLE_PATTERNS,
  NOISE_DIRECTORY_NAMES,
  EXTENSION_PLATFORMS,
};
