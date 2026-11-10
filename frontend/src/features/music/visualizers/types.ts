export type VisualizerMode = 'spectrum-2d' | 'mesh-grid' | (string & {})

export interface VisualizerModeOption {
  id: VisualizerMode
  name: string
  description: string
  dimension: '3D' | '2D'
  iconName: string
}

export interface AudioFrameData {
  frequencyData: Uint8Array
  waveformData: Uint8Array
  bassWaveformData?: Uint8Array
  highResFrequencyData?: Uint8Array
  bass: number
  mid: number
  treble: number
  energy: number
  beat: number
  isPlaying: boolean
  position: number
  duration: number
  bpm?: number
  tempo?: number
  beatPhase?: number
  tempoPulse?: number
}

export interface PersistentPlaybackSession {
  source: 'local' | 'plex' | 'jellyfin'
  track: {
    id: string
    title: string
    artist: string
    albumName: string
    albumArt: string | null
    durationMs: number
    ratingKey?: string
    serverId?: number | null
    partKey?: string | null
    path?: string
    url?: string
  }
  queue: Array<{
    id: string
    title: string
    artist: string
    albumName: string
    albumArt: string | null
    durationMs: number
    ratingKey?: string
    serverId?: number | null
    partKey?: string | null
    path?: string
    url?: string
  }>
  positionMs: number
  durationMs: number
  status: 'playing' | 'paused'
  repeatMode: 'off' | 'all' | 'one'
  isShuffled: boolean
  volume: number
  savedAt: number
}
