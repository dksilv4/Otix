import { app, BrowserWindow, screen, nativeImage, session as electronSession } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getApiBaseUrl } from '../config';
import { applyDesktopSettings, getSettings } from '../desktop-settings';
import { registerWindowIPC, notifyMaximizedChange } from '../ipc/window';
import { registerDesktopSettingsIPC } from '../ipc/settings';
import { registerNotificationIPC } from '../ipc/notifications';
import { registerDownloadsIPC } from '../ipc/downloads';
import { registerGameServersIPC } from '../ipc/game-servers';
import { registerNetworkIPC } from '../ipc/network';
import { registerInstallerIPC } from '../ipc/installer';
import { registerSystemIPC, openStandaloneWindow } from '../ipc/system';
import { setupSessionHeaders, registerAppProtocol, registerMediaCacheProtocol, registerLocalMediaProtocol } from './protocols';
import { closeDb } from '../db';
import type { BootContext } from './types';

// Directory containing compiled desktop distribution files (desktop/dist) and repo paths
const appDistDir = path.resolve(__dirname, '..');
const desktopRootDir = path.resolve(appDistDir, '..');

// Lazy backend sync helpers
let _backendSyncMod: typeof import('./backend-sync') | null = null;
async function getBackendSync() {
  if (!_backendSyncMod) _backendSyncMod = await import('./backend-sync');
  return _backendSyncMod;
}

function syncRunningGames(ctx: BootContext, games: any[]): void {
  void getBackendSync().then((m) => m.syncRunningGamesToBackend(ctx, games)).catch(() => {});
}

function syncGameSession(ctx: BootContext, session: any): void {
  void getBackendSync().then((m) => m.syncGameSessionToBackend(ctx, session)).catch(() => {});
}

function syncDesktopNode(ctx: BootContext, notify: boolean): void {
  void getBackendSync().then((m) => m.syncDesktopNodeToBackend(ctx, notify)).catch(() => {});
}

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

const DEFAULT_SIZE: WindowState = { width: 1280, height: 800, maximized: false };

let _statePathCache: string = '';
function statePath(): string {
  if (!_statePathCache) {
    _statePathCache = path.join(app.getPath('userData'), 'window-state.json');
  }
  return _statePathCache;
}

function loadWindowState(): WindowState | null {
  try {
    const raw = fs.readFileSync(statePath(), 'utf-8');
    return JSON.parse(raw) as WindowState;
  } catch {
    return null;
  }
}

function ensureVisible(saved: WindowState): Electron.Rectangle {
  const pri = screen.getPrimaryDisplay().workArea;
  const w = saved.width || DEFAULT_SIZE.width;
  const h = saved.height || DEFAULT_SIZE.height;

  if (saved.x === undefined || saved.y === undefined) {
    return {
      x: pri.x + Math.max(0, (pri.width - w) / 2),
      y: pri.y + Math.max(0, (pri.height - h) / 2),
      width: w,
      height: h,
    };
  }

  const onPrimary = (
    saved.x >= pri.x && saved.x + w <= pri.x + pri.width &&
    saved.y >= pri.y && saved.y + h <= pri.y + pri.height
  );

  if (onPrimary) {
    return { x: saved.x, y: saved.y, width: w, height: h };
  }

  return {
    x: pri.x + Math.max(0, Math.round((pri.width - w) / 2)),
    y: pri.y + Math.max(0, Math.round((pri.height - h) / 2)),
    width: w,
    height: h,
  };
}

let _saveWindowStateTimer: NodeJS.Timeout | null = null;
function saveWindowState(win: BrowserWindow) {
  try {
    let bounds: Electron.Rectangle;
    if (win.isMaximized()) {
      bounds = win.getNormalBounds();
      fs.promises.writeFile(statePath(), JSON.stringify({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, maximized: true })).catch(() => {});
    } else {
      bounds = win.getBounds();
      fs.promises.writeFile(statePath(), JSON.stringify({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, maximized: false })).catch(() => {});
    }
  } catch {}
}

function debouncedSaveWindowState(win: BrowserWindow) {
  if (_saveWindowStateTimer) clearTimeout(_saveWindowStateTimer);
  _saveWindowStateTimer = setTimeout(() => {
    _saveWindowStateTimer = null;
    if (win && !win.isDestroyed()) {
      saveWindowState(win);
    }
  }, 300);
}

export class StagedBootManager {
  private ctx: BootContext;
  private isDev: boolean;
  private isTearingDown = false;

  constructor(isDev: boolean) {
    this.isDev = isDev;
    this.ctx = {
      mainWindow: null,
      dbReady: false,
      settings: getSettings(),
      tray: null,
      currentAuthToken: '',
      gameDetector: null,
      fpsCaptureService: null,
      achievementTracker: null,
      cs2GsiManager: null,
      pluginManager: null,
      permissionManager: null,
      saveDaemon: null,
      fetchBridge: null,
      nodeDaemon: null,
      libraryWatcher: null,
      orchestrator: null,
      runningGameSyncTimer: null,
      desktopNodeHeartbeatTimer: null,
      initialDownloadCheckTimer: null,
      periodicDownloadCheckTimer: null,
      stagedTimers: [],
      pendingDeepLink: null,
      isQuitting: false,
    };
  }

  public getContext(): BootContext {
    return this.ctx;
  }

  public setPendingDeepLink(url: string | null): void {
    this.ctx.pendingDeepLink = url;
    if (url && this.ctx.mainWindow && !this.ctx.mainWindow.isDestroyed()) {
      this.handleDeepLink(url);
    }
  }

  public parseDeepLink(url: string): { action: string; params: Record<string, string> } {
    try {
      const u = new URL(url);
      const params: Record<string, string> = {};
      u.searchParams.forEach((v, k) => { params[k] = v; });
      const action = (u.hostname + u.pathname).replace(/\/+$/, '');
      return { action, params };
    } catch {
      return { action: 'refocus', params: {} };
    }
  }

  public handleDeepLink(url: string): void {
    if (!this.ctx.mainWindow || this.ctx.mainWindow.isDestroyed()) {
      this.ctx.pendingDeepLink = url;
      return;
    }
    const data = this.parseDeepLink(url);
    this.ctx.mainWindow.webContents.send('deep-link', data);
    if (this.ctx.mainWindow.isMinimized()) this.ctx.mainWindow.restore();
    this.ctx.mainWindow.focus();
  }

  public markQuitting(): void {
    this.ctx.isQuitting = true;
  }

  /**
   * Run the structured staged boot sequence with parallel window presentation.
   */
  public async boot(): Promise<void> {
    console.log('[boot] Starting structured desktop boot pipeline...');

    // STAGE 1: Protocols & Security Headers (Synchronous Shell Preparation)
    this.stage1_protocolsAndSession();

    // STAGE 2: Launch Database Initialization asynchronously in background
    const dbInitPromise = this.stage2_initDatabase();

    // STAGE 3: Window Creation & UI Shell Display (Immediate Window Visibility)
    // Runs in parallel with DB initialization to minimize Time-To-First-Window
    this.stage3_createWindow();

    // STAGE 4: Essential IPC & Controller Registration
    await this.stage4_registerEssentialIPC();

    // Await DB initialization and then notify renderer that IPC & database are ready
    await dbInitPromise;
    this.notifyIpcReady();

    // STAGE 5: Interactive Services Tier (Staggered: 350ms after window creation)
    const t5 = setTimeout(() => {
      if (!this.ctx.isQuitting) {
        this.stage5_startInteractiveServices().catch((err) => {
          console.error('[boot:stage5] Interactive services error:', err);
        });
      }
    }, 350);
    this.ctx.stagedTimers.push(t5);

    // STAGE 6: Deferred Daemons & Idle Network Background Tasks (Staggered: 2800ms)
    const t6 = setTimeout(() => {
      if (!this.ctx.isQuitting) {
        this.stage6_startDeferredServices().catch((err) => {
          console.error('[boot:stage6] Deferred services error:', err);
        });
      }
    }, 2800);
    this.ctx.stagedTimers.push(t6);

    this.setupTeardownHooks();
    console.log('[boot] Structured desktop boot pipeline initiated successfully');
  }

  private notifyIpcReady(): void {
    const win = this.ctx.mainWindow;
    if (!win || win.isDestroyed()) return;

    const dispatch = () => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('main:ipc-ready');
        if (this.ctx.pendingDeepLink) {
          const url = this.ctx.pendingDeepLink;
          this.ctx.pendingDeepLink = null;
          this.handleDeepLink(url);
        }
      }
    };

    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', dispatch);
    } else {
      dispatch();
    }
  }

  /**
   * STAGE 1: Protocols, Session Headers, and Cache Directories
   */
  private stage1_protocolsAndSession(): void {
    console.log('[boot:stage1] Configuring protocols and session interceptors...');
    if (process.platform === 'darwin') {
      const p1 = process.resourcesPath ? path.join(process.resourcesPath, 'assets', 'icon.png') : '';
      const iconPath = p1 && fs.existsSync(p1) ? p1 : path.join(desktopRootDir, 'assets', 'icon.png');
      if (fs.existsSync(iconPath)) {
        app.dock?.setIcon(nativeImage.createFromPath(iconPath));
      }
    }

    const sess = electronSession.fromPartition('persist:main');
    setupSessionHeaders(sess);
    registerAppProtocol(sess, process.resourcesPath || '', appDistDir);
    registerMediaCacheProtocol(sess, app.getPath('userData'));
    registerLocalMediaProtocol(sess);
  }

  /**
   * STAGE 2: SQLite Database Initialization & Active Install Recovery
   */
  private async stage2_initDatabase(): Promise<void> {
    console.log('[boot:stage2] Initializing SQLite database...');
    try {
      const { initDatabase } = await import('../db');
      await initDatabase();
      this.ctx.dbReady = true;
      console.log('[boot:stage2] Database initialized successfully');
    } catch (err: any) {
      console.error('[boot:stage2] DB init failed (app will run with degraded functionality):', err.message);
      this.ctx.dbReady = false;
    }

    if (this.ctx.dbReady) {
      // Fire-and-forget active install recovery in background without stalling boot
      import('../installer').then(({ rehydrateActiveInstalls }) => {
        rehydrateActiveInstalls();
      }).catch((err) => {
        console.error('[boot:stage2] rehydrateActiveInstalls failed:', err);
      });
    }
  }

  /**
   * STAGE 3: Main Window Creation & Shell Presentation
   */
  private stage3_createWindow(): void {
    console.log('[boot:stage3] Creating main application window...');
    const saved = loadWindowState();
    const bounds = saved ? ensureVisible(saved) : DEFAULT_SIZE;
    const settings = getSettings();
    const startHidden = Boolean(
      settings.startMinimized ||
      process.argv.includes('--hidden') ||
      process.argv.includes('--start-minimized')
    );
    const isMac = process.platform === 'darwin';

    const p1 = process.resourcesPath ? path.join(process.resourcesPath, 'assets', 'icon.png') : '';
    const iconPath = p1 && fs.existsSync(p1) ? p1 : path.join(desktopRootDir, 'assets', 'icon.png');

    const win = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      minWidth: 800,
      minHeight: 600,
      show: !startHidden,
      paintWhenInitiallyHidden: true,
      icon: iconPath,
      title: 'Otix',
      backgroundColor: '#000000',
      titleBarStyle: isMac ? 'hidden' : 'default',
      frame: isMac,
      trafficLightPosition: isMac ? { x: 12, y: 10 } : undefined,
      webPreferences: {
        preload: path.join(appDistDir, 'preload.js'),
        additionalArguments: [`--otix-api-base-url=${getApiBaseUrl()}`],
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        webSecurity: false,
        partition: 'persist:main',
        backgroundThrottling: false,
      },
    });

    this.ctx.mainWindow = win;

    // Direct game change notifications to window
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) openStandaloneWindow(url);
      return { action: 'deny' };
    });

    if (saved?.maximized) {
      win.maximize();
    }

    win.on('resize', () => debouncedSaveWindowState(win));
    win.on('move', () => debouncedSaveWindowState(win));
    win.on('maximize', () => {
      saveWindowState(win);
      notifyMaximizedChange(true);
    });
    win.on('unmaximize', () => {
      saveWindowState(win);
      notifyMaximizedChange(false);
    });

    win.on('minimize', () => {
      const s = getSettings();
      if (s.minimizeToTray && this.ctx.tray) {
        win.hide();
      }
    });

    win.on('close', (event) => {
      console.log('[main] Window close event fired');
      if (this.ctx.isQuitting) return;
      saveWindowState(win);
      const s = getSettings();
      if (s.closeToTray) {
        console.log('[main] closeToTray enabled — hiding instead of closing');
        event.preventDefault();
        win.hide();
      }
    });

    win.on('restore', () => win.webContents.invalidate());
    win.on('focus', () => win.webContents.invalidate());

    win.webContents.on('render-process-gone', (_event, details) => {
      console.error('[main] RENDERER GONE:', details.reason, 'exitCode:', details.exitCode);
      if (!this.ctx.isQuitting && details.reason !== 'clean-exit') {
        console.warn('[main] Unexpected renderer termination, reloading window in 500ms...');
        setTimeout(() => {
          if (win && !win.isDestroyed()) win.webContents.reload();
        }, 500);
      }
    });

    win.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown') {
        if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
          win.webContents.toggleDevTools();
          event.preventDefault();
        } else if ((input.control && input.key.toLowerCase() === 'r') || input.key === 'F5' || (input.alt && input.key.toLowerCase() === 'r')) {
          win.webContents.reload();
          event.preventDefault();
        }
      }
    });

    if (this.isDev && process.env.NODE_ENV === 'development') {
      void win.loadURL('http://127.0.0.1:5174/');
      win.webContents.openDevTools();
    } else {
      void win.loadURL('app://otix/');
    }

    if (!startHidden) {
      win.show();
      win.focus();
    }

    win.on('closed', () => {
      console.log('[main] Window closed');
      this.ctx.libraryWatcher?.setMainWindow(null);
      this.ctx.gameDetector?.stopAll();
      this.ctx.mainWindow = null;
    });

    registerWindowIPC(win);
  }

  /**
   * STAGE 4: Essential IPC Registration & UI Readiness Signaling
   */
  private async stage4_registerEssentialIPC(): Promise<void> {
    console.log('[boot:stage4] Registering essential IPC channels and settings...');
    const win = this.ctx.mainWindow!;
    const settings = getSettings();
    this.ctx.settings = settings;

    // Register protocol client (otix://)
    try {
      const { registerDefaultProtocolClient } = await import('../main');
      registerDefaultProtocolClient();
    } catch {}

    // Dynamically import NodeDaemonManager for instant IPC registration
    const { NodeDaemonManager } = await import('../node-daemon');
    const { registerNodeDaemonIPC } = await import('../ipc/node-daemon');
    const { registerUpdaterIPC } = await import('../ipc/updater');

    this.ctx.nodeDaemon = new NodeDaemonManager(app.getPath('userData'), process.resourcesPath);
    this.ctx.nodeDaemon.setWebContents(win.webContents);

    // Register all modular IPC handlers upfront (safe and instant)
    try { registerDownloadsIPC(); } catch (err) { console.error('[main] registerDownloadsIPC error:', err); }
    try { registerGameServersIPC(); } catch (err) { console.error('[main] registerGameServersIPC error:', err); }
    try { registerNetworkIPC(); } catch (err) { console.error('[main] registerNetworkIPC error:', err); }
    try { registerNodeDaemonIPC(this.ctx.nodeDaemon); } catch (err) { console.error('[main] registerNodeDaemonIPC error:', err); }
    try { registerInstallerIPC(); } catch (err) { console.error('[main] registerInstallerIPC error:', err); }
    try { registerUpdaterIPC(win); } catch (err) { console.error('[main] registerUpdaterIPC error:', err); }

    // Register system, shell, file dialog, disk space, and machine mapping IPC handlers
    try {
      registerSystemIPC(() => this.ctx.fpsCaptureService);
    } catch (err) {
      console.error('[main] registerSystemIPC error:', err);
    }

    // Create system tray if configured
    const needsTray = settings.minimizeToTray || settings.closeToTray || settings.startMinimized;
    if (needsTray && win) {
      const { createTray } = await import('../tray');
      this.ctx.tray = createTray(win);
    }

    applyDesktopSettings(settings, win, this.ctx.tray);
    registerDesktopSettingsIPC(win, this.ctx.tray, this.ctx.nodeDaemon);
    registerNotificationIPC(win);

    const startHiddenEarly = Boolean(
      settings.startMinimized ||
      process.argv.includes('--hidden') ||
      process.argv.includes('--start-minimized')
    );
    if (startHiddenEarly && win && !win.isDestroyed()) {
      win.hide();
    }
  }

  /**
   * STAGE 5: Interactive Services Tier (Game Detector, Plugins, Saves, Achievements)
   */
  private async stage5_startInteractiveServices(): Promise<void> {
    console.log('[boot:stage5] Initializing interactive services (detector, plugins, saves)...');
    const win = this.ctx.mainWindow;
    if (!win || win.isDestroyed()) return;

    // 1. Lazy-load Game Detector & FPS Service
    const { GameDetector } = await import('../game/detector');
    const { FpsCaptureService } = await import('../game/fps-capture');
    const { eventBus } = await import('../plugin-runtime/event-bus');
    const { setNotifyTarget, getAllGames, onGamesChanged } = await import('../game/storage');
    const {
      registerScannerIPC,
      setScanOrchestrator,
      registerPluginScanIPC,
      setPluginManager,
      setScannerMainWindow,
    } = await import('../ipc/scanner');

    setNotifyTarget(win);
    setScannerMainWindow(win);

    const fpsService = new FpsCaptureService(app.getPath('userData'));
    fpsService.setWebContents(win.webContents);
    this.ctx.fpsCaptureService = fpsService;

    const detector = new GameDetector(app.getPath('userData'));
    this.ctx.gameDetector = detector;

    // 2. Achievements
    if (this.ctx.dbReady) {
      const { AchievementTracker } = await import('../game/achievements/tracker');
      const { registerAchievementsIPC } = await import('../ipc/achievements');
      const tracker = new AchievementTracker();
      this.ctx.achievementTracker = tracker;
      registerAchievementsIPC(tracker);
      tracker.on('achievement:unlocked', (payload) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('game:achievement-unlocked', payload);
        }
        eventBus.emit('achievement:unlocked', payload);
      });
    }

    // 3. Save Daemon
    const { SaveDaemon } = await import('../saves');
    const { registerSaveIPC } = await import('../ipc/saves');
    const saveD = new SaveDaemon(path.join(app.getPath('userData'), 'saves'));
    this.ctx.saveDaemon = saveD;
    registerSaveIPC(saveD);
    if (this.ctx.dbReady) {
      const { populateKnownLocations } = await import('../saves/export');
      populateKnownLocations(saveD);
    }

    // 4. Scanner IPC
    registerScannerIPC(detector, this.ctx.nodeDaemon, () => {
      syncDesktopNode(this.ctx, true);
      this.ctx.libraryWatcher?.updateWatches();
    });

    // 5. Plugin System & GameScanOrchestrator
    let pluginsRepo: any = null;
    if (this.ctx.dbReady) {
      try {
        const { PluginsRepository } = await import('../db');
        pluginsRepo = new PluginsRepository();
      } catch (err) {
        console.error('[boot:stage5] Failed to create PluginsRepository:', err);
      }
    }

    if (this.ctx.dbReady && pluginsRepo) {
      const packagedPluginsDir = process.resourcesPath ? path.join(process.resourcesPath, 'plugins') : '';
      const extensionsDir = this.isDev
        ? path.resolve(desktopRootDir, '..', 'extensions', 'plugins')
        : (packagedPluginsDir && fs.existsSync(packagedPluginsDir) ? packagedPluginsDir : path.join(app.getPath('userData'), 'extensions'));
      const devExtensionsDir = this.isDev ? path.join(app.getPath('userData'), 'extensions') : undefined;

      const { PermissionManager } = await import('../plugin-runtime/permissions');
      const { PluginManager } = await import('../plugin-runtime/manager');
      const { registerPluginIPC, setPluginMainWebContents } = await import('../plugin-runtime/ipc');
      const { wireOrchestratorEvents } = await import('../ipc/plugins');
      const { Cs2GsiManager } = await import('../game/cs2-gsi');
      const { registerGameDetectorIPC } = await import('../ipc/game-detector');
      const { GameScanOrchestrator } = await import('../game/orchestrator');
      const { FetchWorkerBridge } = await import('../fetch/bridge');

      const permManager = new PermissionManager();
      this.ctx.permissionManager = permManager;
      const plugManager = new PluginManager(extensionsDir, pluginsRepo, app.getPath('userData'), devExtensionsDir);
      this.ctx.pluginManager = plugManager;

      plugManager.setPermissionManager(permManager);
      saveD.setServiceRegistry(plugManager.serviceRegistry);
      permManager.setWebContents(win.webContents);
      setPluginMainWebContents(win.webContents);

      registerPluginIPC(plugManager, win, permManager);

      // CS2 GSI
      const cs2 = new Cs2GsiManager();
      this.ctx.cs2GsiManager = cs2;
      cs2.start().catch((err) => console.warn('[main] Failed to start CS2 GSI listener:', err));
      try { cs2.setupCs2GsiConfig(); } catch {}
      cs2.on('update', (state) => {
        if (win && !win.isDestroyed()) win.webContents.send('game:cs2-gsi-update', state);
      });
      fpsService.setCs2GsiManager(cs2);

      registerGameDetectorIPC(detector, fpsService, cs2);

      // GameScanOrchestrator & FetchWorkerBridge
      const orchestrator = new GameScanOrchestrator(plugManager);
      orchestrator.setApiBaseUrl(getApiBaseUrl());
      this.ctx.orchestrator = orchestrator;

      const fBridge = new FetchWorkerBridge({
        filePath: path.join(app.getPath('userData'), 'fetch-client.json'),
      });
      this.ctx.fetchBridge = fBridge;

      // Wire auth token management
      const origSetAuth = plugManager.setAuthToken.bind(plugManager);
      plugManager.setAuthToken = (token: string) => {
        origSetAuth(token);
        this.ctx.currentAuthToken = token;
        orchestrator.setAuthToken(token);
        fBridge.setCredentials(getApiBaseUrl(), token);
        if (token) {
          this.ctx.nodeDaemon?.setAuthToken(token);
          syncDesktopNode(this.ctx, true);
          if (!this.ctx.desktopNodeHeartbeatTimer) {
            this.ctx.desktopNodeHeartbeatTimer = setInterval(() => {
              syncDesktopNode(this.ctx, true);
            }, 30000);
          }
          if (detector.getRunningGames().length > 0) {
            syncRunningGames(this.ctx, detector.getRunningGames());
          }
          const recent = detector.getRecentSessions();
          if (recent.length > 0) {
            syncGameSession(this.ctx, recent);
          }
        } else {
          this.ctx.nodeDaemon?.unclaim().catch(() => {});
          if (this.ctx.desktopNodeHeartbeatTimer) {
            clearInterval(this.ctx.desktopNodeHeartbeatTimer);
            this.ctx.desktopNodeHeartbeatTimer = null;
          }
        }
      };

      setScanOrchestrator(orchestrator);
      setPluginManager(plugManager);
      plugManager.watchPluginSources();
      registerPluginScanIPC();
      wireOrchestratorEvents(orchestrator, win);

      // Discover plugins asynchronously without blocking
      plugManager.discoverPlugins().then(async () => {
        return plugManager.loadEnabledPlugins();
      }).then(async () => {
        const igdbPluginKeys = (): { client_id: string; client_secret: string } | null => {
          if (!this.ctx.fetchBridge) return null;
          const cfg = plugManager.getConfig('igdb-source');
          const clientId = cfg?.igdb_client_id;
          const clientSecret = cfg?.igdb_client_secret;
          if (typeof clientId === 'string' && clientId && typeof clientSecret === 'string' && clientSecret) {
            return { client_id: clientId, client_secret: clientSecret };
          }
          return null;
        };
        const seededIgdb = igdbPluginKeys();
        if (seededIgdb && this.ctx.fetchBridge && !this.ctx.fetchBridge.configured.includes('igdb')) {
          this.ctx.fetchBridge.setProvider('igdb', seededIgdb);
        }
        eventBus.on('plugin:config-changed', ({ pluginId }) => {
          if (pluginId !== 'igdb-source') return;
          this.ctx.fetchBridge?.setProvider('igdb', igdbPluginKeys() ?? undefined);
        }, 'main');
      }).catch((err) => {
        console.error('[plugins] Discovery failed:', err);
      });
    }

    // Wire GameDetector events
    await this.wireGameDetectorEvents();

    // Seed detector with installed games
    if (this.ctx.dbReady) {
      try {
        const existingGames = getAllGames({ installed: true });
        if (existingGames.length > 0) {
          detector.setLibrary(existingGames as any);
          console.log(`[boot:stage5] Seeded detector with ${existingGames.length} installed game(s) from DB`);
        }
        detector.startPeriodicScan();
      } catch (err) {
        console.error('[boot:stage5] Failed to seed detector from DB:', err);
      }

      onGamesChanged(() => {
        try {
          const freshGames = getAllGames({ installed: true });
          this.ctx.gameDetector?.setLibrary(freshGames as any);
        } catch (err) {
          console.error('[boot:stage5] Failed to refresh detector library on games changed:', err);
        }
      });
    } else {
      detector.startPeriodicScan();
    }
  }

  /**
   * STAGE 6: Deferred Daemons & Idle Background Tasks
   */
  private async stage6_startDeferredServices(): Promise<void> {
    console.log('[boot:stage6] Starting deferred background daemons and update checks...');
    const win = this.ctx.mainWindow;

    // 1. Embedded Otix Node Daemon
    if (this.ctx.settings.embeddedNodeEnabled !== false && this.ctx.nodeDaemon) {
      this.ctx.nodeDaemon.start({ port: this.ctx.settings.embeddedNodePort || 8090 }).catch((err) => {
        console.warn('[boot:stage6] Failed to launch embedded node daemon on startup:', err);
      });
    }

    // 2. Library Folder Watcher
    if (this.ctx.dbReady && win && !win.isDestroyed()) {
      const { LibraryWatcher } = await import('../game/library-watcher');
      const { executeScan, handleNewGamesDetected } = await import('../ipc/scanner');
      const gameService = await import('../game/storage');

      const watcher = new LibraryWatcher({
        getScanPaths: () => gameService.getScanPaths(),
        onPerformScan: async () => {
          return executeScan({
            gameDetector: this.ctx.gameDetector,
            nodeDaemon: this.ctx.nodeDaemon,
            isAutomatic: true,
          });
        },
        onNewGamesDetected: (newGames) => {
          handleNewGamesDetected(newGames, this.ctx.mainWindow);
        },
      });
      this.ctx.libraryWatcher = watcher;
      watcher.setMainWindow(win);
      watcher.start();

      setTimeout(() => {
        if (this.ctx.libraryWatcher) {
          void this.ctx.libraryWatcher.triggerScan();
        }
      }, 1000);
    }

    // 3. Pre-download innounp for ISO installs
    try {
      const { ensureInnounp } = await import('../installer');
      ensureInnounp().then((p: string | null) => {
        if (p) console.log('[startup] innounp ready');
        else console.warn('[startup] innounp failed (will retry on demand)');
      });
    } catch {}

    // 4. Auto-update checks
    const { checkForUpdatesOnStartup, startPeriodicUpdateChecks } = await import('../ipc/updater');
    checkForUpdatesOnStartup();
    startPeriodicUpdateChecks();

    // 5. Periodic cleanup and downloads checks
    const { purgeOldDeletedDownloads, pollAndUpdateDownloads } = await import('../downloads');
    purgeOldDeletedDownloads().catch(() => {});
    const cleanTimer = setInterval(() => purgeOldDeletedDownloads().catch(() => {}), 3600000);
    this.ctx.stagedTimers.push(cleanTimer);

    this.ctx.initialDownloadCheckTimer = setTimeout(() => {
      pollAndUpdateDownloads().catch((err: any) => console.error('[main] Initial update check failed:', err));
    }, 5 * 60 * 1000);

    this.ctx.periodicDownloadCheckTimer = setInterval(() => {
      pollAndUpdateDownloads().catch((err: any) => console.error('[main] Periodic update check failed:', err));
    }, 12 * 60 * 60 * 1000);
  }

  private async wireGameDetectorEvents(): Promise<void> {
    const detector = this.ctx.gameDetector;
    if (!detector) return;
    const { eventBus } = await import('../plugin-runtime/event-bus');
    const SaveService = await import('../saves/service');

    detector.on('game:started', (runningGame) => {
      if (this.ctx.mainWindow && !this.ctx.mainWindow.isDestroyed()) {
        this.ctx.mainWindow.webContents.send('game:started', runningGame);
      }
      this.ctx.fpsCaptureService?.handleGameStarted({
        game: runningGame.game,
        gameId: runningGame.game.id,
        pid: runningGame.pid ?? 0,
        processName: runningGame.game.exePath ? path.basename(runningGame.game.exePath) : (runningGame.game as any).processName || '',
        node: runningGame.node ?? null,
        hardware: runningGame.hardware ?? null,
        shareEligible: runningGame.shareEligible ?? false,
      });
      this.ctx.achievementTracker?.startTracking(runningGame.game).catch(() => {});
      eventBus.emit('game:started', {
        gameId: runningGame.game.id,
        gameTitle: runningGame.game.title,
        pid: runningGame.pid ?? 0,
        launchedByOtix: runningGame.launchedByOtix,
        node: runningGame.node ?? null,
        hardware: runningGame.hardware ?? null,
        shareEligible: runningGame.shareEligible ?? false,
      });

      const runningList = detector.getRunningGames();
      syncRunningGames(this.ctx, runningList);
      if (!this.ctx.runningGameSyncTimer) {
        this.ctx.runningGameSyncTimer = setInterval(() => {
          if (this.ctx.gameDetector && this.ctx.gameDetector.getRunningGames().length > 0) {
            syncRunningGames(this.ctx, this.ctx.gameDetector.getRunningGames());
          } else if (this.ctx.runningGameSyncTimer) {
            clearInterval(this.ctx.runningGameSyncTimer);
            this.ctx.runningGameSyncTimer = null;
          }
        }, 25000);
      }
    });

    detector.on('game:updated', (runningGame) => {
      if (this.ctx.mainWindow && !this.ctx.mainWindow.isDestroyed()) {
        this.ctx.mainWindow.webContents.send('game:started', runningGame);
      }
      this.ctx.achievementTracker?.startTracking(runningGame.game).catch(() => {});
      eventBus.emit('game:started', {
        gameId: runningGame.game.id,
        gameTitle: runningGame.game.title,
        pid: runningGame.pid ?? 0,
        launchedByOtix: runningGame.launchedByOtix,
        node: runningGame.node ?? null,
        hardware: runningGame.hardware ?? null,
        shareEligible: runningGame.shareEligible ?? false,
      });
    });

    detector.on('game:ended', (session) => {
      this.ctx.fpsCaptureService?.handleGameStopped({
        gameId: session.gameId,
        gameTitle: session.gameTitle,
        startTime: session.startTime,
        endTime: session.endTime,
        launchedByOtix: session.launchedByOtix,
        node: session.node ?? null,
        hardware: session.hardware ?? null,
        shareEligible: session.shareEligible ?? false,
      });
      if (this.ctx.mainWindow && !this.ctx.mainWindow.isDestroyed()) {
        this.ctx.mainWindow.webContents.send('game:ended', session);
        this.ctx.mainWindow.webContents.send('game:sessions-updated', session);
      }
      this.ctx.achievementTracker?.stopTracking(session.gameId);
      eventBus.emit('game:ended', {
        gameId: session.gameId,
        gameTitle: session.gameTitle,
        startTime: session.startTime,
        endTime: session.endTime,
        launchedByOtix: session.launchedByOtix,
        node: session.node ?? null,
        hardware: session.hardware ?? null,
        shareEligible: session.shareEligible ?? false,
      });

      const runningList = detector.getRunningGames();
      syncRunningGames(this.ctx, runningList);
      if (runningList.length === 0 && this.ctx.runningGameSyncTimer) {
        clearInterval(this.ctx.runningGameSyncTimer);
        this.ctx.runningGameSyncTimer = null;
      }

      syncGameSession(this.ctx, session);
      if (this.ctx.saveDaemon) {
        (async () => {
          try {
            const cloudSettings = await this.ctx.saveDaemon!.getCloudSettings(session.gameId);
            if (cloudSettings?.autoSync) {
              const profile = SaveService.getActiveProfile(session.gameId);
              const profileId = profile?.id || 'default';
              if (this.ctx.currentAuthToken) {
                await this.ctx.saveDaemon!.syncCloud(
                  session.gameId,
                  session.gameTitle,
                  profileId,
                  getApiBaseUrl(),
                  this.ctx.currentAuthToken,
                );
              } else {
                const discovery = await this.ctx.saveDaemon!.discoverForGame(session.gameId, session.gameTitle);
                if (discovery.detectedPaths.length > 0) {
                  await this.ctx.saveDaemon!.backupToVault(session.gameId, discovery.detectedPaths);
                }
              }
            }
          } catch (err) {
            console.warn(`[main] Auto-save backup for ${session.gameTitle} failed:`, err);
          }
        })();
      }
    });

    eventBus.on('fps:live', (payload) => {
      if (this.ctx.mainWindow && !this.ctx.mainWindow.isDestroyed()) {
        this.ctx.mainWindow.webContents.send('game:fps', payload);
      }
    }, 'main');

    eventBus.on('fps:stats', (payload: any) => {
      if (payload?.gameId && payload?.fpsStats && this.ctx.gameDetector) {
        this.ctx.gameDetector.updateSessionFpsStats(payload.gameId, payload.fpsStats);
        const recent = this.ctx.gameDetector.getRecentSessions();
        const updated = recent.find((s) => s.gameId === payload.gameId);
        if (updated) syncGameSession(this.ctx, updated);
      }
      if (this.ctx.mainWindow && !this.ctx.mainWindow.isDestroyed()) {
        this.ctx.mainWindow.webContents.send('game:fps-stats', payload);
        this.ctx.mainWindow.webContents.send('game:sessions-updated', payload);
      }
    }, 'main');

    eventBus.on('fps:permission-needed', (payload) => {
      if (this.ctx.mainWindow && !this.ctx.mainWindow.isDestroyed()) {
        this.ctx.mainWindow.webContents.send('fps:permission-needed', payload);
      }
    }, 'main');

    eventBus.on('scan:progress', (payload: any) => {
      if (this.ctx.mainWindow && !this.ctx.mainWindow.isDestroyed()) {
        this.ctx.mainWindow.webContents.send('scanner:progress', payload);
      }
    }, 'main');
  }

  private setupTeardownHooks(): void {
    app.on('before-quit', (event) => {
      console.log('[main] before-quit fired');
      if (this.isTearingDown) return;
      this.ctx.isQuitting = true;

      for (const t of this.ctx.stagedTimers) {
        clearTimeout(t);
        clearInterval(t);
      }
      this.ctx.stagedTimers = [];

      this.ctx.libraryWatcher?.stop();
      this.ctx.libraryWatcher = null;

      import('../ipc/updater').then(({ stopPeriodicUpdateChecks }) => {
        stopPeriodicUpdateChecks();
      }).catch(() => {});

      if (this.ctx.desktopNodeHeartbeatTimer) {
        clearInterval(this.ctx.desktopNodeHeartbeatTimer);
        this.ctx.desktopNodeHeartbeatTimer = null;
      }
      if (this.ctx.runningGameSyncTimer) {
        clearInterval(this.ctx.runningGameSyncTimer);
        this.ctx.runningGameSyncTimer = null;
      }
      if (this.ctx.initialDownloadCheckTimer) {
        clearTimeout(this.ctx.initialDownloadCheckTimer);
        this.ctx.initialDownloadCheckTimer = null;
      }
      if (this.ctx.periodicDownloadCheckTimer) {
        clearInterval(this.ctx.periodicDownloadCheckTimer);
        this.ctx.periodicDownloadCheckTimer = null;
      }

      try { this.ctx.fpsCaptureService?.stopCapture(); } catch {}
      try { this.ctx.gameDetector?.stopAll(); } catch {}

      if (this.ctx.currentAuthToken) {
        syncDesktopNode(this.ctx, false);
        if (this.ctx.gameDetector && this.ctx.gameDetector.getRunningGames().length > 0) {
          syncRunningGames(this.ctx, []);
        }
      }
      this.ctx.mainWindow?.webContents.send('app:clean-quit');

      event.preventDefault();
      this.isTearingDown = true;

      const cleanupPromise = Promise.allSettled([
        this.ctx.nodeDaemon?.dispose(),
        this.ctx.pluginManager?.shutdown(),
        this.ctx.cs2GsiManager?.stop(),
      ]);

      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 3000));

      Promise.race([cleanupPromise, timeoutPromise]).finally(async () => {
        this.ctx.fetchBridge?.stop();
        try {
          const { closeDb } = await import('../db');
          closeDb();
        } catch (err) {
          console.error('[main] Failed to close database connections:', err);
        }
        app.exit(0);
      });
    });

    app.on('window-all-closed', async () => {
      console.log('[main] window-all-closed fired');
      try { this.ctx.fpsCaptureService?.stopCapture(); } catch {}
      try { this.ctx.gameDetector?.stopAll(); } catch {}
      this.ctx.pluginManager?.shutdown().catch(() => {});
      this.ctx.cs2GsiManager?.stop().catch(() => {});
      this.ctx.fetchBridge?.stop();
      try {
        const { cancelCurrentInstall } = require('../installer');
        cancelCurrentInstall();
      } catch {}
      if (process.platform !== 'darwin') {
        try {
          const { closeDb } = await import('../db');
          closeDb();
        } catch (err) {
          console.error('[main] Failed to close database connections:', err);
        }
        app.quit();
      }
    });

    app.on('activate', () => {
      if (this.ctx.mainWindow === null) {
        this.stage3_createWindow();
      } else if (!this.ctx.mainWindow.isVisible()) {
        this.ctx.mainWindow.show();
        this.ctx.mainWindow.focus();
      }
    });
  }
}
