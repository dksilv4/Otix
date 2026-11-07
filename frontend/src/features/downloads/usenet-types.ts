/** Dedicated TypeScript types for Usenet (SABnzbd + Prowlarr) integration. */

export interface DownloadProviderPathMapping {
  remote_path?: string;
  remotePath?: string;
  host_path?: string;
  hostPath?: string;
  linked?: boolean;
  linkedLibraryPath?: string;
  error?: string;
}

export interface ServerSabnzbdConfig {
  host: string;
  port: number;
  api_key: string;
  apiKey?: string;
  use_ssl: boolean;
  useSsl?: boolean;
  url_base?: string;
  urlBase?: string;
  category: string;
  complete_dir?: string;
  completeDir?: string;
  local_complete_dir?: string;
  localCompleteDir?: string;
  remote_path?: string;
  remotePath?: string;
  host_path?: string;
  hostPath?: string;
  path_mappings?: DownloadProviderPathMapping[];
  pathMappings?: DownloadProviderPathMapping[];
  providerCompleteDir?: string;
  linkedLibraryPath?: string;
  folderLinked?: boolean;
  folderError?: string;
  configured?: boolean;
  has_api_key?: boolean;
  hasApiKey?: boolean;
  connected?: boolean;
  provider_type?: string;
  providerType?: string;
}

export interface SabnzbdLibraryStatus {
  provider: 'sabnzbd';
  folderLinked: boolean;
  remotePath: string;
  hostPath: string;
  pathMappings: DownloadProviderPathMapping[];
  providerCompleteDir: string;
  localCompleteDir: string;
  linkedLibraryPath: string;
  folderError: string;
}

export interface SaveServerUsenetConfigResponse {
  status: string;
  sabnzbdLibrary?: SabnzbdLibraryStatus;
}

export interface ServerProwlarrConfig {
  host: string;
  port: number;
  api_key: string;
  apiKey?: string;
  use_ssl: boolean;
  useSsl?: boolean;
  url_base?: string;
  urlBase?: string;
  categories: number[];
  configured?: boolean;
  has_api_key?: boolean;
  hasApiKey?: boolean;
  connected?: boolean;
  provider_type?: string;
  providerType?: string;
}

export interface ServerG4UConfig {
  enabled?: boolean;
  url?: string;
  api_key?: string;
  apiKey?: string;
  configured?: boolean;
  has_api_key?: boolean;
  hasApiKey?: boolean;
  connected?: boolean;
  provider_type?: string;
  providerType?: string;
}

export interface ServerUsenetConfig {
  enabled: boolean;
  sabnzbd: ServerSabnzbdConfig;
  prowlarr: ServerProwlarrConfig;
  g4u?: ServerG4UConfig;
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
  nzoId?: string;
  nzo_id?: string;
  filename: string;
  title?: string;
  percentage: number;
  sizeMb?: number;
  size_mb?: number;
  sizeLeftMb?: number;
  size_left_mb?: number;
  speed: string;
  timeLeft?: string;
  time_left?: string;
  status: string;
}

export interface ServerDownloadQueueData {
  status: string;
  speed: string;
  timeLeft?: string;
  time_left?: string;
  items: ServerSabnzbdQueueItem[];
}

export interface ServerDownloadHistoryItem {
  id: number;
  nzoId?: string;
  nzo_id?: string;
  title: string;
  protocol: string;
  status: string;
  percentage: number;
  sizeBytes?: number;
  size_bytes?: number;
  errorMessage?: string | null;
  error_message?: string | null;
  mediaItemId?: string | null;
  media_item_id?: string | null;
  completedAt?: string | null;
  completed_at?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
}

export interface ServerDownloadHistoryData {
  items: ServerDownloadHistoryItem[];
}

export interface DownloadReleasePayload {
  title: string;
  download_url: string;
  category?: string | null;
  protocol?: string | null;
  media_item_id?: string | number | null;
  size?: number | null;
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

