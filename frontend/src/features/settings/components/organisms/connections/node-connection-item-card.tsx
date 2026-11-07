import {
  DownloadCloud,
  Film,
  Gamepad2,
  Pause,
  Play,
  Search,
  Tv,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkDropdown } from '@ui/atoms/dropdown'
import { DkSwitch } from '@ui/atoms/switch'
import { ProwlarrIndexersPanel } from '@/features/downloads/molecules/prowlarr-indexers-panel'
import type { ProwlarrIndexerItem } from '@/features/downloads/usenet-types'
import {
  IntegrationAction,
  IntegrationCard,
  IntegrationStats,
} from '../settings-integration-card'
import type { NodeDefItem } from '../../../hooks/use-node-connections-group'

export interface NodeConnectionItemCardProps {
  item: NodeDefItem
  isExpanded: boolean
  onToggleExpand: () => void
  isSabnzbdConfigured: boolean
  sabnzbdQueue?: any
  isQueuePaused: boolean
  onToggleQueuePause: () => void
  onOpenSabnzbdModal: () => void
  isJDownloaderConfigured: boolean
  jdConfig?: any
  onOpenJDownloaderModal: () => void
  isProwlarrConfigured: boolean
  prowlarrIndexers: ProwlarrIndexerItem[]
  prowlarrSyncProtocol: 'all' | 'torrent' | 'usenet'
  onProtocolChange: (protocol: 'all' | 'torrent' | 'usenet') => void
  prowlarrSyncMessage: string | null
  onProwlarrSync: () => void
  isSyncingProwlarr: boolean
  onOpenProwlarrModal: () => void
  isG4UConfigured: boolean
  usenetConfig?: any
  onOpenG4UModal: () => void
  isRadarrConfigured: boolean
  radarrMovies: any[]
  radarrQueue?: any
  radarrConfig?: any
  onToggleRadarrAutoRequest: (checked: boolean) => void
  isSavingRadarr: boolean
  onOpenRadarrModal: () => void
  isSonarrConfigured: boolean
  sonarrSeries: any[]
  sonarrQueue?: any
  sonarrConfig?: any
  onToggleSonarrAutoRequest: (checked: boolean) => void
  isSavingSonarr: boolean
  onOpenSonarrModal: () => void
}

export const NodeConnectionItemCard = ({
  item,
  isExpanded,
  onToggleExpand,
  isSabnzbdConfigured,
  sabnzbdQueue,
  isQueuePaused,
  onToggleQueuePause,
  onOpenSabnzbdModal,
  isJDownloaderConfigured,
  jdConfig,
  onOpenJDownloaderModal,
  isProwlarrConfigured,
  prowlarrIndexers,
  prowlarrSyncProtocol,
  onProtocolChange,
  prowlarrSyncMessage,
  onProwlarrSync,
  isSyncingProwlarr,
  onOpenProwlarrModal,
  isG4UConfigured,
  usenetConfig,
  onOpenG4UModal,
  isRadarrConfigured,
  radarrMovies,
  radarrQueue,
  radarrConfig,
  onToggleRadarrAutoRequest,
  isSavingRadarr,
  onOpenRadarrModal,
  isSonarrConfigured,
  sonarrSeries,
  sonarrQueue,
  sonarrConfig,
  onToggleSonarrAutoRequest,
  isSavingSonarr,
  onOpenSonarrModal,
}: NodeConnectionItemCardProps) => {
  return (
    <IntegrationCard
      key={item.id}
      name={item.name}
      description={item.description}
      icon={item.icon}
      brandColor={item.brandColor}
      brandBg={item.brandBg}
      isConnected={item.isConnected}
      expanded={isExpanded}
      onToggle={onToggleExpand}
      onConnect={item.onConnect}
    >
      {item.id === 'sabnzbd' && (
        <>
          {isSabnzbdConfigured && (
            <IntegrationStats
              items={[
                { label: 'status', value: sabnzbdQueue?.status || (isQueuePaused ? 'Paused' : 'Idle') },
                { label: 'speed', value: sabnzbdQueue?.speed || '0 KB/s' },
                {
                  label: 'time left',
                  value: sabnzbdQueue?.time_left || sabnzbdQueue?.timeleft || '0:00:00',
                },
                {
                  label: 'size left',
                  value: sabnzbdQueue?.size_left || sabnzbdQueue?.sizeleft || '0 MB',
                },
              ]}
            />
          )}
          <IntegrationAction
            label="SABnzbd Settings"
            description="Configure host, port, API key, and download folder options"
            buttonLabel="Configure SABnzbd"
            buttonIcon={DownloadCloud}
            onPress={onOpenSabnzbdModal}
          />
          {isSabnzbdConfigured && (
            <IntegrationAction
              label={isQueuePaused ? 'Resume Queue' : 'Pause Queue'}
              description={
                isQueuePaused
                  ? 'Downloads are currently paused'
                  : 'Pause all active Usenet downloads'
              }
              buttonLabel={isQueuePaused ? 'Resume Downloads' : 'Pause Downloads'}
              buttonIcon={isQueuePaused ? Play : Pause}
              onPress={onToggleQueuePause}
            />
          )}
        </>
      )}

      {item.id === 'jdownloader' && (
        <>
          {isJDownloaderConfigured && (
            <IntegrationStats
              items={[
                {
                  label: 'mode',
                  value: jdConfig?.email ? 'MyJDownloader Cloud' : 'Direct Loopback',
                },
                {
                  label: 'device / host',
                  value: jdConfig?.deviceName || jdConfig?.directHost || 'Connected',
                },
                { label: 'path', value: jdConfig?.downloadPath || 'Default' },
              ]}
            />
          )}
          <IntegrationAction
            label="JDownloader 2 Settings"
            description="Configure MyJDownloader credentials, direct host, or download paths"
            buttonLabel="Configure JDownloader"
            buttonIcon={DownloadCloud}
            onPress={onOpenJDownloaderModal}
          />
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
            onPress={onOpenProwlarrModal}
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
                    onChange={(val) => onProtocolChange(val as 'all' | 'torrent' | 'usenet')}
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
                    onClick={onProwlarrSync}
                    loading={isSyncingProwlarr}
                    className="text-xs cursor-pointer"
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
                onProtocolChange={onProtocolChange}
                onSync={onProwlarrSync}
                isSyncing={isSyncingProwlarr}
                indexers={prowlarrIndexers}
                syncMessage={prowlarrSyncMessage}
              />
            </>
          )}
        </>
      )}

      {item.id === 'g4u' && (
        <>
          {isG4UConfigured && (
            <IntegrationStats
              items={[
                { label: 'category', value: 'PC / Games (4050)' },
                { label: 'protocol', value: 'Usenet' },
                { label: 'api endpoint', value: usenetConfig?.g4u?.url || 'https://g4u.to/api/' },
              ]}
            />
          )}
          <IntegrationAction
            label="g4u.to Settings"
            description="Configure API URL, API key, and view SABnzbd RSS feed instructions"
            buttonLabel="Configure g4u.to"
            buttonIcon={Gamepad2}
            onPress={onOpenG4UModal}
          />
        </>
      )}

      {item.id === 'radarr' && (
        <>
          {isRadarrConfigured && (
            <IntegrationStats
              items={[
                { label: 'indexed movies', value: String(radarrMovies.length) },
                {
                  label: 'monitored',
                  value: String(radarrMovies.filter((m) => m.monitored).length),
                },
                {
                  label: 'queued downloads',
                  value: String(radarrQueue?.totalRecords ?? radarrQueue?.records?.length ?? 0),
                },
              ]}
            />
          )}
          <IntegrationAction
            label="Radarr Settings"
            description="Configure host, port, API key, root folders, and quality profiles"
            buttonLabel="Configure Radarr"
            buttonIcon={Film}
            onPress={onOpenRadarrModal}
          />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 bg-[var(--dk-surface-ghost)] border-t border-white/[0.04]">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                Watchlist Automation
              </p>
              <p className="mt-0.5 text-sm font-medium text-foreground">
                Automatically request media from the watchlist
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically request movies added to your watchlist on this Radarr instance
              </p>
            </div>
            <DkSwitch
              checked={Boolean(
                radarrConfig?.autoRequestWatchlist ?? radarrConfig?.auto_request_watchlist,
              )}
              onCheckedChange={onToggleRadarrAutoRequest}
              disabled={!isRadarrConfigured || isSavingRadarr}
              aria-label="Automatically request media from the watchlist"
            />
          </div>
        </>
      )}

      {item.id === 'sonarr' && (
        <>
          {isSonarrConfigured && (
            <IntegrationStats
              items={[
                { label: 'indexed series', value: String(sonarrSeries.length) },
                {
                  label: 'monitored',
                  value: String(sonarrSeries.filter((s) => s.monitored).length),
                },
                {
                  label: 'queued downloads',
                  value: String(sonarrQueue?.totalRecords ?? sonarrQueue?.records?.length ?? 0),
                },
              ]}
            />
          )}
          <IntegrationAction
            label="Sonarr Settings"
            description="Configure host, port, API key, quality profile, and series options"
            buttonLabel="Configure Sonarr"
            buttonIcon={Tv}
            onPress={onOpenSonarrModal}
          />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 bg-[var(--dk-surface-ghost)] border-t border-white/[0.04]">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                Watchlist Automation
              </p>
              <p className="mt-0.5 text-sm font-medium text-foreground">
                Automatically request media from the watchlist
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically request TV series added to your watchlist on this Sonarr instance
              </p>
            </div>
            <DkSwitch
              checked={Boolean(
                sonarrConfig?.autoRequestWatchlist ?? sonarrConfig?.auto_request_watchlist,
              )}
              onCheckedChange={onToggleSonarrAutoRequest}
              disabled={!isSonarrConfigured || isSavingSonarr}
              aria-label="Automatically request media from the watchlist"
            />
          </div>
        </>
      )}
    </IntegrationCard>
  )
}
