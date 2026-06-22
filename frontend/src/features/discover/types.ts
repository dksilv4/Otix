export interface PersonalizedSection {
  id: string
  title: string
  mediaType: string | null
  listType: string
  genre: string | null
  language: string | null
  isAnime: boolean | null
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

export interface TrendingTrailerItem {
  id: string
  mediaType: string
  title: string
  slug: string
  posterUrl: string | null
  textlessPosterUrl: string | null
  backdropUrl: string | null
  logoUrl: string | null
  releaseDate: string | null
  popularity: number
  avgRating: number | null
  ratingCount: number
  overview: string | null
  trailerYoutubeId: string
  trailerUrl: string
}
