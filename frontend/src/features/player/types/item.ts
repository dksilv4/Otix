export type MediaType = 'video' | 'audio'

export type MediaSubtype = 'movie' | 'episode' | 'trailer' | 'track' | 'clip'

export type MediaSourceProvider = 'plex' | 'jellyfin' | 'local' | 'youtube' | 'direct' | (string & {})

export interface EpisodeContext {
  seriesTitle: string
  seasonNumber: number
  episodeNumber: number
  episodeTitle: string
  nextItemId?: string
  prevItemId?: string
}

export interface PlayableMediaItem {
  id: string
  source: MediaSourceProvider
  mediaType: MediaType
  subtype?: MediaSubtype
  title: string
  subtitle?: string
  albumOrShowTitle?: string
  artworkUrl?: string | null
  backdropUrl?: string | null
  duration?: number
  startPosition?: number
  providerData?: Record<string, any>
  episodeContext?: EpisodeContext
}
