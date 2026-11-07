import { Link } from '@tanstack/react-router'
import { FolderOpen, RefreshCw, Sparkles } from 'lucide-react'
import GOGIcon from '@/assets/provider-logos/gog.svg?react'
import {
  IntegrationAction,
  IntegrationProfile,
} from '../settings-integration-card'
import { BRAND_COLORS, BRAND_BG } from '../../../utils/integrations'
import type { useIntegrationsPageState } from '../../../hooks/use-integrations-page-state'

export const GogCardContent = ({ state }: { state: ReturnType<typeof useIntegrationsPageState> }) => {
  return (
    <>
          <IntegrationProfile
            avatarAlt={state.gogDisplayName ?? 'GOG avatar'}
            name={state.gogDisplayName ?? 'GOG User'}
            detail={state.gogAccountId ? `Account ID: ${state.gogAccountId}` : 'GOG account linked'}
            brandBg={BRAND_BG.gog}
            icon={GOGIcon}
            brandColor={BRAND_COLORS.gog}
          />
          <div className="mx-5 my-3 p-3.5 rounded-xl bg-[var(--dk-surface-ghost)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <FolderOpen className="h-4 w-4 text-muted-foreground/60 shrink-0" />
              <span>
                Game scanning and matching are also managed under
                {' '}<strong>Library Settings</strong> as a Provider.
              </span>
            </div>
            <Link
              to="/settings/library"
              className="px-3 py-1.5 rounded-xl bg-[var(--dk-surface-field)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground text-xs font-semibold whitespace-nowrap transition-colors self-start sm:self-auto shrink-0"
            >
              Go to Library Settings &rarr;
            </Link>
          </div>
          {state.isGOGConnected && (
            <IntegrationAction
              label="Library Scanning"
              description="GOG library"
              result={state.gogScanResult ? `${state.gogScanResult.matchedInOtix} matched out of ${state.gogScanResult.totalInGOG} games${state.gogScanResult.failed ? ` (${state.gogScanResult.failed} failed)` : ''}` : null}
              buttonLabel={state.gogScanning ? 'Scanning...' : state.gogScanResult ? 'Re-scan' : 'Scan Library'}
              buttonIcon={RefreshCw}
              onPress={state.handleGOGScan}
              loading={state.gogScanning}
              disabled={state.gogScanning || state.gogResolvingSteamGrid}
              muted
            />
          )}
          {state.isGOGConnected && (
            <IntegrationAction
              label="SteamGridDB Artwork"
              description="Find covers, banners, icons, and hero artwork from SteamGridDB"
              result={state.gogSteamGridResult ? `${state.gogSteamGridResult.matched} of ${state.gogSteamGridResult.total} games updated${state.gogSteamGridResult.failed ? ` (${state.gogSteamGridResult.failed} not found)` : ''}` : null}
              buttonLabel={state.gogResolvingSteamGrid ? 'Resolving...' : state.gogSteamGridResult ? 'Re-resolve' : 'Resolve with SteamGrid'}
              buttonIcon={Sparkles}
              onPress={state.handleGOGResolveSteamGrid}
              loading={state.gogResolvingSteamGrid}
              disabled={state.gogResolvingSteamGrid || state.gogScanning}
              muted
            />
          )}
          {state.gogMessage && <p className="px-5 py-2 text-xs text-green-400">{state.gogMessage}</p>}
          {state.gogError && <p className="px-5 py-2 text-xs text-red-400">{state.gogError}</p>}
        </>
  )
}
