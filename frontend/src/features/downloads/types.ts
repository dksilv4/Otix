/** Shared types for the downloads feature. Mirrors electron.d.ts. */

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

export interface WishlistTrackingEntry {
  mediaItemId: string;
  attempts: number;
  lastSearchedAt: string | null;
}
