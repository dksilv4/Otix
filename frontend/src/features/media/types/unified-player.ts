import type { StreamPlaybackSession } from './stream-player'

export type UnifiedPlayerMode = 'stream' | 'trailer'

export interface UnifiedTrailerSession {
  youtubeId: string
  title: string
  backdropUrl?: string | null
  posterUrl?: string | null
  videoType?: string | null
}

export interface UnifiedPlayerSession {
  mode: UnifiedPlayerMode
  title: string
  subtitle?: string
  posterUrl?: string | null
  backdropUrl?: string | null
  stream?: StreamPlaybackSession | null
  trailer?: UnifiedTrailerSession | null
}

export interface UnifiedMediaPlayerModalProps {
  mode?: UnifiedPlayerMode
  youtubeId?: string
  title?: string
  streamSession?: StreamPlaybackSession | null
  isExiting?: boolean
  onClose?: () => void
}
