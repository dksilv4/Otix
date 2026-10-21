export const OPEN_QUICK_STREAM_EVENT = 'otix:media:quick-stream'

export interface QuickStreamEventDetail {
  mediaId: string
  tmdbId?: string | number | null
  mediaType: string
  title: string
}

export function openQuickStream(detail: QuickStreamEventDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_QUICK_STREAM_EVENT, { detail }))
}
