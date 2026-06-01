export interface DetectedGame {
  id: string;
  title: string;
  exePath: string;
  localExePath?: string;
  installDir: string;
  platform: 'steam' | 'pc' | 'iso' | 'epic' | 'gog' | 'battlenet' | 'ubisoft' | 'ea' | 'riot' | 'xbox' | 'itch';
  iconUrl?: string; // base64 data URL
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
}

export interface PostProcessResult {
  success: boolean;
  isosFound: string[];
  isosMoved: { from: string; to: string }[];
  errors: string[];
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

export interface IElectronAPI {
  ping: () => Promise<string>;
  selectDirectory: () => Promise<string | null>;
  scanPaths: (paths: string[], isoPaths: string[]) => Promise<DetectedGame[]>;
  scanLaunchers: () => Promise<LauncherScanResult[]>;
  launchGame: (game: DetectedGame) => Promise<boolean>;
  selectIso: () => Promise<string | null>;
  mountIso: (isoPath: string) => Promise<MountResult>;
  dismountIso: (isoPath: string) => Promise<boolean>;
  applyCrack: (crackPath: string, targetDir: string) => Promise<boolean>;
  getUpdatesForIso: (isoPath: string) => Promise<{ name: string; path: string }[]>;
  previewOrganization: (directory: string, regexPattern: string, isoTemplate: string, updateTemplate: string) => Promise<OrganizationPreviewItem[]>;
  executeOrganization: (items: { sourcePath: string; targetPath: string }[]) => Promise<{ sourcePath: string; targetPath: string; success: boolean; error?: string }[]>;
  launchSetup: (setupPath: string) => Promise<boolean>;
  onScannerProgress: (callback: (data: { currentDir: string; progress: number }) => void) => () => void;
  getScannedGames: () => Promise<DetectedGame[]>;
  saveScannedGames: (games: DetectedGame[]) => Promise<void>;
  getScanPaths: () => Promise<{ path: string; type: 'game' | 'iso' }[]>;
  saveScanPaths: (paths: { path: string; type: 'game' | 'iso' }[]) => Promise<void>;
  getLocalGamesMap: () => Promise<Record<string, DetectedGame>>;
  saveLocalGamesMapEntry: (mediaId: string, game: DetectedGame | null) => Promise<void>;

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
  downloadsSearchAndDownload: (userId: string, mediaItemId: string | null, gameName: string) =>
    Promise<SearchAndDownloadResult | SearchAndDownloadError>;
  downloadsFilterResults: (results: NZBResult[]) => Promise<NZBResult[]>;
  downloadsAutoPick: (results: NZBResult[]) => Promise<NZBResult | null>;
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
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
  }
}
