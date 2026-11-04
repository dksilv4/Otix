#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const fixturePath = path.join(rootDir, 'fixtures', 'parser_fixtures.json');

console.log(`[verify-fixtures] Checking: ${fixturePath}`);

if (!fs.existsSync(fixturePath)) {
  console.error(`[FAIL] Fixture file does not exist at: ${fixturePath}`);
  process.exit(1);
}

let raw;
try {
  raw = fs.readFileSync(fixturePath, 'utf8');
} catch (err) {
  console.error(`[FAIL] Could not read fixture file:`, err);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(raw);
} catch (err) {
  console.error(`[FAIL] JSON parsing failed:`, err);
  process.exit(1);
}

if (!data || typeof data !== 'object' || !Array.isArray(data.cases)) {
  console.error(`[FAIL] Root object must contain a 'cases' array.`);
  process.exit(1);
}

const cases = data.cases;
console.log(`[INFO] Found ${cases.length} test cases in fixtures.`);

if (cases.length < 105) {
  console.error(`[FAIL] Expected at least 105 test cases, found ${cases.length}.`);
  process.exit(1);
}

const REQUIRED_PLATFORMS = new Set([
  'PC',
  'NES',
  'SNES',
  'N64',
  'GameCube',
  'Wii',
  'Switch',
  'PS1',
  'PS2',
  'PS3',
  'PSP',
  'Dreamcast',
]);

const REQUIRED_EXPECTED_FIELDS = [
  { name: 'title', type: 'string', nonEmpty: true },
  { name: 'clean_title', type: 'string', nonEmpty: true },
  { name: 'year', type: 'string', nonEmpty: false },
  { name: 'edition', type: 'string', nonEmpty: false },
  { name: 'platform', type: 'string', nonEmpty: true },
  { name: 'release_group', type: 'string', nonEmpty: false },
  { name: 'region', type: 'string', nonEmpty: false },
  { name: 'version', type: 'string', nonEmpty: false },
  { name: 'title_id', type: 'string', nonEmpty: false },
  { name: 'is_scene', type: 'boolean', nonEmpty: false },
];

const platformCounts = new Map();
let sceneCount = 0;
let repackArchiveCount = 0;
let updateDlcCount = 0;
let errors = 0;

for (let i = 0; i < cases.length; i++) {
  const tc = cases[i];
  const idx = `Case #${i + 1} ("${tc.input || 'missing'}")`;

  if (typeof tc.input !== 'string' || !tc.input.trim()) {
    console.error(`[FAIL] ${idx}: 'input' must be a non-empty string.`);
    errors++;
  }
  if (typeof tc.ext_hint !== 'string') {
    console.error(`[FAIL] ${idx}: 'ext_hint' must be a string.`);
    errors++;
  }
  if (typeof tc.parent_dir !== 'string') {
    console.error(`[FAIL] ${idx}: 'parent_dir' must be a string.`);
    errors++;
  }
  if (!tc.expected || typeof tc.expected !== 'object') {
    console.error(`[FAIL] ${idx}: 'expected' must be an object.`);
    errors++;
    continue;
  }

  for (const field of REQUIRED_EXPECTED_FIELDS) {
    const val = tc.expected[field.name];
    if (typeof val !== field.type) {
      console.error(`[FAIL] ${idx}: 'expected.${field.name}' must be of type ${field.type}, got ${typeof val}.`);
      errors++;
    } else if (field.nonEmpty && typeof val === 'string' && !val.trim()) {
      console.error(`[FAIL] ${idx}: 'expected.${field.name}' must not be empty.`);
      errors++;
    }
  }

  const plat = tc.expected.platform;
  if (plat) {
    if (!REQUIRED_PLATFORMS.has(plat)) {
      console.error(`[FAIL] ${idx}: Unknown platform "${plat}".`);
      errors++;
    } else {
      platformCounts.set(plat, (platformCounts.get(plat) || 0) + 1);
    }
  }

  if (tc.expected.is_scene) {
    sceneCount++;
  }
  if (/part\d+|\.bin|\.iso|\.rar|\.zip|repack/i.test(tc.input)) {
    repackArchiveCount++;
  }
  if (/update|dlc|patch|hotfix|crackfix/i.test(tc.input)) {
    updateDlcCount++;
  }
}

console.log('\n--- Platform Distribution ---');
for (const plat of REQUIRED_PLATFORMS) {
  const count = platformCounts.get(plat) || 0;
  console.log(`  - ${plat.padEnd(12)}: ${count} cases`);
  if (count === 0) {
    console.error(`[FAIL] Platform "${plat}" has zero cases! All 11 retro + PC platforms are required.`);
    errors++;
  }
}

console.log('\n--- Category Breakdown ---');
console.log(`  - Scene releases: ${sceneCount}`);
console.log(`  - Repack / multi-part / archives: ${repackArchiveCount}`);
console.log(`  - Updates / DLCs / Patches: ${updateDlcCount}`);

if (errors > 0) {
  console.error(`\n[FAIL] Fixture verification completed with ${errors} error(s).`);
  process.exit(1);
}

console.log(`\n[PASS] All ${cases.length} fixtures passed verification with strict 100% schema compliance!`);
process.exit(0);
