// ── People API types ──────────────────────────────

export interface EpisodeInfo {
  episodeNumber: number
  name: string | null
  airDate: string | null
}

export interface SeasonInfo {
  seasonNumber: number
  name: string | null
  firstAirDate: string | null
  lastAirDate: string | null
  episodes: EpisodeInfo[]
}

export interface PersonCredit {
  id: string
  mediaItem: {
    id: string
    mediaType: string
    title: string
    slug: string
    posterUrl: string | null
    releaseDate: string | null
    seasons: SeasonInfo[] | null
  } | null
  role: string
  characterName?: string
  sortOrder: number
}

export interface PersonDetail {
  id: string
  name: string
  photoUrl: string | null
  biography: string | null
  birthday: string | null
  deathday: string | null
  placeOfBirth: string | null
  followerCount: number
  isFollowed: boolean | null
  avgRating: number | null
  userRating: number | null
  credits: PersonCredit[]
}

export interface PersonSummary {
  id: string
  name: string
  photoUrl: string | null
  birthday: string | null
  placeOfBirth: string | null
}

export interface PersonListResponse {
  items: PersonSummary[]
  nextCursor: string | null
  hasMore: boolean
}

export interface RelatedArtist {
  id: string | null
  spotify_artist_id?: string
  name: string
  image_url: string | null
}

export interface PeopleCardProps {
  id: string
  name: string
  imageUrl?: string | null
  role?: string | null
  className?: string
  isFavorite?: boolean
  onFavoriteToggle?: () => void
}
