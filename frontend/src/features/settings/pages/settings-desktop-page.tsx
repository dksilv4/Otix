import { cn } from '@/lib/utils'
import { useSettingsHashScroll } from '../hooks/use-settings-hash-scroll'
import { NodesTopologyCanvas } from '../components/organisms/nodes-topology-canvas'
import { NodesGridView } from '../components/organisms/nodes-grid-view'
import { NodesListView } from '../components/organisms/nodes-list-view'
import { SettingsPathsPage } from './settings-paths-page'
import { SettingsOrganizePage } from './settings-organize-page'
import { SettingsProposalsPage } from './settings-proposals-page'
import { SettingsNodeConnectionsPage } from './settings-node-connections-page'
import { SettingsMachinePage } from './settings-machine-page'
import { SettingsSoftwarePage } from './settings-software-page'
import { SettingsOverlayPage } from './settings-overlay-page'
import { getNavPillsTopOffset } from '../utils/node-views'
import { useNodesPageState } from '../hooks/use-nodes-page-state'
import { NodesPageHeader } from '../components/organisms/nodes-page/nodes-page-header'
import { NodesPageModals } from '../components/organisms/nodes-page/nodes-page-modals'

export const SettingsNodesPage = () => {
  useSettingsHashScroll()
  const state = useNodesPageState()

  if (state.activeTab === 'paths') {
    return (
      <div
        id="settings-nodes-section"
        className={cn(
          'relative w-full h-full overflow-y-auto px-4 sm:px-6 lg:px-8 pb-28',
          getNavPillsTopOffset(false),
        )}
      >
        <div className="w-full space-y-5">
          <SettingsPathsPage
            onNavigateToOrganize={() => state.setActiveTab('organize')}
            onNavigateToInfrastructure={() => state.setActiveTab('infrastructure')}
          />
        </div>
      </div>
    )
  }

  if (state.activeTab === 'organize') {
    return (
      <div
        id="settings-nodes-section"
        className={cn(
          'relative w-full h-full overflow-y-auto px-4 sm:px-6 lg:px-8 pb-28',
          getNavPillsTopOffset(false),
        )}
      >
        <div className="w-full space-y-5">
          <SettingsOrganizePage />
        </div>
      </div>
    )
  }

  if (state.activeTab === 'connections') {
    return (
      <div
        id="settings-nodes-section"
        className={cn(
          'relative w-full h-full overflow-y-auto px-4 sm:px-6 lg:px-8 pb-28',
          getNavPillsTopOffset(false),
        )}
      >
        <div className="w-full space-y-5">
          <SettingsNodeConnectionsPage />
        </div>
      </div>
    )
  }

  if (state.activeTab === 'machine') {
    return (
      <div
        id="settings-nodes-section"
        className={cn(
          'relative w-full h-full overflow-y-auto px-4 sm:px-6 lg:px-8 pb-28',
          getNavPillsTopOffset(false),
        )}
      >
        <div className="w-full space-y-5">
          <SettingsMachinePage />
        </div>
      </div>
    )
  }

  if (state.activeTab === 'software') {
    return (
      <div
        id="settings-nodes-section"
        className={cn(
          'relative w-full h-full overflow-y-auto px-4 sm:px-6 lg:px-8 pb-28',
          getNavPillsTopOffset(false),
        )}
      >
        <div className="w-full space-y-5">
          <SettingsSoftwarePage />
        </div>
      </div>
    )
  }

  if (state.activeTab === 'overlay') {
    return (
      <div
        id="settings-nodes-section"
        className={cn(
          'relative w-full h-full overflow-y-auto px-4 sm:px-6 lg:px-8 pb-28',
          getNavPillsTopOffset(false),
        )}
      >
        <div className="w-full space-y-5">
          <SettingsOverlayPage />
        </div>
      </div>
    )
  }

  if (state.activeTab === 'proposals') {
    return (
      <div
        id="settings-nodes-section"
        className={cn(
          'relative w-full h-full overflow-y-auto px-4 sm:px-6 lg:px-8 pb-28',
          getNavPillsTopOffset(false),
        )}
      >
        <div className="w-full space-y-5">
          <SettingsProposalsPage />
        </div>
      </div>
    )
  }

  return (
    <div
      id="settings-nodes-section"
      className={
        state.viewMode === 'map'
          ? 'relative w-full h-full overflow-hidden'
          : cn(
              'relative w-full h-full overflow-y-auto px-4 sm:px-6 lg:px-8 pb-28',
              getNavPillsTopOffset(false),
            )
      }
    >
      {state.viewMode === 'map' && (
        <NodesTopologyCanvas
          homes={state.homes}
          serverMachines={state.serverMachines}
          nodes={state.gameServers}
          gameServers={state.dedicatedGameServers}
          pendingNodes={[]}
          customSambaShares={state.customSambaShares}
          hubStats={state.stats}
          unclaimedNodes={state.unclaimedNodes}
          searchQuery={state.searchQuery}
          categoryFilter={state.categoryFilter}
          statusFilter={state.statusFilter}
          onOpenConnectModal={(url) => state.openConnectModal(url)}
          onOpenDownloadModal={state.openDownloadNodeModal}
          onOpenGameServersDrawer={() => state.setGameServersDrawerOpen(true)}
          onSelectGameServer={(server) => {
            state.setFocusedGameServerId(server.id)
            state.setGameServersDrawerOpen(true)
          }}
          onEditGameServer={(server) => state.setEditingGameServer(server)}
          onPingGameServer={state.handlePingDedicatedGameServer}
          onCopyGameServerAddress={state.handleCopyGameServerAddress}
          onClaimPendingNode={state.handleClaimQuickNode}
          onAddHome={() => state.setCreateHomeOpen(true)}
          onAddServer={(homeId) => {
            state.setCreateServerHomeId(homeId ?? null)
            state.setCreateServerMachineOpen(true)
          }}
          onAddNode={() => state.setAddNodeModalOpen(true)}
          onAddSamba={(preset) => {
            state.setCreateSambaPreset(preset ?? null)
            state.setCreateSambaOpen(true)
          }}
          onOpenSambaSettings={(samba) => state.setEditingSamba(samba)}
          onEditSamba={(samba) => state.setEditingSamba(samba)}
          onSaveCustomSamba={state.handleSaveCustomSamba}
          onDeleteSamba={state.handleDeleteCustomSamba}
          onEditHome={(home) => state.setEditingHome(home)}
          onDeleteHome={state.handleDeleteHome}
          onEditServer={(server) => state.setEditingServerMachine(server)}
          onDeleteServer={state.handleDeleteMachine}
          onDetectDrives={state.handleDetectDrivesForMachine}
          onOpenNodeSettings={state.handleOpenNodeSettings}
          onEditNode={(node) => state.setEditingWorkerNode(node)}
          onRenameNode={(node) => state.openRenameModal(node)}
          onDuplicateNode={state.handleDuplicateNode}
          onPingNode={state.handlePingServerInstance}
        />
      )}

      {state.viewMode !== 'map' && (
        <NodesPageHeader
          isAuthenticated={state.isAuthenticated}
          onlineInfrastructureCount={state.onlineInfrastructureCount}
          totalInfrastructureCount={state.totalInfrastructureCount}
        />
      )}

      {state.viewMode === 'grid' && (
        <div className="space-y-4">
          <NodesGridView
            items={state.filteredInfrastructureItems}
            categoryFilter={state.categoryFilter}
            onOpenNodeSettings={state.handleOpenNodeSettings}
            onEditNode={(node) => state.setEditingWorkerNode(node)}
            onRenameNode={(node) => state.openRenameModal(node)}
            onDuplicateNode={state.handleDuplicateNode}
            onPingNode={state.handlePingServerInstance}
            onDisconnectNode={(node) => state.setNodeToDelete(node)}
            onEditServer={(server) => state.setEditingServerMachine(server)}
            onDeleteServer={state.handleDeleteMachine}
            onDetectDrives={state.handleDetectDrivesForMachine}
            onEditHome={(home) => state.setEditingHome(home)}
            onDeleteHome={state.handleDeleteHome}
            onEditSamba={(samba) => state.setEditingSamba(samba)}
            onDeleteSamba={state.handleDeleteCustomSamba}
            onOpenGameServerDrawer={(server) => {
              state.setFocusedGameServerId(server.id)
              state.setGameServersDrawerOpen(true)
            }}
            onPingGameServer={state.handlePingDedicatedGameServer}
            onEditGameServer={(server) => state.setEditingGameServer(server)}
            onCopyGameServerAddress={state.handleCopyGameServerAddress}
            onClaimPendingNode={state.handleClaimQuickNode}
            onAddNode={() => state.setAddNodeModalOpen(true)}
            onResetFilters={state.resetFilters}
          />
        </div>
      )}

      {state.viewMode === 'list' && (
        <div className="space-y-4">
          <NodesListView
            items={state.filteredInfrastructureItems}
            onOpenNodeSettings={state.handleOpenNodeSettings}
            onEditNode={(node) => state.setEditingWorkerNode(node)}
            onRenameNode={(node) => state.openRenameModal(node)}
            onDuplicateNode={state.handleDuplicateNode}
            onPingNode={state.handlePingServerInstance}
            onDisconnectNode={(node) => state.setNodeToDelete(node)}
            onEditServer={(server) => state.setEditingServerMachine(server)}
            onDeleteServer={state.handleDeleteMachine}
            onDetectDrives={state.handleDetectDrivesForMachine}
            onEditHome={(home) => state.setEditingHome(home)}
            onDeleteHome={state.handleDeleteHome}
            onEditSamba={(samba) => state.setEditingSamba(samba)}
            onDeleteSamba={state.handleDeleteCustomSamba}
            onOpenGameServerDrawer={(server) => {
              state.setFocusedGameServerId(server.id)
              state.setGameServersDrawerOpen(true)
            }}
            onPingGameServer={state.handlePingDedicatedGameServer}
            onEditGameServer={(server) => state.setEditingGameServer(server)}
            onCopyGameServerAddress={state.handleCopyGameServerAddress}
            onClaimPendingNode={state.handleClaimQuickNode}
            onAddNode={() => state.setAddNodeModalOpen(true)}
            onResetFilters={state.resetFilters}
          />
        </div>
      )}

      <NodesPageModals
        nodeToDelete={state.nodeToDelete}
        setNodeToDelete={state.setNodeToDelete}
        onDeleteConfirm={state.handleDeleteConfirm}
        deleteServerPending={state.deleteServerPending}
        nodeToRename={state.nodeToRename}
        setNodeToRename={state.setNodeToRename}
        renameInput={state.renameInput}
        setRenameInput={state.setRenameInput}
        onRenameConfirm={state.handleRenameConfirm}
        isSavingRename={state.isSavingRename}
        createWorkerNodeOpen={state.createWorkerNodeOpen}
        setCreateWorkerNodeOpen={state.setCreateWorkerNodeOpen}
        connectInitialUrl={state.connectInitialUrl}
        setConnectInitialUrl={state.setConnectInitialUrl}
        unclaimedNodes={state.unclaimedNodes}
        defaultAutoName={state.defaultAutoName}
        homes={state.homes}
        serverMachines={state.serverMachines}
        gameServers={state.gameServers}
        editingWorkerNode={state.editingWorkerNode}
        setEditingWorkerNode={state.setEditingWorkerNode}
        handleOpenNodeSettings={state.handleOpenNodeSettings}
        duplicateWorkerNodeOpen={state.duplicateWorkerNodeOpen}
        setDuplicateWorkerNodeOpen={state.setDuplicateWorkerNodeOpen}
        nodeToDuplicate={state.nodeToDuplicate}
        setNodeToDuplicate={state.setNodeToDuplicate}
        createServerMachineOpen={state.createServerMachineOpen}
        setCreateServerMachineOpen={state.setCreateServerMachineOpen}
        createServerHomeId={state.createServerHomeId}
        editingServerMachine={state.editingServerMachine}
        setEditingServerMachine={state.setEditingServerMachine}
        createHomeOpen={state.createHomeOpen}
        setCreateHomeOpen={state.setCreateHomeOpen}
        editingHome={state.editingHome}
        setEditingHome={state.setEditingHome}
        createSambaOpen={state.createSambaOpen}
        setCreateSambaOpen={state.setCreateSambaOpen}
        createSambaPreset={state.createSambaPreset}
        editingSamba={state.editingSamba}
        setEditingSamba={state.setEditingSamba}
        onSaveCustomSamba={state.handleSaveCustomSamba}
        onDeleteCustomSamba={state.handleDeleteCustomSamba}
        addNodeModalOpen={state.addNodeModalOpen}
        setAddNodeModalOpen={state.setAddNodeModalOpen}
        addModalOpen={state.addModalOpen}
        setAddModalOpen={state.setAddModalOpen}
        onSelectNodeType={state.handleSelectNodeType}
        onClaimQuickNode={state.handleClaimQuickNode}
        gameServersDrawerOpen={state.gameServersDrawerOpen}
        setGameServersDrawerOpen={state.setGameServersDrawerOpen}
        focusedGameServerId={state.focusedGameServerId}
        createGameServerOpen={state.createGameServerOpen}
        setCreateGameServerOpen={state.setCreateGameServerOpen}
        createGameServerMachineId={state.createGameServerMachineId}
        setCreateGameServerMachineId={state.setCreateGameServerMachineId}
        editingGameServer={state.editingGameServer}
        setEditingGameServer={state.setEditingGameServer}
      />
    </div>
  )
}

export { SettingsNodesPage as SettingsDesktopPage }
