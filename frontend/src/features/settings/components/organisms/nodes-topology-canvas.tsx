import { useState, useMemo } from 'react'
import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Server,
  Home as HomeIcon,
  Cpu,
  X,
  Network,
  Plus,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { useToast } from '@ui/molecules/toast'
import type { GameServer } from '@/features/downloads/types'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import type { DedicatedGameServer } from '@/features/gameservers/types'
import { useUpdateGameServer } from '@/features/gameservers/queries/gameservers-queries'
import type { UserHome, UserServerMachine } from '../../types/server-machines'
import type {
  NodeMapConnectPrompt,
  NodeMapEdge,
  NodeMapItem,
  SambaShareConfig,
} from '../../types/node-map'
import {
  buildNodeMapGraph,
  getNodeCardBorderAnchor,
  getNodeCardWidth,
  getNodeCardHeight,
  generateSmartNodeConnectionPath,
  SIDE_NORMALS,
  isCompatibleConnection,
  HUB_NODE_ID,
  HUB_NODE_WIDTH,
} from '../../utils/node-map'
import { NodesCentralHubNode, type NodesCentralHubStats } from './nodes-central-hub-node'
import { useNodeMap } from '../../hooks/use-node-map'
import { NodeMapCardItem } from '../molecules/node-map-card-item'
import { NodeMapConnectDialog } from './node-map-connect-dialog'
import { ConnectNodePickerModal } from './connect-node-picker-modal'
import {
  useAssignNodeHome,
  useUpdateServerMachine,
} from '../../hooks/use-server-machines'

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
  viewMode: _viewMode = 'map',
  onViewModeChange: _onViewModeChange,
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
  onDeleteSamba: _onDeleteSamba,
  onEditHome,
  onDeleteHome,
  onEditServer,
  onDeleteServer,
  onDetectDrives,
  onOpenNodeSettings,
  onEditNode,
  onRenameNode,
  onPingNode,
  onEditSamba,
}: NodesTopologyCanvasProps) => {
  const { toast } = useToast()
  const assignHomeMutation = useAssignNodeHome()
  const updateServerMutation = useUpdateServerMachine()
  const updateGameServerMutation = useUpdateGameServer()

  const [connectPickerItem, setConnectPickerItem] = useState<NodeMapItem | null>(null)
  const [connectPrompt, setConnectPrompt] = useState<NodeMapConnectPrompt | null>(null)
  const [isConnectingPending, setIsConnectingPending] = useState(false)
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)

  const { items, edges } = useMemo(
    () => buildNodeMapGraph(homes, serverMachines, nodes, pendingNodes, customSambaShares, gameServers),
    [homes, serverMachines, nodes, pendingNodes, customSambaShares, gameServers],
  )

  // Execute connection between two nodes
  const executeConnection = async (
    source: NodeMapItem,
    target: NodeMapItem,
    type: 'home' | 'host' | 'smb',
  ) => {
    setIsConnectingPending(true)
    try {
      if (type === 'home') {
        const homeItem = source.type === 'home' ? source : target.type === 'home' ? target : null
        const otherItem = source.type === 'home' ? target : target.type === 'home' ? source : null

        if (homeItem && otherItem) {
          const homeId = Number(homeItem.entityId)
          if (otherItem.type === 'server') {
            await updateServerMutation.mutateAsync({ id: Number(otherItem.entityId), homeId })
            toast({
              title: 'Server Assigned',
              description: `"${otherItem.name}" assigned to home "${homeItem.name}".`,
            })
          } else if (otherItem.type === 'node') {
            await assignHomeMutation.mutateAsync({ nodeId: Number(otherItem.entityId), homeId })
            toast({
              title: 'Node Assigned',
              description: `"${otherItem.name}" assigned to home "${homeItem.name}".`,
            })
          }
        } else {
          // Both are nodes or servers: assign them to the default home (or first home)
          const defaultHome = homes.find((h) => h.isDefault) || homes[0]
          if (defaultHome) {
            if (source.type === 'node') await assignHomeMutation.mutateAsync({ nodeId: Number(source.entityId), homeId: defaultHome.id })
            if (source.type === 'server') await updateServerMutation.mutateAsync({ id: Number(source.entityId), homeId: defaultHome.id })
            if (target.type === 'node') await assignHomeMutation.mutateAsync({ nodeId: Number(target.entityId), homeId: defaultHome.id })
            if (target.type === 'server') await updateServerMutation.mutateAsync({ id: Number(target.entityId), homeId: defaultHome.id })
            toast({
              title: 'Linked via Home',
              description: `"${source.name}" and "${target.name}" linked under "${defaultHome.name}".`,
            })
          } else {
            toast({
              title: 'Home Environment Required',
              description: 'Create a Home Environment first to link peer instances together.',
              variant: 'destructive',
            })
          }
        }
      } else if (type === 'host') {
        const gameServerItem =
          source.type === 'game_server' ? source : target.type === 'game_server' ? target : null
        const serverItem =
          source.type === 'server' ? source : target.type === 'server' ? target : null
        const nodeItem =
          source.type === 'node' ? source : target.type === 'node' ? target : null

        if (gameServerItem && serverItem) {
          const gsId = Number(gameServerItem.entityId)
          const machineId = Number(serverItem.entityId)
          const machine = serverMachines.find((m) => m.id === machineId)
          const machineHost = machine?.ipAddress || machine?.host
          const existingGs = gameServers.find((s) => s.id === gsId)
          const shouldUpdateHost =
            machineHost &&
            (!existingGs?.host ||
              existingGs.host === 'localhost' ||
              existingGs.host === '127.0.0.1')

          await updateGameServerMutation.mutateAsync({
            id: gsId,
            payload: {
              serverMachineId: machineId,
              ...(shouldUpdateHost ? { host: machineHost } : {}),
            },
          })
          toast({
            title: 'Dedicated Game Server Hosted',
            description: `Game server "${gameServerItem.name}" is now hosted on "${serverItem.name}".`,
          })
        } else if (serverItem && nodeItem) {
          const serverId = Number(serverItem.entityId)
          const nodeId = Number(nodeItem.entityId)
          await updateServerMutation.mutateAsync({
            id: serverId,
            hostedNodeId: nodeId,
          })
          const parentServer = serverMachines.find((m) => m.id === serverId)
          toast({
            title: 'Hosted Node Configured',
            description: `Node "${nodeItem.name}" is now marked as running on "${serverItem.name}"${parentServer?.homeId ? ' and inherits its Home Environment.' : '.'}`,
          })
        }
      } else if (type === 'smb') {
        const sambaItem = source.type === 'samba' ? source : target.type === 'samba' ? target : null
        const serverItem = source.type === 'server' ? source : target.type === 'server' ? target : null
        const nodeItem = source.type === 'node' ? source : target.type === 'node' ? target : null

        if (sambaItem && serverItem) {
          const sambaConfig = (sambaItem.data as { samba: SambaShareConfig }).samba
          await updateServerMutation.mutateAsync({
            id: Number(serverItem.entityId),
            smbEnabled: true,
            smbShareName: sambaConfig.shareName || 'games',
            smbHost: sambaConfig.host || '',
            smbPort: sambaConfig.port || 445,
            smbUsername: sambaConfig.username || '',
            smbPassword: sambaConfig.password || '',
            smbWorkgroup: sambaConfig.workgroup || 'WORKGROUP',
            smbMountPath: sambaConfig.mountPath || '',
          })
          toast({
            title: 'Samba Share Connected',
            description: `Samba share "${sambaItem.name}" connected to server "${serverItem.name}".`,
          })
        } else if (sambaItem && nodeItem) {
          const sambaConfig = (sambaItem.data as { samba: SambaShareConfig }).samba
          const targetNodeId = Number(nodeItem.entityId)
          if (sambaConfig.serverId) {
            const server = serverMachines.find((m) => m.id === sambaConfig.serverId)
            const currentSmbNodes = server?.smbNodeIds || []
            const nextSmbNodes = Array.from(new Set([...currentSmbNodes, targetNodeId]))
            await updateServerMutation.mutateAsync({
              id: sambaConfig.serverId,
              smbNodeIds: nextSmbNodes,
              smbEnabled: true,
            })
          } else if (onSaveCustomSamba) {
            const currentNodes = sambaConfig.nodeIds || []
            const nextNodes = Array.from(new Set([...currentNodes, targetNodeId]))
            onSaveCustomSamba({ ...sambaConfig, nodeIds: nextNodes })
          }
          toast({
            title: 'Samba Share Linked',
            description: `Node "${nodeItem.name}" now connected to Samba share "${sambaItem.name}".`,
          })
        } else if (serverItem && nodeItem) {
          const server = (serverItem.data as { machine: UserServerMachine }).machine
          const currentSmbNodes = server.smbNodeIds || []
          const nextSmbNodes = Array.from(new Set([...currentSmbNodes, Number(nodeItem.entityId)]))

          await updateServerMutation.mutateAsync({
            id: Number(serverItem.entityId),
            smbNodeIds: nextSmbNodes,
            smbEnabled: true,
          })
          toast({
            title: 'SMB Connection Established',
            description: `Node "${nodeItem.name}" linked to SMB share on "${serverItem.name}".`,
          })
        }
      }
    } catch {
      toast({
        title: 'Connection Failed',
        description: 'Could not establish connection between nodes.',
        variant: 'destructive',
      })
    } finally {
      setIsConnectingPending(false)
    }
  }

  // Handle dragging a card and dropping it directly on another card to link
  const handleCardDropConnect = (source: NodeMapItem, target: NodeMapItem) => {
    const check = isCompatibleConnection(source, target)
    if (!check.compatible) {
      toast({
        title: 'Incompatible Connection',
        description: check.reason || 'These nodes cannot be linked directly.',
        variant: 'destructive',
      })
      return
    }

    if (check.connectionTypes.length === 1) {
      void executeConnection(source, target, check.connectionTypes[0])
      return
    }

    setConnectPrompt({
      source,
      target,
      allowedTypes: check.connectionTypes,
    })
  }

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
  } = useNodeMap({ items, edges, anchor, onCardDropConnect: handleCardDropConnect })

  const hubPos = positions[HUB_NODE_ID] || { x: anchor?.x ?? 300, y: anchor?.y ?? 100 }

  // Filter items matching search
  const filteredItemIds = useMemo(() => {
    if (!searchQuery.trim()) return null
    const q = searchQuery.toLowerCase().trim()
    return new Set(
      items
        .filter((item) => item.name.toLowerCase().includes(q) || item.type.includes(q))
        .map((i) => i.id),
    )
  }, [items, searchQuery])

  // Click on a node when in connection mode
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

    // If only one relationship type exists, connect immediately without prompting
    if (check.connectionTypes.length === 1) {
      void executeConnection(source, targetItem, check.connectionTypes[0])
      return
    }

    // Multiple possible relation types (e.g. host node vs smb client)
    setConnectPrompt({
      source,
      target: targetItem,
      allowedTypes: check.connectionTypes,
    })
  }

  // Execute connection from dialog prompt
  const handleExecuteConnect = async (type: 'home' | 'host' | 'smb') => {
    if (!connectPrompt) return
    const { source, target } = connectPrompt
    setConnectPrompt(null)
    await executeConnection(source, target, type)
  }

  // Disconnect Edge
  const handleDisconnectEdge = async (edge: NodeMapEdge) => {
    try {
      if (edge.relation === 'home_link') {
        if (edge.targetType === 'server') {
          const serverId = Number(edge.targetId.replace('server-', ''))
          await updateServerMutation.mutateAsync({ id: serverId, homeId: null })
          toast({ title: 'Unlinked from Home' })
        } else if (edge.targetType === 'node') {
          const nodeId = Number(edge.targetId.replace('node-', ''))
          await assignHomeMutation.mutateAsync({ nodeId, homeId: null })
          toast({ title: 'Unlinked from Home' })
        }
      } else if (edge.relation === 'hosted_link') {
        const serverId = Number(edge.sourceId.replace('server-', ''))
        await updateServerMutation.mutateAsync({ id: serverId, hostedNodeId: null })
        toast({ title: 'Host Node Link Removed' })
      } else if (edge.relation === 'samba_server_link') {
        const serverId = Number(edge.sourceId.replace('server-', ''))
        await updateServerMutation.mutateAsync({ id: serverId, smbEnabled: false })
        toast({ title: 'Samba Share Disconnected' })
      } else if (edge.relation === 'smb_link') {
        const nodeId = Number(edge.targetId.replace('node-', ''))
        if (edge.sourceId.startsWith('samba-server-')) {
          const serverId = Number(edge.sourceId.replace('samba-server-', ''))
          const machine = serverMachines.find((m) => m.id === serverId)
          if (machine) {
            const filtered = (machine.smbNodeIds || []).filter((id) => id !== nodeId)
            await updateServerMutation.mutateAsync({ id: serverId, smbNodeIds: filtered })
            toast({ title: 'SMB Link Removed' })
          }
        } else if (edge.sourceId.startsWith('server-')) {
          const serverId = Number(edge.sourceId.replace('server-', ''))
          const machine = serverMachines.find((m) => m.id === serverId)
          if (machine) {
            const filtered = (machine.smbNodeIds || []).filter((id) => id !== nodeId)
            await updateServerMutation.mutateAsync({ id: serverId, smbNodeIds: filtered })
            toast({ title: 'SMB Link Removed' })
          }
        } else {
          // Custom standalone Samba share
          const samba = customSambaShares.find((s) => s.id === edge.sourceId)
          if (samba && onSaveCustomSamba) {
            const nextNodeIds = (samba.nodeIds || []).filter((id) => id !== nodeId)
            onSaveCustomSamba({ ...samba, nodeIds: nextNodeIds })
            toast({ title: 'SMB Link Removed' })
          }
        }
      }
    } catch {
      toast({ title: 'Disconnect failed', variant: 'destructive' })
    }
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
        {/* SVG Connectors Layer */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ overflow: 'visible' }}
        >
          <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
            {edges.map((edge) => {
              const sourcePos = positions[edge.sourceId]
              const targetPos = positions[edge.targetId]
              if (!sourcePos || !targetPos) return null

              const sourceWidth = getNodeCardWidth(edge.sourceType)
              const sourceHeight = getNodeCardHeight(edge.sourceType)
              const targetWidth = getNodeCardWidth(edge.targetType)
              const targetHeight = getNodeCardHeight(edge.targetType)

              const anchor1 = getNodeCardBorderAnchor(sourcePos, targetPos, true, sourceWidth, sourceHeight, targetWidth, targetHeight)
              const anchor2 = getNodeCardBorderAnchor(targetPos, sourcePos, true, targetWidth, targetHeight, sourceWidth, sourceHeight)

              const { path: pathData, mid, p1, p2 } = generateSmartNodeConnectionPath(
                anchor1.point,
                anchor1.side,
                anchor2.point,
                anchor2.side,
              )
              const isHovered = hoveredEdgeId === edge.id

              return (
                <g key={edge.id} className="transition-all duration-200">
                  {/* Subtle wide hit-area path */}
                  <path
                    d={pathData}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={20}
                    className="pointer-events-auto cursor-pointer"
                    onMouseEnter={() => setHoveredEdgeId(edge.id)}
                    onMouseLeave={() => setHoveredEdgeId(null)}
                  />

                  {/* Visual Line */}
                  <path
                    d={pathData}
                    fill="none"
                    stroke={
                      edge.relation === 'hosted_link' || edge.relation === 'game_server_link'
                        ? 'var(--primary)'
                        : edge.relation === 'smb_link'
                          ? 'var(--primary)'
                          : 'rgba(255, 255, 255, 0.3)'
                    }
                    strokeWidth={edge.relation === 'hosted_link' || edge.relation === 'game_server_link' ? 2.5 : isHovered ? 2.5 : 1.5}
                    strokeDasharray={edge.relation === 'smb_link' ? '6 4' : undefined}
                    opacity={isHovered ? 1 : 0.65}
                  />

                  {/* Connection terminal pins on card borders */}
                  <circle
                    cx={p1.x}
                    cy={p1.y}
                    r={2.5}
                    fill={
                      edge.relation === 'hosted_link' || edge.relation === 'smb_link' || edge.relation === 'game_server_link'
                        ? 'var(--primary)'
                        : 'rgba(255, 255, 255, 0.5)'
                    }
                  />
                  <circle
                    cx={p2.x}
                    cy={p2.y}
                    r={2.5}
                    fill={
                      edge.relation === 'hosted_link' || edge.relation === 'smb_link' || edge.relation === 'game_server_link'
                        ? 'var(--primary)'
                        : 'rgba(255, 255, 255, 0.5)'
                    }
                  />

                  {/* Midpoint Label & Unlink Button */}
                  <foreignObject
                    x={mid.x - 60}
                    y={mid.y - 14}
                    width={120}
                    height={28}
                    className="pointer-events-auto"
                    onMouseEnter={() => setHoveredEdgeId(edge.id)}
                    onMouseLeave={() => setHoveredEdgeId(null)}
                  >
                    <div className="flex items-center justify-center h-full">
                      <div
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium backdrop-blur-md transition-all shadow-md ${
                          isHovered
                            ? 'bg-destructive text-destructive-foreground cursor-pointer'
                            : 'bg-[var(--dk-surface-overlay)] text-foreground border border-[var(--dk-separator)]'
                        }`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDisconnectEdge(edge)
                        }}
                        title={isHovered ? 'Click to disconnect' : edge.label}
                      >
                        {isHovered ? (
                          <>
                            <X size={10} />
                            <span>Unlink</span>
                          </>
                        ) : (
                          <>
                            {edge.relation === 'hosted_link' && <Cpu size={9} className="text-primary" />}
                            {edge.relation === 'smb_link' && <Network size={9} className="text-primary" />}
                            {edge.relation === 'home_link' && <HomeIcon size={9} className="text-primary" />}
                            <span className="truncate max-w-[80px]">{edge.label}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </foreignObject>
                </g>
              )
            })}

            {/* Dynamic line while user is dragging connection */}
            {connectingFrom && connectingMousePos && (() => {
              const sourcePos = positions[connectingFrom.id] || { x: 0, y: 0 }
              const sourceWidth = getNodeCardWidth(connectingFrom.type)
              const sourceHeight = getNodeCardHeight(connectingFrom.type)
              const anchor1 = getNodeCardBorderAnchor(sourcePos, connectingMousePos, false, sourceWidth, sourceHeight)
              const dist = Math.hypot(connectingMousePos.x - anchor1.point.x, connectingMousePos.y - anchor1.point.y)
              const d = Math.min(Math.max(dist * 0.45, 30), 120)
              const n1 = SIDE_NORMALS[anchor1.side]
              const cp1 = { x: anchor1.point.x + n1.x * d, y: anchor1.point.y + n1.y * d }
              const path = `M ${anchor1.point.x} ${anchor1.point.y} Q ${cp1.x} ${cp1.y} ${connectingMousePos.x} ${connectingMousePos.y}`

              return (
                <g>
                  <path
                    d={path}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    className="animate-pulse"
                  />
                  <circle
                    cx={anchor1.point.x}
                    cy={anchor1.point.y}
                    r={3}
                    fill="var(--primary)"
                  />
                </g>
              )
            })()}
          </g>
        </svg>

        {/* HTML Nodes Layer */}
        <div
          style={{
            transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
            transformOrigin: '0 0',
          }}
          className="absolute inset-0 pointer-events-none"
        >
          {/* Central Hub Node (Title Bar Node) acting as an interactive canvas node */}
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
            const isMatch = filteredItemIds ? filteredItemIds.has(item.id) : true
            const isDropTarget = hoveredDropTargetId === item.id
            const isCompatible = connectingFrom && connectingFrom.id !== item.id
              ? isCompatibleConnection(connectingFrom, item).compatible
              : false
            const isTargetCandidate = isDropTarget || Boolean(connectingFrom && connectingFrom.id !== item.id && isCompatible)
            const isConnectingDimmed = !hoveredDropTargetId && Boolean(connectingFrom && connectingFrom.id !== item.id && !isCompatible)

            return (
              <div
                key={item.id}
                className={`pointer-events-auto transition-opacity duration-200 ${
                  isMatch ? 'opacity-100' : 'opacity-25'
                }`}
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
        </div>

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

      {/* Connecting Mode Banner */}
      {connectingFrom && (
        <div className="absolute top-44 left-1/2 -translate-x-1/2 z-30 pointer-events-auto p-3 rounded-2xl bg-primary/15 border border-primary/30 backdrop-blur-2xl flex items-center justify-between gap-3 text-xs shadow-xl animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary animate-ping" />
            <span className="font-semibold text-foreground">
              Connecting from &quot;{connectingFrom.name}&quot;
            </span>
            <span className="text-muted-foreground hidden sm:inline">
              — Click on a node to connect, or right-click / Esc to cancel.
            </span>
          </div>
          <button
            type="button"
            onClick={handleCancelConnecting}
            className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-lg bg-[var(--dk-surface-field)] hover:bg-[var(--dk-surface-hover)] border border-[var(--dk-separator)] text-foreground transition-colors"
          >
            <X size={12} />
            <span>Cancel</span>
          </button>
        </div>
      )}


      {/* Floating HUD in bottom-right corner for Canvas Navigation Controls */}
      <div
        className="absolute bottom-6 right-6 z-20 pointer-events-auto flex items-center gap-1 p-1.5 rounded-2xl bg-[var(--dk-surface-overlay)] backdrop-blur-2xl border border-[var(--dk-separator)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DkButton
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleAutoLayout}
          title="Auto arrange layout"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
        >
          <RotateCcw size={13} />
        </DkButton>

        <DkButton
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => fitView()}
          title="Fit to screen"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
        >
          <Maximize2 size={13} />
        </DkButton>

        <div className="h-3.5 w-px bg-[var(--dk-separator)] mx-0.5" />

        <DkButton
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => zoomOut()}
          title="Zoom out"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
        >
          <ZoomOut size={13} />
        </DkButton>

        <button
          type="button"
          onClick={resetView}
          title="Reset zoom to 100%"
          className="text-[11px] font-mono text-muted-foreground hover:text-foreground min-w-[36px] text-center select-none cursor-pointer"
        >
          {Math.round(viewport.zoom * 100)}%
        </button>

        <DkButton
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => zoomIn()}
          title="Zoom in"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
        >
          <ZoomIn size={13} />
        </DkButton>
      </div>

      {/* Connection Selection / Confirmation Dialog */}
      <NodeMapConnectDialog
        prompt={connectPrompt}
        onClose={() => setConnectPrompt(null)}
        onConnect={handleExecuteConnect}
        isPending={isConnectingPending}
      />

      {/* 1-Click Connect Node Picker Modal */}
      <ConnectNodePickerModal
        open={Boolean(connectPickerItem)}
        onOpenChange={(open) => !open && setConnectPickerItem(null)}
        sourceItem={connectPickerItem}
        allItems={items}
        edges={edges}
        onConnect={(source, target, type) => executeConnection(source, target, type)}
        onDisconnect={handleDisconnectEdge}
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
