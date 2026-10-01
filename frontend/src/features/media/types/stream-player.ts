/**
 * Types for the in-app media server streaming pipeline (Jellyfin & Plex).
 */

export type StreamSource = 'jellyfin' | 'plex'

export type SubtitleFormat = 'vtt' | 'srt' | 'pgs' | 'ass'

export interface SubtitleTrack {
  id: string
  index: number
  label: string
  language: string
  url?: string
  format: SubtitleFormat
  isExternal: boolean
  requiresBurnIn: boolean
}

export interface AudioTrack {
  id: string
  index: number
  label: string
  language: string
  codec: string
  channels: number
  isDefault?: boolean
}

export interface EpisodeContext {
  seriesTitle: string
  seasonNumber: number
  episodeNumber: number
  episodeTitle: string
  nextEpisodeId?: string
  prevEpisodeId?: string
}

export interface StreamPlaybackSession {
  source: StreamSource
  serverUrl: string
  token: string
  itemId: string
  title: string
  subtitle?: string
  playSessionId: string
  directUrl?: string
  hlsUrl: string
  audioTracks: AudioTrack[]
  selectedAudioIndex?: number
  subtitles: SubtitleTrack[]
  selectedSubtitleIndex?: number
  episodeContext?: EpisodeContext
  startPositionMs?: number
  durationMs?: number
  container?: string
  videoCodec?: string
  audioCodec?: string
}

export type PlaybackMethod = 'direct-play' | 'direct-stream' | 'transcode'

export interface StreamPlayerState {
  session: StreamPlaybackSession | null
  isOpen: boolean
  isPlaying: boolean
  isBuffering: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  isTheater: boolean
  isZoomedOut: boolean
  activeSubtitleId: string | null
  activeAudioIndex: number | null
  playbackMethod: PlaybackMethod
  error: string | null
}
