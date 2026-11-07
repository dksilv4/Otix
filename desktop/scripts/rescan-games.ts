import * as path from 'path';
import * as fs from 'fs';

// Mock electron app.getPath('userData') before importing db modules
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (moduleName: string) {
  if (moduleName === 'electron') {
    return {
      app: {
        getPath: (_name: string) => path.join(process.env.APPDATA || '', 'desktop'),
      },
      BrowserWindow: class {
        static fromWebContents() { return null; }
        static getFocusedWindow() { return null; }
      },
      ipcMain: {
        handle: () => {},
        on: () => {},
      },
    };
  }
  return originalRequire.apply(this, arguments);
};

async function main() {
  const { initDatabase, getDb } = await import('../db');
  const gameService = await import('../game/storage');
  const { executeScan } = await import('../ipc/scanner');

  console.log('=== STEP 1: INITIALIZE DB & RESET GAMES ===');
  await initDatabase();
  gameService.resetGameData();

  const countBefore = getDb().prepare('SELECT COUNT(*) as c FROM scanned_games').get() as { c: number };
  console.log(`Database reset complete. Scanned games count: ${countBefore.c}`);

  console.log('\n=== STEP 2: RUN RESCAN ===');
  const token = '64b4bdc57c3aab9c9e5b7dfa05b768bb02642d9c7d52bcbe';
  const mockNodeDaemon = {
    currentPort: 8090,
    getNodeAuthToken: () => token,
    syncLibraries: async () => {},
  };

  const scanPaths = ['\\\\192.168.1.58\\Games', 'D:\\Games', 'D:\\SteamLibrary'];

  const res = await executeScan({
    paths: scanPaths,
    isoPaths: [],
    nodeDaemon: mockNodeDaemon as any,
    onProgress: (dir, progress) => {
      console.log(`[Progress ${progress}%] ${dir}`);
    },
  });

  console.log(`\nScan execution finished. Discovered ${res.games.length} total games (${res.newGames.length} new).`);

  console.log('\n=== STEP 3: ANALYZE ALL SCANNED GAMES IN DATABASE ===');
  const rows = getDb().prepare('SELECT id, title, platform, exe_path, local_exe_path FROM scanned_games ORDER BY platform, title').all() as any[];
  console.log(`Total games in database: ${rows.length}`);

  const byPlat: Record<string, number> = {};
  const anomalies: string[] = [];
  const seenExes = new Map<string, string>();

  for (const r of rows) {
    byPlat[r.platform] = (byPlat[r.platform] || 0) + 1;

    const tLower = r.title.toLowerCase();
    const pLower = (r.exe_path || '').toLowerCase();

    // Check for banned / anomalous titles
    if (
      tLower.startsWith('menu simulation') ||
      tLower.startsWith('nauvis ') ||
      tLower === 'app 0' ||
      tLower === 'app0' ||
      tLower === 'plugins' ||
      tLower === 'cleaner' ||
      tLower === 'legacy' ||
      tLower === 'sheep' ||
      tLower === 'distribution' ||
      pLower.includes('menu-simulation') ||
      pLower.includes('mods\\bigambitionsmp')
    ) {
      anomalies.push(`ANOMALY DETECTED: [${r.id}] ${r.title} (${r.platform}) -> ${r.exe_path}`);
    }

    // Check for duplicate executables
    const target = (r.local_exe_path || (r.exe_path && !r.exe_path.startsWith('steam://') ? r.exe_path : '')).toLowerCase();
    if (target) {
      if (seenExes.has(target) && seenExes.get(target) !== r.id) {
        anomalies.push(`DUPLICATE DETECTED: [${r.id}] ${r.title} shares exe with [${seenExes.get(target)}] (${target})`);
      } else {
        seenExes.set(target, r.id);
      }
    }
  }

  console.log('\nPlatform breakdown:');
  for (const [p, count] of Object.entries(byPlat)) {
    console.log(`  ${p.padEnd(10)}: ${count} games`);
  }

  console.log('\n=== COMPLETE SCANNED LIBRARY INVENTORY ===');
  for (const r of rows) {
    console.log(`[${r.platform.toUpperCase().padEnd(6)}] ${r.title.padEnd(45)} | Exe: ${r.exe_path || ''} | Local: ${r.local_exe_path || ''}`);
  }

  console.log(`\nAnomalies count: ${anomalies.length}`);
  if (anomalies.length > 0) {
    for (const a of anomalies) {
      console.error(' ', a);
    }
    process.exit(1);
  } else {
    console.log('\nSUCCESS: 0 anomalies, 0 duplicates, 100% clean scanned library!');
  }
}

main().catch((err) => {
  console.error('Rescan script error:', err);
  process.exit(1);
});
