import { RefreshCw, Server } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConnectNetworkFolderModal } from '@/components/path-picker/connect-network-folder-modal'
import { useNodeFileExplorerState } from '../hooks/use-node-file-explorer-state'
import { ExplorerHeader } from './explorer/explorer-header'
import { ExplorerToolbar } from './explorer/explorer-toolbar'
import { ExplorerEntriesList } from './explorer/explorer-entries-list'
import { ExplorerFooter } from './explorer/explorer-footer'

export interface NodeFileExplorerProps {
  initialNodeId?: number
  initialServerId?: number
  initialPath?: string
  className?: string
  onClose?: () => void
  /** `modal` strips card chrome and uses dialog-friendly surfaces. */
  variant?: 'panel' | 'modal'
}

export type ServerFileExplorerProps = NodeFileExplorerProps

export const NodeFileExplorer = ({
  initialNodeId,
  initialServerId,
  initialPath,
  className,
  onClose,
  variant = 'panel',
}: NodeFileExplorerProps) => {
  const isModal = variant === 'modal'

  const state = useNodeFileExplorerState({
    initialNodeId,
    initialServerId,
    initialPath,
  })

  if (state.nodesLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-12 text-xs text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin text-primary" />
        <span>Loading connected nodes...</span>
      </div>
    )
  }

  if (state.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
        <div className="rounded-2xl p-3 bg-muted text-muted-foreground/60">
          <Server className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">No Otix nodes connected</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Download and run an Otix node on any machine to browse its file storage and stream games.
          </p>
        </div>
        <a
          href="/settings/library#downloads"
          onClick={onClose}
          className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          Connect node
        </a>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden',
        !isModal && 'rounded-2xl border border-white/[0.04] bg-card',
        className,
      )}
    >
      <ExplorerHeader
        isModal={isModal}
        activeNode={state.activeNode}
        nodes={state.nodes}
        nodeId={state.nodeId}
        onSelectNodeId={(id) => {
          state.setSelectedNodeId(id)
          state.handleNavigate(undefined)
        }}
        browseData={state.browseData}
        isRefetching={state.isRefetching}
        onRefetch={state.refetch}
        onRequestPermission={state.handleRequestPermission}
        isRequestingPermission={state.isRequestingPermission}
        onOpenConnectShare={() => state.setIsConnectShareOpen(true)}
        onNavigate={state.handleNavigate}
        currentPath={state.currentPath}
        onClose={onClose}
      />

      <ExplorerFooter
        isModal={isModal}
        browseData={state.browseData}
        isCurrentFolderDownloadTarget={state.isCurrentFolderDownloadTarget}
        onSetDownloadLocation={() => state.handleSetDownloadLocation()}
        onResetDownloadLocation={state.handleResetDownloadLocation}
        isSettingDownloadPath={state.isSettingDownloadPath}
      />

      <ExplorerToolbar
        isModal={isModal}
        browseData={state.browseData}
        currentPath={state.currentPath}
        breadcrumbs={state.breadcrumbs}
        onNavigate={state.handleNavigate}
        isCreatingFolder={state.isCreatingFolder}
        setIsCreatingFolder={state.setIsCreatingFolder}
        newFolderName={state.newFolderName}
        setNewFolderName={state.setNewFolderName}
        onCreateFolder={state.handleCreateFolder}
        isCreatingFolderPending={state.isCreatingFolderPending}
        searchQuery={state.searchQuery}
        setSearchQuery={state.setSearchQuery}
      />

      <ExplorerEntriesList
        isModal={isModal}
        isBrowsing={state.isBrowsing}
        browseData={state.browseData}
        browseError={state.browseError}
        sortedEntries={state.sortedEntries}
        searchQuery={state.searchQuery}
        nodes={state.nodes}
        nodeId={state.nodeId}
        currentPath={state.currentPath}
        isRefetching={state.isRefetching}
        onRefetch={state.refetch}
        onNavigate={state.handleNavigate}
        onRequestPermission={state.handleRequestPermission}
        isRequestingPermission={state.isRequestingPermission}
        onSelectNodeId={(id) => {
          state.setSelectedNodeId(id)
          state.handleNavigate(undefined)
        }}
        onDownloadFile={state.handleDownloadFile}
        onClose={onClose}
      />

      {/* Network Share Connection Modal */}
      <ConnectNetworkFolderModal
        open={state.isConnectShareOpen}
        onClose={() => state.setIsConnectShareOpen(false)}
        serverId={state.nodeId}
        onConnected={(path) => {
          state.handleNavigate(path)
          state.refetch()
        }}
      />
    </div>
  )
}
