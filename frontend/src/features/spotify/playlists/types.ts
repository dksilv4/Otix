export interface SpotifyPlaylistImage {
  url: string
  height?: number
  width?: number
}

export interface SpotifyPlaylistOwner {
  id: string
  display_name?: string
  uri?: string
}

export interface PlaylistSubscriptionInfo {
  subscribed: boolean
  subscription_id?: string
  auto_sync?: boolean
  last_synced_at?: string | null
}

export interface SpotifyPlaylist {
  id: string
  name: string
  description?: string
  images?: SpotifyPlaylistImage[]
  owner?: SpotifyPlaylistOwner
  tracks?: { total: number }
  public?: boolean
  collaborative?: boolean
  uri?: string
  snapshot_id?: string
  _subscription?: PlaylistSubscriptionInfo
}

export interface SpotifyPlaylistTrack {
  added_at: string
  track: {
    id: string
    name: string
    uri: string
    duration_ms: number
    artists: Array<{ id: string; name: string; uri: string }>
    album: {
      id: string
      name: string
      images?: SpotifyPlaylistImage[]
      uri?: string
    }
    track_number?: number
    disc_number?: number
  } | null
}

export interface SpotifyPlaylistDetail extends SpotifyPlaylist {
  tracks: {
    items: SpotifyPlaylistTrack[]
    total: number
    limit: number
    offset: number
  }
  _subscription?: PlaylistSubscriptionInfo
}

export interface PlaylistSubscription {
  id: string
  playlist_id: string
  playlist_name: string | null
  playlist_owner: string | null
  auto_sync: boolean
  last_synced_at: string | null
  created_at: string
}
