#!/usr/bin/env node
/**
 * Otix Unified Game Management Simulation Script
 *
 * Simulates game discovery, release parsing, noise filtering, and template-based
 * library reorganization on REAL folders with ZERO filesystem modifications (dry run only).
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
 *   node scripts/simulate-game-management.js --help
 */

const fs = require('fs');
const path = require('path');

// ── Naming Presets (From frontend/src/features/settings/utils/naming-template.ts) ──

const PRESETS = {
  standard: '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}',
  clean_game_folder: '{Title} ({Year})/{Title}.{ext}',
  flat_title: '{Title}/{Title}.{ext}',
  scene_release: '{Title}/{Title}.v{Version}-{ReleaseGroup}.{ext}',
  year_subfolder: '{Year}/{Title}/{OriginalName}.{ext}',
};

// ── Noise & Filtering (From node/internal/indexer/indexer.go) ──

const NOISE_EXECUTABLE_PATTERNS = [
  'unins000', 'uninstall', 'uninst',
  'crashreporter', 'crash_reporter', 'crashreport', 'crashhandler', 'crash_handler',
  'unitycrashhandler', 'unitycrashhandler32', 'unitycrashhandler64', 'crashpad', 'crashing',
  'vcredist', 'dxsetup', 'directx', 'dotnetfx', 'oalinst', 'physx', 'redist',
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
  'rune', 'tenoke', 'delusion', 'plaza', 'goldberg', 'razor1911',
]);

const EDITION_RE = /(goty|game\s*of\s*the\s*year|definitive|enhanced|remastered|ultimate|complete|deluxe|collectors|special|legendary|anniversary)\s*edition/gi;

// Realistic built-in sample releases for demonstration
const SAMPLE_RELEASES = [
  { raw: 'Cyberpunk.2077.v2.12.REPACK-ELAMIGOS.iso', ext: '.iso', sub: 'Downloads' },
  { raw: 'Elden.Ring.Shadow.of.the.Erdtree.REPACK-RUNE.iso', ext: '.iso', sub: 'Downloads' },
  { raw: 'The.Witcher.3.Wild.Hunt.GOTY-GOG.iso', ext: '.iso', sub: 'Downloads' },
  { raw: 'Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL.iso', ext: '.iso', sub: 'Downloads' },
  { raw: 'Hades.II.v0.91024-EarlyAccess.exe', ext: '.exe', sub: 'Downloads/Hades 2' },
  { raw: 'Cyberpunk 2077 update 2.12 - 2.13.exe', ext: '.exe', sub: 'Downloads/Cyberpunk 2077/Updates' },
  { raw: 'Elden Ring update 1.12.3 - 1.13.0.exe', ext: '.exe', sub: 'Downloads/Elden Ring/Updates' },
  { raw: 'HollowKnight.exe', ext: '.exe', sub: 'Games/Hollow Knight' },
  { raw: 'UnityCrashHandler64.exe', ext: '.exe', sub: 'Games/Hollow Knight' },
  { raw: 'dxsetup.exe', ext: '.exe', sub: 'Games/DirectX' },
];

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

// ── Parsing Functions ──

function cleanGameTitle(filename) {
  let name = filename;
  // Strip version patterns preceded by 'v' or 'update' (e.g. "update 2.12 - 2.13", "v1.12.3", "v2.12")
  name = name.replace(/(^|[^a-zA-Z0-9])(?:update\s*\d+(?:\.\d+)*(?:\s*-\s*\d+(?:\.\d+)*)?)/gi, '$1');
  name = name.replace(/(^|[^a-zA-Z0-9])v\d+(?:\.\d+)+(?:[a-zA-Z]\d*)?(?![a-zA-Z0-9])/gi, '$1');
  name = name.replace(/(^|[\s._-])(?:v\d+|build\s*\d+)(?=[\s._-]|$)/gi, ' ');
  name = name.replace(/\.(iso|exe|zip|rar|7z|bin|cue)$/i, '');
  name = name.replace(/[\._\-]/g, ' ');

  const tags = [
    /\[repack\]/gi, /\brepack\b/gi, /\belamigos\b/gi, /\bfitgirl\b/gi, /\bdodi\b/gi,
    /\bcodex\b/gi, /\bflt\b/gi, /\bplaza\b/gi, /\bskidrow\b/gi, /\brune\b/gi, /\btenoke\b/gi,
    /\bgoldberg\b/gi, /\brazor1911\b/gi, /\bfairlight\b/gi, /\bhoodlum\b/gi,
    /\bmulti\d+\b/gi, /\bvoices\d*\b/gi, /\bv\d+(\.\d+)*\b/gi, /\bbuild\s*\d+\b/gi, /\bupdate\s*\d*\b/gi,
    /\bunleashed\b/gi, /\bdlc\b/gi, /\bincl\b/gi, /\bgog\b/gi, /\bcrack\b/gi, /\bearlyaccess\b/gi,
  ];
  for (const tag of tags) {
    name = name.replace(tag, '');
  }
  name = name.replace(/\[\s*\]/g, '');
  name = name.replace(/\(\s*\)/g, '');
  name = name.replace(/\{\s*\}/g, '');
  name = name.replace(/\s+(exe|iso)\s*$/gi, '');
  name = name.replace(/[\s\-\+\:\,]+$/, '');
  return name.replace(/\s+/g, ' ').trim();
}

function extractGroup(rawName) {
  const lower = rawName.toLowerCase().trim();
  const cleaned = lower.replace(/\s*password=.*$/i, '').replace(/\.(iso|exe)$/i, '').trim();
  const dashMatch = cleaned.match(/-([a-z0-9]+)$/);
  if (dashMatch && !CORE_SKIP_WORDS.has(dashMatch[1])) {
    return capitalize(dashMatch[1]);
  }
  const groups = ['elamigos', 'fitgirl', 'dodi', 'rune', 'flt', 'codex', 'skidrow', 'tenoke', 'razor1911', 'goldberg'];
  for (const g of groups) {
    if (new RegExp(`\\b${g}\\b`, 'i').test(rawName)) return capitalize(g);
  }
  return null;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function parseReleaseName(rawName) {
  const baseName = path.basename(rawName).replace(/\.(iso|exe)$/i, '');
  const cleanTitle = cleanGameTitle(baseName);

  // Year detection: only in brackets or as last word before extension. Range 1980..2026
  const yearBracket = baseName.match(/[\[\(](?<year>(?:19[8-9]\d|20[0-2]\d))[\]\)]/);
  const yearEnd = baseName.match(/(?:\s|\.)(?<year>(?:19[8-9]\d|20[0-2]\d))(?:\s*\.\w+)?$/);
  const year = yearBracket?.groups?.year || yearEnd?.groups?.year || '';

  // Version detection
  const vMatch = baseName.match(/(?:^|[\s._-])v?(\d+(?:\.\d+)+)/i) || baseName.match(/build\s*(\d+)/i);
  const version = vMatch ? vMatch[1] : '';

  // Edition detection
  const edMatch = baseName.match(EDITION_RE);
  const edition = edMatch ? edMatch[0].trim() : '';

  // Group detection
  const group = extractGroup(baseName) || '';

  // Platform detection
  const platMatch = baseName.match(/\[(PC|Switch|PS\d|Xbox)\]/i) || baseName.match(/\b(PC|Switch)\b/i);
  const platform = platMatch ? platMatch[1].toUpperCase() : 'PC';

  return {
    rawName: baseName,
    title: cleanTitle || baseName,
    cleanTitle,
    year,
    version: version || '1.0',
    edition,
    releaseGroup: group || 'Scene',
    platform,
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
  return false;
}

function classifyArtifact(filename, fullPath) {
  const ext = path.extname(filename).toLowerCase();
  const lower = filename.toLowerCase();

  if (isNoiseFile(filename, fullPath)) {
    return { category: 'noise', skip: true };
  }

  if (ext === '.iso' || ext === '.img' || ext === '.bin') {
    return { category: 'iso', isPrimary: true };
  }

  if (ext === '.exe') {
    if (lower.includes('update') || lower.includes('patch') || lower.includes('hotfix')) {
      return { category: 'update', isPrimary: false };
    }
    if (lower.includes('dlc')) {
      return { category: 'dlc', isPrimary: false };
    }
    const stem = path.basename(filename, ext).toLowerCase();
    if (GENERIC_INSTALLER_STEMS.has(stem) || lower.includes('setup') || lower.includes('install')) {
      return { category: 'installer', isPrimary: true };
    }
    return { category: 'game_exe', isPrimary: true };
  }

  if (['.nsp', '.xci', '.3ds', '.nds', '.rvz', '.chd', '.sfc', '.smc'].includes(ext)) {
    return { category: 'rom', isPrimary: true };
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
    '{OriginalName}': release.rawName,
    '{ext}': ext.replace(/^\./, ''),
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
  let files = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dirPath, ent.name);
      if (ent.isDirectory()) {
        const lower = ent.name.toLowerCase();
        if (NOISE_DIRECTORY_NAMES.has(lower) || lower.startsWith('$') || lower.startsWith('.')) {
          continue;
        }
        files = files.concat(walkDirectory(full, maxDepth, currentDepth + 1));
      } else if (ent.isFile()) {
        files.push(full);
      }
    }
  } catch (err) {
    // Ignore unreadable dirs
  }
  return files;
}

// ── Simulation Engine ──

function runSimulation(rootDir, options) {
  const template = options.template || PRESETS[options.preset] || PRESETS.standard;
  let rawFiles = [];
  const isSample = options.sample || !rootDir || !fs.existsSync(rootDir);

  if (isSample) {
    const fakeBase = rootDir || 'D:\\Games\\Library';
    rawFiles = SAMPLE_RELEASES.map((s) => ({
      fullPath: path.join(fakeBase, s.sub, s.raw),
      filename: s.raw,
      ext: s.ext,
      isSimulated: true,
    }));
  } else {
    const diskFiles = walkDirectory(rootDir, options.depth || 4);
    rawFiles = diskFiles.map((p) => ({
      fullPath: p,
      filename: path.basename(p),
      ext: path.extname(p).toLowerCase(),
      isSimulated: false,
    }));
  }

  const results = [];
  const targetMap = new Map();
  let noiseCount = 0;

  for (const file of rawFiles) {
    const classification = classifyArtifact(file.filename, file.fullPath);
    if (classification.skip) {
      noiseCount++;
      continue;
    }

    const release = parseReleaseName(file.filename);
    let targetRel = '';
    let status = 'RENAME_AND_MOVE';

    if (classification.category === 'update' || classification.category === 'dlc') {
      // Group satellite update into parent game folder
      const yearPart = release.year ? ` (${release.year})` : '';
      const parentDir = `${release.title}${yearPart} [${release.platform}]/Updates`;
      targetRel = path.join(parentDir, file.filename).replace(/\\/g, '/');
      status = 'SECONDARY_UPDATE';
    } else {
      targetRel = applyTemplate(release, template, file.ext);
      const simulatedSourceRel = isSample
        ? file.fullPath.replace(/^[a-zA-Z]:[\\/]/, '').replace(/\\/g, '/')
        : path.relative(rootDir, file.fullPath).replace(/\\/g, '/');

      if (simulatedSourceRel.toLowerCase() === targetRel.toLowerCase()) {
        status = 'ALREADY_ORGANIZED';
      } else if (targetMap.has(targetRel.toLowerCase())) {
        status = 'CONFLICT_COLLISION';
      }
    }

    targetMap.set(targetRel.toLowerCase(), file.fullPath);

    results.push({
      sourcePath: file.fullPath,
      sourceFilename: file.filename,
      category: classification.category,
      parsed: release,
      targetRelative: targetRel,
      status,
      isSimulated: file.isSimulated,
    });
  }

  return {
    rootDir: rootDir || 'D:\\Games\\Library (Simulated)',
    isSample,
    template,
    totalScanned: rawFiles.length,
    noiseFiltered: noiseCount,
    actionableItems: results,
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
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--depth') {
      options.depth = parseInt(args[++i], 10) || 4;
    } else if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    }
  }

  return options;
}

function showHelp() {
  console.log(`
${colors.bold}${colors.cyan}Otix Game Management Simulation CLI${colors.reset}
Simulates library discovery, release parsing, and reorganization without touching any files.

${colors.bold}Usage:${colors.reset}
  node scripts/simulate-game-management.js [options]

${colors.bold}Options:${colors.reset}
  -d, --dir <path>       Real folder path to scan (ISOs, game library, downloads)
  -p, --preset <name>    Naming preset (default: standard)
                         Available: standard, clean_game_folder, flat_title, scene_release, year_subfolder
  -t, --template <tmpl>  Custom naming template (e.g. "{Title} ({Year})/{Title}.{ext}")
  -s, --sample           Run simulation with sample realistic scene/repack releases
  --depth <number>       Directory scan depth (default: 4)
  --json                 Output raw JSON results for machine processing
  -h, --help             Show this help screen
`);
}

function main() {
  const options = parseArgs();
  const sim = runSimulation(options.dir, options);

  if (options.json) {
    console.log(JSON.stringify(sim, null, 2));
    return;
  }

  console.log('');
  console.log(`${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}             OTIX GAME MANAGEMENT SIMULATION (DRY RUN)                  ${colors.reset}`);
  console.log(`${colors.cyan}========================================================================${colors.reset}`);
  console.log(`  ${colors.bold}Scan Target:${colors.reset}     ${sim.rootDir} ${sim.isSample ? `${colors.yellow}(Sample Mode)${colors.reset}` : ''}`);
  console.log(`  ${colors.bold}Naming Template:${colors.reset} ${colors.magenta}${sim.template}${colors.reset}`);
  console.log(`  ${colors.bold}Preset:${colors.reset}          ${options.preset}`);
  console.log(`  ${colors.bold}Mode:${colors.reset}            ${colors.green}Strict Simulation / ZERO Outcomes (No files touched)${colors.reset}`);
  console.log(`${colors.cyan}------------------------------------------------------------------------${colors.reset}`);
  console.log(`  ${colors.bold}Files Inspected:${colors.reset} ${sim.totalScanned}`);
  console.log(`  ${colors.bold}Noise Filtered:${colors.reset}  ${sim.noiseFiltered} (DirectX, vcredist, crash handlers, etc.)`);
  console.log(`  ${colors.bold}Valid Games/ISOs:${colors.reset}${sim.actionableItems.length}`);
  console.log(`${colors.cyan}========================================================================${colors.reset}`);
  console.log('');

  if (sim.actionableItems.length === 0) {
    console.log(`${colors.yellow}No actionable game artifacts found in target directory.${colors.reset}`);
    console.log(`Tip: Run with ${colors.bold}--sample${colors.reset} to preview realistic scene releases.`);
    return;
  }

  console.log(`${colors.bold}Discovered Artifacts & Proposed Organization:${colors.reset}`);
  console.log('');

  for (let idx = 0; idx < sim.actionableItems.length; idx++) {
    const item = sim.actionableItems[idx];
    let badgeColor = colors.green;
    if (item.status === 'ALREADY_ORGANIZED') badgeColor = colors.blue;
    if (item.status === 'CONFLICT_COLLISION') badgeColor = colors.red;
    if (item.status === 'SECONDARY_UPDATE') badgeColor = colors.yellow;

    console.log(`[${idx + 1}] ${colors.bold}${item.sourceFilename}${colors.reset}`);
    console.log(`    ${colors.gray}Category:${colors.reset}     ${item.category.toUpperCase()} | Group: ${item.parsed.releaseGroup || 'N/A'} | Year: ${item.parsed.year}`);
    console.log(`    ${colors.gray}Clean Title:${colors.reset}  ${colors.cyan}${item.parsed.cleanTitle}${colors.reset}`);
    console.log(`    ${colors.gray}Proposed To:${colors.reset}  ${colors.magenta}${item.targetRelative}${colors.reset}`);
    console.log(`    ${colors.gray}Status:${colors.reset}       ${badgeColor}[${item.status}]${colors.reset}`);
    console.log('');
  }

  console.log(`${colors.cyan}------------------------------------------------------------------------${colors.reset}`);
  console.log(`${colors.green}✔ Simulation completed successfully with zero modifications to your disk.${colors.reset}`);
  console.log(`${colors.cyan}========================================================================${colors.reset}`);
  console.log('');
}

main();
