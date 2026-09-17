import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { useAuth } from '@auth/hooks/use-auth'
import { showToast } from '@ui/molecules/toast'
import { libraryKeys } from '@library/library-keys'
import {
  clearOfflineWatchlist,
  getOfflineWatchlistCount,
  PENDING_LOGIN_SYNC_KEY,
  syncOfflineWatchlist,
} from '@/features/interaction/offline-watchlist'

/**
 * Shown after a fresh login when there are items saved in the signed-out
 * offline watchlist. Offers to copy them onto the account watchlist.
 *
 * Covers both login paths:
 *  - Email / register / 2FA / Steam deep-link → `otix:user:login` event.
 *  - OAuth (Google / Plex / TMDb) → the callback page reloads the app, so the
 *    event is lost; instead it drops `PENDING_LOGIN_SYNC_KEY` which we consume
 *    on mount and fire once auth has resolved.
 */
export function WatchlistSyncPrompt() {
  const { isAuthenticated } = useAuth()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const promptedRef = useRef(false)
  const pendingOAuthRef = useRef(false)

  const maybePrompt = useCallback(() => {
    if (promptedRef.current) return
    if (getOfflineWatchlistCount() === 0) return
    promptedRef.current = true
    setOpen(true)
  }, [])

  useEffect(() => {
    const onLogin = () => maybePrompt()
    window.addEventListener('otix:user:login', onLogin)
    return () => window.removeEventListener('otix:user:login', onLogin)
  }, [maybePrompt])

  useEffect(() => {
    try {
      if (!localStorage.getItem(PENDING_LOGIN_SYNC_KEY)) return
      localStorage.removeItem(PENDING_LOGIN_SYNC_KEY)
      pendingOAuthRef.current = true
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (!pendingOAuthRef.current) return
    if (!isAuthenticated) return
    pendingOAuthRef.current = false
    maybePrompt()
  }, [isAuthenticated, maybePrompt])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const { synced } = await syncOfflineWatchlist()
      clearOfflineWatchlist()
      qc.invalidateQueries({ queryKey: libraryKeys.all() })
      showToast({
        title: 'Watchlist synced',
        description:
          synced === 0
            ? 'Nothing could be synced — it stays saved on this device.'
            : synced === 1
              ? '1 title added to your account watchlist.'
              : `${synced} titles added to your account watchlist.`,
        variant: synced === 0 ? 'error' : 'success',
      })
    } catch {
      showToast({
        title: 'Sync failed',
        description: 'Could not sync your watchlist. It stays saved on this device.',
        variant: 'error',
      })
    } finally {
      setSyncing(false)
      setOpen(false)
    }
  }

  return (
    <DkDialog
      open={open}
      onOpenChange={(o) => {
        if (!syncing) setOpen(o)
      }}
      title="Sync your offline watchlist?"
      description="You saved titles to your watchlist while signed out. Add them to your account watchlist now?"
    >
      <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 mt-4">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={syncing}
          className="w-full sm:w-auto px-4 py-2 text-xs font-medium text-white/60 hover:text-white transition-colors disabled:opacity-50"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-md disabled:opacity-60"
        >
          {syncing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Sync now
        </button>
      </div>
    </DkDialog>
  )
}
