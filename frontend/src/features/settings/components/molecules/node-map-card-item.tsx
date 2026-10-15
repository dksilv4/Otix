import {
  Server,
  HardDrive,
  Network,
  Home as HomeIcon,
  Cpu,
  Pencil,
  Plus,
  Trash2,
  ExternalLink,
  GripHorizontal,
  RefreshCw,
  Activity,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { DkButton } from '@ui/atoms/button'
import { formatBytes, cn } from '@/lib/utils'
import type { NodeMapItem } from '../../types/node-map'
import { getOSLabel } from '../../utils/server-machines'
import { NODE_CARD_WIDTH } from '../../utils/node-map'
import { nodeSettingsNavigateOptions } from '../../node-settings'
import { isLocalDesktopNode } from '../../local-desktop-node'

interface NodeMapCardItemProps {
  item: NodeMapItem
  position: { x: number; y: number }
  isSelected: boolean
  isConnectingSource: boolean
  isConnectingTargetCandidate: boolean
  onSelect: (item: NodeMapItem) => void
  onDragStart: (e: React.PointerEvent, id: string) => void
  onStartConnecting: (e: React.MouseEvent | React.PointerEvent, item: NodeMapItem) => void
  onConnectTarget?: (item: NodeMapItem) => void
  onEditHome?: (home: any) => void
  onDeleteHome?: (home: any) => void
  onEditServer?: (server: any) => void
  onDeleteServer?: (server: any) => void
  onDetectDrives?: (server: any) => void
  onOpenNodeSettings?: (server: any) => void
  onRenameNode?: (server: any) => void
}

export const NodeMapCardItem = ({
  item,
  position,
  isSelected,
  isConnectingSource,
  isConnectingTargetCandidate,
  onSelect,
  onDragStart,
  onStartConnecting,
  onConnectTarget,
  onEditHome,
  onDeleteHome,
  onEditServer,
  onDeleteServer,
  onDetectDrives,
  onOpenNodeSettings,
  onRenameNode,
}: NodeMapCardItemProps) => {
  const { type, name, data } = item

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isConnectingTargetCandidate && onConnectTarget) {
      onConnectTarget(item)
    } else {
      onSelect(item)
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isConnectingTargetCandidate && onConnectTarget) {
      e.stopPropagation()
      onConnectTarget(item)
    }
  }

  return (
    <div
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        width: `${NODE_CARD_WIDTH}px`,
      }}
      onClick={handleClick}
      onPointerUp={handlePointerUp}
      className={cn(
        'absolute select-none rounded-2xl backdrop-blur-xl transition-shadow duration-150',
        'bg-white/[0.04] border border-white/[0.06] shadow-xl',
        isSelected && 'ring-2 ring-primary/60 border-primary/40 shadow-primary/10',
        isConnectingSource && 'ring-2 ring-primary border-primary animate-pulse',
        isConnectingTargetCandidate && 'ring-2 ring-primary/60 border-primary/60 shadow-lg shadow-primary/20 cursor-pointer animate-in fade-in',
      )}
    >
      {/* Target Connector Port (Left Edge) - Active during connecting mode */}
      {isConnectingTargetCandidate && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onConnectTarget?.(item)
          }}
          title={`Connect to ${name}`}
          className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg ring-4 ring-primary/20 hover:scale-125 transition-transform z-20 cursor-pointer"
        >
          <Plus size={13} className="stroke-[3]" />
        </button>
      )}

      {/* Source Connector Port (Right Edge) - Convenient handle to initiate connection */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onStartConnecting(e, item)
        }}
        title="Drag or click to connect to another node"
        className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/[0.08] hover:bg-primary border border-white/[0.1] hover:border-primary text-white/50 hover:text-primary-foreground flex items-center justify-center transition-all z-10 cursor-crosshair opacity-0 group-hover:opacity-100 hover:opacity-100 focus:opacity-100"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
      </button>

      {/* Top Drag Handle Bar */}
      <div
        onPointerDown={(e) => onDragStart(e, item.id)}
        className="flex items-center justify-between px-3.5 pt-2.5 pb-1.5 cursor-grab active:cursor-grabbing border-b border-white/[0.04] group/drag"
      >
        <div className="flex items-center gap-2">
          <GripHorizontal size={14} className="text-muted-foreground/60 group-hover/drag:text-foreground transition-colors" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {type === 'home' ? 'Home Environment' : type === 'server' ? 'Server Machine' : 'Worker Node'}
          </span>
        </div>

        {/* Quick Connect Trigger Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onStartConnecting(e, item)
          }}
          title="Connect to another node"
          className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/[0.04] hover:bg-primary/20 text-muted-foreground hover:text-primary transition-all"
        >
          <Plus size={11} />
          <span>Connect</span>
        </button>
      </div>

      {/* Main Card Content */}
      <div className="p-4 space-y-3">
        {/* Header: Icon, Name, Subtitle */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/10">
              {type === 'home' && <HomeIcon size={18} />}
              {type === 'server' && <Server size={18} />}
              {type === 'node' && <Cpu size={18} />}
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-foreground truncate" title={name}>
                {name}
              </h4>
              <p className="text-[11px] text-muted-foreground truncate">
                {type === 'home' && (data.home.subnetCidr ? `Subnet ${data.home.subnetCidr}` : 'Homelab Environment')}
                {type === 'server' && (data.machine.ipAddress || data.machine.hostname || getOSLabel(data.machine.os))}
                {type === 'node' && (isLocalDesktopNode(data.server) ? 'This computer' : data.server.primaryUrl || 'Local Node')}
              </p>
            </div>
          </div>

          {/* Type-specific Status / Badge */}
          {type === 'home' && data.home.isDefault && (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold uppercase tracking-wider shrink-0">
              Default
            </span>
          )}

          {type === 'server' && (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/[0.06] text-foreground font-semibold uppercase tracking-wider shrink-0">
              {getOSLabel(data.machine.os)}
            </span>
          )}

          {type === 'node' && (
            <div className="flex items-center gap-1 shrink-0">
              {isLocalDesktopNode(data.server) && (
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold uppercase tracking-wider">
                  Otix app
                </span>
              )}
              <span
                className={cn(
                  'text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider',
                  data.server.isOnline ? 'bg-primary/20 text-primary' : 'bg-white/[0.04] text-muted-foreground',
                )}
              >
                {data.server.isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
          )}
        </div>

        {/* Body per entity type */}
        {type === 'home' && (
          <div className="space-y-2 pt-1 text-xs text-muted-foreground">
            <div className="flex items-center justify-between text-[11px] p-2 rounded-xl bg-white/[0.02]">
              <span className="flex items-center gap-1.5">
                <HardDrive size={12} className="text-primary" />
                <span>Servers: {data.home.serverMachinesCount ?? 0}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Cpu size={12} className="text-primary" />
                <span>Nodes: {data.home.nodesCount ?? 0}</span>
              </span>
            </div>
            {data.home.description && (
              <p className="text-[11px] line-clamp-1 italic">{data.home.description}</p>
            )}
          </div>
        )}

        {type === 'server' && (
          <div className="space-y-2 pt-1">
            {/* Storage bar */}
            {data.machine.totalCapacityBytes ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Storage</span>
                  <span className="font-mono">
                    {formatBytes(data.machine.usedCapacityBytes || 0)} / {formatBytes(data.machine.totalCapacityBytes)}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(((data.machine.usedCapacityBytes || 0) / data.machine.totalCapacityBytes) * 100),
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}

            {/* Status indicators */}
            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
              {data.machine.hostedNodeName ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15 text-primary font-medium">
                  <Cpu size={10} />
                  <span>Hosted Node: {data.machine.hostedNodeName}</span>
                </span>
              ) : null}

              {data.machine.smbEnabled ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] text-foreground/80">
                  <Network size={10} className="text-primary" />
                  <span>SMB /{data.machine.smbShareName || 'share'}</span>
                </span>
              ) : null}
            </div>
          </div>
        )}

        {type === 'node' && (
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
              {item.homeName && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15 text-primary font-medium">
                  <HomeIcon size={10} />
                  <span>{item.homeName}</span>
                </span>
              )}
              {data.server.isOnline && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] text-foreground/80">
                  <Activity size={10} className="text-primary" />
                  <span>Ready</span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Card Action Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-white/[0.04] text-xs">
          {type === 'home' && (
            <>
              <div className="flex items-center gap-1">
                <DkButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEditHome?.(data.home)
                  }}
                  className="h-7 px-2 text-[11px] gap-1"
                >
                  <Pencil size={11} />
                  <span>Edit</span>
                </DkButton>
              </div>
              {!data.home.isDefault && (
                <DkButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteHome?.(data.home)
                  }}
                  className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive gap-1"
                >
                  <Trash2 size={11} />
                </DkButton>
              )}
            </>
          )}

          {type === 'server' && (
            <>
              <div className="flex items-center gap-1">
                <DkButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEditServer?.(data.machine)
                  }}
                  className="h-7 px-2 text-[11px] gap-1"
                >
                  <Pencil size={11} />
                  <span>Edit</span>
                </DkButton>
                <DkButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDetectDrives?.(data.machine)
                  }}
                  title="Detect drives"
                  className="h-7 px-2 text-[11px] gap-1"
                >
                  <RefreshCw size={11} />
                  <span>Drives</span>
                </DkButton>
              </div>
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteServer?.(data.machine)
                }}
                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive gap-1"
              >
                <Trash2 size={11} />
              </DkButton>
            </>
          )}

          {type === 'node' && (
            <>
              <div className="flex items-center gap-1">
                <Link
                  {...nodeSettingsNavigateOptions(data.server.id)}
                  aria-label={`Open ${data.server.name}`}
                  className="sr-only"
                >
                  Open {data.server.name}
                </Link>
                <DkButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenNodeSettings?.(data.server)
                  }}
                  className="h-7 px-2.5 text-[11px] gap-1 font-semibold"
                >
                  <ExternalLink size={11} />
                  <span>Open</span>
                </DkButton>
                <DkButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Rename ${data.server.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRenameNode?.(data.server)
                  }}
                  className="h-7 px-2 text-[11px] gap-1"
                >
                  <Pencil size={11} />
                  <span>Rename</span>
                </DkButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
