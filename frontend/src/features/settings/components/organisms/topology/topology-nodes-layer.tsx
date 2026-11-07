import { cn } from '@/lib/utils'
import { Server, Plus } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import type { GameServer } from '@/features/downloads/types'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import type { DedicatedGameServer } from '@/features/gameservers/types'
import type { UserHome, UserServerMachine } from '../../../types/server-machines'
import type { NodeMapItem, SambaShareConfig } from '../../../types/node-map'
import { isCompatibleConnection, HUB_NODE_ID, HUB_NODE_WIDTH } from '../../../utils/node-map'
import { NodesCentralHubNode, type NodesCentralHubStats } from '../nodes-central-hub-node'
import { NodeMapCardItem } from '../../molecules/node-map-card-item'

export interface TopologyNodesLayerProps {
  viewport: { x: number; y: number; zoom: number }
  hubStats?: NodesCentralHubStats
  hubPos: { x: number; y: number }
  unclaimedNodes: PendingNode[]
  items: NodeMapItem[]
  positions: Record<string, { x: number; y: number }>
  matchingItemIds: Set<string>
  hoveredDropTargetId: string | null
  connectingFrom: NodeMapItem | null
  selectedItem: NodeMapItem | null
  draggingItemId: string | null
  setSelectedItem: (item: NodeMapItem | null) => void
  handleNodeDragStart: (e: React.PointerEvent, id: string) => void
  handleStartConnecting: (item: NodeMapItem) => void
  handleCancelConnecting: () => void
  handleNodeClickInConnectMode: (item: NodeMapItem) => void
  setConnectPickerItem: (item: NodeMapItem | null) => void
  onAddNode: () => void
  onClaimPendingNode?: (pending: PendingNode) => void
  onOpenConnectModal?: (url?: string) => void
  onOpenDownloadModal?: () => void
  onOpenGameServersDrawer?: () => void
  onSelectGameServer?: (gameServer: DedicatedGameServer) => void
  onEditGameServer?: (gameServer: DedicatedGameServer) => void
  onPingGameServer?: (gameServer: DedicatedGameServer) => void
  onCopyGameServerAddress?: (gameServer: DedicatedGameServer, e: React.MouseEvent) => void
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
  onOpenSambaSettings?: (samba: SambaShareConfig) => void
  onEditSamba?: (samba: SambaShareConfig) => void
}

export const TopologyNodesLayer = ({
  viewport,
  hubStats,
  hubPos,
  unclaimedNodes,
  items,
  positions,
  matchingItemIds,
  hoveredDropTargetId,
  connectingFrom,
  selectedItem,
  draggingItemId,
  setSelectedItem,
  handleNodeDragStart,
  handleStartConnecting,
  handleCancelConnecting,
  handleNodeClickInConnectMode,
  setConnectPickerItem,
  onAddNode,
  onClaimPendingNode,
  onOpenConnectModal,
  onOpenDownloadModal,
  onOpenGameServersDrawer,
  onSelectGameServer,
  onEditGameServer,
  onPingGameServer,
  onCopyGameServerAddress,
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
  onOpenSambaSettings,
  onEditSamba,
}: TopologyNodesLayerProps) => {
  return (
    <div
      style={{
        transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
        transformOrigin: '0 0',
      }}
      className="absolute inset-0 pointer-events-none"
    >
      {/* Central Hub Node */}
      {hubStats && (
        <div
          style={{
            transform: `translate3d(${hubPos.x}px, ${hubPos.y}px, 0)`,
            width: `${HUB_NODE_WIDTH}px`,
          }}
          className="absolute pointer-events-auto select-none"
        >
          <NodesCentralHubNode
            stats={hubStats}
            unclaimedNodes={unclaimedNodes}
            onAddNode={onAddNode}
            onClaimPendingNode={onClaimPendingNode}
            onOpenConnectModal={onOpenConnectModal}
            onOpenDownloadModal={onOpenDownloadModal}
            onOpenGameServersDrawer={onOpenGameServersDrawer}
            isSelected={selectedItem?.id === HUB_NODE_ID}
            isDragging={draggingItemId === HUB_NODE_ID}
            onSelect={() =>
              setSelectedItem({
                id: HUB_NODE_ID,
                type: 'node',
                name: 'Nodes Hub',
                entityId: 'hub',
                data: { type: 'node' },
              })
            }
            onDragStart={(e) => handleNodeDragStart(e, HUB_NODE_ID)}
          />
        </div>
      )}

      {/* Cards for homes, servers, nodes, samba */}
      {items.map((item) => {
        const pos = positions[item.id] || { x: 80, y: 80 }
        const isMatch = matchingItemIds.has(item.id)
        const isDropTarget = hoveredDropTargetId === item.id
        const isCompatible = connectingFrom && connectingFrom.id !== item.id
          ? isCompatibleConnection(connectingFrom, item).compatible
          : false
        const isTargetCandidate = isDropTarget || Boolean(connectingFrom && connectingFrom.id !== item.id && isCompatible)
        const isConnectingDimmed = !hoveredDropTargetId && Boolean(connectingFrom && connectingFrom.id !== item.id && !isCompatible)

        return (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto transition-opacity duration-200',
              isMatch ? 'opacity-100' : 'opacity-20 hover:opacity-75',
            )}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              if (isTargetCandidate) {
                handleNodeClickInConnectMode(item)
              }
            }}
          >
            <NodeMapCardItem
              item={item}
              position={pos}
              isSelected={selectedItem?.id === item.id}
              isConnectingSource={connectingFrom?.id === item.id}
              isConnectingTargetCandidate={isTargetCandidate}
              isConnectingDimmed={isConnectingDimmed}
              onSelect={setSelectedItem}
              onDragStart={handleNodeDragStart}
              onStartConnecting={handleStartConnecting}
              onConnectTarget={handleNodeClickInConnectMode}
              onCancelConnecting={handleCancelConnecting}
              onOpenConnectPicker={setConnectPickerItem}
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
              onClaimPendingNode={onClaimPendingNode}
              onOpenSambaSettings={onOpenSambaSettings}
              onEditSamba={onEditSamba}
              onOpenGameServerDrawer={onSelectGameServer || onOpenGameServersDrawer}
              onEditGameServer={onEditGameServer}
              onPingGameServer={onPingGameServer}
              onCopyGameServerAddress={onCopyGameServerAddress}
            />
          </div>
        )
      })}

      {/* Subtle empty state helper beneath hub when no nodes exist */}
      {items.length === 0 && hubStats && (
        <div
          style={{
            transform: `translate3d(${hubPos.x}px, ${hubPos.y + 200}px, 0)`,
            width: `${HUB_NODE_WIDTH}px`,
          }}
          className="absolute pointer-events-none flex flex-col items-center text-center p-4 space-y-1 text-muted-foreground/70"
        >
          <p className="text-xs font-medium text-muted-foreground">
            No worker nodes, machines, or homes connected yet
          </p>
          <p className="text-[11px]">
            Drag this hub or click Add Node above to start building your network topology
          </p>
        </div>
      )}

      {/* Empty State when no nodes exist and hubStats is not provided */}
      {items.length === 0 && !hubStats && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-3 pointer-events-none pl-20 sm:pl-72 lg:pl-80">
          <div className="h-14 w-14 rounded-2xl bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] flex items-center justify-center text-muted-foreground">
            <Server size={28} />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">No nodes or servers in map</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Add your worker node, server machine, home environment, or Samba share to build your topology.
            </p>
          </div>
          <div className="flex items-center gap-2 pt-1 pointer-events-auto flex-wrap justify-center">
            <DkButton type="button" size="sm" variant="primary" onClick={onAddNode} className="gap-1.5 font-semibold shadow-md shadow-primary/20">
              <Plus size={14} />
              <span>Add Node</span>
            </DkButton>
          </div>
        </div>
      )}
    </div>
  )
}
