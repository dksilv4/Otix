import type {
  NodesViewMode,
  NodesActiveTab,
  NodesCategoryFilter,
  NodesStatusFilter,
} from '../utils/node-views'

export type MassMatchPhase = 'analyzing' | 'reviewing' | 'applying' | 'completed'

export interface NodesCentralHubStats {
  totalNodes: number
  onlineNodes: number
  offlineNodes: number
  serverCount: number
  homeCount: number
  sambaCount: number
  gameServerCount?: number
  gameServerPlayerCount?: number
}

export interface MatchCandidate {
  media_item_id?: string | null
  title: string
  poster_url?: string | null
  backdrop_url?: string | null
  release_year?: number | null
  platforms?: string[] | null
  developer?: string | null
  confidence: number
  match_type: string
  needs_import?: boolean
  provider_id?: string | null
  provider?: string | null
  id?: string
  year?: number | null
  posterUrl?: string | null
}

export type CandidateRow = [string, string | null, string | null]

export interface LibraryOverviewStats {
  total: number
  matched: number
  candidates: number
  unmatched: number
  loading?: boolean
}

export type OverviewOrganize = {
  autoSearchWishlist?: boolean
  postProcessEnabled?: boolean
  autoOrganizeEnabled?: boolean
  preferredRepackers?: string | null
  downloadPath?: string | null
  isoDownloadPath?: string | null
}

export interface NodesViewContextValue {
  viewMode: NodesViewMode
  setViewMode: (mode: NodesViewMode) => void
  activeTab: NodesActiveTab
  setActiveTab: (tab: NodesActiveTab) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  categoryFilter: NodesCategoryFilter
  setCategoryFilter: (category: NodesCategoryFilter) => void
  statusFilter: NodesStatusFilter
  setStatusFilter: (status: NodesStatusFilter) => void
  resetFilters: () => void
  addModalOpen: boolean
  setAddModalOpen: (open: boolean) => void
  totalCount: number
  setTotalCount: (count: number) => void
  onlineCount: number
  setOnlineCount: (count: number) => void
}

export type SteamProfile = {
  steamid?: string | null
  personaname: string | null
  avatarfull: string | null
  profileurl: string | null
  realname: string | null
  loccountrycode: string | null
  timecreated: number | null
  personastate: number | null
  lastlogoff: number | null
}

export type PlexIntegration = {
  name: string
  connected: boolean
  plexId: string | null
  plexUsername: string | null
  plexEmail: string | null
  plexThumb: string | null
}

export type PlexSyncResult = {
  servers: number
  libraries: number
  total: number
  matched: number
  seeded: number
}

export type PlexLibraryProgress = {
  serverName: string
  libraryName: string
  itemsProcessed: number
  itemsTotal: number
  phase: 'pending' | 'syncing' | 'complete' | 'failed'
}

export type IntegrationCategory = 'account' | 'service'

export interface IntegrationDef {
  id: string
  name: string
  category: IntegrationCategory
  keywords: string | string[]
  description: string
  isConnected: boolean
  brandColor: string
  brandBg: string
  icon: any
  onConnect?: () => void
  connecting?: boolean
  connectDisabled?: boolean
  onDisconnect?: () => void
  disconnecting?: boolean
  error?: string
}

export type ItemFilter =
  | 'all'
  | 'games'
  | 'dlcs'
  | 'expansions'
  | 'demos'
  | 'betas'
  | 'mods'
  | 'soundtracks'
  | 'matched'
  | 'candidates'
  | 'unmatched'

export type SortKey = 'title' | 'recent' | 'playtime' | 'platform' | 'status'

export type SortDir = 'asc' | 'desc'

export interface StorageStats {
  mediaDir: string
  downloadedCount: number
  downloadedBytes: number
  disk: { total: number; used: number; free: number }
}
