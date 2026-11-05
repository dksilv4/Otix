export const VALID_TYPES = ['liked', 'watchlisted', 'watched', 'played', 'started', 'listened'] as const
export type InteractionType = (typeof VALID_TYPES)[number]

export interface UserInteractionState {
  liked: boolean
  watchlisted: boolean
  watched: boolean
  played: boolean
  started: boolean
  listened: boolean
  owned: boolean
  rating?: number | null
}

export interface InteractionCounts {
  likeCount: number
  watchlistCount: number
  watchedCount: number
  playedCount: number
  startedCount: number
  listenedCount: number
}

export interface InteractionOut {
  userId: string
  mediaItemId: string
  interactionType: string
  extraData: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface InteractionToggleResponse {
  interaction: InteractionOut
  counts: InteractionCounts
}

export interface InteractionButtonDef {
  type: InteractionType
  label: string
  activeColor: string
  activeGlow: string
  Icon: any
  showFor: 'all' | 'movie_show' | 'game' | 'music'
  supportsFill: boolean
}
