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

export type LiveActivityMediaType = 'game' | 'movie' | 'show' | 'music'

export interface LiveMediaActivityItem {
  id: string
  mediaType: LiveActivityMediaType
  mediaId?: string | null
  title: string
  subtitle?: string | null
  user: {
    id?: string
    username: string
    avatarUrl?: string | null
  }
  posterUrl?: string | null
  backdropUrl?: string | null
  textlessPosterUrl?: string | null
  elapsedMs?: number
  durationMs?: number
  fps?: number | null
  sessionXp?: number
  cs2Status?: string
}

export type PlayerActivityItem = LiveMediaActivityItem

export interface DealGame {
  id: string
  title: string
  storeId: number
  storeName: string
  posterUrl: string | null
  originalPrice: string | null
  freeEndDate: string | null
  urlSlug: string | null
  description: string | null
  seller: string | null
  claimed?: boolean
  storeUrl: string | null
  steamAppId: number | null
}

export interface DealsCheckResult {
  success: boolean
  deals: DealGame[]
  newDeals?: DealGame[]
  error?: string
}

export type MediaTypeFilter = 'movie' | 'show' | 'game'

export interface EpicFreeGame {
  id: string
  title: string
  namespace: string
  offerId: string
  posterUrl: string | null
  originalPrice: string | null
  freeEndDate: string | null
  urlSlug: string | null
  description: string | null
  seller: string | null
  claimed?: boolean
}

export interface GameMatch {
  media_item_id?: string
  title: string
  poster_url?: string | null
}

export interface MatchedEntry {
  game: EpicFreeGame
  match: GameMatch | null
  candidates: GameMatch[]
  error?: string
}

export interface MatchResult {
  success: boolean
  matched: MatchedEntry[]
  isAuthenticated: boolean
  alreadyOwned?: number
}

export interface SteamFreeGame {
  id: number
  title: string
  appId: number
  posterUrl: string | null
  originalPrice: string | null
  freeEndDate: string | null
  urlSlug: string | null
  description: string | null
  seller: string | null
  claimed?: boolean
  kind?: string
  itemType?: string
  baseGameTitle?: string
  claimUrl?: string
}

export interface EpicFreeCheckResult {
  success: boolean
  freeGames: EpicFreeGame[]
  unclaimedGames?: EpicFreeGame[]
  upcomingGames: EpicFreeGame[]
  isAuthenticated: boolean
  alreadyOwned: number
}

export interface FreeCheckResult {
  success: boolean
  freeGames: SteamFreeGame[]
  newGames?: SteamFreeGame[]
  isAuthenticated: boolean
  alreadyOwned?: number
  error?: string
}

