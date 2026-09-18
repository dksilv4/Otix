export interface PlexStorageServer {
  id: number
  machineIdentifier?: string
  machine_identifier?: string
  name: string
  product: string | null
  platform: string | null
  owned: boolean
  baseUrl?: string | null
  base_url?: string | null
  itemCount?: number
  item_count?: number
}

export interface PlexStorageMediaPart {
  partId?: string
  part_id?: string
  file: string
  size: number
  duration: number | null
  container: string
  videoCodec?: string
  video_codec?: string
  videoCodecLabel?: string
  video_codec_label?: string
  videoResolution?: string
  video_resolution?: string
  videoResolutionLabel?: string
  video_resolution_label?: string
  audioCodec?: string
  audio_codec?: string
  audioChannels?: number | null
  audio_channels?: number | null
  bitrate: number
}

export interface PlexStorageLibraryBreakdown {
  libraryId?: number
  library_id?: number
  title: string
  libraryType?: string
  library_type?: string
  totalBytes?: number
  total_bytes?: number
  fileCount?: number
  file_count?: number
  itemCount?: number
  item_count?: number
}

export interface PlexStorageDistributionItem {
  resolution?: string
  codec?: string
  totalBytes?: number
  total_bytes?: number
  fileCount?: number
  file_count?: number
}

export interface PlexStorageSummary {
  serverId?: number | null
  server_id?: number | null
  totalBytes?: number
  total_bytes?: number
  totalFiles?: number
  total_files?: number
  totalItems?: number
  total_items?: number
  potentialSavingsBytes?: number
  potential_savings_bytes?: number
  watchStatus?: {
    watchedBytes: number
    unwatchedBytes: number
  }
  watch_status?: {
    watched_bytes: number
    unwatched_bytes: number
  }
  breakdownByLibrary?: PlexStorageLibraryBreakdown[]
  breakdown_by_library?: PlexStorageLibraryBreakdown[]
  breakdownByResolution?: PlexStorageDistributionItem[]
  breakdown_by_resolution?: PlexStorageDistributionItem[]
  breakdownByCodec?: PlexStorageDistributionItem[]
  breakdown_by_codec?: PlexStorageDistributionItem[]
  categoriesSummary?: {
    duplicates?: { count: number; reclaimableBytes?: number; reclaimable_bytes?: number }
    transcode?: { count: number; estimatedSavingsBytes?: number; estimated_savings_bytes?: number }
    unwatched?: { count: number; reclaimableBytes?: number; reclaimable_bytes?: number }
    watchedShows?: { count: number; totalBytes?: number; total_bytes?: number }
    watched_shows?: { count: number; totalBytes?: number; total_bytes?: number }
  }
  categories_summary?: {
    duplicates?: { count: number; reclaimableBytes?: number; reclaimable_bytes?: number }
    transcode?: { count: number; estimatedSavingsBytes?: number; estimated_savings_bytes?: number }
    unwatched?: { count: number; reclaimableBytes?: number; reclaimable_bytes?: number }
    watchedShows?: { count: number; totalBytes?: number; total_bytes?: number }
    watched_shows?: { count: number; totalBytes?: number; total_bytes?: number }
  }
}

export interface PlexStorageRecommendationItem {
  id: number
  serverId?: number
  server_id?: number
  serverName?: string
  server_name?: string
  libraryId?: number
  library_id?: number
  libraryTitle?: string
  library_title?: string
  libraryType?: string
  library_type?: string
  ratingKey?: string
  rating_key?: string
  title: string
  year: number | null
  mediaType?: string
  media_type?: string
  viewed: boolean
  viewCount?: number
  view_count?: number
  duration: number | null
  lastViewedAt?: string | null
  last_viewed_at?: string | null
  addedAt?: string | null
  added_at?: string | null
  totalSize?: number
  total_size?: number
  parts: PlexStorageMediaPart[]
  primaryCodec?: string
  primary_codec?: string
  primaryCodecLabel?: string
  primary_codec_label?: string
  primaryResolution?: string
  primary_resolution?: string
  primaryResolutionLabel?: string
  primary_resolution_label?: string
  reclaimableBytes?: number
  reclaimable_bytes?: number
  estimatedSavingsBytes?: number
  estimated_savings_bytes?: number
  estimatedNewSize?: number
  estimated_new_size?: number
  savingsPercentage?: number
  savings_percentage?: number
  currentCodec?: string
  current_codec?: string
  targetCodec?: string
  target_codec?: string
  daysSinceAdded?: number | null
  days_since_added?: number | null
  primaryFile?: PlexStorageMediaPart
  primary_file?: PlexStorageMediaPart
  redundantFiles?: PlexStorageMediaPart[]
  redundant_files?: PlexStorageMediaPart[]
  fileCount?: number
  file_count?: number
}

export interface PlexStorageRecommendationsResponse {
  category: string
  totalCount?: number
  total_count?: number
  items: PlexStorageRecommendationItem[]
}
