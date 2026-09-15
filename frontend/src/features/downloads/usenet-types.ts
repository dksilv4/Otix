/** Dedicated TypeScript types for Usenet (SABnzbd + Prowlarr) integration. */

export interface ServerSabnzbdConfig {
  host: string;
  port: number;
  api_key: string;
  use_ssl: boolean;
  url_base?: string;
  category: string;
  configured?: boolean;
  has_api_key?: boolean;
}

export interface ServerProwlarrConfig {
  host: string;
  port: number;
  api_key: string;
  use_ssl: boolean;
  url_base?: string;
  categories: number[];
  configured?: boolean;
  has_api_key?: boolean;
}

export interface ServerUsenetConfig {
  enabled: boolean;
  sabnzbd: ServerSabnzbdConfig;
  prowlarr: ServerProwlarrConfig;
}

export interface ServerProwlarrRelease {
  guid: string;
  title: string;
  size: number;
  download_url: string;
  info_url?: string | null;
  publish_date?: string | null;
  indexer: string;
  protocol: string;
  age_days?: number | null;
  seeders?: number | null;
}

export interface ServerSabnzbdQueueItem {
  nzo_id: string;
  filename: string;
  percentage: number;
  size_mb: number;
  size_left_mb: number;
  speed: string;
  time_left: string;
  status: string;
}

export interface ServerDownloadQueueData {
  status: string;
  speed: string;
  time_left: string;
  items: ServerSabnzbdQueueItem[];
}

export interface DownloadReleasePayload {
  title: string;
  download_url: string;
  category?: string | null;
}

export interface ConnectionTestResult {
  ok: boolean;
  version?: string;
  message: string;
}

export interface ProwlarrIndexerItem {
  id: number;
  name: string;
  protocol: 'usenet' | 'torrent' | string;
  enable: boolean;
  priority?: number;
}

export interface ProwlarrSyncResponse {
  ok: boolean;
  message: string;
  indexers: ProwlarrIndexerItem[];
  stats: {
    total: number;
    usenet: number;
    torrent: number;
  };
}

