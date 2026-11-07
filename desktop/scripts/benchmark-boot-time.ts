import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { performance } from 'perf_hooks';

app.commandLine.appendSwitch('disable-gpu-program-cache');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-disk-cache');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

// Ensure headless/offscreen for automated benchmarking if needed
const startTime = performance.now();

interface BootMetrics {
  moduleLoadMs: number;
  stage1ProtocolsMs: number;
  stage2DbInitMs: number;
  stage3CreateWindowMs: number;
  stage4RegisterIpcMs: number;
  timeToWindowCreatedMs: number;
  timeToIpcReadyMs: number;
  totalBootMs: number;
}

async function runBenchmark() {
  console.log('================================================================');
  console.log('OTIX DESKTOP STARTUP & BOOT PERFORMANCE BENCHMARK HARNESS');
  console.log('================================================================');

  const importStart = performance.now();
  const { StagedBootManager } = await import('../boot/staged-boot');
  const importEnd = performance.now();
  const moduleLoadMs = importEnd - importStart;
  console.log(`[Metric] Boot modules import time: ${moduleLoadMs.toFixed(2)} ms`);

  await app.whenReady();
  const appReadyTime = performance.now();
  console.log(`[Metric] Time to app.whenReady(): ${(appReadyTime - startTime).toFixed(2)} ms`);

  const bootManager = new StagedBootManager(false);

  // Patch methods to instrument timing
  const anyMgr = bootManager as any;

  const origStage1 = anyMgr.stage1_protocolsAndSession.bind(bootManager);
  let stage1Ms = 0;
  anyMgr.stage1_protocolsAndSession = () => {
    const s = performance.now();
    origStage1();
    stage1Ms = performance.now() - s;
  };

  const origStage2 = anyMgr.stage2_initDatabase.bind(bootManager);
  let stage2Ms = 0;
  anyMgr.stage2_initDatabase = async () => {
    const s = performance.now();
    await origStage2();
    stage2Ms = performance.now() - s;
  };

  const origStage3 = anyMgr.stage3_createWindow.bind(bootManager);
  let stage3Ms = 0;
  let windowCreatedTime = 0;
  anyMgr.stage3_createWindow = () => {
    const s = performance.now();
    origStage3();
    stage3Ms = performance.now() - s;
    windowCreatedTime = performance.now();
  };

  const origStage4 = anyMgr.stage4_registerEssentialIPC.bind(bootManager);
  let stage4Ms = 0;
  let ipcReadyTime = 0;
  anyMgr.stage4_registerEssentialIPC = () => {
    const s = performance.now();
    origStage4();
    stage4Ms = performance.now() - s;
    ipcReadyTime = performance.now();
  };

  const bootStart = performance.now();
  await bootManager.boot();
  const bootEnd = performance.now();

  const metrics: BootMetrics = {
    moduleLoadMs,
    stage1ProtocolsMs: stage1Ms,
    stage2DbInitMs: stage2Ms,
    stage3CreateWindowMs: stage3Ms,
    stage4RegisterIpcMs: stage4Ms,
    timeToWindowCreatedMs: windowCreatedTime - bootStart,
    timeToIpcReadyMs: ipcReadyTime - bootStart,
    totalBootMs: bootEnd - bootStart,
  };

  console.log('\n--- BOOT STAGE TIMING BREAKDOWN ---');
  console.log(`Stage 1 (Protocols & Session):    ${metrics.stage1ProtocolsMs.toFixed(2)} ms`);
  console.log(`Stage 2 (Database & Migrations):  ${metrics.stage2DbInitMs.toFixed(2)} ms`);
  console.log(`Stage 3 (Window Creation & Show): ${metrics.stage3CreateWindowMs.toFixed(2)} ms`);
  console.log(`Stage 4 (Essential IPC Register): ${metrics.stage4RegisterIpcMs.toFixed(2)} ms`);
  console.log('--------------------------------------------------');
  console.log(`Time-To-First-Window (TTFW):      ${metrics.timeToWindowCreatedMs.toFixed(2)} ms`);
  console.log(`Time-To-Interactive (IPC Ready):  ${metrics.timeToIpcReadyMs.toFixed(2)} ms`);
  console.log(`Total Immediate Boot Sequence:    ${metrics.totalBootMs.toFixed(2)} ms`);
  console.log('==================================================\n');

  // Clean shutdown
  const win = bootManager.getContext().mainWindow;
  if (win && !win.isDestroyed()) {
    win.destroy();
  }
  app.exit(0);
}

runBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  app.exit(1);
});
