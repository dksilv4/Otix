export interface ArrConnectionTestResult {
  ok: boolean;
  version?: string;
  message?: string;
}

export interface ArrQualityProfile {
  id: number;
  name: string;
}

export interface ArrRootFolder {
  id: number;
  path: string;
  freeSpace?: number;
  free_space?: number;
}

export interface ServerRadarrConfig {
  enabled: boolean;
  host: string;
  port: number;
  apiKey?: string;
  api_key?: string;
  useSsl?: boolean;
  use_ssl?: boolean;
  urlBase?: string;
  url_base?: string;
  qualityProfileId?: number;
  quality_profile_id?: number;
  rootFolderPath?: string;
  root_folder_path?: string;
  minimumAvailability?: string;
  minimum_availability?: string;
  configured?: boolean;
  hasApiKey?: boolean;
  has_api_key?: boolean;
  instances?: import('./arr-instances').ArrServiceInstance[];
}

export interface ServerSonarrConfig {
  enabled: boolean;
  host: string;
  port: number;
  apiKey?: string;
  api_key?: string;
  useSsl?: boolean;
  use_ssl?: boolean;
  urlBase?: string;
  url_base?: string;
  qualityProfileId?: number;
  quality_profile_id?: number;
  rootFolderPath?: string;
  root_folder_path?: string;
  seriesType?: string;
  series_type?: string;
  seasonFolder?: boolean;
  season_folder?: boolean;
  languageProfileId?: number;
  language_profile_id?: number;
  configured?: boolean;
  hasApiKey?: boolean;
  has_api_key?: boolean;
  instances?: import('./arr-instances').ArrServiceInstance[];
}

export interface ServerRadarrMovie {
  id: number;
  title: string;
  year?: number;
  tmdbId?: number;
  tmdb_id?: number;
  imdbId?: string;
  imdb_id?: string;
  overview?: string;
  monitored: boolean;
  hasFile?: boolean;
  has_file?: boolean;
  path?: string;
  sizeOnDisk?: number;
  size_on_disk?: number;
  status?: string;
  images?: Array<{ coverType?: string; remoteUrl?: string; url?: string }>;
}

export interface ServerSonarrSeries {
  id: number;
  title: string;
  year?: number;
  tvdbId?: number;
  tvdb_id?: number;
  imdbId?: string;
  imdb_id?: string;
  overview?: string;
  monitored: boolean;
  episodeCount?: number;
  episode_count?: number;
  episodeFileCount?: number;
  episode_file_count?: number;
  status?: string;
  path?: string;
  network?: string;
  images?: Array<{ coverType?: string; remoteUrl?: string; url?: string }>;
}

export interface ServerArrQueueItem {
  id: number;
  title: string;
  status: string;
  trackedDownloadStatus?: string;
  tracked_download_status?: string;
  size: number;
  sizeLeft?: number;
  size_left?: number;
  timeleft?: string;
  estimatedCompletionTime?: string;
  estimated_completion_time?: string;
  protocol?: string;
  downloadClient?: string;
  download_client?: string;
  indexer?: string;
  outputPath?: string;
  output_path?: string;
  errorMessage?: string;
  error_message?: string;
}

export interface ServerArrQueueResponse {
  page: number;
  pageSize: number;
  totalRecords: number;
  records: ServerArrQueueItem[];
}

export interface AddRadarrMoviePayload {
  title: string;
  tmdb_id: number;
  year?: number;
  quality_profile_id?: number;
  root_folder_path?: string;
  monitored?: boolean;
  search_for_movie?: boolean;
  minimum_availability?: string;
}

export interface AddSonarrSeriesPayload {
  title: string;
  tvdb_id: number;
  year?: number;
  quality_profile_id?: number;
  root_folder_path?: string;
  monitored?: boolean;
  search_for_missing_episodes?: boolean;
  series_type?: string;
  season_folder?: boolean;
}
