import type { MediaItemSummary } from '@media/queries/media-queries'

export type SortValue = 'rating' | 'relevance' | 'popularity' | 'year' | 'title' | 'recent' | ''
export type TypeValue = 'all' | 'movie' | 'show' | 'game' | 'person' | 'user'

export interface DoneEventPayload {
  status: 'complete' | 'error'
  totalLocal: number
  totalExternal: number
}

export interface SearchStreamState {
  items: MediaItemSummary[]
  localItems: MediaItemSummary[]
  externalItems: MediaItemSummary[]
  isStreaming: boolean
  isLocalDone: boolean
  isDone: boolean
  error: Error | null
  totalLocal: number
  totalExternal: number
}
