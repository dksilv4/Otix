import type { PlexTrackInfo } from './plex-audio-provider'
import type { JellyfinTrackInfo } from './jellyfin-audio-provider'

export type PlayerSource = 'plex' | 'jellyfin' | 'none'

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

  // Provider-specific play initiation (consumer picks the source)
  playPlexTrack: (track: PlexTrackInfo) => Promise<void>
  playPlexAlbum: (tracks: PlexTrackInfo[], startIndex?: number) => Promise<void>
  skipPlexToIndex: (index: number) => void

  playJellyfinTrack: (track: JellyfinTrackInfo) => Promise<void>
  playJellyfinAlbum: (tracks: JellyfinTrackInfo[], startIndex?: number) => Promise<void>
  skipJellyfinToIndex: (index: number) => void

  // Provider-specific state exposed for specialized UI
  plexQueue: PlexTrackInfo[]
  plexPreviousTracks: PlexTrackInfo[]

  jellyfinQueue: JellyfinTrackInfo[]
  jellyfinPreviousTracks: JellyfinTrackInfo[]
}
