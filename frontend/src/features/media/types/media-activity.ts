export type MediaActivityStatus = 'requested' | 'processing' | 'available'

export interface MediaActivityOwner {
  id: number
  username: string
  displayName?: string
}

export interface MediaActivityItem {
  status: MediaActivityStatus
  mediaType: 'movie' | 'show'
  tmdbId?: string
  tvdbId?: string
  title: string
  year?: number
  progress?: number
  size?: number
  sizeLeft?: number
  timeleft?: string | null
  speed?: string | null
  queueId?: number | string
  queueStatus?: string
  episodeLabel?: string | null
  episodeCount?: number
  totalEpisodes?: number
  isPartial?: boolean
  nodeId?: number | null
  nodeName?: string
  isOwned: boolean
  canManage: boolean
  owner: MediaActivityOwner
}

export interface MediaActivitySummary {
  totalProcessing: number
  totalRequested: number
  totalAvailable: number
}

export interface MediaActivityCatalog {
  items: Record<string, MediaActivityItem>
  summary: MediaActivitySummary
}
