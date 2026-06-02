import type { QueueTrack } from './spotify-player-provider'
import type { PlexTrackInfo } from './plex-audio-provider'

export type PlayerSource = 'spotify' | 'plex' | 'none'

export interface PlayerTrackInfo {
  id: string
  uri?: string
  title: string
  artist: string
  artists: Array<{ name: string; uri: string }>
  albumName: string
  albumArt: string | null
  durationMs: number
  source: PlayerSource
}

export interface PlayerContextValue {
  // Source detection
  source: PlayerSource

  // Unified state (reflects the currently active source)
  isPlaying: boolean
  currentTrack: PlayerTrackInfo | null
  position: number
  duration: number
  volume: number
  error: string | null

  // Core transport actions (delegate to active source)
  togglePlay: () => Promise<void>
  skipNext: () => Promise<void>
  skipPrevious: () => Promise<void>
  seek: (ms: number) => Promise<void>
  setVolume: (vol: number) => void
  stop: () => void
  dismissError: () => void

  // Provider-specific play initiation (consumer picks the source)
  playSpotify: (spotifyUri: string) => Promise<void>
  playSpotifyQueue: (uris: string[]) => Promise<void>
  setSpotifyQueueMetadata: (tracks: QueueTrack[]) => void
  addToQueue: (spotifyUri: string) => Promise<void>

  playPlexTrack: (track: PlexTrackInfo) => Promise<void>
  playPlexAlbum: (tracks: PlexTrackInfo[], startIndex?: number) => Promise<void>
  skipPlexToIndex: (index: number) => void

  // Provider-specific state exposed for specialized UI
  spotifyNextTracks: QueueTrack[]
  spotifyPreviousTracks: QueueTrack[]
  spotifyIsReady: boolean
  spotifyAvailableDevices: Array<{ id: string; name: string; type: string; isActive: boolean }>
  spotifySelectDevice: (deviceId: string) => Promise<void>
  plexQueue: PlexTrackInfo[]
  plexPreviousTracks: PlexTrackInfo[]
}
