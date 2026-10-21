export interface PersonalizedSection {
  id: string
  title: string
  mediaType: string | null
  listType: string
  genre: string | null
  language: string | null
  isAnime: boolean | null
  platform: string | null
  isPersonalized: boolean
  reason: string | null
}

export interface DiscoverListResponse {
  items: import('@media/queries/media-queries').MediaItemSummary[]
  nextCursor: string | null
  hasMore: boolean
  total: number | null
}

export interface MoodValue {
  emoji: string
  label: string
  query?: string
}

export interface FeelingValue {
  label: string
  query?: string
}

export interface RecordedMoodContext {
  mood: string
  feeling: string
}

export interface DiscoverContinueWatchingItem {
  id: string
  ratingKey: string
  grandparentRatingKey?: string | null
  mediaItemId?: number | string | null
  mediaType: 'movie' | 'show'
  title: string
  showTitle?: string | null
  episodeTitle?: string | null
  seasonNumber?: number | null
  episodeNumber?: number | null
  subtitle?: string | null
  thumb?: string | null
  backdropUrl?: string | null
  viewOffset?: number
  duration?: number
  progressPercent?: number
  year?: number | null
  summary?: string | null
  serverId?: string
  serverName?: string
  serverUrl?: string
}

export interface DiscoverContinueWatchingResponse {
  items: DiscoverContinueWatchingItem[]
}

export interface TrendingTrailerItem {
  id: string
  title: string
  mediaType: string
  mediaId: string | number
  youtubeId: string
  backdropUrl?: string | null
  posterUrl?: string | null
  overview?: string | null
  releaseDate?: string | null
  voteAverage?: number | null
  trailerYoutubeId?: string | null
  textlessPosterUrl?: string | null
  logoUrl?: string | null
  avgRating?: number | null
  ratingCount?: number | null
}

