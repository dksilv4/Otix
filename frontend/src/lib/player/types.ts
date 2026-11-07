export interface PlexTrackInfo {
  id: string
  ratingKey: string
  title: string
  artist: string
  albumName: string
  albumArt: string | null
  durationMs: number
  plexBaseUrl: string | null
  plexToken: string | null
  partKey?: string | null
}

export type RepeatMode = 'off' | 'all' | 'one'

export interface PlayerProgressContextValue {
  position: number
  duration: number
}

export interface PlexPlayerContextValue {
  isPlaying: boolean
  currentTrack: PlexTrackInfo | null
  position: number
  duration: number
  volume: number
  queue: PlexTrackInfo[]
  previousTracks: PlexTrackInfo[]
  repeatMode: RepeatMode
  isShuffled: boolean
  error: string | null
  playTrack: (track: PlexTrackInfo) => Promise<void>
  playAlbum: (tracks: PlexTrackInfo[], startIndex?: number) => Promise<void>
  togglePlay: () => void
  pause: () => void
  resume: () => void
  seek: (ms: number) => void
  setVolume: (vol: number) => void
  skipNext: () => void
  skipPrevious: () => void
  skipToIndex: (index: number) => void
  removeFromQueue: (index: number) => void
  moveQueueItem: (fromIndex: number, toIndex: number) => void
  toggleShuffle: () => void
  setRepeatMode: (mode: RepeatMode) => void
  stop: () => void
}

export interface JellyfinTrackInfo {
  id: string
  itemId: string
  title: string
  artist: string
  albumName: string
  albumArt: string | null
  durationMs: number
  serverUrl: string | null
  token: string | null
}

export interface JellyfinPlayerContextValue {
  isPlaying: boolean
  currentTrack: JellyfinTrackInfo | null
  position: number
  duration: number
  volume: number
  queue: JellyfinTrackInfo[]
  previousTracks: JellyfinTrackInfo[]
  error: string | null
  playTrack: (track: JellyfinTrackInfo) => Promise<void>
  playAlbum: (tracks: JellyfinTrackInfo[], startIndex?: number) => Promise<void>
  togglePlay: () => void
  pause: () => void
  resume: () => void
  seek: (ms: number) => void
  setVolume: (vol: number) => void
  skipNext: () => void
  skipPrevious: () => void
  skipToIndex: (index: number) => void
  stop: () => void
}

export interface LocalTrackInfo {
  id: string
  file?: File
  url: string
  title: string
  artist: string
  albumName: string
  albumArt: string | null
  durationMs: number
  trackNumber?: number
  path?: string
}

export interface LocalPlayerContextValue {
  isPlaying: boolean
  currentTrack: LocalTrackInfo | null
  position: number
  duration: number
  volume: number
  queue: LocalTrackInfo[]
  previousTracks: LocalTrackInfo[]
  repeatMode: RepeatMode
  isShuffled: boolean
  error: string | null
  playTrack: (track: LocalTrackInfo) => Promise<void>
  playTracks: (tracks: LocalTrackInfo[], startIndex?: number) => Promise<void>
  togglePlay: () => void
  pause: () => void
  resume: () => void
  seek: (ms: number) => void
  setVolume: (vol: number) => void
  skipNext: () => void
  skipPrevious: () => void
  skipToIndex: (index: number) => void
  removeFromQueue: (index: number) => void
  moveQueueItem: (fromIndex: number, toIndex: number) => void
  toggleShuffle: () => void
  setRepeatMode: (mode: RepeatMode) => void
  stop: () => void
}

export type PlayerSource = 'plex' | 'jellyfin' | 'local' | 'none'

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

  // Advanced playback controls
  repeatMode: RepeatMode
  isShuffled: boolean
  toggleShuffle: () => void
  setRepeatMode: (mode: RepeatMode) => void
  removeFromQueue: (index: number) => void
  moveQueueItem: (fromIndex: number, toIndex: number) => void

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

  playLocalTrack: (track: LocalTrackInfo) => Promise<void>
  playLocalTracks: (tracks: LocalTrackInfo[], startIndex?: number) => Promise<void>
  skipLocalToIndex: (index: number) => void

  // Provider-specific state exposed for specialized UI
  plexQueue: PlexTrackInfo[]
  plexPreviousTracks: PlexTrackInfo[]

  jellyfinQueue: JellyfinTrackInfo[]
  jellyfinPreviousTracks: JellyfinTrackInfo[]

  localQueue: LocalTrackInfo[]
  localPreviousTracks: LocalTrackInfo[]
}
