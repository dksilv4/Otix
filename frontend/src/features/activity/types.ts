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
}

export interface PlexSessionsResponse {
  sessions: PlexSession[]
}
