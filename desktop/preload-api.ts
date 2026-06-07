export interface DetectedGame {
  id: string;
  title: string;
  exePath: string;
  localExePath?: string;
  installDir: string;
  platform: 'steam' | 'pc' | 'iso' | 'epic' | 'gog' | 'battlenet' | 'ubisoft' | 'ea' | 'riot' | 'xbox' | 'itch';
  iconUrl?: string; // base64 data URL
  posterUrl?: string; // SGDB grid (cover/poster) URL
  updateFiles?: { name: string; path: string }[];
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
  sources?: string[];
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

export interface RunningGame {
  game: DetectedGame;
  startTime: number;
  launchedByOtix: boolean;
  pid?: number;
}

export interface PlaySession {
  gameId: string;
  gameTitle: string;
  startTime: number;
  endTime: number;
  launchedByOtix: boolean;
}

export interface LauncherScanResult {
  source: string;
  games: DetectedGame[];
  error?: string;
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

// ── Desktop settings ──

export interface DesktopSettings {
  launchOnStartup: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
  alwaysOnTop: boolean;
  startMinimized: boolean;
}

export interface IDesktopAPI {
  /** Wait for the main process to finish registering all IPC handlers. */
  onMainIpcReady: () => Promise<void>;

  // ── Platform info ──
  platform: string;

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

  // ── General ──
  openPath: (filePath: string) => Promise<string>;
  ping: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  selectDirectory: () => Promise<string | null>;
  onDeepLink: (callback: (data: { action: string; params: Record<string, string> }) => void) => () => void;
  scanPaths: (paths: string[], isoPaths: string[]) => Promise<DetectedGame[]>;
  scanLaunchers: () => Promise<LauncherScanResult[]>;
  launchGame: (game: DetectedGame) => Promise<boolean>;
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
  getScannedGames: () => Promise<DetectedGame[]>;
  saveScannedGames: (games: DetectedGame[]) => Promise<void>;
  getScanPaths: () => Promise<{ path: string; type: 'game' | 'iso' }[]>;
  saveScanPaths: (paths: { path: string; type: 'game' | 'iso' }[]) => Promise<void>;
  getLocalGamesMap: () => Promise<Record<string, DetectedGame>>;
  saveLocalGamesMapEntry: (mediaId: string, game: DetectedGame | null) => Promise<void>;
  batchCheckMatchCache: (isoPaths: string[]) => Promise<Record<string, MatchCacheEntry | null>>;
  saveMatchCache: (entries: MatchCacheEntry[]) => Promise<void>;
  updateGamePath: (oldExePath: string, newExePath: string, newInstallDir?: string) => Promise<void>;

  // Game detection
  getRunningGame: () => Promise<RunningGame | null>;
  getRecentSessions: () => Promise<PlaySession[]>;
  setLibrary: (games: DetectedGame[]) => Promise<boolean>;
  stopTracking: (gameId: string) => Promise<boolean>;
  getRunningProcesses: () => Promise<DetectedProcess[]>;
  addMapping: (processName: string, gameId: string, gameTitle: string) => Promise<boolean>;
  removeMapping: (processName: string) => Promise<boolean>;
  getMappings: () => Promise<ProcessMapping[]>;
  getLibrary: () => Promise<DetectedGame[]>;
  onGameStarted: (callback: (data: RunningGame) => void) => () => void;
  onGameEnded: (callback: (data: PlaySession) => void) => () => void;

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

  // ── Storage ──
  getDiskSpace: () => Promise<Array<{ drive: string; total?: number; used: number; free: number }>>;

  // ── Auto Install ──
  installGame: (isoPath: string, targetDir: string, gameTitle?: string) => Promise<InstallResult>;
  cancelInstall: (installId?: string) => Promise<boolean>;
  onInstallProgress: (callback: (progress: InstallProgress) => void) => () => void;
  getActiveInstalls: () => Promise<ActiveInstallInfo[]>;
}

declare global {
  interface Window {
    desktopAPI?: IDesktopAPI;
  }
}
