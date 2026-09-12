// Mirrors the `otix:*` interaction events from desktop/plugins/types.ts.
// Canonical source: desktop/plugins/types.ts (OtixEvents) — keep in sync.

interface OtixEventReviewPayload {
  title?: string | null
  content?: string | null
  isSpoiler?: boolean
  isPrivate?: boolean
}

export interface OtixEvents {
  'otix:media:interaction': { type: string; mediaId: string; mediaType: string; active: boolean }
  'otix:media:watched': { mediaId: string; mediaType: string; episodeId?: string; seasonNumber?: number | 'all' }
  'otix:episode:watched': { mediaId: string; mediaType: string; episodeId?: string; active: boolean; seasonNumber?: number | 'all' }
  'otix:interaction:rated': { mediaId: string; mediaType: string; rating: number }

  'otix:review:created': { mediaId: string; mediaType: string; review: OtixEventReviewPayload }
  'otix:review:updated': { mediaId: string; mediaType: string; review: OtixEventReviewPayload }
  'otix:review:deleted': { mediaId: string; mediaType: string }
  'otix:review:voted': { mediaItemId: string; userId: string; voteType: 'up' | 'down'; active: boolean }

  'otix:list:item_added': { listId: string; item: { mediaItemId: string; mediaType?: string } }
  'otix:list:item_removed': { listId: string; item: { mediaItemId: string; mediaType?: string } }
  'otix:list:created': { list: { id: string; name: string; isPublic: boolean } }
  'otix:list:updated': { listId: string; list: { name?: string | null; isPublic?: boolean | null } }
  'otix:list:deleted': { listId: string }
  'otix:list:liked': { listId: string }
  'otix:list:unliked': { listId: string }

  'otix:user:followed': { username: string }
  'otix:user:unfollowed': { username: string }
  'otix:user:login': { userId: string }
  'otix:user:logout': { userId: string }
  'otix:user:mood_checkin': { mood: string; feeling: string }

  'otix:proposal:voted': { proposalId: string; voteType: 'up' | 'down'; active: boolean }
}

export type OtixEventName = keyof OtixEvents

export function emitOtixEvent<E extends OtixEventName>(event: E, payload: OtixEvents[E]) {
  // Also surface as a window CustomEvent so renderer code can subscribe
  // (the desktop emitEvent channel goes to plugins, not the DOM).
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(event, { detail: payload }))
    }
  } catch {
    // ignore — the plugin channel below is the important one
  }
  try {
    const api = (window as Window & {
      desktopAPI?: {
        plugin?: {
          emitEvent: (event: string, payload: unknown) => Promise<unknown>
        }
      }
    }).desktopAPI?.plugin
    if (api?.emitEvent) {
      api.emitEvent(event, payload)
    }
  } catch (err) {
    console.error('Failed to emit event:', err)
  }
}
