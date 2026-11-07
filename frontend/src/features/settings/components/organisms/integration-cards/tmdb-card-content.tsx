import TmdbIcon from '@/assets/provider-logos/tmdb.svg?react'
import { RefreshCw, Download } from 'lucide-react'
import { DkDropdown } from '@ui/atoms/dropdown'
import {
  IntegrationAction,
  IntegrationProfile,
  IntegrationStats,
} from '../settings-integration-card'
import { BRAND_COLORS, BRAND_BG } from '../../../utils/integrations'
import type { useIntegrationsPageState } from '../../../hooks/use-integrations-page-state'

export const TmdbCardContent = ({ state }: { state: ReturnType<typeof useIntegrationsPageState> }) => {
  return (
    <>
          <IntegrationProfile
            avatarUrl={state.tmdbAvatarUrl}
            avatarAlt={state.tmdbUsername ?? 'TMDb avatar'}
            name={state.tmdbUsername ?? 'TMDb User'}
            detail="TMDb account linked"
            brandBg={BRAND_BG.tmdb}
            icon={TmdbIcon}
            brandColor={BRAND_COLORS.tmdb}
          />
          {state.tmdbStats && (
            <IntegrationStats items={[
              { label: 'rated movies', value: state.tmdbStats.ratedMovies },
              { label: 'rated shows', value: state.tmdbStats.ratedTv },
              { label: 'watchlist movies', value: state.tmdbStats.watchlistMovies },
              { label: 'watchlist shows', value: state.tmdbStats.watchlistTv },
            ]} />
          )}
          <IntegrationAction label="Rating Sync" description="Sync ratings between Otix and TMDb" result={state.tmdbSyncResult ? `${state.tmdbSyncResult.imported > 0 ? `${state.tmdbSyncResult.imported} imported` : ''}${state.tmdbSyncResult.imported > 0 && state.tmdbSyncResult.exported > 0 ? ', ' : ''}${state.tmdbSyncResult.exported > 0 ? `${state.tmdbSyncResult.exported} exported` : ''}${state.tmdbSyncResult.skipped > 0 ? ` (${state.tmdbSyncResult.skipped} skipped)` : ''}` : null} buttonLabel={state.tmdbSyncing ? 'Syncing...' : 'Sync Ratings'} buttonIcon={RefreshCw} onPress={state.handleTmdbRatingSync} loading={state.tmdbSyncing} disabled={state.tmdbSyncDirection === 'disabled'}>
            <div className="mt-2">
              <DkDropdown options={state.tmdbSyncDirections} value={state.tmdbSyncDirection} onChange={state.setTmdbSyncDirection} placeholder="Direction" />
            </div>
          </IntegrationAction>
          <IntegrationAction label="Watchlist Import" description="Import your TMDb watchlist into Otix" result={state.tmdbWatchlistResult ? `${state.tmdbWatchlistResult.imported} imported, ${state.tmdbWatchlistResult.skipped} skipped` : null} buttonLabel={state.tmdbWatchlistImporting ? 'Importing...' : state.tmdbWatchlistResult ? 'Re-import' : 'Import'} buttonIcon={Download} onPress={state.handleTmdbWatchlistImport} loading={state.tmdbWatchlistImporting} muted />
          {state.tmdbMessage && <p className="px-5 py-2 text-xs text-green-400">{state.tmdbMessage}</p>}
          {state.tmdbError && <p className="px-5 py-2 text-xs text-red-400">{state.tmdbError}</p>}
        </>
  )
}
