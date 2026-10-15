#!/usr/bin/env node
/**
 * Otix 10k File Structures Simulation Runner
 *
 * Runs the File Management simulation engine against 10,000 synthetic, diverse
 * file structures across PC repacks, scene ISOs, Switch NSPs, retro ROMs,
 * secondary updates, DLCs, preserved metadata, and noise filters.
 *
 * Usage:
 *   node scripts/simulate-10k.js
 *   node scripts/simulate-10k.js --preset platform_subfolder
 *   node scripts/simulate-10k.js --preset rom_standard
 *   node scripts/simulate-10k.js --json
 */

const rawArgs = process.argv.slice(2);
const hasScale = rawArgs.includes('--scale');
const hasConflict = rawArgs.includes('--resolve-conflicts');

if (!hasScale) {
  process.argv.splice(2, 0, '--scale', '10000');
}
if (!hasConflict) {
  process.argv.splice(2, 0, '--resolve-conflicts', 'auto');
}

const sim = require('./simulate-game-management.js');
sim.main();
