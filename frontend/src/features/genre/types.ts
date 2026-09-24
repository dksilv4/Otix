export interface GenreOption {
  id: string | number
  name: string
  slug: string
}

export interface GenreSearchParams {
  type?: 'movie' | 'show' | 'game' | 'music'
  sort?: string
  dir?: 'asc' | 'desc'
  certification?: string
  language?: string
  isAnime?: boolean
}
