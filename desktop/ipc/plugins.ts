// desktop/ipc/plugins.ts
// Plugin IPC surface lives in desktop/plugins/ipc.ts. This module only handles
// forwarding game-scan orchestrator events to the renderer (game domain).

import { BrowserWindow } from 'electron'
import type { GameScanOrchestrator } from '../game/orchestrator'

// ── Orchestrator event forwarding ──

export function wireOrchestratorEvents(
  orchestrator: GameScanOrchestrator,
  mainWindow: BrowserWindow,
): void {
  orchestrator.on('match:progress', (event: any) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:matching:progress', event);
    }
  });

  orchestrator.on('scan:complete', (event: any) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:matching:complete', event);
    }
  });

  orchestrator.on('scan:cancelled', (_event: any) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:matching:cancelled');
    }
  });
}
