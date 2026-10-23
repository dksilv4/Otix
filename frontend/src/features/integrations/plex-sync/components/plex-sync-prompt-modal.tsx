import { Bookmark, CheckCircle2, Loader2, Sparkles } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkCheckbox } from '@ui/atoms/checkbox'
import { DkDialog } from '@ui/molecules/dialog'
import { usePlexSyncPrompt } from '../hooks/use-plex-sync-prompt'

export const PlexSyncPromptModal = () => {
  const { open, setOpen, mode, options, toggleOption, syncing, handleSync, handleSkip } =
    usePlexSyncPrompt()

  const titleText = mode === 'login' ? 'Welcome! Sync Plex Data?' : 'Sync Plex Data'
  const descText =
    mode === 'login'
      ? 'Your Plex account is connected. Choose what you would like to import into your Otix library. Everything is optional.'
      : 'Your Plex account is linked. Choose what you would like to import into your Otix library. Everything is optional.'

  const hasSelection = options.syncWatchlist || options.syncWatched

  return (
    <DkDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!syncing) setOpen(nextOpen)
      }}
      title={
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <span>{titleText}</span>
        </div>
      }
      description={descText}
      className="max-w-md"
    >
      <div className="mt-4 space-y-3">
        {/* Watchlist option row */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => !syncing && toggleOption('syncWatchlist')}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !syncing) {
              e.preventDefault()
              toggleOption('syncWatchlist')
            }
          }}
          className="flex cursor-pointer items-start justify-between gap-3.5 rounded-2xl p-4 transition-all duration-150 border border-white/[0.04] hover:bg-[var(--dk-surface-ghost-hover)]"
          style={{ backgroundColor: 'var(--dk-surface-ghost)' }}
        >
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary"
              style={{ backgroundColor: 'var(--dk-surface-field)' }}
            >
              <Bookmark className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Watchlist</p>
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                Import movies and TV shows from your Plex Discover watchlist
              </p>
            </div>
          </div>
          <div className="pt-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <DkCheckbox
              checked={options.syncWatchlist}
              disabled={syncing}
              onCheckedChange={(val) => toggleOption('syncWatchlist', val)}
              aria-label="Sync Watchlist"
            />
          </div>
        </div>

        {/* Watched media option row */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => !syncing && toggleOption('syncWatched')}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !syncing) {
              e.preventDefault()
              toggleOption('syncWatched')
            }
          }}
          className="flex cursor-pointer items-start justify-between gap-3.5 rounded-2xl p-4 transition-all duration-150 border border-white/[0.04] hover:bg-[var(--dk-surface-ghost-hover)]"
          style={{ backgroundColor: 'var(--dk-surface-ghost)' }}
        >
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary"
              style={{ backgroundColor: 'var(--dk-surface-field)' }}
            >
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Watched Media</p>
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                Sync watched history for movies, shows, and episodes from your Plex servers
              </p>
            </div>
          </div>
          <div className="pt-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <DkCheckbox
              checked={options.syncWatched}
              disabled={syncing}
              onCheckedChange={(val) => toggleOption('syncWatched', val)}
              aria-label="Sync Watched Media"
            />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-6 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
        <DkButton
          variant="ghost"
          disabled={syncing}
          onClick={handleSkip}
          className="w-full sm:w-auto"
        >
          Not now
        </DkButton>
        <DkButton
          variant="primary"
          loading={syncing}
          disabled={syncing || !hasSelection}
          onClick={handleSync}
          leftIcon={syncing ? Loader2 : Sparkles}
          className="w-full sm:w-auto"
        >
          {syncing ? 'Syncing...' : 'Sync Selected'}
        </DkButton>
      </div>
    </DkDialog>
  )
}
