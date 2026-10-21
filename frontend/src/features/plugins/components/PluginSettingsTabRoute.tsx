// Resolves /settings/<tabId> to a plugin settings tab (declared in the
// plugin manifest under settings.tabs). Static settings routes win over this
// dynamic sibling; unknown ids render a benign empty state or helpful fallback.
import { useParams, Link, Navigate } from '@tanstack/react-router'
import { Download, DownloadCloud, Server, Puzzle, Check, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePluginTabs } from '@/features/_config/slots'
import { useGameServers } from '@/features/downloads/use-server-downloads'
import { useServerUsenetConfig } from '@/features/downloads/use-server-usenet'
import { ServerSabnzbdSettingsModal } from '@/features/downloads/molecules/server-sabnzbd-settings-modal'
import { ServerProwlarrSettingsModal } from '@/features/downloads/molecules/server-prowlarr-settings-modal'
import { ServerRadarrSettingsModal } from '@/features/downloads/molecules/server-radarr-settings-modal'
import { ServerSonarrSettingsModal } from '@/features/downloads/molecules/server-sonarr-settings-modal'
import { useServerRadarrConfig, useServerSonarrConfig } from '@/features/downloads/use-server-arr'
import { pickConnectionNode } from '@/features/downloads/molecules/use-integration-target-server'
import {
  isSabnzbdConfigured as checkSabnzbdConfigured,
  isProwlarrConfigured as checkProwlarrConfigured,
} from '@/features/downloads/usenet-utils'
import { useServerProviders } from '@/features/downloads/use-server-providers'
import { PluginSettingsPage } from './PluginSettingsPage'
import { useModal } from '@/lib/modals'

const LEGACY_SETTINGS_TABS: Record<string, { to: string; hash?: string }> = {
  overview: { to: '/settings/appearance' },
  general: { to: '/settings/general' },
  recommendations: { to: '/settings/recommendations' },
  desktop: { to: '/settings/nodes' },
  launcher: { to: '/settings/launcher' },
  integrations: { to: '/settings/connections' },
  proposals: { to: '/settings/library', hash: 'proposals' },
}

import { openBoundModal } from '../utils/settings'

export const PluginSettingsTabRoute = () => {
  const { tabId } = useParams({ from: '/settings/$tabId' })
  const { tabs, isLoading } = usePluginTabs()
  const tab = tabs.find((t) => t.id === tabId)
  const { openModal } = useModal()
  const { data: servers = [] } = useGameServers()
  const activeServer = pickConnectionNode(servers) || servers[0]
  const { data: usenetConfig } = useServerUsenetConfig(activeServer?.id)
  const { data: providers } = useServerProviders(activeServer?.id)
  const { data: radarrConfig } = useServerRadarrConfig(activeServer?.id)
  const { data: sonarrConfig } = useServerSonarrConfig(activeServer?.id)

  const isSabnzbdConfigured =
    Boolean(
      providers?.downloaders?.some(
        (p) => p.name?.toLowerCase() === 'sabnzbd' && ((p as any).connected || p.configured)
      )
    ) || checkSabnzbdConfigured(usenetConfig?.sabnzbd)

  const isProwlarrConfigured =
    Boolean(
      providers?.indexers?.some(
        (p) => p.name?.toLowerCase() === 'prowlarr' && ((p as any).connected || p.configured)
      ) ||
      providers?.indexer_providers?.some(
        (p) => p.name?.toLowerCase() === 'prowlarr' && ((p as any).connected || p.configured)
      ) ||
      providers?.search_providers?.some(
        (p) => p.name?.toLowerCase() === 'prowlarr' && ((p as any).connected || p.configured)
      )
    ) || checkProwlarrConfigured(usenetConfig?.prowlarr)

  const isRadarrConfigured = Boolean(
    radarrConfig?.host &&
    Boolean(radarrConfig?.apiKey || radarrConfig?.api_key || radarrConfig?.configured)
  )
  const isSonarrConfigured = Boolean(
    sonarrConfig?.host &&
    Boolean(sonarrConfig?.apiKey || sonarrConfig?.api_key || sonarrConfig?.configured)
  )

  const legacy = tabId ? LEGACY_SETTINGS_TABS[tabId] : undefined
  if (legacy) {
    return <Navigate to={legacy.to} hash={legacy.hash} replace />
  }

  if (isLoading) return null
  if (!tab) {
    const lowerTab = tabId?.toLowerCase() || ''
    const isDownloaderSearch = ['sabnzbd', 'prowlarr', 'usenet', 'downloads', 'nzbplanet', 'downloader'].includes(lowerTab)
    const isArrSearch = ['radarr', 'sonarr', 'otix-radarr', 'otix-sonarr'].includes(lowerTab)
    const isServerManaged = isDownloaderSearch || isArrSearch

    return (
      <div className="max-w-xl mx-auto py-16 px-6 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-[var(--dk-surface-card)] border border-[var(--dk-separator)] flex items-center justify-center mx-auto text-primary shadow-lg">
          {isArrSearch ? <Server className="h-8 w-8 text-amber-500 dark:text-amber-400" /> : isDownloaderSearch ? <DownloadCloud className="h-8 w-8" /> : <Puzzle className="h-8 w-8 text-muted-foreground" />}
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">
            {isArrSearch
              ? 'Media Automation (Radarr / Sonarr)'
              : isDownloaderSearch
              ? 'Usenet & Downloader Configuration'
              : 'No plugin settings available'}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {isServerManaged
              ? 'SABnzbd, Prowlarr, Radarr, and Sonarr are managed directly through your self-hosted Otix Server node instead of legacy desktop plugins.'
              : 'There are no settings available for this plugin tab. Looking for download clients or server settings?'}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {activeServer && (
            <>
              {(!isArrSearch || lowerTab.includes('sabnzbd')) && (
                <button
                  type="button"
                  onClick={() => {
                    openBoundModal(openModal, (onClose) => (
                      <ServerSabnzbdSettingsModal
                        serverId={activeServer?.id}
                        serverName={activeServer?.name}
                        onClose={onClose}
                      />
                    ))
                  }}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all cursor-pointer',
                    isSabnzbdConfigured
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 hover:bg-amber-500/25'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  )}
                >
                  {isSabnzbdConfigured ? <Check className="h-4 w-4" /> : <DownloadCloud className="h-4 w-4" />}
                  <span>Configure SABnzbd</span>
                  {isSabnzbdConfigured && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                      Connected
                    </span>
                  )}
                </button>
              )}
              {(!isArrSearch || lowerTab.includes('prowlarr')) && (
                <button
                  type="button"
                  onClick={() => {
                    openBoundModal(openModal, (onClose) => (
                      <ServerProwlarrSettingsModal
                        serverId={activeServer?.id}
                        serverName={activeServer?.name}
                        onClose={onClose}
                      />
                    ))
                  }}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all cursor-pointer',
                    isProwlarrConfigured
                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25 hover:bg-rose-500/25'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  )}
                >
                  {isProwlarrConfigured ? <Check className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                  <span>Configure Prowlarr</span>
                  {isProwlarrConfigured && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                      Connected
                    </span>
                  )}
                </button>
              )}
              {(!isDownloaderSearch || lowerTab.includes('radarr')) && (
                <button
                  type="button"
                  onClick={() => {
                    openBoundModal(openModal, (onClose) => (
                      <ServerRadarrSettingsModal
                        serverId={activeServer?.id}
                        serverName={activeServer?.name}
                        onClose={onClose}
                      />
                    ))
                  }}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all cursor-pointer',
                    isRadarrConfigured
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 hover:bg-amber-500/25'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  )}
                >
                  {isRadarrConfigured ? <Check className="h-4 w-4" /> : <Server className="h-4 w-4" />}
                  <span>Configure Radarr</span>
                  {isRadarrConfigured && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                      Connected
                    </span>
                  )}
                </button>
              )}
              {(!isDownloaderSearch || lowerTab.includes('sonarr')) && (
                <button
                  type="button"
                  onClick={() => {
                    openBoundModal(openModal, (onClose) => (
                      <ServerSonarrSettingsModal
                        serverId={activeServer?.id}
                        serverName={activeServer?.name}
                        onClose={onClose}
                      />
                    ))
                  }}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all cursor-pointer',
                    isSonarrConfigured
                      ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/25 hover:bg-cyan-500/25'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  )}
                >
                  {isSonarrConfigured ? <Check className="h-4 w-4" /> : <Server className="h-4 w-4" />}
                  <span>Configure Sonarr</span>
                  {isSonarrConfigured && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                      Connected
                    </span>
                  )}
                </button>
              )}
            </>
          )}
          <Link
            to="/downloads"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--dk-surface-card)] text-foreground font-medium text-sm hover:bg-[var(--dk-surface-card-hover)] border border-[var(--dk-separator)] transition-colors"
          >
            <Download className="h-4 w-4" />
            Downloads Queue
          </Link>
          <Link
            to="/settings/connections"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--dk-surface-glass)] text-muted-foreground font-medium text-sm hover:text-foreground hover:bg-[var(--dk-surface-card-hover)] border border-[var(--dk-separator)] transition-colors"
          >
            <Server className="h-4 w-4" />
            Connections
          </Link>
        </div>
      </div>
    )
  }
  return <PluginSettingsPage tab={tab} />
};
