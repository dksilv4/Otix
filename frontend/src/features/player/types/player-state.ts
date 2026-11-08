import type { PlayableMediaItem } from './item'
import type { AudioTrack, SubtitleTrack, StreamQualityOption, PlaybackMethod, PlaybackOptions } from './adapter'

export type PlayerViewMode = 'hidden' | 'cinema' | 'minibar' | 'pip'

export type PlayerStatus = 'idle' | 'loading' | 'buffering' | 'playing' | 'paused' | 'ended' | 'error'

export type RepeatMode = 'off' | 'all' | 'one'

export interface UniversalPlayerState {
  currentItem: PlayableMediaItem | null
  status: PlayerStatus
  viewMode: PlayerViewMode
  position: number
  duration: number
  buffered: number
  volume: number
  playbackSpeed: number
  isMuted: boolean
  isTheater: boolean
  isZoomedOut: boolean
  isInAppPip: boolean
  isOverallPip: boolean
  isOverallPipSupported: boolean
  queue: PlayableMediaItem[]
  history: PlayableMediaItem[]
  repeatMode: RepeatMode
  isShuffled: boolean
  activeAudio: AudioTrack | null
  activeSubtitle: SubtitleTrack | null
  currentQuality: string
  availableQualities: StreamQualityOption[]
  activeLevelHeight: number | null
  playbackMethod: PlaybackMethod
  error: string | null
}

export interface UniversalPlayerContextValue extends UniversalPlayerState {
  // Transport actions
  play: (item?: PlayableMediaItem | PlayableMediaItem[], options?: PlaybackOptions) => Promise<void>
  pause: () => void
  resume: () => void
  togglePlay: () => Promise<void>
  stop: () => void
  seek: (seconds: number) => void
  seekRelative: (offsetSeconds: number) => void
  skipNext: () => Promise<void>
  skipPrevious: () => Promise<void>
  skipToIndex: (index: number) => Promise<void>

  // Queue actions
  addToQueue: (item: PlayableMediaItem | PlayableMediaItem[]) => void
  removeFromQueue: (index: number) => void
  moveQueueItem: (fromIndex: number, toIndex: number) => void
  clearQueue: () => void
  toggleShuffle: () => void
  setRepeatMode: (mode: RepeatMode) => void

  // Volume & Speed
  setVolume: (volume: number) => void
  toggleMute: () => void
  setPlaybackSpeed: (speed: number) => void

  // Presentation & UI
  setViewMode: (mode: PlayerViewMode) => void
  setTheater: (isTheater: boolean) => void
  toggleTheater: () => void
  setZoomedOut: (isZoomed: boolean) => void
  toggleZoom: () => void
  setInAppPip: (pip: boolean) => void
  toggleInAppPip: () => void
  toggleOverallPip: () => Promise<void>

  // Track & Quality selections
  setActiveSubtitle: (subtitleId: string | null) => void
  setActiveAudio: (audioIndex: number | null) => void
  setQuality: (qualityId: string) => void
  failoverServer: (newBaseUrl: string) => void
}
