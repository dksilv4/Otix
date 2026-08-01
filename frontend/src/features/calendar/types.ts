export interface CalendarEvent {
  id: string
  mediaItemId: string
  mediaType: string
  title: string
  posterUrl: string | null
  slug: string
  releaseDate: string
  eventType: 'watchlist_release' | 'new_episode' | 'new_season' | 'sequel'
  reason: string
  episodeInfo?: {
    id: string
    episodeNumber: number
    name: string | null
    overview: string | null
    runtime: number | null
    airDate: string | null
    stillUrl: string | null
  } | null
  seasonNumber?: number | null
}

export interface CalendarResponse {
  events: CalendarEvent[]
}

export type MonthGroup = {
  month: string
  monthLabel: string
  events: CalendarEvent[]
}
