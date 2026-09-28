export interface GenreOption {
  id: string | number
  name: string
  slug: string
}

export type GenreMediaType = 'movie' | 'show' | 'game'

export interface GenreSearchParams {
  type?: GenreMediaType
  /** Comma-separated genre slugs when multiple categories are selected. */
  genres?: string
  sort?: string
  dir?: 'asc' | 'desc'
  certification?: string
  language?: string
  isAnime?: boolean
}
