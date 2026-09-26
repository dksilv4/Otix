// TODO: Review this file
/** Shared types for the downloads feature. Mirrors @desktop/preload-api. */

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
  autoOrganizeEnabled?: boolean;
  namingTemplate?: string | null;
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
  /** Who created this row — e.g. 'radarr' for catalog-synced movies, null for game/usenet. */
  source: string | null;
}

export interface WishlistTrackingEntry {
  mediaItemId: string;
  attempts: number;
  lastSearchedAt: string | null;
}

export interface HypervisorConfirmResponse {
  hypervisorAvailable: true;
  hypervisorResults: NZBResult[];
  gameName: string;
  error: string;
}

// ── Remote Game Server & Client Downloads ("Plex for Games") ──────────────

export interface OtixNode {
  id: number;
  name: string;
  localUrl?: string | null;
  remoteUrl?: string | null;
  primaryUrl: string;
  authToken?: string | null;
  isOnline: boolean;
  isLocal?: boolean;
  lastSeenAt?: string | null;
  totalFiles: number;
  storageFreeBytes: number;
  storageTotalBytes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  connectError?: string | null;
  /** True when this row is the Otix desktop app on this computer. */
  isLocalDesktop?: boolean;
  /** True when this row is the Otix backend (account-hosted node). */
  isBackend?: boolean;
}

export type GameServer = OtixNode;
export type Node = OtixNode;


export interface ServerGameFile {
  serverId: number;
  serverName: string;
  serverUrl: string;
  fileId: string;
  filename: string;
  filesize: number;
  extension: string;
  formatCategory: 'iso' | 'installer' | 'archive' | 'rom';
  gameTitle: string;
  relativePath?: string;
  libraryName: string;
  modifiedAt?: string | null;
  downloadUrl: string;
  catalogItem?: {
    id: string
    title: string
    slug: string
    posterUrl?: string | null
    backdropUrl?: string | null
    logoUrl?: string | null
    textlessPosterUrl?: string | null
    iconUrl?: string | null
    overview?: string | null
  } | null
}

export interface ServerGamesResponse {
  servers: GameServer[];
  files: ServerGameFile[];
  errors?: { serverId: number; error: string }[] | null;
}
