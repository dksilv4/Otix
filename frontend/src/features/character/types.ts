export interface CharacterGame {
  id: string
  mediaType: string
  title: string
  slug: string
  posterUrl?: string | null
  releaseDate?: string | null
  avgRating?: number | null
}

export interface CharacterDetail {
  id: string
  name: string
  slug: string
  description?: string | null
  gender?: string | null
  species?: string | null
  mugShotUrl?: string | null
  games: CharacterGame[]
}

export interface CharacterSummary {
  id: string
  name: string
  slug: string
  description?: string | null
  gender?: string | null
  species?: string | null
  mugShotUrl?: string | null
}
