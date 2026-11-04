export interface ArrConnectionTestResult {
  ok: boolean;
  version?: string;
  message?: string;
  url_base?: string;
  urlBase?: string;
  detected_url_base?: string;
  detectedUrlBase?: string;
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
  autoRequestWatchlist?: boolean;
  auto_request_watchlist?: boolean;
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
  autoRequestWatchlist?: boolean;
  auto_request_watchlist?: boolean;
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
  tmdbId?: number;
  tmdb_id?: number;
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
  trackedDownloadState?: string;
  tracked_download_state?: string;
  size: number;
  sizeLeft?: number;
  size_left?: number;
  timeleft?: string;
  estimatedCompletionTime?: string;
  estimated_completion_time?: string;
  protocol?: string;
  downloadClient?: string;
  download_client?: string;
  downloadId?: string;
  download_id?: string;
  indexer?: string;
  outputPath?: string;
  output_path?: string;
  errorMessage?: string;
  error_message?: string;
  tmdbId?: number;
  tmdb_id?: number;
  tvdbId?: number;
  tvdb_id?: number;
  seasonNumber?: number;
  season_number?: number;
  episodeNumber?: number;
  episode_number?: number;
  mediaItemId?: number | string;
  media_item_id?: number | string;
  showTitle?: string;
  show_title?: string;
  showPosterUrl?: string;
  show_poster_url?: string;
  showBackdropUrl?: string;
  show_backdrop_url?: string;
  episodeName?: string;
  episode_name?: string;
  episodeStillUrl?: string;
  episode_still_url?: string;
  episodeOverview?: string;
  episode_overview?: string;
  otixEpisodeId?: number;
  otix_episode_id?: number;
  movieTitle?: string;
  movie_title?: string;
  movieYear?: number;
  movie_year?: number;
  posterUrl?: string;
  poster_url?: string;
  backdropUrl?: string;
  backdrop_url?: string;
  overview?: string;
  series?: {
    id?: number;
    title?: string;
    year?: number;
    tvdbId?: number;
    tmdbId?: number;
    images?: Array<{ coverType?: string; remoteUrl?: string; url?: string }>;
  };
  episode?: {
    id?: number;
    title?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    overview?: string;
  };
  movie?: {
    id?: number;
    title?: string;
    year?: number;
    tmdbId?: number;
    images?: Array<{ coverType?: string; remoteUrl?: string; url?: string }>;
  };
  quality?: {
    quality?: {
      id?: number;
      name?: string;
      resolution?: number;
      source?: string;
    };
  };
}

export interface ServerArrQueueResponse {
  page: number;
  pageSize: number;
  totalRecords: number;
  records: ServerArrQueueItem[];
}

export interface AddRadarrMoviePayload {
  title?: string;
  tmdb_id?: number;
  year?: number;
  quality_profile_id?: number;
  root_folder_path?: string;
  monitored?: boolean;
  search_for_movie?: boolean;
  minimum_availability?: string;
  instance_id?: string;
}

export interface AddSonarrSeriesPayload {
  title?: string;
  tvdb_id?: number;
  tmdb_id?: number;
  year?: number;
  quality_profile_id?: number;
  root_folder_path?: string;
  monitored?: boolean;
  search_for_missing_episodes?: boolean;
  series_type?: string;
  season_folder?: boolean;
  instance_id?: string;
}