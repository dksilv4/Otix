import { performance } from 'perf_hooks';

const modules = [
  '../game/detector',
  '../game/fps-capture',
  '../ipc/downloads',
  '../downloads/index',
  '../ipc/scanner',
  '../game/library-watcher',
  '../game/storage',
  '../ipc/installer',
  '../installer/index',
  '../ipc/game-detector',
  '../game/cs2-gsi',
  '../game/achievements/tracker',
  '../ipc/achievements',
  '../ipc/window',
  '../ipc/settings',
  '../desktop-settings',
  '../tray',
  '../db/index',
  '../saves/index',
  '../saves/export',
  '../plugin-runtime/permissions',
  '../plugin-runtime/manager',
  '../plugin-runtime/ipc',
  '../ipc/plugins',
  '../game/orchestrator',
  '../fetch/bridge',
  '../ipc/updater',
  '../node-daemon',
  '../ipc/node-daemon',
  '../ipc/game-servers',
  '../ipc/network',
  '../ipc/system',
  './protocols',
  './backend-sync',
];

console.log('--- INDIVIDUAL MODULE IMPORT TIME PROFILE ---');
let totalMs = 0;
for (const m of modules) {
  const t0 = performance.now();
  try {
    require(m);
    const d = performance.now() - t0;
    totalMs += d;
    console.log(`${m.padEnd(35)}: ${d.toFixed(2)} ms`);
  } catch (err: any) {
    console.log(`${m.padEnd(35)}: FAIL (${err.message})`);
  }
}
console.log(`Total Module Requires: ${totalMs.toFixed(2)} ms`);
