import {
  getNodeCardBorderAnchor,
  getNodeCardWidth,
  getNodeCardHeight,
  generateSmartNodeConnectionPath,
  SIDE_NORMALS,
} from '../../../utils/node-map'
import type { NodeMapEdge, NodeMapItem } from '../../../types/node-map'
import { Cpu, Home as HomeIcon, Network, X } from 'lucide-react'

export interface TopologySvgLayerProps {
  viewport: { x: number; y: number; zoom: number }
  edges: NodeMapEdge[]
  positions: Record<string, { x: number; y: number }>
  matchingItemIds: Set<string>
  hoveredEdgeId: string | null
  setHoveredEdgeId: (id: string | null) => void
  onDisconnectEdge: (edge: NodeMapEdge) => void
  connectingFrom: NodeMapItem | null
  connectingMousePos: { x: number; y: number } | null
}

export const TopologySvgLayer = ({
  viewport,
  edges,
  positions,
  matchingItemIds,
  hoveredEdgeId,
  setHoveredEdgeId,
  onDisconnectEdge,
  connectingFrom,
  connectingMousePos,
}: TopologySvgLayerProps) => {
  return (
    <svg
      aria-hidden="true"
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

          const anchor1 = getNodeCardBorderAnchor(
            sourcePos,
            targetPos,
            true,
            sourceWidth,
            sourceHeight,
            targetWidth,
            targetHeight,
          )
          const anchor2 = getNodeCardBorderAnchor(
            targetPos,
            sourcePos,
            true,
            targetWidth,
            targetHeight,
            sourceWidth,
            sourceHeight,
          )

          const { path: pathData, mid, p1, p2 } = generateSmartNodeConnectionPath(
            anchor1.point,
            anchor1.side,
            anchor2.point,
            anchor2.side,
          )
          const isHovered = hoveredEdgeId === edge.id
          const isSourceMatch = matchingItemIds.has(edge.sourceId)
          const isTargetMatch = matchingItemIds.has(edge.targetId)
          const isEdgeMatch = isSourceMatch && isTargetMatch

          return (
            <g key={edge.id} className="transition-colors duration-200">
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
                strokeWidth={
                  edge.relation === 'hosted_link' || edge.relation === 'game_server_link'
                    ? 2.5
                    : isHovered
                      ? 2.5
                      : 1.5
                }
                strokeDasharray={edge.relation === 'smb_link' ? '6 4' : undefined}
                opacity={isHovered ? 1 : isEdgeMatch ? 0.65 : 0.12}
              />

              {/* Connection terminal pins on card borders */}
              <circle
                cx={p1.x}
                cy={p1.y}
                r={2.5}
                fill={
                  edge.relation === 'hosted_link' ||
                  edge.relation === 'smb_link' ||
                  edge.relation === 'game_server_link'
                    ? 'var(--primary)'
                    : 'rgba(255, 255, 255, 0.5)'
                }
                opacity={isEdgeMatch ? 1 : 0.15}
              />
              <circle
                cx={p2.x}
                cy={p2.y}
                r={2.5}
                fill={
                  edge.relation === 'hosted_link' ||
                  edge.relation === 'smb_link' ||
                  edge.relation === 'game_server_link'
                    ? 'var(--primary)'
                    : 'rgba(255, 255, 255, 0.5)'
                }
                opacity={isEdgeMatch ? 1 : 0.15}
              />

              {/* Midpoint Label & Unlink Button */}
              <foreignObject
                x={mid.x - 60}
                y={mid.y - 14}
                width={120}
                height={28}
                className="pointer-events-auto transition-opacity duration-200"
                style={{ opacity: isHovered ? 1 : isEdgeMatch ? 1 : 0.2 }}
                onMouseEnter={() => setHoveredEdgeId(edge.id)}
                onMouseLeave={() => setHoveredEdgeId(null)}
              >
                <div className="flex items-center justify-center h-full">
                  <div
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium backdrop-blur-md transition shadow-md ${
                      isHovered
                        ? 'bg-destructive text-destructive-foreground cursor-pointer'
                        : 'bg-[var(--dk-surface-overlay)] text-foreground border border-[var(--dk-separator)]'
                    }`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      onDisconnectEdge(edge)
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
  )
}
