import {
  Film,
  Tv,
  Music,
  FolderOpen,
  HardDrive,
  RefreshCw,
  Check,
} from 'lucide-react'
import PlexIcon from '@/assets/provider-logos/plex.svg?react'
import { apiClient } from '@/lib/api/client'
import { DkButton } from '@ui/atoms/button'
import { DkSwitch } from '@ui/atoms/switch'
import {
  IntegrationAction,
  IntegrationProfile,
} from '../settings-integration-card'
import {
  BRAND_COLORS,
  BRAND_BG,
  formatDaysAgo,
  extractIntegrationMessage,
} from '../../../utils/integrations'
import type { useIntegrationsPageState } from '../../../hooks/use-integrations-page-state'

export const PlexCardContent = ({ state }: { state: ReturnType<typeof useIntegrationsPageState> }) => {
  return (
    <>
          <IntegrationProfile
            avatarUrl={state.plex?.plexThumb}
            avatarAlt={state.plex?.plexUsername ?? 'Plex avatar'}
            name={state.plex?.plexUsername ?? 'Plex User'}
            detail={state.plex?.plexEmail ?? (state.plex?.plexId ?? state.user?.plexId ?? 'Plex account linked')}
            brandBg={BRAND_BG.plex}
            icon={PlexIcon}
            brandColor={BRAND_COLORS.plex}
          />

          {/* Libraries list */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Plex Libraries</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {state.plexLibrariesLoading
                  ? 'Loading...'
                  : state.plexLibraries && state.plexLibraries.length > 0
                    ? `${state.plexLibraries.length} librar${state.plexLibraries.length === 1 ? 'y' : 'ies'} found`
                    : 'Discover your Plex libraries to sync individually'}
              </p>
            </div>
            <DkButton
              size="sm"
              variant="ghost"
              onClick={state.handleDiscoverLibraries}
              loading={state.discoveringPlex}
              disabled={state.discoveringPlex || state.plexSyncing || state.syncingLibraryIds.size > 0}
              leftIcon={RefreshCw}
              className="shrink-0 self-start sm:self-center bg-primary/10 text-primary shadow-none hover:bg-primary/15"
            >
              {state.plexLibraries && state.plexLibraries.length > 0 ? 'Refresh' : 'Discover'}
            </DkButton>
          </div>

          {state.plexLibraries && state.plexLibraries.length > 0 && (
            <div className="px-5 py-2 space-y-2">
              {state.plexLibraries.map((lib) => {
                const TypeIcon =
                  lib.libraryType === 'movie' ? Film :
                  lib.libraryType === 'show' ? Tv :
                  lib.libraryType === 'artist' ? Music :
                  FolderOpen
                const typeLabel =
                  lib.libraryType === 'artist' ? 'Music' :
                  lib.libraryType === 'movie' ? 'Movies' :
                  lib.libraryType === 'show' ? 'TV Shows' :
                  lib.libraryType === 'photo' ? 'Photos' : lib.libraryType
                const libIdStr = String(lib.id)
                const libProgress = state.plexLibraryProgress[libIdStr]
                const isSyncing = state.syncingLibraryIds.has(lib.id) || (state.plexSyncing && libProgress?.phase === 'syncing')
                const isComplete = libProgress?.phase === 'complete'
                const libError = state.plexLibraryErrors[libIdStr]
                const displayCount =
                  isComplete && typeof libProgress?.itemsTotal === 'number'
                    ? libProgress.itemsTotal
                    : (lib.itemCount ?? 0)

                return (
                  <div key={lib.id} className="flex flex-col gap-2 rounded-xl p-3 bg-[var(--dk-surface-ghost)]">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">{lib.title}</span>
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0 bg-[var(--dk-surface-field)] rounded-md px-1.5 py-0.5">
                            <TypeIcon className="h-3 w-3" />
                            {typeLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                          <span className="font-medium text-foreground">{lib.serverName}</span>
                          <span className="text-muted-foreground/30">·</span>
                          <span>{displayCount} items</span>
                          {lib.lastSyncedAt && (
                            <>
                              <span className="text-muted-foreground/30">·</span>
                              <span>last synced {formatDaysAgo(Math.floor(new Date(lib.lastSyncedAt).getTime() / 1000))}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <DkButton
                        size="sm"
                        variant="ghost"
                        onClick={() => state.handleSyncLibrary(lib)}
                        loading={isSyncing}
                        disabled={isSyncing || state.plexSyncing || state.syncingLibraryIds.size > 0 || state.discoveringPlex}
                        leftIcon={RefreshCw}
                        loadingText="Syncing"
                        className="shrink-0 self-start sm:self-center bg-primary/10 text-primary shadow-none hover:bg-primary/15"
                      >
                        Sync
                      </DkButton>
                    </div>

                    {/* Progress bar: visible when actively syncing this library */}
                    {isSyncing && libProgress && (
                      <div className="space-y-1">
                        {libProgress.itemsTotal > 0 ? (
                          <>
                            <div className="overflow-hidden rounded-full h-1.5 w-full bg-[var(--dk-surface-field)]">
                              <div
                                className="rounded-full h-full bg-primary transition-colors duration-150"
                                style={{ width: `${Math.min(100, Math.round((libProgress.itemsProcessed / libProgress.itemsTotal) * 100))}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-[11px] text-muted-foreground">
                              <span>Syncing items...</span>
                              <span>{libProgress.itemsProcessed} / {libProgress.itemsTotal}</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>Preparing sync...</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Success state */}
                    {isComplete && (
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-500">
                        <Check className="h-3 w-3" />
                        <span>Sync complete</span>
                      </div>
                    )}

                    {/* Individual library scan error */}
                    {libError && (
                      <div className="rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400">
                        {libError}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Sync All */}
          <IntegrationAction
            label="Sync All Libraries"
            description="Sync all selected Plex libraries at once"
            result={state.plexSyncResult ? `${state.plexSyncResult.total} items, ${state.plexSyncResult.seeded} seeded` : null}
            buttonLabel={state.plexSyncing ? 'Syncing...' : state.plexSyncResult ? 'Re-sync All' : 'Sync All'}
            buttonIcon={RefreshCw}
            onPress={state.handlePlexSync}
            loading={state.plexSyncing}
            disabled={state.plexSyncing || state.syncingLibraryIds.size > 0 || state.discoveringPlex}
            progress={state.plexSyncing && Object.values(state.plexLibraryProgress).filter(l => l.phase === 'syncing').length > 0 && <span className="text-xs text-primary">{Object.values(state.plexLibraryProgress).filter(l => l.phase === 'syncing').length} libraries syncing</span>}
            muted
          />

          <IntegrationAction
            label="Watchlist Sync"
            description="Plex Watchlist"
            result={state.plexWatchlistSyncResult ? `${state.plexWatchlistSyncResult.matched} matches out of ${state.plexWatchlistSyncResult.total} watchlist items` : null}
            buttonLabel={state.plexWatchlistSyncing ? 'Syncing...' : state.plexWatchlistSyncResult ? 'Re-sync' : 'Sync Watchlist'}
            buttonIcon={RefreshCw}
            onPress={state.handlePlexWatchlistSync}
            loading={state.plexWatchlistSyncing}
            disabled={state.plexWatchlistSyncing || state.plexSyncing || state.syncingLibraryIds.size > 0 || state.discoveringPlex}
            muted
          />

          <IntegrationAction
            label="Watched Media Sync"
            description="Sync watched movies, shows, and episodes from Plex"
            result={state.plexWatchedSyncResult ? `${state.plexWatchedSyncResult.matched} matches, ${state.plexWatchedSyncResult.episodes ?? 0} episodes` : null}
            buttonLabel={state.plexWatchedSyncing ? 'Syncing...' : state.plexWatchedSyncResult ? 'Re-sync' : 'Sync Watched'}
            buttonIcon={RefreshCw}
            onPress={state.handlePlexWatchedSync}
            loading={state.plexWatchedSyncing}
            disabled={state.plexWatchedSyncing || state.plexWatchlistSyncing || state.plexSyncing || state.syncingLibraryIds.size > 0 || state.discoveringPlex}
            muted
          />

          <IntegrationAction
            label="Storage Optimizer"
            description="Analyze server disk space and discover opportunities to save storage from duplicates, legacy codecs, and unwatched items"
            buttonLabel="Open Optimizer"
            buttonIcon={HardDrive}
            onPress={() => state.setPlexStorageModalOpen(true)}
          />
          <div className="flex items-center justify-between gap-4 px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Watch History Sync</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Sync episode-level watch history from Plex to your Otix library.
              </p>
            </div>
            <DkSwitch
              checked={state.plexWatchHistoryEnabled}
              onCheckedChange={async (checked) => {
                state.setPlexWatchHistoryEnabled(checked)
                state.setPlexError('')
                try {
                  await apiClient.patch('/auth/me', { plex_watch_history_enabled: checked })
                } catch (err) {
                  state.setPlexWatchHistoryEnabled(!checked)
                  state.setPlexError(extractIntegrationMessage(err))
                }
              }}
            />
          </div>
          {state.plexMessage && <p className="px-5 py-2 text-xs text-green-400">{state.plexMessage}</p>}
          {state.plexError && <p className="px-5 py-2 text-xs text-red-400">{state.plexError}</p>}
        </>
  )
}
