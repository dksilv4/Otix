import { DkButton } from '@ui/atoms/button'
import {
  Plus,
  DownloadCloud,
  ArrowRight,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { NodeFileExplorerModal } from '@/features/downloads/molecules/node-file-explorer-modal'
import { DownloadNodeModal } from '@/features/downloads/molecules/download-node-modal'
import { ManageDownloadersModal } from '@/features/downloads/molecules/manage-downloaders-modal'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { useDownloadsPageState } from '../hooks/use-downloads-page-state'
import { ConnectNodePanel } from '../components/organisms/downloads/connect-node-panel'
import { PendingNodesBanner } from '../components/organisms/downloads/pending-nodes-banner'
import { NodeServerCard } from '../components/organisms/downloads/node-server-card'
import { DisconnectNodeDialog } from '../components/organisms/downloads/disconnect-node-dialog'

export interface SettingsDownloadsPageProps {
  embedded?: boolean
  variant?: 'all' | 'nodes' | 'clients'
}

export const SettingsDownloadsPage = ({
  embedded = false,
  variant = 'all',
}: SettingsDownloadsPageProps = {}) => {
  const state = useDownloadsPageState({ variant })

  const openServerExplorer = (server: { id: number; name: string }) => {
    const close = state.openModal(
      <NodeFileExplorerModal
        initialNodeId={server.id}
        nodeName={server.name}
        onClose={() => close()}
      />,
    )
  }

  const openManageDownloadersModal = () => {
    const close = state.openModal(<ManageDownloadersModal onClose={() => close()} />)
  }

  const openDownloadNodeModal = () => {
    const close = state.openModal(<DownloadNodeModal onClose={() => close()} />)
  }

  return (
    <div id="downloads" className="space-y-6 scroll-mt-28">
      {!embedded && (
        <SettingsCard>
          <SectionHeader
            variant="page"
            icon={DownloadCloud}
            title="Downloads"
            description="Otix nodes and download clients."
          />
        </SettingsCard>
      )}

      {state.showClients && (
        <SettingsCard>
          <SectionHeader
            title="Download clients"
            description="SABnzbd, Prowlarr, Radarr, and Sonarr each have an instance per Otix node."
            action={
              <div className="flex items-center gap-2">
                <DkButton size="sm" variant="ghost" onClick={openManageDownloadersModal}>
                  <DownloadCloud className="h-3.5 w-3.5" />
                  Manage Downloaders
                </DkButton>
                <DkButton size="sm" variant="ghost" asChild>
                  <Link to="/settings/connections">
                    Open Connections
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </DkButton>
              </div>
            }
          />
        </SettingsCard>
      )}

      {state.showNodes && (
        <SettingsCard className="space-y-4">
          <SectionHeader
            title="Otix nodes"
            description="Select a node to open its page. Connect workers to host folders, downloads, and your library on other machines."
            action={
              <div className="flex items-center gap-2">
                <DkButton size="sm" variant="ghost" onClick={openDownloadNodeModal}>
                  <DownloadCloud size={14} />
                  Download node
                </DkButton>
                <DkButton
                  size="sm"
                  variant="ghost"
                  onClick={() => state.setShowAddServer(!state.showAddServer)}
                >
                  <Plus size={14} />
                  {state.showAddServer ? 'Cancel' : 'Connect node'}
                </DkButton>
              </div>
            }
          />

          {state.showAddServer && (
            <ConnectNodePanel
              connectTab={state.connectTab}
              setConnectTab={state.setConnectTab}
              claimPin={state.claimPin}
              setClaimPin={state.setClaimPin}
              claimNodeUrl={state.claimNodeUrl}
              setClaimNodeUrl={state.setClaimNodeUrl}
              claimServerName={state.claimServerName}
              setClaimServerName={state.setClaimServerName}
              claimIsLocal={state.claimIsLocal}
              setClaimIsLocal={state.setClaimIsLocal}
              claimingPin={state.claimingPin}
              handleClaimByPin={state.handleClaimByPin}
              serverName={state.serverName}
              setServerName={state.setServerName}
              serverUrl={state.serverUrl}
              setServerUrl={state.setServerUrl}
              serverRemoteUrl={state.serverRemoteUrl}
              setServerRemoteUrl={state.setServerRemoteUrl}
              serverToken={state.serverToken}
              setServerToken={state.setServerToken}
              manualIsLocal={state.manualIsLocal}
              setManualIsLocal={state.setManualIsLocal}
              serverSubmitting={state.serverSubmitting}
              handleAddServer={state.handleAddServer}
              defaultAutoName={state.defaultAutoName}
              onCancel={() => state.setShowAddServer(false)}
            />
          )}

          <PendingNodesBanner
            orphanedNodes={state.orphanedNodes}
            unclaimedNodes={state.unclaimedNodes}
            isUnclaimingQuick={state.isUnclaimingQuick}
            onUnclaimQuickNode={state.handleUnclaimQuickNode}
            onClaimQuickNode={state.handleClaimQuickNode}
            onOpenManualClaim={(url) => {
              state.setShowAddServer(true)
              state.setConnectTab('claim')
              if (url) state.setClaimNodeUrl(url)
            }}
          />

          <div className="space-y-2">
            {state.gameServers.length > 0 ? (
              state.gameServers.map((server) => (
                <NodeServerCard
                  key={server.id}
                  server={server}
                  probeResult={state.probeResults[server.id]}
                  isProbing={state.probingServerId === server.id}
                  onSetPrimary={state.handleSetPrimary}
                  onProbeServer={state.handleProbeServer}
                  onOpenExplorer={openServerExplorer}
                  onPingServer={state.handlePingServer}
                  onSelectDelete={(srv) => state.setNodeToDelete(srv)}
                />
              ))
            ) : (
              <div className="p-6 rounded-xl bg-[var(--dk-surface-ghost)] text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto text-primary">
                  <DownloadCloud className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-foreground font-semibold">No Otix nodes connected yet</p>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                    Download Otix Node to run on your Mac, Windows PC, or home server. It runs quietly in the background with zero setup — double-click to start and link it with your claim PIN.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                  <DkButton size="sm" variant="primary" onClick={openDownloadNodeModal} className="text-xs font-bold">
                    <DownloadCloud size={14} className="mr-1.5" />
                    Download Otix Node
                  </DkButton>
                  <DkButton size="sm" variant="ghost" onClick={() => state.setShowAddServer(true)} className="text-xs font-medium">
                    <Plus size={14} className="mr-1.5" />
                    Connect existing node
                  </DkButton>
                </div>
              </div>
            )}
          </div>
        </SettingsCard>
      )}

      {/* Disconnect Node Confirmation Modal */}
      <DisconnectNodeDialog
        nodeToDelete={state.nodeToDelete}
        onClose={() => state.setNodeToDelete(null)}
        isPending={state.deletePending}
        onConfirm={state.handleDeleteServer}
      />
    </div>
  )
}

export { SettingsDownloadsPage as SettingsDownloadsSection }
