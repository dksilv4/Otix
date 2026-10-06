export const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  overview: 'Overview',
  tagline: 'Tagline',
  status: 'Status',
  release_date: 'Release Date',
  original_language: 'Language',
  runtime: 'Runtime',
  poster_url: 'Poster',
  backdrop_url: 'Backdrop',
  logo_url: 'Logo',
  textless_poster_url: 'Textless Poster',
}

export const IMAGE_TYPE_LABELS: Record<string, string> = {
  poster: 'Poster',
  backdrop: 'Backdrop',
  logo: 'Logo',
  textless_poster: 'Textless Poster',
}

export const MATCH_TYPE_LABELS: Record<string, string> = {
  direct: 'Direct ID match',
  exact_title: 'Exact title match',
  ilike: 'Fuzzy title match',
  trigram: 'Similar title',
  igdb_crossref: 'IGDB cross-reference',
  igdb_search: 'IGDB search',
  igdb_fuzzy: 'IGDB fuzzy',
}

export const formatProposalDate = (s: string): string => {
  try {
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return s
  }
}

export const confidenceColor = (c: number): string => {
  if (c >= 0.95) return 'text-green-400 bg-green-500/10'
  if (c >= 0.85) return 'text-blue-400 bg-blue-500/10'
  if (c >= 0.75) return 'text-amber-400 bg-amber-500/10'
  return 'text-white/40 bg-white/5'
}
