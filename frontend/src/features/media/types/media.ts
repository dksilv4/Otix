import type { RequestMediaState } from '../hooks/use-request-media'
import type { StreamPlaybackSession, AudioTrack, SubtitleTrack } from './stream-player'

export interface LightboxScreenshot {
  url: string
  width?: number | null
  height?: number | null
}

export interface CreditItem {
  id: string
  person: { id: string; name: string; photoUrl?: string } | null
  role: string
  characterName?: string
  sortOrder: number
}

export type CreditCategory = 'cast' | 'directing' | 'crew'

export type GalleryTab = 'all' | 'videos' | 'screenshots'

export type MoreLikeThisTab = 'similar' | 'forYou'

export type CommercialCategory = 'stream' | 'rent' | 'buy'

export interface RequestInstance {
  id: string
  name: string
  status: 'downloaded' | 'requested' | 'not_exists' | 'error' | 'partially_available'
  file?: {
    name?: string | null
    size?: number | null
    quality?: string | null
    video?: string | null
    audio?: string | null
  } | null
}

export interface RequestWidget {
  pluginId: string
  label: string
  props: {
    label?: string
    mediaType: string
    mediaId: string
    instances: RequestInstance[]
  }
}

export interface PlayInstance {
  id: string
  serverId: string
  name: string
  ratingKey: string
  baseUrl?: string
  token?: string
  provider?: string
  providerLabel?: string
  serverName?: string
  mediaType?: 'movie' | 'show' | 'episode'
  seasonNumber?: number
  episodeNumber?: number
  episodeTitle?: string
  viewOffset?: number
  duration?: number
  progressPercent?: number
  viewed?: boolean
  itemId?: string
  title?: string
  baseUrls?: string[]
  directUrl?: string
  hlsUrl?: string
  audioTracks?: AudioTrack[]
  subtitles?: SubtitleTrack[]
  streamSession?: StreamPlaybackSession
}

export interface PlayWidget {
  pluginId: string
  label: string
  props: {
    mediaType: string
    mediaId: string
    instances: PlayInstance[]
  }
}

export interface OpenMediaRequestModalOptions {
  state: RequestMediaState
  initialInstanceId?: string
  onWatch?: () => void
}
