/**
 * Types for the in-app media server streaming pipeline (Jellyfin & Plex).
 */

export type StreamSource = 'jellyfin' | 'plex'

export type SubtitleFormat = 'vtt' | 'srt' | 'pgs' | 'ass'

export interface StreamQualityOption {
  id: string
  label: string
  description?: string
  height?: number
  width?: number
  bitrate?: number
  hlsLevelIndex?: number
  isAuto?: boolean
  isOriginal?: boolean
  maxVideoBitrate?: number
  videoResolution?: string
}

export type QualityOption = StreamQualityOption

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
  clientId?: string
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
  baseUrls?: string[]
  isSharedServer?: boolean
  selectedQuality?: string
  maxVideoBitrate?: number
  videoResolution?: string
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
  isInAppPip: boolean
  isOverallPip: boolean
  isOverallPipSupported: boolean
  activeSubtitleId: string | null
  activeAudioIndex: number | null
  currentQuality: string
  availableQualities: StreamQualityOption[]
  playbackMethod: PlaybackMethod
  error: string | null
}

export interface MediaStreamPlayerContextValue {
  session: StreamPlaybackSession | null
  isOpen: boolean
  isPlaying: boolean
  isBuffering: boolean
  currentTime: number
  duration: number
  bufferedTime: number
  volume: number
  playbackSpeed: number
  isMuted: boolean
  isTheater: boolean
  isZoomedOut: boolean
  isInAppPip: boolean
  isOverallPip: boolean
  isOverallPipSupported: boolean
  activeSubtitle: SubtitleTrack | null
  activeAudio: AudioTrack | null
  currentQuality: string
  availableQualities: StreamQualityOption[]
  activeLevelHeight: number | null
  playbackMethod: PlaybackMethod
  error: string | null

  // Session lifecycle
  openStream: (session: StreamPlaybackSession) => void
  closeStream: () => void
  failoverToBaseUrl: (newBaseUrl: string) => void

  // Transport actions
  togglePlay: () => void
  play: () => void
  pause: () => void
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
  setPlaybackSpeed: (speed: number) => void
  toggleMute: () => void
  setTheater: (isTheater: boolean) => void
  setZoomedOut: (isZoomed: boolean) => void
  setActiveSubtitle: (subtitleId: string | null) => void
  setActiveAudio: (audioIndex: number | null) => void
  setQuality: (qualityId: string) => void
  setAvailableQualities: (qualities: StreamQualityOption[]) => void
  setActiveLevelHeight: (height: number | null) => void
  updateSessionQuality: (qualityOption: StreamQualityOption) => void

  // Picture-in-Picture actions
  setInAppPip: (inAppPip: boolean) => void
  toggleInAppPip: () => void
  setIsOverallPip: (overallPip: boolean) => void
  requestOverallPip: () => Promise<void>
  exitOverallPip: () => Promise<void>
  toggleOverallPip: () => Promise<void>
  registerVideoElement: (el: HTMLVideoElement | null) => void

  // Internal bindings for the video element
  onTimeUpdate: (time: number, duration: number) => void
  onBufferedUpdate: (buffered: number) => void
  onBuffering: (buffering: boolean) => void
  onError: (err: string | null) => void
  fallbackToHls: () => void
}
