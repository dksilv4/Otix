import { useMemo } from 'react'
import { useToast } from '@ui/molecules/toast'
import type { GameServer } from '@/features/downloads/types'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import type { DedicatedGameServer } from '@/features/gameservers/types'
import type { UserHome, UserServerMachine } from '../../types/server-machines'
import type {
  NodeMapItem,
  SambaShareConfig,
} from '../../types/node-map'
import {
  isCompatibleConnection,
  HUB_NODE_ID,
} from '../../utils/node-map'
import type { NodesCentralHubStats } from './nodes-central-hub-node'
import { useNodeMap } from '../../hooks/use-node-map'
import { NodeMapActionDock } from '../molecules/node-map-action-dock'
import { NodeMapConnectDialog } from './node-map-connect-dialog'
import { ConnectNodePickerModal } from './connect-node-picker-modal'
import { useTopologyConnections } from '../../hooks/use-topology-connections'
import { TopologySvgLayer } from './topology/topology-svg-layer'
import { TopologyNodesLayer } from './topology/topology-nodes-layer'
import { TopologyHudControls } from './topology/topology-hud-controls'
import type {
  NodesCategoryFilter,
  NodesStatusFilter,
} from '../../utils/node-views'

interface NodesTopologyCanvasProps {
  homes: UserHome[]
  serverMachines: UserServerMachine[]
  nodes: GameServer[]
  gameServers?: DedicatedGameServer[]
  pendingNodes?: PendingNode[]
  customSambaShares?: SambaShareConfig[]
  hubStats?: NodesCentralHubStats
  unclaimedNodes?: PendingNode[]
  anchor?: { x: number; y: number }
  searchQuery?: string
  categoryFilter?: NodesCategoryFilter
  statusFilter?: NodesStatusFilter
  viewMode?: 'map' | 'cards'
  onViewModeChange?: (mode: 'map' | 'cards') => void
  onOpenDownloadModal?: () => void
  onOpenGameServersDrawer?: () => void
  onSelectGameServer?: (gameServer: DedicatedGameServer) => void
  onEditGameServer?: (gameServer: DedicatedGameServer) => void
  onPingGameServer?: (gameServer: DedicatedGameServer) => void
  onCopyGameServerAddress?: (gameServer: DedicatedGameServer, e: React.MouseEvent) => void
  onClaimPendingNode?: (pending: PendingNode) => void
  onOpenConnectModal?: (url?: string) => void
  onAddHome: () => void
  onAddServer: (homeId?: number) => void
  onAddNode: () => void
  onAddSamba?: (preset?: Partial<SambaShareConfig>) => void
  onOpenSambaSettings?: (samba: SambaShareConfig) => void
  onSaveCustomSamba?: (samba: SambaShareConfig) => void
  onDeleteSamba?: (sambaId: string) => void
  onEditHome: (home: UserHome) => void
  onDeleteHome: (home: UserHome) => void
  onEditServer: (server: UserServerMachine) => void
  onDeleteServer: (server: UserServerMachine) => void
  onDetectDrives: (server: UserServerMachine) => void
  onOpenNodeSettings: (server: GameServer) => void
  onEditNode?: (server: GameServer) => void
  onRenameNode: (server: GameServer) => void
  onDuplicateNode?: (server: GameServer) => void
  onPingNode?: (server: GameServer) => void
  onEditSamba?: (samba: SambaShareConfig) => void
}

export const NodesTopologyCanvas = ({
  homes,
  serverMachines,
  nodes,
  gameServers = [],
  pendingNodes = [],
  customSambaShares = [],
  hubStats,
  unclaimedNodes = [],
  anchor,
  searchQuery: externalSearchQuery,
  categoryFilter = 'all',
  statusFilter = 'all',
  onOpenDownloadModal,
  onOpenGameServersDrawer,
  onSelectGameServer,
  onEditGameServer,
  onPingGameServer,
  onCopyGameServerAddress,
  onClaimPendingNode,
  onOpenConnectModal,
  onAddHome,
  onAddServer,
  onAddNode,
  onAddSamba,
  onOpenSambaSettings,
  onSaveCustomSamba,
  onEditHome,
  onDeleteHome,
  onEditServer,
  onDeleteServer,
  onDetectDrives,
  onOpenNodeSettings,
  onEditNode,
  onRenameNode,
  onDuplicateNode,
  onPingNode,
  onEditSamba,
}: NodesTopologyCanvasProps) => {
  const { toast } = useToast()

  const connState = useTopologyConnections({
    homes,
    serverMachines,
    nodes,
    gameServers,
    pendingNodes,
    customSambaShares,
    onSaveCustomSamba,
    externalSearchQuery,
    categoryFilter,
    statusFilter,
  })

  const {
    positions,
    viewport,
    selectedItem,
    setSelectedItem,
    searchQuery,
    draggingItemId,
    hoveredDropTargetId,
    connectingFrom,
    connectingMousePos,
    handleAutoLayout,
    zoomIn,
    zoomOut,
    resetView,
    fitView,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
    handleNodeDragStart,
    handleStartConnecting,
    handleCancelConnecting,
    handleWheel,
  } = useNodeMap({
    items: connState.items,
    edges: connState.edges,
    anchor,
    onCardDropConnect: connState.handleCardDropConnect,
  })

  const hubPos = positions[HUB_NODE_ID] || { x: anchor?.x ?? 300, y: anchor?.y ?? 100 }

  const matchingItemIds = useMemo(
    () => connState.getMatchingItemIds(searchQuery),
    [connState, searchQuery],
  )

  const handleNodeClickInConnectMode = (targetItem: NodeMapItem) => {
    if (!connectingFrom) return

    const check = isCompatibleConnection(connectingFrom, targetItem)
    if (!check.compatible) {
      toast({
        title: 'Incompatible Connection',
        description: check.reason || 'These nodes cannot be linked directly.',
        variant: 'destructive',
      })
      return
    }

    const source = connectingFrom
    handleCancelConnecting()

    if (check.connectionTypes.length === 1) {
      void connState.executeConnection(source, targetItem, check.connectionTypes[0])
      return
    }

    connState.setConnectPrompt({
      source,
      target: targetItem,
      allowedTypes: check.connectionTypes,
    })
  }

  const handleExecuteConnect = async (type: 'home' | 'host' | 'smb' | 'game_server') => {
    if (!connState.connectPrompt) return
    const { source, target } = connState.connectPrompt
    connState.setConnectPrompt(null)
    await connState.executeConnection(source, target, type)
  }

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden select-none z-0">
      {/* Edge-to-Edge Interactive Topology Canvas Container */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Nodes Topology Map"
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onClick={() => setSelectedItem(null)}
        onWheel={handleWheel}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing bg-background select-none z-0"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        <TopologySvgLayer
          viewport={viewport}
          edges={connState.edges}
          positions={positions}
          matchingItemIds={matchingItemIds}
          hoveredEdgeId={connState.hoveredEdgeId}
          setHoveredEdgeId={connState.setHoveredEdgeId}
          onDisconnectEdge={connState.handleDisconnectEdge}
          connectingFrom={connectingFrom}
          connectingMousePos={connectingMousePos}
        />

        <TopologyNodesLayer
          viewport={viewport}
          hubStats={hubStats}
          hubPos={hubPos}
          unclaimedNodes={unclaimedNodes}
          items={connState.items}
          positions={positions}
          matchingItemIds={matchingItemIds}
          hoveredDropTargetId={hoveredDropTargetId}
          connectingFrom={connectingFrom}
          selectedItem={selectedItem}
          draggingItemId={draggingItemId}
          setSelectedItem={setSelectedItem}
          handleNodeDragStart={handleNodeDragStart}
          handleStartConnecting={handleStartConnecting}
          handleCancelConnecting={handleCancelConnecting}
          handleNodeClickInConnectMode={handleNodeClickInConnectMode}
          setConnectPickerItem={connState.setConnectPickerItem}
          onAddNode={onAddNode}
          onClaimPendingNode={onClaimPendingNode}
          onOpenConnectModal={onOpenConnectModal}
          onOpenDownloadModal={onOpenDownloadModal}
          onOpenGameServersDrawer={onOpenGameServersDrawer}
          onSelectGameServer={onSelectGameServer}
          onEditGameServer={onEditGameServer}
          onPingGameServer={onPingGameServer}
          onCopyGameServerAddress={onCopyGameServerAddress}
          onEditHome={onEditHome}
          onDeleteHome={onDeleteHome}
          onEditServer={onEditServer}
          onDeleteServer={onDeleteServer}
          onDetectDrives={onDetectDrives}
          onOpenNodeSettings={onOpenNodeSettings}
          onEditNode={onEditNode}
          onRenameNode={onRenameNode}
          onDuplicateNode={onDuplicateNode}
          onPingNode={onPingNode}
          onOpenSambaSettings={onOpenSambaSettings}
          onEditSamba={onEditSamba}
        />
      </div>

      <TopologyHudControls
        hubStats={hubStats}
        viewport={viewport}
        connectingFrom={connectingFrom}
        onCancelConnecting={handleCancelConnecting}
        onAutoLayout={handleAutoLayout}
        onFitView={fitView}
        onResetView={resetView}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
      />

      {/* Contextual Action Dock for Selected Node */}
      <NodeMapActionDock
        selectedItem={selectedItem}
        onClose={() => setSelectedItem(null)}
        onOpenConnectPicker={connState.setConnectPickerItem}
        onOpenNodeSettings={onOpenNodeSettings}
        onEditNode={onEditNode}
        onRenameNode={onRenameNode}
        onDuplicateNode={onDuplicateNode}
        onPingNode={onPingNode}
        onEditServer={onEditServer}
        onDetectDrives={onDetectDrives}
        onDeleteServer={onDeleteServer}
        onEditHome={onEditHome}
        onDeleteHome={onDeleteHome}
        onOpenSambaSettings={onOpenSambaSettings}
        onEditSamba={onEditSamba}
        onClaimPendingNode={onClaimPendingNode}
      />

      {/* Connection Selection / Confirmation Dialog */}
      <NodeMapConnectDialog
        prompt={connState.connectPrompt}
        onClose={() => connState.setConnectPrompt(null)}
        onConnect={handleExecuteConnect}
        isPending={connState.isConnectingPending}
      />

      {/* 1-Click Connect Node Picker Modal */}
      <ConnectNodePickerModal
        open={Boolean(connState.connectPickerItem)}
        onOpenChange={(open) => !open && connState.setConnectPickerItem(null)}
        sourceItem={connState.connectPickerItem}
        allItems={connState.items}
        edges={connState.edges}
        onConnect={(source, target, type) => connState.executeConnection(source, target, type)}
        onDisconnect={connState.handleDisconnectEdge}
        onAddSamba={(machine) => {
          onAddSamba?.(
            machine
              ? {
                  id: '',
                  serverId: machine.id,
                  serverName: machine.name,
                  host: machine.host || '',
                  port: 445,
                  shareName: 'games',
                }
              : undefined,
          )
        }}
        onAddServer={onAddServer}
        onAddNode={onAddNode}
        onAddHome={onAddHome}
      />
    </div>
  )
}
