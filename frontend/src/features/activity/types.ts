export interface PlexSession {
  session_id: string
  media_type: string
  title: string
  grandparent_title: string | null
  parent_title: string | null
  index: number | null
  thumb: string | null
  duration: number | null
  view_offset: number | null
  state: string
  user_name: string
  user_thumb: string | null
  player_title: string | null
  player_device: string | null
  player_platform: string | null
  server_name: string
  server_id: string
  server_owned?: boolean
  rating_key?: string | null
  grandparent_rating_key?: string | null
  parent_rating_key?: string | null
  media_item_id?: number | string | null
  library_section: string | null
  year: number | null
  content_rating: string | null
  summary: string | null
  video_resolution: string | null
  video_codec: string | null
  audio_codec: string | null
  audio_channels: number | null
  bitrate: number | null
  video_decision: string | null
  audio_decision: string | null
  transcode_reason: string | null
  throttled: boolean

  // camelCase aliases for apiClient converted responses
  sessionId?: string
  mediaType?: string
  grandparentTitle?: string | null
  parentTitle?: string | null
  viewOffset?: number | null
  userName?: string
  userThumb?: string | null
  playerTitle?: string | null
  playerDevice?: string | null
  playerPlatform?: string | null
  serverName?: string
  serverId?: string
  serverOwned?: boolean
  ratingKey?: string | null
  grandparentRatingKey?: string | null
  parentRatingKey?: string | null
  mediaItemId?: number | string | null
  librarySection?: string | null
  contentRating?: string | null
  videoResolution?: string | null
  videoCodec?: string | null
  audioCodec?: string | null
  audioChannels?: number | null
  videoDecision?: string | null
  audioDecision?: string | null
  transcodeReason?: string | null
}

export interface PlexSessionsResponse {
  sessions: PlexSession[]
  is_admin?: boolean
  isAdmin?: boolean
}

export type ActivityCategory = 'all' | 'media' | 'transfers' | 'plex' | 'notifications'

