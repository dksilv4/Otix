export const OPEN_AI_QUICK_GLANCE_EVENT = 'otix:open-ai-quick-glance'

export interface AiQuickGlanceEventDetail {
  mediaId: string
  mediaType: string
  title?: string
  posterUrl?: string | null
  backdropUrl?: string | null
  tmdbId?: string | null
}

export const openAiQuickGlance = (detail: AiQuickGlanceEventDetail): void => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<AiQuickGlanceEventDetail>(OPEN_AI_QUICK_GLANCE_EVENT, { detail }),
  )
}
