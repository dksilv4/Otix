import type { PlayableMediaItem, MediaSourceProvider } from './item'

export type PlaybackMethod = 'direct-play' | 'direct-stream' | 'transcode'

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

export type PlaybackEngineType = 'html5-video' | 'html5-audio' | 'hls' | 'youtube'

export interface ResolvedPlayback {
  engine: PlaybackEngineType
  streamUrl?: string
  directUrl?: string
  hlsUrl?: string
  embedUrl?: string
  headers?: Record<string, string>
  audioTracks?: AudioTrack[]
  subtitleTracks?: SubtitleTrack[]
  availableQualities?: StreamQualityOption[]
  playbackMethod?: PlaybackMethod
  baseUrls?: string[]
  activeAudioIndex?: number
  activeSubtitleIndex?: number
}

export interface ProgressReport {
  item: PlayableMediaItem
  positionSeconds: number
  durationSeconds: number
  state: 'playing' | 'paused' | 'stopped'
  sessionId: string
}

export interface PlaybackOptions {
  preferredQuality?: string
  startPosition?: number
  autoplay?: boolean
  audioIndex?: number
  subtitleIndex?: number
}

export interface MediaSourceAdapter {
  readonly id: MediaSourceProvider
  readonly name: string
  supports(item: PlayableMediaItem): boolean
  resolvePlayback(item: PlayableMediaItem, options?: PlaybackOptions): Promise<ResolvedPlayback>
  reportProgress?(report: ProgressReport): Promise<void>
  failoverServer?(currentServerUrl: string, item: PlayableMediaItem): Promise<string | null>
  changeQuality?(
    item: PlayableMediaItem,
    quality: StreamQualityOption,
    currentPosition: number,
  ): Promise<ResolvedPlayback>
  changeTracks?(
    item: PlayableMediaItem,
    audioIndex?: number,
    subtitleIndex?: number,
    currentPosition?: number,
  ): Promise<ResolvedPlayback>
  getNextItem?(item: PlayableMediaItem): Promise<PlayableMediaItem | null>
}
