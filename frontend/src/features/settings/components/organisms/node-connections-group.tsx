import { useState } from 'react'
import {
  DownloadCloud,
  Film,
  Pause,
  Play,
  Search,
  Server,
  Settings,
  Tv,
  AlertTriangle,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkDropdown } from '@ui/atoms/dropdown'
import { useModal } from '@/lib/modals'
import type { GameServer } from '@/features/downloads/use-server-downloads'
import { ServerSabnzbdSettingsModal } from '@/features/downloads/molecules/server-sabnzbd-settings-modal'
import { ServerProwlarrSettingsModal } from '@/features/downloads/molecules/server-prowlarr-settings-modal'
import { ProwlarrIndexersPanel } from '@/features/downloads/molecules/prowlarr-indexers-panel'
import { ServerRadarrSettingsModal } from '@/features/downloads/molecules/server-radarr-settings-modal'
import { ServerSonarrSettingsModal } from '@/features/downloads/molecules/server-sonarr-settings-modal'
import {
  useServerRadarrConfig,
  useServerRadarrMovies,
  useServerRadarrQueue,
  useServerSonarrConfig,
  useServerSonarrSeries,
  useServerSonarrQueue,
} from '@/features/downloads/use-server-arr'
import {
  useServerUsenetConfig,
  useServerUsenetQueue,
  usePauseSabnzbdQueue,
  useResumeSabnzbdQueue,
  useProwlarrIndexers,
  useSyncProwlarrIndexers,
} from '@/features/downloads/use-server-usenet'
import {
  normalizeProwlarrIndexers,
  isProwlarrConfigured as checkProwlarrConfigured,
  isSabnzbdConfigured as checkSabnzbdConfigured,
} from '@/features/downloads/usenet-utils'
import { useServerProviders } from '@/features/downloads/use-server-providers'
import type { ProwlarrIndexerItem } from '@/features/downloads/usenet-types'
import {
  IntegrationAction,
  IntegrationCard,
  IntegrationStats,
} from './settings-integration-card'
import { openBoundModal } from '../../utils/integrations'
import {
  NODE_SERVICE_BG,
  NODE_SERVICE_COLORS,
} from '../../utils/node-connections'

export interface NodeConnectionsGroupProps {
  server: GameServer
  searchQuery?: string
  onOpenSettings?: (server: GameServer) => void
  defaultExpanded?: boolean
  hideNodeHeader?: boolean
}

/** Renders SABnzbd, Prowlarr, Radarr, and Sonarr cards scoped to a single Otix worker node. */
export const NodeConnectionsGroup = ({
  server,
  searchQuery = '',
  onOpenSettings,
  defaultExpanded = true,
  hideNodeHeader = false,
}: NodeConnectionsGroupProps) => {
  const { openModal } = useModal()
  const hasQuery = Boolean(searchQuery && searchQuery.trim().length > 0)
  const [nodeOpen, setNodeOpen] = useState(defaultExpanded || hasQuery || hideNodeHeader)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [prowlarrSyncProtocol, setProwlarrSyncProtocol] = useState<'all' | 'torrent' | 'usenet'>('all')
  const [prowlarrSyncMessage, setProwlarrSyncMessage] = useState<string | null>(null)
  const [syncedProwlarrIndexers, setSyncedProwlarrIndexers] = useState<ProwlarrIndexerItem[]>([])

  const sabnzbdLiveId = expandedId === 'sabnzbd' ? server.id : undefined
  const prowlarrLiveId = expandedId === 'prowlarr' ? server.id : undefined
  const radarrLiveId = expandedId === 'radarr' ? server.id : undefined
  const sonarrLiveId = expandedId === 'sonarr' ? server.id : undefined

  const { data: usenetConfig } = useServerUsenetConfig(server.id)
  const { data: providers } = useServerProviders(server.id)
  const { data: radarrConfig } = useServerRadarrConfig(server.id)
  const { data: sonarrConfig } = useServerSonarrConfig(server.id)
  const { data: radarrMovies = [] } = useServerRadarrMovies(radarrLiveId)
  const { data: sonarrSeries = [] } = useServerSonarrSeries(sonarrLiveId)
  const { data: radarrQueue } = useServerRadarrQueue(radarrLiveId, 1, 50, 4000)
  const { data: sonarrQueue } = useServerSonarrQueue(sonarrLiveId, 1, 50, 4000)
  const { data: sabnzbdQueue, refetch: refetchQueue } = useServerUsenetQueue(sabnzbdLiveId, 3000)
  const pauseSabnzbdMutation = usePauseSabnzbdQueue(server.id)
  const resumeSabnzbdMutation = useResumeSabnzbdQueue(server.id)
  const isQueuePaused = Boolean(sabnzbdQueue?.status?.toLowerCase().includes('paused'))
  const { data: fetchedProwlarrIndexers = [], refetch: refetchProwlarrIndexers } = useProwlarrIndexers(prowlarrLiveId)
  const syncProwlarrMutation = useSyncProwlarrIndexers(server.id)
  const prowlarrIndexers = fetchedProwlarrIndexers.length > 0 ? fetchedProwlarrIndexers : syncedProwlarrIndexers

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

  const openSabnzbdModal = () => {
    openBoundModal(openModal, (onClose) => (
      <ServerSabnzbdSettingsModal serverId={server.id} serverName={server.name} onClose={onClose} />
    ))
  }
  const openProwlarrModal = () => {
    openBoundModal(openModal, (onClose) => (
      <ServerProwlarrSettingsModal serverId={server.id} serverName={server.name} onClose={onClose} />
    ))
  }
  const openRadarrModal = () => {
    openBoundModal(openModal, (onClose) => (
      <ServerRadarrSettingsModal serverId={server.id} serverName={server.name} onClose={onClose} />
    ))
  }
  const openSonarrModal = () => {
    openBoundModal(openModal, (onClose) => (
      <ServerSonarrSettingsModal serverId={server.id} serverName={server.name} onClose={onClose} />
    ))
  }

  const handleToggleQueuePause = async () => {
    try {
      if (isQueuePaused) {
        await resumeSabnzbdMutation.mutateAsync()
      } else {
        await pauseSabnzbdMutation.mutateAsync()
      }
      refetchQueue()
    } catch (err) {
      console.error('Failed to toggle queue pause:', err)
    }
  }

  const handleProwlarrSync = async () => {
    try {
      const res = await syncProwlarrMutation.mutateAsync(prowlarrSyncProtocol)
      setSyncedProwlarrIndexers(normalizeProwlarrIndexers(res))
      setProwlarrSyncMessage(res.message)
      await refetchProwlarrIndexers()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setProwlarrSyncMessage(`Sync failed: ${message}`)
    }
  }

  const toggleExpand = (id: string) => setExpandedId(expandedId === id ? null : id)

  const query = searchQuery.toLowerCase().trim()

  const nodeDefs = [
    {
      id: 'sabnzbd',
      name: 'SABnzbd',
      keywords: 'sabnzbd usenet nzb download downloader provider queue client',
      isConnected: isSabnzbdConfigured,
      description: isSabnzbdConfigured
        ? `Configured on ${server.name} (Downloader Provider)`
        : 'Connect SABnzbd as your downloader provider to automate Usenet downloads on this node.',
      brandColor: NODE_SERVICE_COLORS.sabnzbd,
      brandBg: NODE_SERVICE_BG.sabnzbd,
      icon: DownloadCloud,
      onConnect: openSabnzbdModal,
    },
    {
      id: 'prowlarr',
      name: 'Prowlarr',
      keywords: 'prowlarr indexer provider search usenet torrent sync tracker',
      isConnected: isProwlarrConfigured,
      description: isProwlarrConfigured
        ? `Configured on ${server.name} (Indexer Provider)`
        : 'Connect Prowlarr as your indexer provider for Usenet and Torrent game releases.',
      brandColor: NODE_SERVICE_COLORS.prowlarr,
      brandBg: NODE_SERVICE_BG.prowlarr,
      icon: Search,
      onConnect: openProwlarrModal,
    },
    {
      id: 'radarr',
      name: 'Radarr',
      keywords: 'radarr movie movies watchlist automated download arr',
      isConnected: isRadarrConfigured,
      description: isRadarrConfigured
        ? `Configured on ${server.name}`
        : 'Connect Radarr to manage movie libraries and automate movie downloads.',
      brandColor: NODE_SERVICE_COLORS.radarr,
      brandBg: NODE_SERVICE_BG.radarr,
      icon: Film,
      onConnect: openRadarrModal,
    },
    {
      id: 'sonarr',
      name: 'Sonarr',
      keywords: 'sonarr tv shows series automated download arr',
      isConnected: isSonarrConfigured,
      description: isSonarrConfigured
        ? `Configured on ${server.name}`
        : 'Connect Sonarr to manage TV series and automate episode downloads.',
      brandColor: NODE_SERVICE_COLORS.sonarr,
      brandBg: NODE_SERVICE_BG.sonarr,
      icon: Tv,
      onConnect: openSonarrModal,
    },
  ]

  const filteredDefs = (query
    ? nodeDefs.filter(
        (i) =>
          i.name.toLowerCase().includes(query) ||
          i.keywords.toLowerCase().includes(query)
      )
    : nodeDefs).slice().sort((a, b) => (b.isConnected ? 1 : 0) - (a.isConnected ? 1 : 0))

  if (filteredDefs.length === 0) return null

  if (hideNodeHeader) {
    return (
      <div className="space-y-3">
        {filteredDefs.map((item) => (
          <IntegrationCard
            key={item.id}
            name={item.name}
            description={item.description}
            icon={item.icon}
            brandColor={item.brandColor}
            brandBg={item.brandBg}
            isConnected={item.isConnected}
            expanded={expandedId === item.id}
            onToggle={() => toggleExpand(item.id)}
            onConnect={item.onConnect}
          >
            {item.id === 'sabnzbd' && (
              <>
                {isSabnzbdConfigured && (
                  <IntegrationStats
                    items={[
                      { label: 'status', value: sabnzbdQueue?.status || (isQueuePaused ? 'Paused' : 'Idle') },
                      { label: 'speed', value: sabnzbdQueue?.speed || '0 KB/s' },
                      { label: 'time left', value: sabnzbdQueue?.time_left || (sabnzbdQueue as any)?.timeleft || '0:00:00' },
                      { label: 'size left', value: (sabnzbdQueue as any)?.size_left || (sabnzbdQueue as any)?.sizeleft || '0 MB' },
                    ]}
                  />
                )}
                <IntegrationAction
                  label="SABnzbd Settings"
                  description="Configure host, port, API key, and download folder options"
                  buttonLabel="Configure SABnzbd"
                  buttonIcon={DownloadCloud}
                  onPress={openSabnzbdModal}
                />
                {isSabnzbdConfigured && (
                  <IntegrationAction
                    label={isQueuePaused ? 'Resume Queue' : 'Pause Queue'}
                    description={isQueuePaused ? 'Downloads are currently paused' : 'Pause all active Usenet downloads'}
                    buttonLabel={isQueuePaused ? 'Resume Downloads' : 'Pause Downloads'}
                    buttonIcon={isQueuePaused ? Play : Pause}
                    onPress={handleToggleQueuePause}
                  />
                )}
              </>
            )}

            {item.id === 'prowlarr' && (
              <>
                {isProwlarrConfigured && (
                  <IntegrationStats
                    items={[
                      { label: 'indexers configured', value: String(prowlarrIndexers.length) },
                      { label: 'sync target', value: prowlarrSyncProtocol },
                    ]}
                  />
                )}
                <IntegrationAction
                  label="Prowlarr Settings"
                  description="Configure host, port, API key, and indexer sync categories"
                  buttonLabel="Configure Prowlarr"
                  buttonIcon={Search}
                  onPress={openProwlarrModal}
                />
                {isProwlarrConfigured && (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-[var(--dk-surface-field)] border border-white/[0.04]">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground">Sync Indexers</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Manually sync indexers to applications for this node
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <DkDropdown
                          value={prowlarrSyncProtocol}
                          onChange={(val) => setProwlarrSyncProtocol(val as 'all' | 'torrent' | 'usenet')}
                          options={[
                            { value: 'all', label: 'All Protocols' },
                            { value: 'torrent', label: 'Torrents Only' },
                            { value: 'usenet', label: 'Usenet Only' },
                          ]}
                          className="text-xs"
                        />
                        <DkButton
                          size="sm"
                          variant="secondary"
                          onClick={handleProwlarrSync}
                          loading={syncProwlarrMutation.isPending}
                          className="text-xs"
                        >
                          Sync Now
                        </DkButton>
                      </div>
                    </div>
                    {prowlarrSyncMessage && (
                      <p className="text-xs text-primary px-1">{prowlarrSyncMessage}</p>
                    )}
                    <ProwlarrIndexersPanel
                      protocol={prowlarrSyncProtocol}
                      onProtocolChange={setProwlarrSyncProtocol}
                      onSync={handleProwlarrSync}
                      isSyncing={syncProwlarrMutation.isPending}
                      indexers={prowlarrIndexers}
                      syncMessage={prowlarrSyncMessage}
                    />
                  </>
                )}
              </>
            )}

            {item.id === 'radarr' && (
              <>
                {isRadarrConfigured && (
                  <IntegrationStats
                    items={[
                      { label: 'indexed movies', value: String(radarrMovies.length) },
                      { label: 'monitored', value: String(radarrMovies.filter((m) => m.monitored).length) },
                      { label: 'queued downloads', value: String(radarrQueue?.totalRecords ?? radarrQueue?.records?.length ?? 0) },
                    ]}
                  />
                )}
                <IntegrationAction
                  label="Radarr Settings"
                  description="Configure host, port, API key, root folders, and quality profiles"
                  buttonLabel="Configure Radarr"
                  buttonIcon={Film}
                  onPress={openRadarrModal}
                />
              </>
            )}

            {item.id === 'sonarr' && (
              <>
                {isSonarrConfigured && (
                  <IntegrationStats
                    items={[
                      { label: 'indexed series', value: String(sonarrSeries.length) },
                      { label: 'monitored', value: String(sonarrSeries.filter((s) => s.monitored).length) },
                      { label: 'queued downloads', value: String(sonarrQueue?.totalRecords ?? sonarrQueue?.records?.length ?? 0) },
                    ]}
                  />
                )}
                <IntegrationAction
                  label="Sonarr Settings"
                  description="Configure host, port, API key, quality profile, and series options"
                  buttonLabel="Configure Sonarr"
                  buttonIcon={Tv}
                  onPress={openSonarrModal}
                />
              </>
            )}
          </IntegrationCard>
        ))}
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl sm:rounded-3xl overflow-hidden backdrop-blur-xl transition-all duration-200 border border-white/[0.04]"
      style={{
        backgroundColor: 'var(--dk-surface-raised)',
        boxShadow: 'var(--dk-shadow-md)',
      }}
    >
      {/* Node header bar */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setNodeOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setNodeOpen((o) => !o)
          }
        }}
        className="w-full flex items-center gap-3 px-5 py-4 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{
            backgroundColor: 'var(--dk-surface-glass)',
            boxShadow: 'var(--dk-shadow-sm)',
          }}
        >
          <Server className="w-5 h-5 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">{server.name}</span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--dk-surface-field)] border border-white/[0.04] text-muted-foreground">
              {nodeDefs.filter((d) => d.isConnected).length} of {nodeDefs.length} connected
            </span>
            {server.isOnline ? (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-status-online/15 text-status-online">
                Online
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-status-offline/15 text-status-offline border border-white/[0.04]">
                <AlertTriangle size={10} />
                Offline
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {server.primaryUrl || server.localUrl || 'Remote worker node'} &bull; SABnzbd, Prowlarr, Radarr, Sonarr
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onOpenSettings && (
            <DkButton
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                onOpenSettings(server)
              }}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Node Settings</span>
            </DkButton>
          )}
          <DkButton
            size="sm"
            variant="ghost"
            className="text-xs text-muted-foreground"
          >
            {nodeOpen ? 'Collapse' : 'Expand'}
          </DkButton>
        </div>
      </div>

      {/* Per-node integration cards */}
      {nodeOpen && (
        <div className="px-4 pb-4 space-y-3">
          {filteredDefs.map((item) => (
            <IntegrationCard
              key={item.id}
              name={item.name}
              description={item.description}
              icon={item.icon}
              brandColor={item.brandColor}
              brandBg={item.brandBg}
              isConnected={item.isConnected}
              expanded={expandedId === item.id}
              onToggle={() => toggleExpand(item.id)}
              onConnect={item.onConnect}
            >
              {item.id === 'sabnzbd' && (
                <>
                  {isSabnzbdConfigured && (
                    <IntegrationStats
                      items={[
                        { label: 'status', value: sabnzbdQueue?.status || (isQueuePaused ? 'Paused' : 'Idle') },
                        { label: 'speed', value: sabnzbdQueue?.speed || '0 KB/s' },
                        { label: 'time left', value: sabnzbdQueue?.time_left || (sabnzbdQueue as any)?.timeleft || '0:00:00' },
                        { label: 'size left', value: (sabnzbdQueue as any)?.size_left || (sabnzbdQueue as any)?.sizeleft || '0 MB' },
                      ]}
                    />
                  )}
                  <IntegrationAction
                    label="SABnzbd Settings"
                    description="Configure host, port, API key, and download folder options"
                    buttonLabel="Configure SABnzbd"
                    buttonIcon={DownloadCloud}
                    onPress={openSabnzbdModal}
                  />
                  {isSabnzbdConfigured && (
                    <IntegrationAction
                      label={isQueuePaused ? 'Resume Queue' : 'Pause Queue'}
                      description={isQueuePaused ? 'Downloads are currently paused' : 'Pause all active Usenet downloads'}
                      buttonLabel={isQueuePaused ? 'Resume Downloads' : 'Pause Downloads'}
                      buttonIcon={isQueuePaused ? Play : Pause}
                      onPress={handleToggleQueuePause}
                    />
                  )}
                </>
              )}

              {item.id === 'prowlarr' && (
                <>
                  {isProwlarrConfigured && (
                    <IntegrationStats
                      items={[
                        { label: 'indexers configured', value: String(prowlarrIndexers.length) },
                        { label: 'sync target', value: prowlarrSyncProtocol },
                      ]}
                    />
                  )}
                  <IntegrationAction
                    label="Prowlarr Settings"
                    description="Configure host, port, API key, and indexer sync categories"
                    buttonLabel="Configure Prowlarr"
                    buttonIcon={Search}
                    onPress={openProwlarrModal}
                  />
                  {isProwlarrConfigured && (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-[var(--dk-surface-field)] border border-[var(--dk-separator)]">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground">Sync Indexers</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Manually sync indexers to applications for this node
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <DkDropdown
                            value={prowlarrSyncProtocol}
                            onChange={(val) => setProwlarrSyncProtocol(val as 'all' | 'torrent' | 'usenet')}
                            options={[
                              { value: 'all', label: 'All Protocols' },
                              { value: 'torrent', label: 'Torrents Only' },
                              { value: 'usenet', label: 'Usenet Only' },
                            ]}
                            className="text-xs"
                          />
                          <DkButton
                            size="sm"
                            variant="secondary"
                            onClick={handleProwlarrSync}
                            loading={syncProwlarrMutation.isPending}
                            className="text-xs"
                          >
                            Sync Now
                          </DkButton>
                        </div>
                      </div>
                      {prowlarrSyncMessage && (
                        <p className="text-xs text-primary px-1">{prowlarrSyncMessage}</p>
                      )}
                      <ProwlarrIndexersPanel
                        protocol={prowlarrSyncProtocol}
                        onProtocolChange={setProwlarrSyncProtocol}
                        onSync={handleProwlarrSync}
                        isSyncing={syncProwlarrMutation.isPending}
                        indexers={prowlarrIndexers}
                        syncMessage={prowlarrSyncMessage}
                      />
                    </>
                  )}
                </>
              )}

              {item.id === 'radarr' && (
                <>
                  {isRadarrConfigured && (
                    <IntegrationStats
                      items={[
                        { label: 'indexed movies', value: String(radarrMovies.length) },
                        { label: 'monitored', value: String(radarrMovies.filter((m) => m.monitored).length) },
                        { label: 'queued downloads', value: String(radarrQueue?.totalRecords ?? radarrQueue?.records?.length ?? 0) },
                      ]}
                    />
                  )}
                  <IntegrationAction
                    label="Radarr Settings"
                    description="Configure host, port, API key, root folders, and quality profiles"
                    buttonLabel="Configure Radarr"
                    buttonIcon={Film}
                    onPress={openRadarrModal}
                  />
                </>
              )}

              {item.id === 'sonarr' && (
                <>
                  {isSonarrConfigured && (
                    <IntegrationStats
                      items={[
                        { label: 'indexed series', value: String(sonarrSeries.length) },
                        { label: 'monitored', value: String(sonarrSeries.filter((s) => s.monitored).length) },
                        { label: 'queued downloads', value: String(sonarrQueue?.totalRecords ?? sonarrQueue?.records?.length ?? 0) },
                      ]}
                    />
                  )}
                  <IntegrationAction
                    label="Sonarr Settings"
                    description="Configure host, port, API key, quality profile, and series options"
                    buttonLabel="Configure Sonarr"
                    buttonIcon={Tv}
                    onPress={openSonarrModal}
                  />
                </>
              )}
            </IntegrationCard>
          ))}
        </div>
      )}
    </div>
  )
};
