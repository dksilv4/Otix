import { apiClient } from '@/lib/api/client'
import { showToast } from '@ui/molecules/toast'

export const PENDING_PLEX_SYNC_KEY = 'otix:pending-plex-sync'
export const PLEX_PROMPT_EVENT = 'otix:plex:prompt'

export type PlexSyncPromptMode = 'login' | 'link' | 'manual'

export interface PlexWatchlistSyncResult {
  total: number
  matched: number
  seeded: number
}

export interface PlexWatchedSyncResult {
  total: number
  matched: number
  seeded: number
  episodes: number
}

export interface PlexSyncOptions {
  syncWatchlist: boolean
  syncWatched: boolean
}

export interface PlexSyncExecutionResult {
  watchlist?: PlexWatchlistSyncResult
  watched?: PlexWatchedSyncResult
}

export const triggerPlexSyncPrompt = (mode: PlexSyncPromptMode = 'manual'): void => {
  try {
    sessionStorage.setItem(PENDING_PLEX_SYNC_KEY, mode)
  } catch {
    // Ignore storage quota/permission errors
  }
  window.dispatchEvent(new CustomEvent(PLEX_PROMPT_EVENT, { detail: { mode } }))
}

export const consumePendingPlexSyncPrompt = (): PlexSyncPromptMode | null => {
  try {
    const val = sessionStorage.getItem(PENDING_PLEX_SYNC_KEY)
    if (val) {
      sessionStorage.removeItem(PENDING_PLEX_SYNC_KEY)
      return (val as PlexSyncPromptMode) || 'link'
    }
  } catch {
    // Ignore storage errors
  }
  return null
}

export const syncPlexWatchlist = async (): Promise<PlexWatchlistSyncResult> => {
  const { data } = await apiClient.post<PlexWatchlistSyncResult>('/integrations/plex/watchlist/sync')
  return data
}

export const syncPlexWatched = async (): Promise<PlexWatchedSyncResult> => {
  const { data } = await apiClient.post<PlexWatchedSyncResult>('/integrations/plex/watched/sync')
  return data
}

export const executePlexSync = async (options: PlexSyncOptions): Promise<PlexSyncExecutionResult> => {
  const result: PlexSyncExecutionResult = {}

  if (options.syncWatchlist) {
    try {
      result.watchlist = await syncPlexWatchlist()
    } catch (err) {
      console.error('[PlexSync] Watchlist sync failed:', err)
      throw err
    }
  }

  if (options.syncWatched) {
    try {
      result.watched = await syncPlexWatched()
    } catch (err) {
      console.error('[PlexSync] Watched media sync failed:', err)
      throw err
    }
  }

  return result
}

export const notifyPlexSyncResult = (result: PlexSyncExecutionResult): void => {
  const parts: string[] = []

  if (result.watchlist) {
    const w = result.watchlist
    parts.push(`${w.matched} watchlist item${w.matched === 1 ? '' : 's'}`)
  }

  if (result.watched) {
    const wt = result.watched
    const epText = wt.episodes > 0 ? ` (${wt.episodes} episode${wt.episodes === 1 ? '' : 's'})` : ''
    parts.push(`${wt.matched} watched title${wt.matched === 1 ? '' : 's'}${epText}`)
  }

  if (parts.length === 0) {
    showToast({
      title: 'Plex sync complete',
      description: 'Sync completed. No new items were found.',
      variant: 'neutral',
    })
    return
  }

  showToast({
    title: 'Plex sync complete',
    description: `Synced ${parts.join(' and ')} from Plex to your library.`,
    variant: 'success',
  })
}
