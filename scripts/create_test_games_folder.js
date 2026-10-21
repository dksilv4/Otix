#!/usr/bin/env node
/**
 * Test Games Folder Generator
 *
 * Creates a rich, realistic test environment simulating all possible game library structures,
 * download folders, cracked games, repacks, scene releases, official platforms (Steam, Epic, GOG,
 * EA, Ubisoft, Xbox, Battle.net), retro/modern ROMs, and real-world anomalies.
 *
 * Usage:
 *   node scripts/create_test_games_folder.js
 *   node scripts/create_test_games_folder.js --dir /path/to/custom/folder
 *   node scripts/create_test_games_folder.js --clean
 */

const fs = require('fs');
const path = require('path');

// Parse CLI args
const args = process.argv.slice(2);
let targetDir = path.resolve(__dirname, '..', 'test_games_library');
let cleanFirst = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir' && args[i + 1]) {
    targetDir = path.resolve(args[i + 1]);
    i++;
  } else if (args[i] === '--clean') {
    cleanFirst = true;
  }
}

// ── Binary & Text Mock Helpers ──────────────────────────────────────────────

function makePeExe(isInstaller = false, installerType = 'Inno Setup') {
  // MZ DOS header + PE header + optional installer signature
  const buffer = Buffer.alloc(4096);
  buffer.write('MZ', 0, 'ascii');
  buffer.writeUInt32LE(0x00000080, 0x3c); // PE header offset
  buffer.write('PE\0\0', 0x80, 'ascii');
  if (isInstaller) {
    buffer.write(`Installer Payload Signature: ${installerType} Setup Engine v6.2`, 0x100, 'utf8');
  } else {
    buffer.write('Standard Game Application Executable Win64', 0x100, 'utf8');
  }
  return buffer;
}

function makeIsoHeader(volumeName = 'GAME_DISC') {
  const buf = Buffer.alloc(2048 * 17); // Sector 16 is Volume Descriptor in ISO 9660
  const offset = 2048 * 16;
  buf.writeUInt8(0x01, offset); // Primary Volume Descriptor
  buf.write('CD001', offset + 1, 'ascii'); // Standard ISO 9660 identifier
  buf.writeUInt8(0x01, offset + 6);
  buf.write(volumeName.padEnd(32, ' '), offset + 40, 'ascii');
  return buf;
}

function makeSwitchNspHeader() {
  const buf = Buffer.alloc(512);
  buf.write('PFS0', 0, 'ascii'); // Partition FileSystem
  return buf;
}

function makeSwitchXciHeader() {
  const buf = Buffer.alloc(512);
  buf.write('HEAD', 0x100, 'ascii'); // XCI GameCard header magic
  return buf;
}

function makePsSfoHeader() {
  const buf = Buffer.alloc(256);
  buf.write('\0PSF', 0, 'ascii'); // Sony PARAM.SFO magic
  buf.writeUInt32LE(0x00000101, 4);
  return buf;
}

function makeRomBinary(magic = '') {
  const buf = Buffer.alloc(256);
  if (magic) buf.write(magic, 0, 'ascii');
  return buf;
}

function make1x1Png() {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);
}

function make1x1Jpg() {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
    0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
    0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
    0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
    0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
    0x00, 0xbf, 0x00, 0xff, 0xd9,
  ]);
}

// ── File Tree Definition ───────────────────────────────────────────────────

const FILE_DEFINITIONS = [
  // =========================================================================
  // 1. STEAM LIBRARIES & COMMON GAMES
  // =========================================================================
  {
    path: 'Steam/steamapps/appmanifest_1091500.acf',
    content: `"AppState"
{
  "appid"       "1091500"
  "Universe"    "1"
  "name"        "Cyberpunk 2077"
  "installdir"  "Cyberpunk 2077"
  "StateFlags"  "4"
  "BytesToDownload" "68719476736"
  "BytesDownloaded" "68719476736"
  "AutoUpdateBehavior" "0"
}
`,
  },
  {
    path: 'Steam/steamapps/common/Cyberpunk 2077/bin/x64/Cyberpunk2077.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Steam/steamapps/common/Cyberpunk 2077/bin/x64/steam_api64.dll',
    content: 'Valve Steam API Client DLL v1.57\n',
  },
  {
    path: 'Steam/steamapps/common/Cyberpunk 2077/r6/config/settings.json',
    content: JSON.stringify({ version: '2.12', ray_tracing: true, dlss: 'auto' }, null, 2),
  },
  {
    path: 'Steam/steamapps/appmanifest_1086940.acf',
    content: `"AppState"
{
  "appid"       "1086940"
  "Universe"    "1"
  "name"        "Baldur's Gate 3"
  "installdir"  "Baldurs Gate 3"
  "StateFlags"  "4"
}
`,
  },
  {
    path: 'Steam/steamapps/common/Baldurs Gate 3/bin/bg3.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Steam/steamapps/common/Baldurs Gate 3/bin/bg3_dx11.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Steam/steamapps/appmanifest_730.acf',
    content: `"AppState"
{
  "appid"       "730"
  "Universe"    "1"
  "name"        "Counter-Strike 2"
  "installdir"  "Counter-Strike Global Offensive"
  "StateFlags"  "4"
}
`,
  },
  {
    path: 'Steam/steamapps/common/Counter-Strike Global Offensive/game/bin/win64/cs2.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Steam/steamapps/appmanifest_367520.acf',
    content: `"AppState"
{
  "appid"       "367520"
  "Universe"    "1"
  "name"        "Hollow Knight"
  "installdir"  "Hollow Knight"
  "StateFlags"  "4"
}
`,
  },
  {
    path: 'Steam/steamapps/common/Hollow Knight/Hollow Knight.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Steam/steamapps/common/Hollow Knight/UnityCrashHandler64.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Steam/steamapps/common/Hollow Knight/hollow_knight_Data/app.info',
    content: 'Team Cherry\nHollow Knight\n',
  },
  {
    path: 'Steam/steamapps/common/Hollow Knight/hollow_knight_Data/boot.config',
    content: 'wait-for-native-debugger=0\nhdr-display-enabled=0\n',
  },
  {
    path: 'Steam/steamapps/appmanifest_1245620.acf',
    content: `"AppState"
{
  "appid"       "1245620"
  "Universe"    "1"
  "name"        "ELDEN RING"
  "installdir"  "ELDEN RING"
  "StateFlags"  "4"
}
`,
  },
  {
    path: 'Steam/steamapps/common/ELDEN RING/Game/eldenring.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Steam/steamapps/common/ELDEN RING/Game/start_protected_game.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Steam/steamapps/common/ELDEN RING/Game/EasyAntiCheat/easyanticheat_eos_setup.exe',
    binary: makePeExe(false),
  },
  // Incomplete / Downloading Steam Cache
  {
    path: 'Steam/steamapps/downloading/1245620/state.json',
    content: '{"downloading": true, "chunks": 42}',
  },
  {
    path: 'Steam/steamapps/workshop/content/367520/284930129/mod.dll',
    content: 'Mock Steam Workshop Mod Assembly\n',
  },
  {
    path: 'Steam/userdata/12345678/config/localconfig.vdf',
    content: '"UserLocalConfigStore" { "Software" { "Valve" { "Steam" { "Apps" { "1091500" { "Playtime" "1420" } } } } } }\n',
  },

  // =========================================================================
  // 2. EPIC GAMES STORE LIBRARIES & MANIFESTS
  // =========================================================================
  {
    path: 'Epic Games/GrandTheftAutoV/GTA5.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Epic Games/GrandTheftAutoV/GTAVLauncher.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Epic Games/GrandTheftAutoV/.egstore/Manifest.item',
    content: JSON.stringify(
      {
        FormatVersion: 0,
        AppName: 'GrandTheftAutoV',
        CatalogItemId: 'b281f6d90d7945d8b8577dd80f74a000',
        DisplayName: 'Grand Theft Auto V',
        InstallationGuid: '{5A1F29C3-4411-4E80-8742-0F928C576629}',
        InstallLocation: 'D:\\Games\\Epic Games\\GrandTheftAutoV',
        MainGameAppName: 'GrandTheftAutoV',
      },
      null,
      2,
    ),
  },
  {
    path: 'Epic Games/GrandTheftAutoV/.egstore/bps/01234567.bps',
    binary: Buffer.from('BPS_PATCH_STREAM_DATA'),
  },
  {
    path: 'Epic Games/Fortnite/FortniteGame/Binaries/Win64/FortniteClient-Win64-Shipping.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Epic Games/Fortnite/FortniteGame/Binaries/Win64/FortniteLauncher.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Epic Games/Fortnite/.egstore/Manifest.item',
    content: JSON.stringify(
      {
        AppName: 'Fortnite',
        CatalogItemId: '4fe75bbc5a674f4f9b356b5c90567da5',
        DisplayName: 'Fortnite',
        InstallLocation: 'D:\\Games\\Epic Games\\Fortnite',
      },
      null,
      2,
    ),
  },
  {
    path: 'Epic Games/Alan Wake 2/AlanWake2.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Epic Games/Alan Wake 2/.egstore/Manifest.item',
    content: JSON.stringify(
      {
        AppName: 'AlanWake2',
        CatalogItemId: 'c80882e365044c35b8aa8cf168f0f000',
        DisplayName: 'Alan Wake 2',
        InstallLocation: 'D:\\Games\\Epic Games\\Alan Wake 2',
      },
      null,
      2,
    ),
  },
  {
    path: 'Epic Games/Launcher/Portal/Manifests/A5B6C7D8E9F01234.item',
    content: JSON.stringify(
      {
        AppName: 'AlanWake2',
        DisplayName: 'Alan Wake 2',
        InstallSize: 85899345920,
      },
      null,
      2,
    ),
  },

  // =========================================================================
  // 3. GOG (GALAXY & OFFLINE INSTALLERS)
  // =========================================================================
  {
    path: 'GOG Galaxy/Games/The Witcher 3 Wild Hunt GOTY/bin/x64/witcher3.exe',
    binary: makePeExe(false),
  },
  {
    path: 'GOG Galaxy/Games/The Witcher 3 Wild Hunt GOTY/goggame-1207664643.info',
    content: JSON.stringify(
      {
        gameId: '1207664643',
        rootGameId: '1207664643',
        name: 'The Witcher 3: Wild Hunt - Game of the Year Edition',
        version: '1.31',
        playTasks: [
          {
            path: 'bin\\x64\\witcher3.exe',
            type: 'FileTask',
            isPrimary: true,
          },
        ],
      },
      null,
      2,
    ),
  },
  {
    path: 'GOG Galaxy/Games/The Witcher 3 Wild Hunt GOTY/goggame-1207664643.ico',
    binary: Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10]),
  },
  {
    path: 'GOG Galaxy/Games/The Witcher 3 Wild Hunt GOTY/goggame-1207664643.hashdb',
    content: 'mock_gog_file_checksums_db\n',
  },
  {
    path: 'GOG Galaxy/Games/Cyberpunk 2077/bin/x64/Cyberpunk2077.exe',
    binary: makePeExe(false),
  },
  {
    path: 'GOG Galaxy/Games/Cyberpunk 2077/goggame-1423049311.info',
    content: JSON.stringify(
      {
        gameId: '1423049311',
        rootGameId: '1423049311',
        name: 'Cyberpunk 2077',
        version: '2.12',
      },
      null,
      2,
    ),
  },
  // GOG Offline Standalone Multi-bin Installers
  {
    path: 'GOG Installers/The Witcher 3 Wild Hunt GOTY/setup_the_witcher_3_wild_hunt_goty_1.31_(a)_(9704).exe',
    binary: makePeExe(true, 'Inno Setup'),
  },
  {
    path: 'GOG Installers/The Witcher 3 Wild Hunt GOTY/setup_the_witcher_3_wild_hunt_goty_1.31_(a)_(9704)-1.bin',
    content: 'GOG Installer Data Archive Chunk 1\n',
  },
  {
    path: 'GOG Installers/The Witcher 3 Wild Hunt GOTY/setup_the_witcher_3_wild_hunt_goty_1.31_(a)_(9704)-2.bin',
    content: 'GOG Installer Data Archive Chunk 2\n',
  },
  {
    path: 'GOG Installers/Cyberpunk 2077/setup_cyberpunk_2077_2.12_(64bit)_(71844).exe',
    binary: makePeExe(true, 'Inno Setup'),
  },
  {
    path: 'GOG Installers/Cyberpunk 2077/setup_cyberpunk_2077_2.12_(64bit)_(71844)-1.bin',
    content: 'GOG Cyberpunk Chunk 1\n',
  },
  {
    path: 'GOG Installers/Cyberpunk 2077/setup_cyberpunk_2077_2.12_(64bit)_(71844)-2.bin',
    content: 'GOG Cyberpunk Chunk 2\n',
  },

  // =========================================================================
  // 4. EA APP / ORIGIN & UBISOFT CONNECT & XBOX & BATTLE.NET
  // =========================================================================
  {
    path: 'EA Games/Dead Space Remake/Dead Space.exe',
    binary: makePeExe(false),
  },
  {
    path: 'EA Games/Dead Space Remake/__Installer/installerdata.xml',
    content: '<game><title>Dead Space</title><installLocation>EA Games\\Dead Space</installLocation></game>\n',
  },
  {
    path: 'EA Games/The Sims 4/Game/Bin/TS4_x64.exe',
    binary: makePeExe(false),
  },
  {
    path: 'EA Games/The Sims 4/__Installer/installerdata.xml',
    content: '<game><title>The Sims 4</title></game>\n',
  },
  {
    path: 'Ubisoft Game Launcher/games/Far Cry 6/bin/FarCry6.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Ubisoft Game Launcher/games/Far Cry 6/uplay_install.manifest',
    content: '{"game_id": 5266, "name": "Far Cry 6", "version": "1.6.0"}\n',
  },
  {
    path: 'Ubisoft Game Launcher/games/Far Cry 6/uplay_install.state',
    content: 'INSTALLED\n',
  },
  {
    path: 'Ubisoft Game Launcher/games/Assassins Creed Mirage/ACMirage.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Ubisoft Game Launcher/games/Assassins Creed Mirage/uplay_install.manifest',
    content: '{"game_id": 5644, "name": "Assassin\'s Creed Mirage"}\n',
  },
  {
    path: '.GamingRoot',
    content: 'Xbox Games Root Directory Config\n',
  },
  {
    path: 'XboxGames/Forza Horizon 5/Content/ForzaHorizon5.exe',
    binary: makePeExe(false),
  },
  {
    path: 'XboxGames/Forza Horizon 5/Content/appxmanifest.xml',
    content: '<Package><Identity Name="Microsoft.624F8B84B80" Version="1.634.818.0" /><Properties><DisplayName>Forza Horizon 5</DisplayName></Properties></Package>\n',
  },
  {
    path: 'XboxGames/Forza Horizon 5/Content/gamelaunchhelper.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Battle.net/Diablo IV/Diablo IV.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Battle.net/Diablo IV/Diablo IV Launcher.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Battle.net/Diablo IV/.build.info',
    content: 'Branch!STRING:0|Active!DEC:1|InstallPath!STRING:0|Product!STRING:0|Version!STRING:0\nfenris|1|Diablo IV|fenris|1.4.3.54411\n',
  },

  // =========================================================================
  // 5. FITGIRL REPACKS (STANDARD & ANOMALY CASES)
  // =========================================================================
  {
    path: 'Downloads/FitGirl/Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL/setup.exe',
    binary: makePeExe(true, 'Inno Setup'),
  },
  {
    path: 'Downloads/FitGirl/Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL/setup-fitgirl-1.bin',
    content: 'FitGirl Archive Data Chunk 1\n',
  },
  {
    path: 'Downloads/FitGirl/Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL/setup-fitgirl-2.bin',
    content: 'FitGirl Archive Data Chunk 2\n',
  },
  {
    path: 'Downloads/FitGirl/Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL/setup-fitgirl-3.bin',
    content: 'FitGirl Archive Data Chunk 3\n',
  },
  {
    path: 'Downloads/FitGirl/Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL/fg-01.bin',
    content: 'FitGirl Core Game Files\n',
  },
  {
    path: 'Downloads/FitGirl/Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL/fg-selective-english.bin',
    content: 'FitGirl Selective Audio English\n',
  },
  {
    path: 'Downloads/FitGirl/Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL/fg-optional-soundtracks.bin',
    content: 'FitGirl Bonus Soundtrack Files\n',
  },
  {
    path: 'Downloads/FitGirl/Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL/quickSFV.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Downloads/FitGirl/Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL/Verify BIN files before installation.bat',
    content: '@echo off\nquickSFV.exe MD5\\checksum.md5\npause\n',
  },
  {
    path: 'Downloads/FitGirl/Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL/MD5/checksum.md5',
    content: 'd41d8cd98f00b204e9800998ecf8427e *setup.exe\n',
  },
  {
    path: 'Downloads/FitGirl/Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL/fitgirl.nfo',
    content: 'Baldur\'s Gate 3 (v4.1.1.4763283) FitGirl Repack\nLossless, Nothing removed, Nothing re-encoded\n',
  },
  // FitGirl Anomaly Case: Incomplete Download (contains .bin.part)
  {
    path: 'Downloads/FitGirl/Ghost.of.Tsushima.REPACK-FITGIRL/setup.exe',
    binary: makePeExe(true, 'Inno Setup'),
  },
  {
    path: 'Downloads/FitGirl/Ghost.of.Tsushima.REPACK-FITGIRL/setup-fitgirl-1.bin',
    content: 'FitGirl Chunk 1\n',
  },
  {
    path: 'Downloads/FitGirl/Ghost.of.Tsushima.REPACK-FITGIRL/setup-fitgirl-2.bin.part',
    content: 'Incomplete Download Stream\n',
  },
  {
    path: 'Downloads/FitGirl/Ghost.of.Tsushima.REPACK-FITGIRL/quickSFV.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Downloads/FitGirl/Warhammer.40000.Space.Marine.2.v11.2.0.1-FITGIRL/setup.exe',
    binary: makePeExe(true, 'Inno Setup'),
  },
  {
    path: 'Downloads/FitGirl/Warhammer.40000.Space.Marine.2.v11.2.0.1-FITGIRL/setup-fitgirl-1.bin',
    content: 'FitGirl Space Marine Chunk\n',
  },

  // =========================================================================
  // 6. DODI REPACKS
  // =========================================================================
  {
    path: 'Downloads/DODI/Ghost.of.Tsushima.DIRECTORS.CUT.v1053.0522-DODI/setup.exe',
    binary: makePeExe(true, 'Inno Setup'),
  },
  {
    path: 'Downloads/DODI/Ghost.of.Tsushima.DIRECTORS.CUT.v1053.0522-DODI/data1.doi',
    content: 'DODI Data Archive 1\n',
  },
  {
    path: 'Downloads/DODI/Ghost.of.Tsushima.DIRECTORS.CUT.v1053.0522-DODI/data2.doi',
    content: 'DODI Data Archive 2\n',
  },
  {
    path: 'Downloads/DODI/Ghost.of.Tsushima.DIRECTORS.CUT.v1053.0522-DODI/dodi.nfo',
    content: 'Ghost of Tsushima Director\'s Cut DODI Repack\nBased on PlayStation PC LLC release\n',
  },
  {
    path: 'Downloads/DODI/Ghost.of.Tsushima.DIRECTORS.CUT.v1053.0522-DODI/DODI-Repacks.url',
    content: '[InternetShortcut]\nURL=https://dodi-repacks.site\n',
  },

  // =========================================================================
  // 7. ELAMIGOS REPACKS (STANDARD & ANOMALY HEALING CASES)
  // =========================================================================
  {
    path: 'Downloads/ElAmigos/Elden.Ring.Shadow.of.the.Erdtree.v1.12.0.REPACK-ELAMIGOS/setup.exe',
    binary: makePeExe(true, 'Inno Setup'),
  },
  {
    path: 'Downloads/ElAmigos/Elden.Ring.Shadow.of.the.Erdtree.v1.12.0.REPACK-ELAMIGOS/elamigos-1.bin',
    content: 'ElAmigos Chunk 1\n',
  },
  {
    path: 'Downloads/ElAmigos/Elden.Ring.Shadow.of.the.Erdtree.v1.12.0.REPACK-ELAMIGOS/elamigos-2.bin',
    content: 'ElAmigos Chunk 2\n',
  },
  {
    path: 'Downloads/ElAmigos/Elden.Ring.Shadow.of.the.Erdtree.v1.12.0.REPACK-ELAMIGOS/elamigos.nfo',
    content: 'Elden Ring Shadow of the Erdtree Edition ElAmigos\n',
  },
  // ElAmigos Anomaly 1: Duplicate Browser Collision " (1).bin"
  {
    path: 'Downloads/ElAmigos/Cyberpunk.2077.v2.12.REPACK-ELAMIGOS/setup.exe',
    binary: makePeExe(true, 'Inno Setup'),
  },
  {
    path: 'Downloads/ElAmigos/Cyberpunk.2077.v2.12.REPACK-ELAMIGOS/elamigos-1.bin',
    content: 'ElAmigos Cyberpunk Chunk 1\n',
  },
  {
    path: 'Downloads/ElAmigos/Cyberpunk.2077.v2.12.REPACK-ELAMIGOS/elamigos-2 (1).bin',
    content: 'ElAmigos Duplicate Download Chunk 2\n',
  },
  {
    path: 'Downloads/ElAmigos/Cyberpunk.2077.v2.12.REPACK-ELAMIGOS/elamigos-3.bin',
    content: 'ElAmigos Cyberpunk Chunk 3\n',
  },
  {
    path: 'Downloads/ElAmigos/Cyberpunk.2077.v2.12.REPACK-ELAMIGOS/elamigos.nfo',
    content: 'Cyberpunk 2077 v2.12 ElAmigos Repack\n',
  },
  // ElAmigos Anomaly 2: Missing "elamigos-" prefix (named data-2.bin)
  {
    path: 'Downloads/ElAmigos/Lies.of.P.v1.5.0.REPACK-ELAMIGOS/setup.exe',
    binary: makePeExe(true, 'Inno Setup'),
  },
  {
    path: 'Downloads/ElAmigos/Lies.of.P.v1.5.0.REPACK-ELAMIGOS/elamigos-1.bin',
    content: 'ElAmigos Chunk 1\n',
  },
  {
    path: 'Downloads/ElAmigos/Lies.of.P.v1.5.0.REPACK-ELAMIGOS/data-2.bin',
    content: 'Missing prefix chunk\n',
  },
  {
    path: 'Downloads/ElAmigos/Lies.of.P.v1.5.0.REPACK-ELAMIGOS/elamigos.nfo',
    content: 'Lies of P v1.5.0 ElAmigos Repack\n',
  },

  // =========================================================================
  // 8. SCENE RELEASES, ISOS & CRACK EXTRACTED PACKAGES
  // =========================================================================
  {
    path: 'Downloads/Torrents/Cyberpunk.2077.Phantom.Liberty-RUNE/Cyberpunk.2077.Phantom.Liberty-RUNE.iso',
    binary: makeIsoHeader('CP2077_PL_RUNE'),
  },
  {
    path: 'Downloads/Torrents/Cyberpunk.2077.Phantom.Liberty-RUNE/rune.nfo',
    content: 'Cyberpunk 2077: Phantom Liberty (c) CD PROJEKT RED\nRELEASE DATE: 09/2023 | PROTECTION: Steam\nDISCS: 1 | GENRE: RPG\n',
  },
  {
    path: 'Downloads/Torrents/Cyberpunk.2077.Phantom.Liberty-RUNE/rune.sfv',
    content: 'Cyberpunk.2077.Phantom.Liberty-RUNE.iso 8F5A7B3C\n',
  },
  {
    path: 'Downloads/Torrents/Cyberpunk.2077.Phantom.Liberty-RUNE/file_id.diz',
    content: 'RUNE SCENE RELEASE 2023\n',
  },
  {
    path: 'Downloads/Torrents/Black.Myth.Wukong-voices38/Black.Myth.Wukong-voices38.iso',
    binary: makeIsoHeader('BMW_VOICES38'),
  },
  {
    path: 'Downloads/Torrents/Black.Myth.Wukong-voices38/voices38.nfo',
    content: 'Black Myth: Wukong (c) Game Science\n',
  },
  {
    path: 'Downloads/Torrents/Clair.Obscur.Expedition.33-TENOKE/Clair.Obscur.Expedition.33.iso',
    binary: makeIsoHeader('EXPEDITION_33'),
  },
  {
    path: 'Downloads/Torrents/Clair.Obscur.Expedition.33-TENOKE/tenoke.nfo',
    content: 'Clair Obscur Expedition 33 - TENOKE\n',
  },
  {
    path: 'Downloads/Torrents/DOOM.Eternal.The.Ancient.Gods-CODEX/codex-doom.eternal.iso',
    binary: makeIsoHeader('DOOM_ETERNAL_CODEX'),
  },
  {
    path: 'Downloads/Torrents/DOOM.Eternal.The.Ancient.Gods-CODEX/codex.nfo',
    content: 'DOOM Eternal The Ancient Gods - CODEX\n',
  },
  {
    path: 'Downloads/Torrents/Red.Dead.Redemption.2.Ultimate.Edition-Razor1911/rzr-rdr2.iso',
    binary: makeIsoHeader('RDR2_RAZOR1911'),
  },
  {
    path: 'Downloads/Torrents/Red.Dead.Redemption.2.Ultimate.Edition-Razor1911/razor1911.nfo',
    content: 'Red Dead Redemption 2 Ultimate Edition - Razor1911\n',
  },
  {
    path: 'Downloads/Torrents/Hogwarts.Legacy.Deluxe.Edition-EMPRESS/empress-hogwarts.iso',
    binary: makeIsoHeader('HOGWARTS_EMPRESS'),
  },
  {
    path: 'Downloads/Torrents/Hogwarts.Legacy.Deluxe.Edition-EMPRESS/EMPRESS.nfo',
    content: 'Hogwarts Legacy Deluxe Edition Cracked by EMPRESS\n',
  },
  {
    path: 'Downloads/Torrents/Stellar.Blade-DELUSION/Stellar.Blade-DELUSION.iso',
    binary: makeIsoHeader('STELLAR_BLADE'),
  },
  {
    path: 'Downloads/Torrents/Starfield.Premium.Edition-FLT/flt-starfield.iso',
    binary: makeIsoHeader('STARFIELD_FLT'),
  },
  // Extracted Scene Folders (e.g. uncompressed ISO or direct play scene folder)
  {
    path: 'Extracted/DOOM.Eternal-CODEX/setup.exe',
    binary: makePeExe(true, 'Inno Setup'),
  },
  {
    path: 'Extracted/DOOM.Eternal-CODEX/CODEX/steam_api64.dll',
    content: 'CODEX Steam Emu DLL\n',
  },
  {
    path: 'Extracted/DOOM.Eternal-CODEX/CODEX/codex.ini',
    content: '[Settings]\nAppId=782330\nPlayerName=CODEX\nLanguage=english\n',
  },
  {
    path: 'Extracted/DOOM.Eternal-CODEX/DOOMEternalx64vk.exe',
    binary: makePeExe(false),
  },

  // =========================================================================
  // 9. CRACKED GAMES, EMULATORS, CRACKFIXES & UNLOCKERS
  // =========================================================================
  // Goldberg Steam Emulator Setup
  {
    path: 'Games/Cracked/Balatro (Goldberg)/Balatro.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Games/Cracked/Balatro (Goldberg)/steam_api64.dll',
    content: 'Goldberg Steam Emulator DLL\n',
  },
  {
    path: 'Games/Cracked/Balatro (Goldberg)/steam_emu.ini',
    content: '[Settings]\nAppId=2379780\nAccountId=76561198000000000\nUserName=Goldberg\nLanguage=english\n',
  },
  {
    path: 'Games/Cracked/Balatro (Goldberg)/steam_settings/steam_appid.txt',
    content: '2379780\n',
  },
  {
    path: 'Games/Cracked/Balatro (Goldberg)/steam_settings/DLC.txt',
    content: '2379781=Balatro Friends of Jimbo Pack\n',
  },
  {
    path: 'Games/Cracked/Balatro (Goldberg)/steam_settings/configs.user.ini',
    content: '[user_general]\naccount_name=Player\n',
  },
  {
    path: 'Games/Cracked/Balatro (Goldberg)/steam_settings/achievements.json',
    content: '[]\n',
  },
  // RUNE Crack
  {
    path: 'Games/Cracked/Elden Ring (RUNE)/eldenring.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Games/Cracked/Elden Ring (RUNE)/steam_api64.dll',
    content: 'RUNE Steam Emulator DLL\n',
  },
  {
    path: 'Games/Cracked/Elden Ring (RUNE)/rune.ini',
    content: '[Settings]\nAppId=1245620\nPlayerName=RUNE\n',
  },
  // EMPRESS Crack
  {
    path: 'Games/Cracked/Hogwarts Legacy (EMPRESS)/HogwartsLegacy.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Games/Cracked/Hogwarts Legacy (EMPRESS)/emp.dll',
    content: 'EMPRESS Denuvo Bypass Engine DLL\n',
  },
  {
    path: 'Games/Cracked/Hogwarts Legacy (EMPRESS)/Empress.ini',
    content: '[Settings]\nAppId=990080\nUserName=EMPRESS\n',
  },
  // OnlineFix (Spacewar 480 Multiplayer Bypass)
  {
    path: 'Games/Cracked/Palworld (OnlineFix)/Palworld.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Games/Cracked/Palworld (OnlineFix)/OnlineFix.ini',
    content: '[Main]\nRealAppId=1623730\nFakeAppId=480\nLanguage=english\n',
  },
  {
    path: 'Games/Cracked/Palworld (OnlineFix)/OnlineFix64.dll',
    content: 'OnlineFix P2P Steam Overlay DLL\n',
  },
  {
    path: 'Games/Cracked/Palworld (OnlineFix)/steam_api64.dll',
    content: 'Steamworks Proxy DLL\n',
  },
  {
    path: 'Games/Cracked/Palworld (OnlineFix)/steam_appid.txt',
    content: '480\n',
  },
  // DLC Unlockers (CreamAPI, SmokeAPI, Koaloader)
  {
    path: 'Games/Cracked/Europa Universalis IV (CreamAPI)/eu4.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Games/Cracked/Europa Universalis IV (CreamAPI)/cream_api.ini',
    content: '[steam]\nappid = 236850\nunlockall = true\norgapi = steam_api64_o.dll\n',
  },
  {
    path: 'Games/Cracked/Europa Universalis IV (CreamAPI)/steam_api64_o.dll',
    content: 'Original Valve Steam API DLL Backup\n',
  },
  {
    path: 'Games/Cracked/Europa Universalis IV (CreamAPI)/steam_api64.dll',
    content: 'CreamAPI Hook Proxy DLL\n',
  },
  {
    path: 'Games/Cracked/Hearts of Iron IV (Koaloader)/hoi4.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Games/Cracked/Hearts of Iron IV (Koaloader)/version.dll',
    content: 'Koaloader DLL Proxy Hook\n',
  },
  {
    path: 'Games/Cracked/Hearts of Iron IV (Koaloader)/SmokeAPI.config.json',
    content: '{"logging": false, "auto_fetch": true, "unlock_all": true}\n',
  },
  // Crackfixes & Standalone Crack Folders
  {
    path: 'Downloads/Updates & Cracks/Cyberpunk.2077.v2.12.Crack.Only-ELAMIGOS/apply_crack.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Downloads/Updates & Cracks/Cyberpunk.2077.v2.12.Crack.Only-ELAMIGOS/steam_api64.dll',
    content: 'Cracked Steam API DLL\n',
  },
  {
    path: 'Downloads/Updates & Cracks/Cyberpunk.2077.v2.12.Crack.Only-ELAMIGOS/steam_emu.ini',
    content: '[Settings]\nAppId=1091500\n',
  },
  {
    path: 'Downloads/Updates & Cracks/Cyberpunk.2077.v2.12.Crack.Only-ELAMIGOS/elamigos.nfo',
    content: 'Cyberpunk 2077 v2.12 Crack Only ElAmigos\n',
  },
  {
    path: 'Downloads/Updates & Cracks/Elden.Ring.v1.12.Crackfix.V2-RUNE/eldenring.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Downloads/Updates & Cracks/Elden.Ring.v1.12.Crackfix.V2-RUNE/steam_api64.dll',
    content: 'RUNE Crackfix DLL\n',
  },
  {
    path: 'Downloads/Updates & Cracks/Elden.Ring.v1.12.Crackfix.V2-RUNE/rune.nfo',
    content: 'Elden Ring v1.12 Crackfix V2 - RUNE\nFixed controller crash on certain hardware\n',
  },
  {
    path: 'Downloads/Updates & Cracks/Cyberpunk.2077.v2.12.Crackfix-RUNE.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Downloads/Updates & Cracks/Hogwarts.Legacy.Crackfix.PROPER-EMPRESS/HogwartsLegacy.exe',
    binary: makePeExe(false),
  },

  // =========================================================================
  // 10. SATELLITE UPDATES, DLCS & PATCHES
  // =========================================================================
  {
    path: 'Downloads/Updates & Cracks/Cyberpunk 2077 update 2.12 - 2.13.exe',
    binary: makePeExe(true, 'Inno Setup'),
  },
  {
    path: 'Downloads/Updates & Cracks/Elden Ring update 1.12.3 - 1.13.0.exe',
    binary: makePeExe(true, 'Inno Setup'),
  },
  {
    path: 'Downloads/Updates & Cracks/The.Witcher.3.Wild.Hunt.Blood.and.Wine.DLC-GOG.exe',
    binary: makePeExe(true, 'Inno Setup'),
  },
  {
    path: 'Downloads/Updates & Cracks/Hades.II.v0.91024-Update.exe',
    binary: makePeExe(true, 'Inno Setup'),
  },
  {
    path: 'Downloads/Updates & Cracks/Baldurs.Gate.3.Update.v4.1.1.5022896-ElAmigos/setup.exe',
    binary: makePeExe(true, 'Inno Setup'),
  },
  {
    path: 'Downloads/Updates & Cracks/Baldurs.Gate.3.Update.v4.1.1.5022896-ElAmigos/update.bin',
    content: 'Baldur\'s Gate 3 Cumulative Update Archive\n',
  },
  {
    path: 'Downloads/Updates & Cracks/Baldurs.Gate.3.Update.v4.1.1.5022896-ElAmigos/elamigos.nfo',
    content: 'Baldurs Gate 3 Update v4.1.1.5022896 - ElAmigos\n',
  },
  {
    path: 'Downloads/Updates & Cracks/Elden.Ring.Update.v1.12.3-v1.13.0.incl.DLC-RUNE/setup.exe',
    binary: makePeExe(true, 'Inno Setup'),
  },
  {
    path: 'Downloads/Updates & Cracks/Elden.Ring.Update.v1.12.3-v1.13.0.incl.DLC-RUNE/RUNE/steam_api64.dll',
    content: 'RUNE Patch DLL\n',
  },
  {
    path: 'Downloads/Updates & Cracks/Elden.Ring.Update.v1.12.3-v1.13.0.incl.DLC-RUNE/rune.nfo',
    content: 'Elden Ring Update v1.12.3 to v1.13.0 incl DLC - RUNE\n',
  },

  // =========================================================================
  // 11. PORTABLE / EXTRACTED DIRECT-PLAY GAMES
  // =========================================================================
  {
    path: 'Games/Portable/Black Myth Wukong/b1.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Games/Portable/Black Myth Wukong/b1/Binaries/Win64/b1-Win64-Shipping.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Games/Portable/Black Myth Wukong/b1/Content/Paks/b1-Windows.pak',
    content: 'Unreal Engine Pakfile Archive\n',
  },
  {
    path: 'Games/Portable/Black Myth Wukong/Engine/Binaries/Win64/CrashReportClient.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Games/Portable/Satisfactory/FactoryGame.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Games/Portable/Satisfactory/FactoryGame/Binaries/Win64/FactoryGame-Win64-Shipping.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Games/Portable/Dyson Sphere Program/DSPGAME.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Games/Portable/Factorio/bin/x64/factorio.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Games/Portable/Factorio/data/base/scenarios/sandbox/control.lua',
    content: 'script.on_init(function() end)\n',
  },
  {
    path: 'Games/Portable/Need for Speed Most Wanted/speed.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Games/Portable/Dead Cells/deadcells.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Games/Portable/Dead Cells/hlboot.dat',
    content: 'Shiro Games HashLink Boot Bytecode\n',
  },

  // =========================================================================
  // 12. ARCHIVES & COMPRESSED DOWNLOADS (.rar, .zip, .7z)
  // =========================================================================
  {
    path: 'Downloads/Archives/Call.Of.Duty.Black.Ops.2-SKIDROW.part01.rar',
    binary: Buffer.from('Rar!\x1a\x07\x00MultiPartRARArchive1'),
  },
  {
    path: 'Downloads/Archives/Call.Of.Duty.Black.Ops.2-SKIDROW.part02.rar',
    binary: Buffer.from('Rar!\x1a\x07\x00MultiPartRARArchive2'),
  },
  {
    path: 'Downloads/Archives/Grand.Theft.Auto.V.v1.0.3095-RUNE.part1.rar',
    binary: Buffer.from('Rar!\x1a\x07\x00GTAPart1'),
  },
  {
    path: 'Downloads/Archives/Grand.Theft.Auto.V.v1.0.3095-RUNE.part2.rar',
    binary: Buffer.from('Rar!\x1a\x07\x00GTAPart2'),
  },
  {
    path: 'Downloads/Archives/IndieGame.Collection.2024-PROPHET.7z',
    binary: Buffer.from('7z\xbc\xaf\x27\x1c7ZipHeaderData'),
  },
  {
    path: 'Downloads/Archives/Slay.the.Spire.v2.3.4-GOG.zip',
    binary: Buffer.from('PK\x03\x04ZipArchiveHeader'),
  },
  {
    path: 'Downloads/Archives/Celeste.v1.4.0.0.rar',
    binary: Buffer.from('Rar!\x1a\x07\x00CelesteArchive'),
  },

  // =========================================================================
  // 13. CONSOLE & RETRO EMULATION ROMS
  // =========================================================================
  // Nintendo Switch (Yuzu / Ryujinx)
  {
    path: 'ROMs/Switch/The Legend of Zelda Tears of the Kingdom [0100F2C0115B6000][v0].nsp',
    binary: makeSwitchNspHeader(),
  },
  {
    path: 'ROMs/Switch/The Legend of Zelda Tears of the Kingdom [0100F2C0115B6800][v131072][UPD].nsp',
    binary: makeSwitchNspHeader(),
  },
  {
    path: 'ROMs/Switch/Super Smash Bros Ultimate [01006A800016F001][v0][DLC].nsp',
    binary: makeSwitchNspHeader(),
  },
  {
    path: 'ROMs/Switch/Metroid Prime 4 Beyond NSW-HR.xci',
    binary: makeSwitchXciHeader(),
  },
  {
    path: 'ROMs/Switch/Pokemon Scarlet [0100A3D008C5C000].nsz',
    binary: makeSwitchNspHeader(),
  },
  // PlayStation 3 (RPCS3 format & PKG)
  {
    path: 'ROMs/PS3/The Last of Us [BCUS98174]/PS3_GAME/USRDIR/EBOOT.BIN',
    binary: Buffer.from('SCE\x00SonyPlayStationExecutable'),
  },
  {
    path: 'ROMs/PS3/The Last of Us [BCUS98174]/PS3_GAME/PARAM.SFO',
    binary: makePsSfoHeader(),
  },
  {
    path: 'ROMs/PS3/The Last of Us [BCUS98174]/PS3_GAME/ICON0.PNG',
    binary: make1x1Png(),
  },
  {
    path: 'ROMs/PS3/The Last of Us [BCUS98174]/PS3_DISC.SFB',
    binary: Buffer.from('SFB\x00PS3DiscKeyIdentification'),
  },
  {
    path: 'ROMs/PS3/Demon\'s Souls [BLES00932].iso',
    binary: makeIsoHeader('DEMONS_SOULS_PS3'),
  },
  {
    path: 'ROMs/PS3/Updates/UP0001-BCUS98174_00-TLOU101UPDATE.pkg',
    binary: Buffer.from('\x7fPKGPlayStationPackageContainer'),
  },
  // PlayStation 4 (shadPS4)
  {
    path: 'ROMs/PS4/CUSA00411 - Bloodborne/eboot.bin',
    binary: Buffer.from('SCE\x00PS4ELFExecutable'),
  },
  {
    path: 'ROMs/PS4/CUSA00411 - Bloodborne/sce_sys/param.sfo',
    binary: makePsSfoHeader(),
  },
  {
    path: 'ROMs/PS4/CUSA00411 - Bloodborne/sce_sys/icon0.png',
    binary: make1x1Png(),
  },
  // PlayStation 2 / 1 / PSP / PS Vita
  {
    path: 'ROMs/PS2/God of War II (USA).chd',
    binary: makeRomBinary('MComprHD'),
  },
  {
    path: 'ROMs/PS2/Metal Gear Solid 3 Snake Eater (USA).chd',
    binary: makeRomBinary('MComprHD'),
  },
  {
    path: 'ROMs/PS1/Castlevania - Symphony of the Night (USA).chd',
    binary: makeRomBinary('MComprHD'),
  },
  {
    path: 'ROMs/PS1/Metal Gear Solid (USA) (Disc 1).cue',
    content: 'FILE "Metal Gear Solid (USA) (Disc 1).bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n',
  },
  {
    path: 'ROMs/PS1/Metal Gear Solid (USA) (Disc 1).bin',
    binary: Buffer.alloc(2352 * 10),
  },
  {
    path: 'ROMs/PSP/Crisis Core - Final Fantasy VII (USA).iso',
    binary: makeIsoHeader('CRISIS_CORE_PSP'),
  },
  {
    path: 'ROMs/PSVita/Persona 4 Golden [PCSE00120].vpk',
    binary: Buffer.from('PK\x03\x04VitaPackageZip'),
  },
  // Nintendo GameCube & Wii (Dolphin)
  {
    path: 'ROMs/GameCube/Super Smash Bros. Melee (USA) (v1.02).rvz',
    binary: makeRomBinary('RVZ\x01DolphinRawDisc'),
  },
  {
    path: 'ROMs/GameCube/The Legend of Zelda The Wind Waker (USA).gcz',
    binary: makeRomBinary('GCZ\x01DolphinCompressedGameCube'),
  },
  {
    path: 'ROMs/Wii/Super Mario Galaxy (USA).wbfs',
    binary: makeRomBinary('WBFSWiiDiscImage'),
  },
  // Retro Nintendo / Sega / Handheld ROMs
  {
    path: 'ROMs/N64/Super Mario 64 (USA).z64',
    binary: makeRomBinary('\x80\x37\x12\x40N64BigEndianHeader'),
  },
  {
    path: 'ROMs/SNES/Chrono Trigger (USA).sfc',
    binary: makeRomBinary('SNESRomCartridgeData'),
  },
  {
    path: 'ROMs/NES/Super Mario Bros. (World).nes',
    binary: makeRomBinary('NES\x1aINesRomHeader'),
  },
  {
    path: 'ROMs/Genesis/Sonic the Hedgehog 2 (World).md',
    binary: makeRomBinary('SEGA GENESIS'),
  },
  {
    path: 'ROMs/GBA/Pokemon - Emerald Version (USA, Europe).gba',
    binary: makeRomBinary('GBA Nintendo GameBoy Advance'),
  },
  {
    path: 'ROMs/NDS/Pokemon - Platinum Version (USA).nds',
    binary: makeRomBinary('NDS Nitro Card Header'),
  },
  {
    path: 'ROMs/3DS/The Legend of Zelda - A Link Between Worlds (USA).3ds',
    binary: makeRomBinary('NCSD3DSCartridgeHeader'),
  },

  // =========================================================================
  // 14. NOISE, REDISTRIBUTABLES, SYSTEM JUNK & TEMPORARY FILES
  // =========================================================================
  {
    path: 'Noise/_CommonRedist/DirectX/Jun2010/DXSETUP.exe',
    binary: makePeExe(true, 'InstallShield'),
  },
  {
    path: 'Noise/_CommonRedist/DirectX/Jun2010/dxdllreg_x86.cab',
    content: 'MSCFDirectXCabinetFile\n',
  },
  {
    path: 'Noise/_CommonRedist/vcredist/2019/vc_redist.x64.exe',
    binary: makePeExe(true, 'Burn'),
  },
  {
    path: 'Noise/_CommonRedist/DotNet/dotnetfx35.exe',
    binary: makePeExe(true, 'WiX'),
  },
  {
    path: 'Noise/System/$RECYCLE.BIN/S-1-5-21-deleted_game.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Noise/System/System Volume Information/WPSettings.dat',
    content: 'Windows System Volume Indexing File\n',
  },
  {
    path: 'Downloads/Incomplete/Baldurs.Gate.3.v4.1.1.iso.crdownload',
    content: 'Chrome In-Progress Download\n',
  },
  {
    path: 'Downloads/Incomplete/Elden.Ring.v1.12.iso.part',
    content: 'Firefox In-Progress Download Part\n',
  },
  {
    path: 'Downloads/Incomplete/Cyberpunk.2077.tmp',
    content: 'Temporary Download Cache\n',
  },
  {
    path: '.DS_Store',
    content: 'Apple Desktop Services Store File\n',
  },
  {
    path: 'Thumbs.db',
    content: 'Windows Explorer Thumbnail Cache Database\n',
  },
  {
    path: 'desktop.ini',
    content: '[.ShellClassInfo]\nIconResource=icon.ico,0\n',
  },

  // =========================================================================
  // 15. PRESERVED METADATA, ARTWORK, TORRENTS & SCENE NOTES
  // =========================================================================
  {
    path: 'Downloads/Torrents/Done/The.Witcher.3.Wild.Hunt.GOTY-GOG/cover.jpg',
    binary: make1x1Jpg(),
  },
  {
    path: 'Downloads/Torrents/Done/The.Witcher.3.Wild.Hunt.GOTY-GOG/poster.png',
    binary: make1x1Png(),
  },
  {
    path: 'Downloads/Torrents/Done/The.Witcher.3.Wild.Hunt.GOTY-GOG/the.witcher.3.nfo',
    content: 'The Witcher 3: Wild Hunt GOTY Edition GOG Release\n',
  },
  {
    path: 'Downloads/Torrents/Done/The.Witcher.3.Wild.Hunt.GOTY-GOG/the.witcher.3.sfv',
    content: 'setup_the_witcher_3_wild_hunt_goty_1.31.exe A1B2C3D4\n',
  },
  {
    path: 'Downloads/Torrents/Done/The.Witcher.3.Wild.Hunt.GOTY-GOG/ReadMe.txt',
    content: 'Installation Instructions:\n1. Run setup.exe\n2. Play!\n',
  },
  {
    path: 'Downloads/Torrents/Done/The.Witcher.3.Wild.Hunt.GOTY-GOG/Password.txt',
    content: 'Password: www.repak-games.com\n',
  },
  {
    path: 'Downloads/Torrents/Done/The.Witcher.3.Wild.Hunt.GOTY-GOG/torrent-downloaded-from-1337x.to.txt',
    content: 'Downloaded from 1337x.to - Verified torrents only!\n',
  },
  {
    path: 'Downloads/Torrents/Done/The.Witcher.3.Wild.Hunt.GOTY-GOG/Cyberpunk.torrent',
    content: 'd8:announce35:http://tracker.example.com/announce13:creation datei1600000000e4:infod6:lengthi1048576e4:name14:Cyberpunk.207712:piece lengthi262144e6:pieces20:12345678901234567890ee\n',
  },

  // =========================================================================
  // 16. MESSY USER ROOTS & UNSORTED DISK CRUFT
  // =========================================================================
  {
    path: 'Unsorted/Balatro.v1.0.0L-Unleashed/Balatro/Balatro.exe',
    binary: makePeExe(false),
  },
  {
    path: 'Unsorted/DSPGAME.exe',
    binary: makePeExe(false),
  },
  {
    path: 'TODO/Black.Myth.Wukong-voices38/Black.Myth.Wukong-voices38.iso',
    binary: makeIsoHeader('BMW_TODO'),
  },
  {
    path: 'TODO/Call Of Duty Black Ops 2.rar',
    binary: Buffer.from('Rar!\x1a\x07\x00CallOfDutyBlackOps2Archive'),
  },
  {
    path: 'TODO/Kingdom Come Deliverance II v1.5.0 ElAmigos/Kingdom Come Deliverance II.iso',
    binary: makeIsoHeader('KCD2_ELAMIGOS'),
  },
  {
    path: 'Old_Hard_Drive_Backup/Games/GTA_San_Andreas/gta_sa.exe',
    binary: makePeExe(false),
  },
];

// ── Main Generator Logic ───────────────────────────────────────────────────

function generateTestGamesFolder() {
  console.log('========================================================================');
  console.log('🎮 Otix Test Games Folder Generator');
  console.log(`📁 Target Directory: ${targetDir}`);
  console.log('========================================================================\n');

  if (cleanFirst && fs.existsSync(targetDir)) {
    console.log('🧹 Cleaning existing target directory...');
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  let fileCount = 0;
  let dirCount = 0;
  const createdDirs = new Set();

  for (const def of FILE_DEFINITIONS) {
    const fullPath = path.join(targetDir, def.path);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      if (!createdDirs.has(dir)) {
        createdDirs.add(dir);
        dirCount++;
      }
    }

    if (def.binary) {
      fs.writeFileSync(fullPath, def.binary);
    } else if (def.content !== undefined) {
      fs.writeFileSync(fullPath, def.content, 'utf8');
    } else {
      fs.writeFileSync(fullPath, '');
    }
    fileCount++;
  }

  // Create comprehensive README in the test folder
  const readmeContent = `# Test Games Folder Library (Otix Simulation Environment)

This test directory contains a comprehensive simulation of real-world game installations,
downloads, crack releases, repacks, platforms, and emulation ROMs designed to rigorously test
Otix's local game detection, release parsing, archive healing, indexer, and organization engine.

---

## Simulated Categories & Test Cases

### 1. Official Store Platforms
- **Steam**:
  - Valid \`appmanifest_<id>.acf\` manifests (Cyberpunk 2077, Baldur's Gate 3, CS2, Hollow Knight, Elden Ring).
  - \`steamapps/common/\` game hierarchies with native \`steam_api64.dll\`.
  - Incomplete download state in \`steamapps/downloading/\`.
  - Workshop mod directory and user config \`localconfig.vdf\`.
- **Epic Games**:
  - \`.egstore/Manifest.item\` and \`.bps\` patches for Grand Theft Auto V, Fortnite, Alan Wake 2.
  - \`Launcher/Portal/Manifests/\` app records.
- **GOG (Good Old Games)**:
  - GOG Galaxy installations with \`goggame-<id>.info\`, \`.ico\`, and \`.hashdb\` (The Witcher 3, Cyberpunk 2077).
  - GOG offline standalone multi-bin installers (\`setup_...exe\` + \`setup_...-1.bin\`).
- **EA App / Origin**:
  - Games with \`__Installer/installerdata.xml\` (Dead Space Remake, The Sims 4).
- **Ubisoft Connect**:
  - Games with \`uplay_install.manifest\` and \`uplay_install.state\` (Far Cry 6, Assassin's Creed Mirage).
- **Xbox / Microsoft Store**:
  - \`.GamingRoot\` disk identifier, MSIX \`appxmanifest.xml\`, and \`gamelaunchhelper.exe\` (Forza Horizon 5).
- **Battle.net**:
  - Games with \`.build.info\` and launcher executables (Diablo IV).

### 2. Repacks & Installers
- **FitGirl Repacks**:
  - Multi-bin installer sequences (\`setup.exe\`, \`setup-fitgirl-1.bin\`, \`fg-01.bin\`, \`fg-selective-english.bin\`).
  - \`quickSFV.exe\`, \`MD5/checksum.md5\`, and \`fitgirl.nfo\`.
  - **Anomaly Case**: Incomplete download with \`.bin.part\` (Ghost of Tsushima).
- **DODI Repacks**:
  - DODI archives with \`.doi\` data containers and \`dodi.nfo\` (Ghost of Tsushima).
- **ElAmigos Repacks**:
  - Clean multi-bin releases (\`setup.exe\` + \`elamigos-1.bin\`).
  - **Anomaly 1**: Duplicate download naming collision \`elamigos-2 (1).bin\`.
  - **Anomaly 2**: Missing prefix \`data-2.bin\` requiring healing to \`elamigos-2.bin\`.

### 3. Scene Releases & ISOs
- ISO images from major scene groups: **RUNE**, **TENOKE**, **CODEX**, **Razor1911**, **EMPRESS**, **FLT**, **DELUSION**.
- Accompanying scene metadata: \`.nfo\`, \`.sfv\`, and \`file_id.diz\`.
- Extracted scene folders with \`setup.exe\` and internal crack directories (\`CODEX/\`, \`RUNE/\`).

### 4. Cracked Games, Emulators, Crackfixes & Unlockers
- **Goldberg Steam Emulator**: Full configuration with \`steam_emu.ini\`, \`steam_settings/steam_appid.txt\`, \`DLC.txt\`, \`configs.user.ini\`.
- **RUNE & EMPRESS Cracks**: Standalone installations with \`rune.ini\` and \`emp.dll\`.
- **OnlineFix Multiplayer Crack**: Spacewar (AppID 480) multiplayer bypass with \`OnlineFix64.dll\` and \`OnlineFix.ini\`.
- **DLC Unlockers**: CreamAPI (\`cream_api.ini\` + \`steam_api64_o.dll\`), Koaloader (\`version.dll\`), and SmokeAPI.
- **Crackfixes & Standalone Crack Folders**: \`Crack.Only-ELAMIGOS/\`, \`Crackfix.V2-RUNE/\`, \`Crackfix-RUNE.exe\`.

### 5. Satellite Updates & Patches
- Standalone executable patches: \`Cyberpunk 2077 update 2.12 - 2.13.exe\`, \`Elden Ring update 1.12.3 - 1.13.0.exe\`.
- Folder packages containing cumulative update binaries and setup engines.

### 6. Portable & Direct-Play Games
- Unity Engine direct-play (\`Hollow Knight.exe\` + \`*_Data/\` + \`UnityCrashHandler64.exe\`).
- Unreal Engine direct-play (\`Black Myth Wukong\` + \`Win64-Shipping.exe\` + \`*.pak\`).
- Custom engines (Dyson Sphere Program, Factorio, Dead Cells, Need for Speed).

### 7. Archives & Compressed Downloads
- Multi-part RARs (\`.part01.rar\`, \`.part02.rar\`).
- \`.zip\`, \`.7z\`, single \`.rar\` downloads.

### 8. Console & Retro Emulation ROMs
- **Nintendo Switch**: \`.nsp\`, \`.xci\`, \`.nsz\` with Title IDs, base games, updates (\`[UPD]\`), and DLCs (\`[DLC]\`).
- **PlayStation 3 (RPCS3)**: \`PS3_GAME/\` folder structure with \`USRDIR/EBOOT.BIN\`, \`PARAM.SFO\`, \`ICON0.PNG\`, \`PS3_DISC.SFB\`, and \`.pkg\` updates.
- **PlayStation 4 (shadPS4)**: \`CUSA00411 - Bloodborne\` with \`eboot.bin\` and \`sce_sys/\`.
- **PlayStation 2 & 1**: Compressed \`.chd\` and multi-track \`.cue\`/\`.bin\`.
- **PSP & PS Vita**: \`.iso\`, \`.pbp\`, and \`.vpk\`.
- **Nintendo GameCube & Wii**: \`.rvz\`, \`.gcz\`, and \`.wbfs\`.
- **Retro Systems**: Nintendo 64 (\`.z64\`), SNES (\`.sfc\`), NES (\`.nes\`), Genesis (\`.md\`), Game Boy Advance (\`.gba\`), Nintendo DS (\`.nds\`), Nintendo 3DS (\`.3ds\`).

### 9. Noise & System Junk (Verification of Filter Rules)
- Redistributables: \`_CommonRedist/DirectX/DXSETUP.exe\`, \`vcredist/vc_redist.x64.exe\`, \`dotnetfx35.exe\`.
- OS metadata: \`.DS_Store\`, \`Thumbs.db\`, \`desktop.ini\`, \`$RECYCLE.BIN/\`, \`System Volume Information/\`.
- Incomplete downloads: \`*.crdownload\`, \`*.part\`, \`*.tmp\`.

---

## How to Test With Otix

\`\`\`bash
# Run dry-run simulation with the unified game management script:
node scripts/simulate-game-management.js --dir "test_games_library"

# Test with a specific preset:
node scripts/simulate-game-management.js --dir "test_games_library" --preset clean_game_folder

# Output structured JSON:
node scripts/simulate-game-management.js --dir "test_games_library" --json
\`\`\`
`;

  fs.writeFileSync(path.join(targetDir, 'README.md'), readmeContent, 'utf8');
  fileCount++;

  console.log(`✨ Successfully created test games environment!`);
  console.log(`📊 Statistics:`);
  console.log(`   • Total Directories: ${dirCount + createdDirs.size}`);
  console.log(`   • Total Files Created: ${fileCount}`);
  console.log(`   • Location: ${targetDir}`);
  console.log('\n🚀 Next step: Test with:');
  console.log(`   node scripts/simulate-game-management.js --dir "${targetDir}"\n`);
}

generateTestGamesFolder();
