import type { PluginStatus, PluginConfigField } from './plugins'

export interface CardBadge {
  pluginId: string
  text: string
  tone?: 'default' | 'info' | 'success' | 'warning' | 'danger'
}

export interface ProbeOptions {
  [field: string]: Array<{ value: string; label: string }>
}

export interface ProbeResult {
  ok: boolean
  version?: string
  options?: ProbeOptions
  error?: string
}

export type PluginDetailTabId = 'overview' | 'configure' | 'permissions' | 'activity' | 'depends'

export type DepEntry = {
  id: string
  name: string
  installed: boolean
  status?: PluginStatus
}

export interface GroupedField {
  key: string
  field: PluginConfigField
}

export interface ConfigField {
  key: string
  label: string
  type: 'path-list' | 'string' | 'number'
  description?: string
  placeholder?: string
}

export interface SlotPluginData {
  type: string
  label: string
  description?: string
  platform?: string
  platforms?: string[]
  mediaTypes?: string[]
  status?: Record<string, unknown>
  actions?: Record<string, string>
  configFields?: ConfigField[]
  viewLibraryPath?: string
}

export interface SlotEntry {
  pluginId: string
  label: string
  data: SlotPluginData | null
}

export type ScanPhase = 'idle' | 'scanning' | 'matching' | 'hydrating' | 'done'

export interface ScanProgress {
  phase: ScanPhase
  scanned: number
  matched: number
  suggested: number
  total: number
  currentDir: string
  message: string
  current?: string
  error?: string
}

export interface SyncStatus {
  phase?: string
  current?: number
  total?: number
  playlistTitle?: string
  track?: number
  trackTotal?: number
  lastTrack?: string
  last?: LastSyncInfo | null
  lastSync?: LastSyncInfo | null
  instance_count?: number
  instances?: Array<{ id: string; name: string }>
}

export interface LastSyncInfo {
  at?: string
  lastSyncAt?: string | number
  added?: number
  imported?: number
  skipped?: number
  pruned?: number
  unmatched?: number
  failed?: number
  errors?: number | unknown[]
}

export interface SyncItem {
  ok?: boolean
  title?: string
  key?: string
  upToDate?: boolean
  added?: number
  skipped?: number
  pruned?: number
  unmatched?: unknown[]
  errors?: string[]
  error?: string
}

export interface CatalogMovie {
  provider_id: string
  title: string | null
  year: number | null
  poster_url: string | null
  backdrop_url: string | null
  overview: string | null
  runtime: number | null
  rating: number | null
  status: string | null
  genres: string | null
  file_path: string | null
  source_instance: string | null
  source_instance_id: string | null
}

export interface InstanceSummary {
  id: string
  name: string
  disabled?: boolean
  total: number
  size_on_disk: number
  downloaded: number
  downloading: number
  requested: number
  missing: number
  episodes_total?: number
  episodes_files?: number
}

export interface ArrDetail {
  found?: boolean
  live?: boolean
  source?: string | null
  media_type?: string | null
  provider_id?: string | null
  source_instance?: string | null
  source_instance_id?: string | null
  title?: string | null
  year?: number | null
  overview?: string | null
  poster_url?: string | null
  backdrop_url?: string | null
  genres?: string[] | null
  runtime?: number | null
  rating?: number | null
  status?: string | null
  path?: string | null
  size_on_disk?: number | null
  monitored?: boolean | null
  quality_profile?: string | null
  minimum_availability?: string | null
  added?: string | null
  series_type?: string | null
  season_count?: number | null
  episode_count?: number | null
  episode_file_count?: number | null
  percent_of_episodes?: number | null
  file?: {
    name?: string | null
    size?: number | null
    quality?: string | null
    video?: string | null
    audio?: string | null
  } | null
  error?: string | null
}

export interface CatalogRequest {
  tmdb_id: string
  title: string | null
  instance_id: string | null
  instance_name: string | null
  status: 'requested' | 'exists' | 'error'
  source: string | null
  already_exists: number
  error: string | null
  requested_at: number
  poster_url: string | null
  backdrop_url: string | null
}

export interface SyncRun {
  id: number
  instance_id: string | null
  started_at: number
  finished_at: number | null
  success: number
  paused: number
  found: number
  imported: number
  skipped: number
  failed: number
  errors: string | null
  message: string | null
}

export interface SyncRunError {
  title?: string | null
  error?: string | null
  tmdb_id?: string | null
}

export interface SpotifyPlaylist {
  id: string
  name: string
  tracks: number
  public: boolean
}
