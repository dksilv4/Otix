import type { BrowserWindow } from 'electron';
import type { GameDetector, RunningGame, PlaySession } from '../game/detector';
import type { FpsCaptureService } from '../game/fps-capture';
import type { AchievementTracker } from '../game/achievements/tracker';
import type { Cs2GsiManager } from '../game/cs2-gsi';
import type { PluginManager } from '../plugin-runtime/manager';
import type { PermissionManager } from '../plugin-runtime/permissions';
import type { SaveDaemon } from '../saves';
import type { FetchWorkerBridge } from '../fetch/bridge';
import type { NodeDaemonManager } from '../node-daemon';
import type { LibraryWatcher } from '../game/library-watcher';
import type { GameScanOrchestrator } from '../game/orchestrator';
import type { DesktopSettings } from '../desktop-settings';
import type { createTray } from '../tray';

export type TrayHandle = ReturnType<typeof createTray> | null;

export interface BootContext {
  mainWindow: BrowserWindow | null;
  dbReady: boolean;
  settings: DesktopSettings;
  tray: TrayHandle;
  currentAuthToken: string;

  // Services
  gameDetector: GameDetector | null;
  fpsCaptureService: FpsCaptureService | null;
  achievementTracker: AchievementTracker | null;
  cs2GsiManager: Cs2GsiManager | null;
  pluginManager: PluginManager | null;
  permissionManager: PermissionManager | null;
  saveDaemon: SaveDaemon | null;
  fetchBridge: FetchWorkerBridge | null;
  nodeDaemon: NodeDaemonManager | null;
  libraryWatcher: LibraryWatcher | null;
  orchestrator: GameScanOrchestrator | null;

  // Timers & State
  runningGameSyncTimer: NodeJS.Timeout | null;
  desktopNodeHeartbeatTimer: NodeJS.Timeout | null;
  initialDownloadCheckTimer: NodeJS.Timeout | null;
  periodicDownloadCheckTimer: NodeJS.Timeout | null;
  stagedTimers: NodeJS.Timeout[];

  pendingDeepLink: string | null;
  isQuitting: boolean;
}
