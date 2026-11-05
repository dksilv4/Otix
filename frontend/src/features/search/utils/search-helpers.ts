import type { SortValue, TypeValue } from '../types'

export const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'rating', label: 'Rating' },
  { value: 'popularity', label: 'Popularity' },
  { value: 'year', label: 'Year' },
  { value: 'title', label: 'Title' },
  { value: 'recent', label: 'Recent' },
]

export const TYPE_OPTIONS: { value: TypeValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'show', label: 'Shows' },
  { value: 'game', label: 'Games' },
  { value: 'person', label: 'People' },
  { value: 'user', label: 'Users' },
]

export const MEDIA_TYPE_REGEX = /^\/(movie|show|game)\b/

export const MEDIA_TYPE_LABEL: Record<string, string> = {
  movie: 'Movie',
  show: 'TV Show',
  game: 'Game',
  people: 'Artist',
  users: 'User',
}

export const MEDIA_TYPE_CLASS: Record<string, string> = {
  movie: 'text-[var(--media-movie,hsl(var(--primary)))] bg-[var(--media-movie,hsl(var(--primary)))]/10 border-[var(--media-movie,hsl(var(--primary)))]/20',
  show: 'text-[var(--media-show,hsl(var(--primary)))] bg-[var(--media-show,hsl(var(--primary)))]/10 border-[var(--media-show,hsl(var(--primary)))]/20',
  game: 'text-[var(--media-game,hsl(var(--primary)))] bg-[var(--media-game,hsl(var(--primary)))]/10 border-[var(--media-game,hsl(var(--primary)))]/20',
  people: 'text-primary bg-primary/10 border-primary/20',
  users: 'text-primary bg-primary/10 border-primary/20',
}

export const cleanQueryTypePrefix = (val: string): { type: string | null; cleanValue: string } => {
  const match = val.match(MEDIA_TYPE_REGEX)
  const type = match ? match[1] : null
  const cleanValue = val.replace(MEDIA_TYPE_REGEX, '').trimStart()
  return { type, cleanValue }
}

export const formatReleaseYear = (dateStr?: string | null): string | null => {
  if (!dateStr) return null
  const year = new Date(dateStr).getFullYear()
  return isNaN(year) ? null : String(year)
}

export const formatRating = (rating?: number | null): string | null => {
  if (rating == null || isNaN(rating) || rating <= 0) return null
  return Number(rating).toFixed(1)
}
