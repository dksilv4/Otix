/** Unified Modular Provider Framework types for Otix (Downloaders & Search Providers). */

export type ProviderType = 'downloader' | 'search-provider';

export type ProviderProtocol = 'usenet' | 'torrent' | 'direct' | string;

export interface ProviderInfo {
  name: string;
  display_name: string;
  provider_type: ProviderType;
  protocol: ProviderProtocol;
  is_active: boolean;
  configured: boolean;
  settings_schema?: Record<string, any>;
}

export interface ServerProvidersResponse {
  active_downloader: string;
  active_search_provider: string;
  downloaders: ProviderInfo[];
  search_providers: ProviderInfo[];
}

export interface UnifiedReleaseItem {
  guid: string;
  title: string;
  size: number;
  download_url: string;
  info_url?: string | null;
  publish_date?: string | null;
  indexer: string;
  protocol: ProviderProtocol;
  age_days?: number | null;
  provider_name?: string;
}

export interface UnifiedQueueItem {
  id: string;
  title: string;
  percentage: number;
  size_mb: number;
  size_left_mb: number;
  speed: string;
  time_left: string;
  status: string;
  downloader?: string;
}

export interface UnifiedDownloadQueue {
  status: string;
  speed: string;
  time_left: string;
  items: UnifiedQueueItem[];
  downloader?: string;
}

export interface ProviderConnectionTestResult {
  ok: boolean;
  version?: string;
  message: string;
}

export interface AddDownloadPayload {
  title: string;
  download_url: string;
  category?: string | null;
}
