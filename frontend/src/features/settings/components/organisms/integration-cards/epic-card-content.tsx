import { Link } from '@tanstack/react-router'
import { FolderOpen, RefreshCw, Sparkles } from 'lucide-react'
import EpicIcon from '@/assets/provider-logos/epic.svg?react'
import {
  IntegrationAction,
  IntegrationProfile,
} from '../settings-integration-card'
import { BRAND_COLORS, BRAND_BG } from '../../../utils/integrations'
import type { useIntegrationsPageState } from '../../../hooks/use-integrations-page-state'

export const EpicCardContent = ({ state }: { state: ReturnType<typeof useIntegrationsPageState> }) => {
  return (
    <>
          <IntegrationProfile
            avatarAlt={state.epicDisplayName ?? 'Epic Games avatar'}
            name={state.epicDisplayName ?? 'Epic Games User'}
            detail={state.epicAccountId ? `Account ID: ${state.epicAccountId}` : 'Epic Games account linked'}
            brandBg={BRAND_BG.epic}
            icon={EpicIcon}
            brandColor={BRAND_COLORS.epic}
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
          {state.isEpicConnected && (
            <IntegrationAction
              label="Library Scanning"
              description="Epic Games library"
              result={state.epicScanResult ? `${state.epicScanResult.matchedInOtix} matched out of ${state.epicScanResult.totalInEpic} games${state.epicScanResult.failed ? ` (${state.epicScanResult.failed} failed)` : ''}` : null}
              buttonLabel={state.epicScanning ? 'Scanning...' : state.epicScanResult ? 'Re-scan' : 'Scan Library'}
              buttonIcon={RefreshCw}
              onPress={state.handleEpicScan}
              loading={state.epicScanning}
              disabled={state.epicScanning || state.epicResolvingSteamGrid}
              muted
            />
          )}
          {state.isEpicConnected && (
            <IntegrationAction
              label="SteamGridDB Artwork"
              description="Find covers, banners, icons, and hero artwork from SteamGridDB"
              result={state.epicSteamGridResult ? `${state.epicSteamGridResult.matched} of ${state.epicSteamGridResult.total} games updated${state.epicSteamGridResult.failed ? ` (${state.epicSteamGridResult.failed} not found)` : ''}` : null}
              buttonLabel={state.epicResolvingSteamGrid ? 'Resolving...' : state.epicSteamGridResult ? 'Re-resolve' : 'Resolve with SteamGrid'}
              buttonIcon={Sparkles}
              onPress={state.handleEpicResolveSteamGrid}
              loading={state.epicResolvingSteamGrid}
              disabled={state.epicResolvingSteamGrid || state.epicScanning}
              muted
            />
          )}
          {state.epicMessage && <p className="px-5 py-2 text-xs text-green-400">{state.epicMessage}</p>}
          {state.epicError && <p className="px-5 py-2 text-xs text-red-400">{state.epicError}</p>}
        </>
  )
}
