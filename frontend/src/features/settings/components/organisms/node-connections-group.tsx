import type { GameServer } from '@/features/downloads/use-server-downloads'
import { useNodeConnectionsGroup } from '../../hooks/use-node-connections-group'
import { NodeConnectionsHeader } from './connections/node-connections-header'
import { NodeConnectionItemCard } from './connections/node-connection-item-card'

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
  const state = useNodeConnectionsGroup({
    server,
    searchQuery,
    defaultExpanded,
    hideNodeHeader,
  })

  if (state.filteredDefs.length === 0) return null

  const cardsContent = (
    <div className="space-y-3">
      {state.filteredDefs.map((item) => (
        <NodeConnectionItemCard
          key={item.id}
          item={item}
          isExpanded={state.expandedId === item.id}
          onToggleExpand={() => state.toggleExpand(item.id)}
          isSabnzbdConfigured={state.isSabnzbdConfigured}
          sabnzbdQueue={state.sabnzbdQueue}
          isQueuePaused={state.isQueuePaused}
          onToggleQueuePause={state.handleToggleQueuePause}
          onOpenSabnzbdModal={state.openSabnzbdModal}
          isJDownloaderConfigured={state.isJDownloaderConfigured}
          jdConfig={state.jdConfig}
          onOpenJDownloaderModal={state.openJDownloaderModal}
          isProwlarrConfigured={state.isProwlarrConfigured}
          prowlarrIndexers={state.prowlarrIndexers}
          prowlarrSyncProtocol={state.prowlarrSyncProtocol}
          onProtocolChange={state.setProwlarrSyncProtocol}
          prowlarrSyncMessage={state.prowlarrSyncMessage}
          onProwlarrSync={state.handleProwlarrSync}
          isSyncingProwlarr={state.isSyncingProwlarr}
          onOpenProwlarrModal={state.openProwlarrModal}
          isG4UConfigured={state.isG4UConfigured}
          usenetConfig={state.usenetConfig}
          onOpenG4UModal={state.openG4UModal}
          isRadarrConfigured={state.isRadarrConfigured}
          radarrMovies={state.radarrMovies}
          radarrQueue={state.radarrQueue}
          radarrConfig={state.radarrConfig}
          onToggleRadarrAutoRequest={state.handleToggleRadarrAutoRequest}
          isSavingRadarr={state.isSavingRadarr}
          onOpenRadarrModal={state.openRadarrModal}
          isSonarrConfigured={state.isSonarrConfigured}
          sonarrSeries={state.sonarrSeries}
          sonarrQueue={state.sonarrQueue}
          sonarrConfig={state.sonarrConfig}
          onToggleSonarrAutoRequest={state.handleToggleSonarrAutoRequest}
          isSavingSonarr={state.isSavingSonarr}
          onOpenSonarrModal={state.openSonarrModal}
        />
      ))}
    </div>
  )

  if (hideNodeHeader) {
    return cardsContent
  }

  return (
    <div
      className="rounded-2xl sm:rounded-3xl overflow-hidden backdrop-blur-xl transition-colors duration-200 border border-white/[0.04]"
      style={{
        backgroundColor: 'var(--dk-surface-raised)',
        boxShadow: 'var(--dk-shadow-md)',
      }}
    >
      <NodeConnectionsHeader
        server={server}
        connectedCount={state.nodeDefs.filter((d) => d.isConnected).length}
        totalCount={state.nodeDefs.length}
        nodeOpen={state.nodeOpen}
        onToggleOpen={() => state.setNodeOpen((o) => !o)}
        onOpenSettings={onOpenSettings}
      />

      {state.nodeOpen && <div className="px-4 pb-4">{cardsContent}</div>}
    </div>
  )
}
