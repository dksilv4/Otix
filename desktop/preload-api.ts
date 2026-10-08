export interface GameFilter {
  platform?: string[]
  matched?: boolean
  hasSuggestion?: boolean
  search?: string
  installed?: boolean
  limit?: number
  offset?: number
  sortBy?: 'title' | 'platform' | 'updated_at' | 'last_played_at'
  sortDir?: 'asc' | 'desc'
}

export interface LocalGame {
  id: string;
  title: string;
  exePath: string;
  localExePath?: string;
  installDir: string;
  platform: 'steam' | 'pc' | 'iso' | 'epic' | 'gog' | 'battlenet' | 'ubisoft' | 'origin' | 'ea' | 'riot' | 'xbox' | 'itch' | 'server' | 'unknown';
  localIconUrl?: string; // base64 data URL from .exe icon
  iconUrl?: string; // Icon URL from plugin enrichment
  posterUrl?: string; // Poster URL from plugin enrichment
  updateFiles?: { name: string; path: string; kind?: 'update' | 'dlc'; version?: string | null; filesize?: number }[];
  isDlc?: boolean;
  dlcOf?: string;
  isBeta?: boolean;
  betaOf?: string;
  isApp?: boolean;
  gameType?: string;
  itemType?: 'game' | 'dlc';
  otixMediaId?: string;
  otixMediaTitle?: string;
  otixMediaSlug?: string;
  otixConfidence?: number;
  otixMatchSuggestion?: {
    mediaId: string;
    title: string;
    slug: string;
  };
  otixPosterUrl?: string | null;
  otixTextlessPosterUrl?: string | null;
  otixLogoUrl?: string | null;
  sources?: (string | Record<string, unknown>)[];
}

export interface MountResult {
  driveLetter: string;
  setupPath?: string;
  crackPath?: string;
  crackName?: string;
}

export interface OrganizationPreviewItem {
  sourcePath: string;
  sourceFilename: string;
  type: 'iso' | 'update';
  matched: boolean;
  extracted: Record<string, string>;
  targetPath: string;
}

export interface DetectedProcess {
  name: string;
  pid: number;
  windowTitle: string | null;
}

export interface ProcessMapping {
  processName: string;
  gameId: string;
  gameTitle: string;
}

export interface SessionNodeInfo {
  id?: string | number | null;
  name?: string | null;
  url?: string | null;
  installed?: boolean;
  running?: boolean;
}

export interface SessionHardwareInfo {
  cpu?: string;
  gpu?: string;
  ramBytes?: number;
  os?: string;
  discreteGpu?: boolean;
}

export interface RunningGame {
  game: LocalGame;
  startTime: number;
  launchedByOtix: boolean;
  pid?: number;
  node?: SessionNodeInfo | null;
  hardware?: SessionHardwareInfo | null;
  shareEligible?: boolean;
}

export interface FpsStats {
  avgFps: number;
  onePercentLow: number;
  zeroPointOnePercentLow: number;
  maxFps: number;
  minFps: number;
  totalFrames: number;
  captureDurationMs: number;
}

export interface LiveFpsSnapshot {
  currentFps: number;
  frameCount: number;
  captureDurationMs: number;
  node?: SessionNodeInfo | null;
  hardware?: SessionHardwareInfo | null;
  shareEligible?: boolean;
}

export interface PlaySession {
  gameId: string;
  gameTitle: string;
  startTime: number;
  endTime: number;
  launchedByOtix: boolean;
  fpsStats?: FpsStats | null;
  node?: SessionNodeInfo | null;
  hardware?: SessionHardwareInfo | null;
  shareEligible?: boolean;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  bannerUrl?: string | null;
  slug?: string | null;
  otixMediaId?: string | number | null;
  processName?: string | null;
}

export interface LauncherScanResult {
  source: string;
  games: LocalGame[];
  error?: string;
}

export interface Cs2LiveState {
  activity: 'menu' | 'playing' | 'textinput' | string;
  isInGame: boolean;
  playerName?: string;
  rawMapName: string;
  mapName: string;
  mode: string;
  phase: string;
  round: number;
  scoreCt: number;
  scoreT: number;
  health: number;
  armor: number;
  helmet: boolean;
  team: string;
  kills: number;
  deaths: number;
  assists: number;
  mvps: number;
  roundKills: number;
  bombState?: 'planted' | 'defused' | 'exploded' | null;
  money?: number;
  timestamp: number;
}

// ── Download types ──

export interface NZBResult {
  guid: string;
  title: string;
  size: number;
  pubDate: string;
  category: string;
  nzbUrl: string;
  detailsUrl: string;
}

export interface DownloadConfig {
  id: string;
  userId: string;
  sabnzbdHost: string | null;
  sabnzbdPort: number | null;
  sabnzbdApiKey: string | null;
  sabnzbdUseSsl: boolean;
  nzbplanetApiKey: string | null;
  sabnzbdCompletePath: string | null;
  downloadPath: string | null;
  postProcessEnabled: boolean;
  autoSearchWishlist: boolean;
  wishlistIntervalHours: number;
  preferredRepackers?: string | null;
  allowHypervisor?: boolean;
}

export interface AutoOrganizeResult {
  success: boolean;
  organized: { from: string; to: string; type: string }[];
  errors: string[];
}

export interface MatchCacheEntry {
  isoPath: string;
  queryTitle: string;
  mediaId: string;
  mediaTitle: string;
  mediaSlug?: string;
  confidence?: number;
  posterUrl?: string;
  logolessPosterUrl?: string;
  logoUrl?: string;
}

export interface PostProcessResult {
  success: boolean;
  isosFound: string[];
  isosMoved: { from: string; to: string }[];
  errors: string[];
}

export interface InstallProgress {
  phase: 'mounting' | 'detecting' | 'installing' | 'cracking' | 'finishing' | 'done' | 'error';
  progress: number;
  message: string;
  /** Added in multi-install: identifies which install this event belongs to. */
  installId?: string;
  isoPath?: string;
}

export interface InstallResult {
  success: boolean;
  installDir: string;
  gameExe?: string;
  crackApplied?: boolean;
  error?: string;
}

export interface ActiveInstallInfo {
  installId: string;
  isoPath: string;
  targetDir: string;
  gameTitle: string;
  startTime: number;
  phase: string;
  progress: number;
  message: string;
}

export interface PathMapping {
  id: string;
  configId: string;
  sourcePath: string;
  destPath: string;
  createdAt: string;
}

export interface Download {
  id: string;
  userId: string;
  mediaItemId: string | null;
  mediaItemTitle: string | null;
  sabnzbdNzoId: string | null;
  status: string;
  nzbName: string | null;
  nzbSize: number | null;
  nzbUrl: string | null;
  isoPath: string | null;
  errorMessage: string | null;
  percentage: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RemoteDownloadOptions {
  id?: string;
  userId?: string;
  serverUrl: string;
  fileId: string;
  filename: string;
  filesize: number;
  gameTitle: string;
  mediaItemId?: string | null;
  authToken?: string | null;
  destDir?: string | null;
}

export interface RemoteDownloadProgress {
  id: string;
  status: 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled';
  gameTitle: string;
  filename: string;
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
  speedBytesPerSec: number;
  etaSeconds: number;
  isoPath?: string | null;
  error?: string | null;
  serverUrl: string;
  fileId: string;
}

export interface SabQueueItem {
  nzoId: string;
  name: string;
  size: number;
  sizeLeft: number;
  status: string;
  percentage: number;
}

export interface WishlistTrackingEntry {
  mediaItemId: string;
  attempts: number;
  lastSearchedAt: string | null;
}

export interface SearchAndDownloadResult {
  download: Download;
  nzbResult: NZBResult;
}

export interface SearchAndDownloadError {
  error: string;
}

export interface SearchAndDownloadHypervisor {
  hypervisorAvailable: true;
  hypervisorResults: NZBResult[];
  gameName: string;
  error: string;
}

export interface GameTrackEntry {
  mediaItemId: string;
  mediaItemTitle: string;
  downloadedUpdateTags: string[];
  lastUpdateCheck: string | null;
}

// ── Plugin types (inlined for renderer consumption) ──

export type PluginPermission =
  | 'network:external'
  | 'storage:local'
  | 'events:subscribe'
  | 'ui:settings'
  | 'ui:media.actions'
  | 'ui:list.actions'
  | 'ui:nav.item'
  | 'ui:dashboard.widget'
  | 'notifications'
  | 'api:proxy';

export type PluginStatus = 'installed' | 'enabled' | 'disabled' | 'error';

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  repository: string;
  status: PluginStatus;
  error?: string;
  manifest: any;
  installedAt: string;
  enabledAt?: string;
  connected?: boolean;
}

export type PermissionDuration = 'once' | 'always';

export interface PermissionRequest {
  requestId: string;
  pluginId: string;
  pluginName: string;
  permission: PluginPermission;
  reason: string;
}

export type PermissionResponse =
  | { granted: true; duration: PermissionDuration }
  | { granted: false };

export interface PluginSettingsTab {
  id: string;
  label: string;
  icon: string;
  path: string;
  sections: { id: string; label: string; slot: string }[];
}

export interface PluginActivityItem {
  id: string;
  type: 'scan' | 'download' | 'sync' | 'info' | 'warning' | 'error' | 'notification';
  title: string;
  subtitle?: string;
  progress?: number;
  status?: 'active' | 'completed' | 'error' | 'pending';
  icon?: string;
  timestamp?: number;
  action?: { label: string; method: string };
}

export interface PluginActivityEntry {
  pluginId: string;
  label: string;
  activities: PluginActivityItem[];
}

export interface DesktopSettings {
  launchOnStartup: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
  alwaysOnTop: boolean;
  startMinimized: boolean;
  gamesDownloadPath?: string;
  gamesInstallPath?: string;
  isoDownloadPath?: string;
}

export interface IDesktopAPI {
  /** Wait for the main process to finish registering all IPC handlers. */
  onMainIpcReady: () => Promise<void>;

  // ── Platform info ──
  platform: string;

  // ── Query cache persistence ──
  cacheLoad: () => Promise<unknown>;
  cacheSave: (data: unknown) => Promise<void>;

  // ── Game hydration ──
  hydrateMatchedGames: () => Promise<{ updated: number; failed: number; total: number }>;

  // ── Desktop settings ──
  getDesktopSettings: () => Promise<DesktopSettings>;
  setDesktopSettings: (settings: Partial<DesktopSettings>) => Promise<DesktopSettings>;

  // ── Window controls ──
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  unmaximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isWindowMaximized: () => Promise<boolean>;
  setAlwaysOnTop: (value: boolean) => Promise<void>;
  getAlwaysOnTop: () => Promise<boolean>;
  onMaximizedChanged: (callback: (maximized: boolean) => void) => () => void;

  // ── Notifications ──
  showNotification: (opts: { title: string; body?: string; icon?: string; type: string; metadata?: Record<string, unknown> }) => Promise<void>;

  // ── General ──
  openPath: (filePath: string) => Promise<string>;
  ping: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  openSessionWindow: (url: string) => Promise<void>;
  selectDirectory: () => Promise<string | null>;
  onDeepLink: (callback: (data: { action: string; params: Record<string, string> }) => void) => () => void;
  scanPaths: (paths: string[], isoPaths: string[]) => Promise<LocalGame[]>;
  scanLaunchers: () => Promise<LauncherScanResult[]>;
  launchGame: (game: LocalGame) => Promise<boolean>;
  selectIso: () => Promise<string | null>;
  mountIso: (isoPath: string) => Promise<MountResult>;
  dismountIso: (isoPath: string) => Promise<boolean>;
  applyCrack: (crackPath: string, targetDir: string) => Promise<boolean>;
  getUpdatesForIso: (isoPath: string) => Promise<{ name: string; path: string }[]>;
  previewOrganization: (directory: string, regexPattern: string, isoTemplate: string, updateTemplate: string, separator?: string) => Promise<OrganizationPreviewItem[]>;
  executeOrganization: (items: { sourcePath: string; targetPath: string }[]) => Promise<{ sourcePath: string; targetPath: string; success: boolean; error?: string }[]>;
  launchSetup: (setupPath: string) => Promise<boolean>;
  batchOrganize: (directory: string, namingTemplate?: string) => Promise<AutoOrganizeResult>;
  smartOrganizePreview: (directory: string, namingTemplate: string, separator?: string) => Promise<OrganizationPreviewItem[]>;
  onScannerProgress: (callback: (data: { currentDir: string; progress: number }) => void) => () => void;
  onGamesUpdated: (callback: () => void) => () => void;
  getLocalGames: (filter?: GameFilter) => Promise<LocalGame[]>;
  saveScannedGames: (games: LocalGame[]) => Promise<void>;
  pickExecutable: (defaultPath?: string) => Promise<string | null>;
  getScanPaths: () => Promise<{ path: string; type: 'game' | 'iso' }[]>;
  saveScanPaths: (paths: { path: string; type: 'game' | 'iso' }[]) => Promise<void>;
  getLocalGamesMap: () => Promise<Record<string, LocalGame>>;
  saveLocalGamesMapEntry: (mediaId: string, game: LocalGame | null) => Promise<void>;
  batchCheckMatchCache: (isoPaths: string[]) => Promise<Record<string, MatchCacheEntry | null>>;
  saveMatchCache: (entries: MatchCacheEntry[]) => Promise<void>;
  updateGamePath: (id: string, exePath: string, installDir?: string) => Promise<void>;
  getGameById: (id: string) => Promise<LocalGame | null>;
  getGameCount: (filter: unknown) => Promise<number>;
  acceptSuggestion: (gameId: string, suggestion: unknown) => Promise<void>;
  unmatchGame: (gameId: string) => Promise<void>;
  rejectSuggestion: (gameId: string, suggestionMediaId: string) => Promise<void>;
  resetPlatformGames: (platforms: string[]) => Promise<void>;
  resetGameData: () => Promise<void>;
  onGamesDbChanged: (callback: () => void) => () => void;

  // Game detection
  getRunningGame: () => Promise<RunningGame | null>;
  getRecentSessions: () => Promise<PlaySession[]>;
  getPlaytimeForGame: (gameId: string) => Promise<{ totalMinutes: number; sessionCount: number; lastPlayed: number | null; lastFpsStats: FpsStats | null }>;
  setLibrary: (games: LocalGame[]) => Promise<boolean>;
  stopTracking: (gameId: string) => Promise<boolean>;
  getRunningProcesses: () => Promise<DetectedProcess[]>;
  addMapping: (processName: string, gameId: string, gameTitle: string) => Promise<boolean>;
  removeMapping: (processName: string) => Promise<boolean>;
  getMappings: () => Promise<ProcessMapping[]>;
  getLibrary: () => Promise<LocalGame[]>;
  onGameStarted: (callback: (data: RunningGame) => void) => () => void;
  onGameEnded: (callback: (data: PlaySession) => void) => () => void;
  onFpsUpdate: (callback: (data: LiveFpsSnapshot) => void) => () => void;
  onFpsStats: (callback: (data: { gameId: string; fpsStats: FpsStats | null }) => void) => () => void;
  onSessionsUpdated: (callback: (data?: any) => void) => () => void;

  // CS2 Live Game State Integration
  getCs2GameState: () => Promise<Cs2LiveState | null>;
  onCs2StateUpdate: (callback: (data: Cs2LiveState | null) => void) => () => void;
  setupCs2Gsi: () => Promise<{ success: boolean; path?: string; message?: string }>;

  // Downloads
  downloadsGetConfig: (userId: string) => Promise<DownloadConfig | null>;
  downloadsSaveConfig: (config: any) => Promise<DownloadConfig>;
  downloadsSearch: (query: string, apiKey: string) => Promise<NZBResult[]>;
  downloadsScanWishlist: (userId: string, wishlistGames: { id: string; title: string }[]) =>
    Promise<{ mediaItemId: string; success: boolean; downloadId?: string; error?: string }[]>;
  downloadsSearchAndDownload: (userId: string, mediaItemId: string | null, gameName: string, allowHypervisor?: boolean) =>
    Promise<SearchAndDownloadResult | SearchAndDownloadError | SearchAndDownloadHypervisor>;
  downloadsFilterResults: (results: NZBResult[]) => Promise<NZBResult[]>;
  downloadsAutoPick: (results: NZBResult[], allowHypervisor?: boolean) => Promise<NZBResult | null>;
  downloadsGetDownload: (id: string) => Promise<Download | null>;
  downloadsGetUserDownloads: (userId: string) => Promise<Download[]>;
  downloadsDelete: (id: string) => Promise<void>;
  downloadsPollQueue: (userId: string) => Promise<Download[]>;
  downloadsTestSabnzbd: (host: string, port: number, apiKey: string, useSsl: boolean) => Promise<boolean>;
  downloadsTestNzbplanet: (apiKey: string) => Promise<boolean>;
  downloadsGetWishlistTracking: (userId: string) => Promise<WishlistTrackingEntry[]>;
  downloadsSkipWishlistItem: (userId: string, mediaItemId: string) => Promise<void>;
  downloadsPostProcess: (downloadId: string, configId: string, fallbackSource?: string, fallbackDest?: string) => Promise<PostProcessResult>;
  downloadsGetPathMappings: (configId: string) => Promise<PathMapping[]>;
  downloadsAddPathMapping: (configId: string, sourcePath: string, destPath: string) => Promise<PathMapping>;
  downloadsRemovePathMapping: (id: string) => Promise<void>;

  // Update tracking
  downloadsGetTrackedGames: () => Promise<GameTrackEntry[]>;
  downloadsCheckUpdates: () => Promise<{ game: string; queued: number }[]>;

  // Organizer
  downloadsPreviewNamingTemplate: (template: string, sampleName: string) => Promise<{ valid: boolean; result?: string; error?: string }>;
  downloadsValidateNamingTemplate: (template: string) => Promise<{ valid: boolean; error?: string }>;

  // Remote Server Downloads (Plex-for-Games)
  downloadsRemoteStart: (options: RemoteDownloadOptions) => Promise<string>;
  downloadsRemotePause: (downloadId: string) => Promise<boolean>;
  downloadsRemoteResume: (downloadId: string) => Promise<boolean>;
  downloadsRemoteCancel: (downloadId: string) => Promise<boolean>;
  downloadsRemoteGetActive: () => Promise<RemoteDownloadProgress[]>;
  onRemoteDownloadProgress: (callback: (progress: RemoteDownloadProgress) => void) => () => void;
  onRemoteDownloadCompleted: (callback: (data: { downloadId: string; finalPath: string; gameTitle: string }) => void) => () => void;

  // ── Save Management ──
  saveGetKnownLocations: () => Promise<any[]>;
  saveDiscoverForGame: (gameId: string, gameTitle: string) => Promise<any>;
  saveBackupToVault: (gameId: string, originPaths: string[]) => Promise<any>;
  saveRestoreFromVault: (gameId: string, options: any) => Promise<number>;
  saveGetProfiles: (gameId: string) => Promise<any[]>;
  saveCreateProfile: (gameId: string, name: string) => Promise<any>;
  saveDeleteProfile: (profileId: string) => Promise<void>;
  saveSetActiveProfile: (profileId: string) => Promise<void>;
  saveGetSnapshots: (profileId: string) => Promise<any[]>;
  saveCreateSnapshot: (profileId: string, name?: string) => Promise<any>;
  saveDeleteSnapshot: (snapshotId: string) => Promise<void>;
  saveGetOverride: (gameId: string) => Promise<any>;
  saveSetOverride: (gameId: string, userPath: string) => Promise<void>;
  saveClearOverride: (gameId: string) => Promise<void>;
  saveGetVaultStatus: () => Promise<any>;
  saveExportSaves: (gameId: string, targetDir: string) => Promise<string>;
  saveImportSaves: (gameId: string, sourceDir: string) => Promise<string>;
  saveGetVaultPath: () => Promise<string>;
  saveSetVaultPath: (newPath: string) => Promise<void>;
  saveSelectExportDir: () => Promise<string | null>;
  saveSelectImportDir: () => Promise<string | null>;
  saveSelectOverridePath: () => Promise<string | null>;
  saveGetCloudSettings: (gameId: string) => Promise<any>;
  saveSetCloudSettings: (gameId: string, autoSync: boolean) => Promise<void>;
  saveSyncCloud: (gameId: string, gameTitle: string, profileId: string, apiBaseUrl: string, authToken: string) => Promise<any>;
  saveConfirmPath: (gameId: string, absolutePath: string, apiBaseUrl: string, authToken: string) => Promise<void>;
  saveResolvePathPatterns: (patterns: string[]) => Promise<string[]>;

  // ── Auto Updater ──
  updater: {
    checkForUpdates: () => Promise<{ status: string; updateInfo?: any; error?: string }>;
    installUpdate: () => Promise<boolean>;
    getVersion: () => Promise<string>;
    onStatusChanged: (callback: (state: { status: string; version?: string; releaseNotes?: string | null; progress?: { percent: number; bytesPerSecond: number; transferred: number; total: number }; error?: string }) => void) => () => void;
  };

  // ── Storage ──
  getDiskSpace: () => Promise<Array<{ drive: string; total?: number; used: number; free: number }>>;

  // ── Auto Install ──
  installGame: (isoPath: string, targetDir: string, gameTitle?: string) => Promise<InstallResult>;
  cancelInstall: (installId?: string) => Promise<boolean>;
  onInstallProgress: (callback: (progress: InstallProgress) => void) => () => void;
  getActiveInstalls: () => Promise<ActiveInstallInfo[]>;
  checkInstallDir: (installDir: string) => Promise<{ found: boolean; gameExe: string | null }>;

  // ── Plugin system ──
  plugin: {
    list: () => Promise<PluginInfo[]>;
    get: (id: string) => Promise<PluginInfo | null>;
    uninstall: (id: string) => Promise<void>;
    enable: (id: string) => Promise<void>;
    disable: (id: string) => Promise<string[]>;
    reload: (id: string) => Promise<PluginInfo[]>;
    discover: () => Promise<PluginInfo[]>;
    getConfig: (pluginId: string) => Promise<Record<string, unknown>>;
    setConfig: (pluginId: string, key: string, value: unknown) => Promise<void>;
    respondToPermission: (requestId: string, response: PermissionResponse) => Promise<void>;
    emitEvent: (eventName: string, payload: unknown) => Promise<void>;
    onPermissionRequest: (callback: (request: PermissionRequest) => void) => () => void;
    setAuthToken: (token: string) => Promise<void>;
    getApiBaseUrl: () => Promise<string>;
    setApiBaseUrl: (url: string) => Promise<void>;
    testInstance: (url: string, apiKey: string) => Promise<{ success: boolean; message: string }>;
    testConfig: (pluginId: string, configDraft: Record<string, unknown>) => Promise<{ success: boolean; message: string }>;
    callData: (pluginId: string, method: string, ...args: unknown[]) => Promise<unknown>;
    getStatus: (pluginId: string) => Promise<Record<string, unknown> | null>;
    getSlotData: (location: string) => Promise<{pluginId: string; label: string; data: any}[]>;
    getPageSlotData: (pageId: string) => Promise<Record<string, {pluginId: string; label: string; data: any}[]>>;
    getPluginTabs: () => Promise<PluginSettingsTab[]>;
    getActivity: () => Promise<PluginActivityEntry[]>;
    getFreeGames: () => Promise<{ items: any[]; fetchedAt: number }>;
    refreshFreeGames: () => Promise<{ items: any[]; fetchedAt: number }>;
    openOAuthWindow: (url: string, redirectPattern: string, options?: { tokenExtraction?: { type: 'url-param' | 'web-request' | 'local-storage' | 'pin'; key?: string; poll?: { url: string; headers?: Record<string, string>; tokenPath?: string[]; intervalMs?: number; timeoutMs?: number } } }) => Promise<{ success: boolean; code?: string; redirectUrl?: string; error?: string }>;
  };

  // ── Plugin game matching ──
  scanAllPlugins: () => Promise<unknown>;
  scanPlugin: (pluginId: string) => Promise<unknown>;
  cancelScan: () => Promise<void>;
  onMatchingProgress: (callback: (event: any) => void) => () => void;
  onMatchingComplete: (callback: (event: any) => void) => () => void;
  onMatchingCancelled: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    desktopAPI?: IDesktopAPI;
  }
}
