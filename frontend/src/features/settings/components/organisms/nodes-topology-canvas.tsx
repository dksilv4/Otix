import { useState, useMemo } from 'react'
import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Server,
  Home as HomeIcon,
  Cpu,
  X,
  Network,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { useToast } from '@ui/molecules/toast'
import type { GameServer } from '@/features/downloads/types'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import type { UserHome, UserServerMachine } from '../../types/server-machines'
import type {
  NodeMapConnectPrompt,
  NodeMapEdge,
  NodeMapItem,
} from '../../types/node-map'
import {
  buildNodeMapGraph,
  generateSmoothBezierPath,
  getEdgeCenterPoint,
  isCompatibleConnection,
  NODE_CARD_WIDTH,
  NODE_CARD_HEIGHT,
} from '../../utils/node-map'
import { useNodeMap } from '../../hooks/use-node-map'
import { NodeMapCardItem } from '../molecules/node-map-card-item'
import { NodeMapConnectDialog } from './node-map-connect-dialog'
import {
  useAssignNodeHome,
  useUpdateServerMachine,
} from '../../hooks/use-server-machines'

interface NodesTopologyCanvasProps {
  homes: UserHome[]
  serverMachines: UserServerMachine[]
  nodes: GameServer[]
  pendingNodes?: PendingNode[]
  anchor?: { x: number; y: number }
  viewMode?: 'map' | 'cards'
  onViewModeChange?: (mode: 'map' | 'cards') => void
  onOpenDownloadModal?: () => void
  onClaimPendingNode?: (pending: PendingNode) => void
  onAddHome: () => void
  onAddServer: () => void
  onAddNode: () => void
  onEditHome: (home: UserHome) => void
  onDeleteHome: (home: UserHome) => void
  onEditServer: (server: UserServerMachine) => void
  onDeleteServer: (server: UserServerMachine) => void
  onDetectDrives: (server: UserServerMachine) => void
  onOpenNodeSettings: (server: GameServer) => void
  onRenameNode: (server: GameServer) => void
}

export const NodesTopologyCanvas = ({
  homes,
  serverMachines,
  nodes,
  pendingNodes: _pendingNodes = [],
  anchor,
  viewMode: _viewMode = 'map',
  onViewModeChange: _onViewModeChange,
  onOpenDownloadModal: _onOpenDownloadModal,
  onClaimPendingNode: _onClaimPendingNode,
  onAddHome,
  onAddServer: _onAddServer,
  onAddNode,
  onEditHome,
  onDeleteHome,
  onEditServer,
  onDeleteServer,
  onDetectDrives,
  onOpenNodeSettings,
  onRenameNode,
}: NodesTopologyCanvasProps) => {
  const { toast } = useToast()
  const assignHomeMutation = useAssignNodeHome()
  const updateServerMutation = useUpdateServerMachine()

  const { items, edges } = useMemo(
    () => buildNodeMapGraph(homes, serverMachines, nodes),
    [homes, serverMachines, nodes],
  )

  const {
    positions,
    viewport,
    selectedItem,
    setSelectedItem,
    searchQuery,
    connectingFrom,
    connectingMousePos,
    handleAutoLayout,
    zoomIn,
    zoomOut,
    resetView,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
    handleNodeDragStart,
    handleStartConnecting,
    handleCancelConnecting,
    handleWheel,
  } = useNodeMap({ items, edges, anchor })

  const [connectPrompt, setConnectPrompt] = useState<NodeMapConnectPrompt | null>(null)
  const [isConnectingPending, setIsConnectingPending] = useState(false)
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)

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

    // Open connection confirmation / choice dialog
    setConnectPrompt({
      source: connectingFrom,
      target: targetItem,
      allowedTypes: check.connectionTypes,
    })
    handleCancelConnecting()
  }

  // Execute connection
  const handleExecuteConnect = async (type: 'home' | 'host' | 'smb') => {
    if (!connectPrompt) return
    setIsConnectingPending(true)
    const { source, target } = connectPrompt

    try {
      if (type === 'home') {
        const homeItem = source.type === 'home' ? source : target.type === 'home' ? target : null
        const otherItem = source.type === 'home' ? target : target.type === 'home' ? source : null

        if (homeItem && otherItem) {
          const homeId = homeItem.entityId
          if (otherItem.type === 'server') {
            await updateServerMutation.mutateAsync({ id: otherItem.entityId, homeId })
            toast({
              title: 'Server Assigned',
              description: `"${otherItem.name}" assigned to home "${homeItem.name}".`,
            })
          } else if (otherItem.type === 'node') {
            await assignHomeMutation.mutateAsync({ nodeId: otherItem.entityId, homeId })
            toast({
              title: 'Node Assigned',
              description: `"${otherItem.name}" assigned to home "${homeItem.name}".`,
            })
          }
        } else {
          // Both are nodes or servers: assign them to the default home (or first home)
          const defaultHome = homes.find((h) => h.isDefault) || homes[0]
          if (defaultHome) {
            if (source.type === 'node') await assignHomeMutation.mutateAsync({ nodeId: source.entityId, homeId: defaultHome.id })
            if (source.type === 'server') await updateServerMutation.mutateAsync({ id: source.entityId, homeId: defaultHome.id })
            if (target.type === 'node') await assignHomeMutation.mutateAsync({ nodeId: target.entityId, homeId: defaultHome.id })
            if (target.type === 'server') await updateServerMutation.mutateAsync({ id: target.entityId, homeId: defaultHome.id })
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
        const serverItem = source.type === 'server' ? source : target
        const nodeItem = source.type === 'node' ? source : target
        await updateServerMutation.mutateAsync({
          id: serverItem.entityId,
          hostedNodeId: nodeItem.entityId,
        })
        toast({
          title: 'Hosted Node Configured',
          description: `Node "${nodeItem.name}" is now marked as running on "${serverItem.name}".`,
        })
      } else if (type === 'smb') {
        const serverItem = source.type === 'server' ? source : target
        const nodeItem = source.type === 'node' ? source : target
        const server = (serverItem.data as { machine: UserServerMachine }).machine
        const currentSmbNodes = server.smbNodeIds || []
        const nextSmbNodes = Array.from(new Set([...currentSmbNodes, nodeItem.entityId]))

        await updateServerMutation.mutateAsync({
          id: serverItem.entityId,
          smbNodeIds: nextSmbNodes,
          smbEnabled: true,
        })
        toast({
          title: 'SMB Connection Established',
          description: `Node "${nodeItem.name}" linked to SMB share on "${serverItem.name}".`,
        })
      }
      setConnectPrompt(null)
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
      } else if (edge.relation === 'smb_link') {
        const serverId = Number(edge.sourceId.replace('server-', ''))
        const nodeId = Number(edge.targetId.replace('node-', ''))
        const machine = serverMachines.find((m) => m.id === serverId)
        if (machine) {
          const filtered = (machine.smbNodeIds || []).filter((id) => id !== nodeId)
          await updateServerMutation.mutateAsync({ id: serverId, smbNodeIds: filtered })
          toast({ title: 'SMB Link Removed' })
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

              const p1 = {
                x: sourcePos.x + NODE_CARD_WIDTH,
                y: sourcePos.y + NODE_CARD_HEIGHT / 2,
              }
              const p2 = {
                x: targetPos.x,
                y: targetPos.y + NODE_CARD_HEIGHT / 2,
              }

              const pathData = generateSmoothBezierPath(p1, p2)
              const mid = getEdgeCenterPoint(p1, p2)
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
                      edge.relation === 'hosted_link'
                        ? 'var(--primary)'
                        : edge.relation === 'smb_link'
                          ? 'var(--primary)'
                          : 'rgba(255, 255, 255, 0.3)'
                    }
                    strokeWidth={edge.relation === 'hosted_link' ? 2.5 : isHovered ? 2.5 : 1.5}
                    strokeDasharray={edge.relation === 'smb_link' ? '6 4' : undefined}
                    opacity={isHovered ? 1 : 0.65}
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
                            : 'bg-[#181a20]/90 text-foreground/80 border border-white/[0.08]'
                        }`}
                        onClick={() => handleDisconnectEdge(edge)}
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
            {connectingFrom && connectingMousePos && (
              <path
                d={generateSmoothBezierPath(
                  {
                    x: (positions[connectingFrom.id]?.x || 0) + NODE_CARD_WIDTH,
                    y: (positions[connectingFrom.id]?.y || 0) + NODE_CARD_HEIGHT / 2,
                  },
                  connectingMousePos,
                )}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={2}
                strokeDasharray="4 4"
                className="animate-pulse"
              />
            )}
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
          {items.map((item) => {
            const pos = positions[item.id] || { x: 80, y: 80 }
            const isMatch = filteredItemIds ? filteredItemIds.has(item.id) : true

            return (
              <div
                key={item.id}
                className={`pointer-events-auto transition-opacity duration-200 ${
                  isMatch ? 'opacity-100' : 'opacity-25'
                }`}
                onClick={() => {
                  if (connectingFrom && connectingFrom.id !== item.id) {
                    handleNodeClickInConnectMode(item)
                  }
                }}
              >
                <NodeMapCardItem
                  item={item}
                  position={pos}
                  isSelected={selectedItem?.id === item.id}
                  isConnectingSource={connectingFrom?.id === item.id}
                  isConnectingTargetCandidate={
                    Boolean(connectingFrom && connectingFrom.id !== item.id)
                  }
                  onSelect={setSelectedItem}
                  onDragStart={handleNodeDragStart}
                  onStartConnecting={handleStartConnecting}
                  onConnectTarget={handleNodeClickInConnectMode}
                  onEditHome={onEditHome}
                  onDeleteHome={onDeleteHome}
                  onEditServer={onEditServer}
                  onDeleteServer={onDeleteServer}
                  onDetectDrives={onDetectDrives}
                  onOpenNodeSettings={onOpenNodeSettings}
                  onRenameNode={onRenameNode}
                />
              </div>
            )
          })}
        </div>

        {/* Empty State when no nodes exist */}
        {items.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-3 pointer-events-none pl-20 sm:pl-72 lg:pl-80">
            <div className="h-14 w-14 rounded-2xl bg-white/[0.04] flex items-center justify-center text-muted-foreground">
              <Server size={28} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">No nodes or servers in map</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Add your home environment, worker node, or homelab server machine to build your topology.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1 pointer-events-auto">
              <DkButton type="button" size="sm" variant="secondary" onClick={onAddHome}>
                Add Home
              </DkButton>
              <DkButton type="button" size="sm" variant="primary" onClick={onAddNode}>
                Connect Node
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
              — Click on another node in the map to establish a connection.
            </span>
          </div>
          <button
            type="button"
            onClick={handleCancelConnecting}
            className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-foreground transition-colors"
          >
            <X size={12} />
            <span>Cancel</span>
          </button>
        </div>
      )}

      {/* Floating HUD in bottom-right corner for Canvas Navigation Controls */}
      <div className="absolute bottom-6 right-6 z-20 pointer-events-auto flex items-center gap-1 p-1.5 rounded-2xl bg-black/60 backdrop-blur-2xl border border-white/[0.06] shadow-2xl">
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

        <div className="h-3.5 w-px bg-white/10 mx-0.5" />

        <DkButton
          type="button"
          size="sm"
          variant="ghost"
          onClick={zoomOut}
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
          onClick={zoomIn}
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
    </div>
  )
}
