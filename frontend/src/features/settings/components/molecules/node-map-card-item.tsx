import {
  Server,
  Home as HomeIcon,
  Cpu,
  Sparkles,
  FolderTree,
  Gamepad2,
  Copy,
  Link as LinkIcon,
  ExternalLink,
  Pencil,
  RefreshCw,
  Trash2,
  Radio,
  KeyRound,
  Plus,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { cn } from '@/lib/utils'
import type { NodeMapItem, SambaShareConfig } from '../../types/node-map'
import type { GameServer } from '@/features/downloads/types'
import type { UserHome, UserServerMachine } from '../../types/server-machines'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import type { DedicatedGameServer } from '@/features/gameservers/types'
import { Link } from '@tanstack/react-router'
import { getOSLabel } from '../../utils/server-machines'
import { NODE_CARD_WIDTH, NODE_CARD_HEIGHT } from '../../utils/node-map'
import { nodeSettingsNavigateOptions } from '../../node-settings'
import { isLocalDesktopNode } from '../../local-desktop-node'

interface NodeMapCardItemProps {
  item: NodeMapItem
  position: { x: number; y: number }
  isSelected: boolean
  isConnectingSource: boolean
  isConnectingTargetCandidate: boolean
  isConnectingDimmed?: boolean
  onSelect: (item: NodeMapItem) => void
  onDragStart: (e: React.PointerEvent, id: string) => void
  onStartConnecting?: (e: React.MouseEvent | React.PointerEvent, item: NodeMapItem) => void
  onConnectTarget?: (item: NodeMapItem) => void
  onCancelConnecting?: () => void
  onOpenConnectPicker?: (item: NodeMapItem) => void
  onEditHome?: (home: UserHome) => void
  onDeleteHome?: (home: UserHome) => void
  onEditServer?: (server: UserServerMachine) => void
  onDeleteServer?: (server: UserServerMachine) => void
  onDetectDrives?: (server: UserServerMachine) => void
  onOpenNodeSettings?: (server: GameServer) => void
  onEditNode?: (server: GameServer) => void
  onRenameNode?: (server: GameServer) => void
  onPingNode?: (server: GameServer) => void
  onClaimPendingNode?: (pending: PendingNode) => void
  onOpenSambaSettings?: (samba: SambaShareConfig) => void
  onEditSamba?: (samba: SambaShareConfig) => void
  onOpenGameServerDrawer?: (gameServer: DedicatedGameServer) => void
  onPingGameServer?: (gameServer: DedicatedGameServer) => void
  onEditGameServer?: (gameServer: DedicatedGameServer) => void
  onCopyGameServerAddress?: (gameServer: DedicatedGameServer, e: React.MouseEvent) => void
}

export const NodeMapCardItem = ({
  item,
  position,
  isSelected,
  isConnectingSource,
  isConnectingTargetCandidate,
  isConnectingDimmed = false,
  onSelect,
  onDragStart,
  onStartConnecting: _onStartConnecting,
  onConnectTarget,
  onCancelConnecting,
  onOpenConnectPicker,
  onEditHome,
  onDeleteHome,
  onEditServer,
  onDeleteServer,
  onDetectDrives,
  onOpenNodeSettings,
  onEditNode,
  onRenameNode,
  onPingNode,
  onClaimPendingNode,
  onOpenSambaSettings,
  onEditSamba,
  onOpenGameServerDrawer,
  onPingGameServer,
  onEditGameServer,
  onCopyGameServerAddress,
}: NodeMapCardItemProps) => {
  const { type, name } = item
  const data = item.data as any

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isConnectingTargetCandidate && onConnectTarget) {
      onConnectTarget(item)
    } else {
      onSelect(item)
    }
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (data.type === 'node') {
      if (onEditNode) onEditNode(data.server)
      else onOpenNodeSettings?.(data.server)
    } else if (data.type === 'server') {
      onEditServer?.(data.machine)
    } else if (data.type === 'home') {
      onEditHome?.(data.home)
    } else if (data.type === 'samba') {
      if (onEditSamba) onEditSamba(data.samba)
      else onOpenSambaSettings?.(data.samba)
    } else if (data.type === 'game_server') {
      onOpenGameServerDrawer?.(data.gameServer)
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
        height: `${NODE_CARD_HEIGHT}px`,
      }}
      onPointerDown={(e) => {
        e.stopPropagation()
        if ((e.target as HTMLElement).closest('button, a')) return
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // ignore
        }
        onDragStart(e, item.id)
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onPointerUp={(e) => {
        try {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId)
          }
        } catch {
          // ignore
        }
        handlePointerUp(e)
      }}
      onContextMenu={(e) => {
        if (isConnectingSource || isConnectingTargetCandidate) {
          e.preventDefault()
          e.stopPropagation()
          onCancelConnecting?.()
        }
      }}
      className={cn(
        'group absolute select-none rounded-2xl backdrop-blur-2xl cursor-grab active:cursor-grabbing',
        'bg-[var(--dk-surface-base)]/85 hover:bg-[var(--dk-surface-base)] shadow-sm hover:shadow-md',
        'transition-[background-color,box-shadow,opacity] duration-150',
        isSelected && 'ring-2 ring-primary/60 shadow-primary/20',
        isConnectingSource && 'ring-2 ring-primary animate-pulse shadow-primary/30',
        isConnectingTargetCandidate &&
          'ring-2 ring-primary/80 bg-primary/[0.08] shadow-md shadow-primary/25 cursor-pointer scale-[1.02]',
        isConnectingDimmed && 'opacity-40 grayscale-[35%]',
      )}
    >
      <div className="flex items-center justify-between h-full px-3 gap-2.5">
        {/* Left: Icon with Status Badge */}
        <div className="relative shrink-0 flex items-center justify-center">
          <div className="h-7 w-7 rounded-lg bg-[var(--dk-surface-field)] flex items-center justify-center text-primary">
            {type === 'home' && <HomeIcon size={14} />}
            {type === 'server' && <Server size={14} />}
            {type === 'node' && <Cpu size={14} />}
            {type === 'samba' && <FolderTree size={14} />}
            {type === 'game_server' && <Gamepad2 size={14} />}
            {type === 'unclaimed_node' && <Sparkles size={14} />}
          </div>
          {/* Status Indicator Dot for all nodes */}
          {type === 'game_server' && (
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-[var(--dk-surface-base)]',
                data.type === 'game_server' && data.gameServer.status === 'online'
                  ? 'bg-status-online'
                  : 'bg-status-offline',
              )}
              title={data.type === 'game_server' && data.gameServer.status === 'online' ? 'Online' : 'Offline'}
            />
          )}
          {type === 'node' && (
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-[var(--dk-surface-base)]',
                data.type === 'node' && data.server.isOnline ? 'bg-status-online' : 'bg-status-offline',
              )}
              title={data.type === 'node' && data.server.isOnline ? 'Online' : 'Offline'}
            />
          )}
          {type === 'server' && (
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-[var(--dk-surface-base)]',
                data.type === 'server' && data.machine.isOnline ? 'bg-status-online' : 'bg-status-offline',
              )}
              title={data.type === 'server' && data.machine.isOnline ? 'Online' : 'Offline'}
            />
          )}
          {type === 'samba' && (
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-[var(--dk-surface-base)]',
                data.type === 'samba' && data.samba.isOnline !== false ? 'bg-status-online' : 'bg-status-offline',
              )}
              title={data.type === 'samba' && data.samba.isOnline !== false ? 'SMB Share Available' : 'SMB Share Offline'}
            />
          )}
          {type === 'home' && (
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-[var(--dk-surface-base)] bg-status-online"
              title="Home Environment Active"
            />
          )}
          {type === 'unclaimed_node' && (
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-[var(--dk-surface-base)] bg-status-warning animate-pulse"
              title="Discovered Beaconing Node"
            />
          )}
        </div>

        {/* Center/Right: Name & Subtitle - Clean typography */}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <h4 className="text-xs font-semibold text-foreground truncate" title={name}>
              {name}
            </h4>
            {type === 'home' && data.home.isDefault && (
              <span className="text-[8px] font-bold px-1.5 py-0.2 rounded-full bg-primary/15 text-primary shrink-0">
                Default
              </span>
            )}
            {type === 'node' && isLocalDesktopNode(data.server) && (
              <span className="text-[8px] font-bold px-1.5 py-0.2 rounded-full bg-primary/15 text-primary shrink-0">
                Otix app
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground truncate leading-tight">
            {type === 'home' && (data.home.subnetCidr ? `Subnet ${data.home.subnetCidr}` : 'Homelab Network')}
            {type === 'server' && (data.machine.ipAddress || data.machine.host || getOSLabel(data.machine.os))}
            {type === 'node' && (isLocalDesktopNode(data.server) ? 'Companion Daemon' : data.server.primaryUrl || 'Local Node')}
            {type === 'samba' && (data.samba.serverName ? `/${data.samba.shareName} • ${data.samba.serverName}` : `/${data.samba.shareName} • Port ${data.samba.port}`)}
            {type === 'game_server' &&
              `${data.gameServer.gameTitle || 'Game Server'} • ${
                data.gameServer.status === 'online'
                  ? `${data.gameServer.currentPlayers}/${data.gameServer.maxPlayers || 0} players`
                  : data.gameServer.connectionAddress
              }`}
            {type === 'unclaimed_node' && (data.pending.claimCode ? `PIN: ${data.pending.claimCode}` : 'Discovered Node')}
          </p>
          {type === 'node' && (
            <Link
              {...nodeSettingsNavigateOptions(data.server.id)}
              aria-label={`Open ${data.server.name}`}
              className="sr-only"
            >
              <span>Open</span> {data.server.name}
            </Link>
          )}
        </div>
      </div>

      {/* Action Buttons Toolbar Underneath Node with 1rem Spacing */}
      {isSelected && (
        <div
          role="toolbar"
          aria-label="Node actions"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+1rem)] z-30 pointer-events-auto flex items-center gap-1 p-1 px-1.5 rounded-xl bg-[var(--dk-surface-overlay)] backdrop-blur-2xl shadow-xl whitespace-nowrap animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {/* Add Node Action for compatible connector nodes */}
          {type !== 'unclaimed_node' && onOpenConnectPicker && (
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Add node to ${name}`}
              onClick={() => onOpenConnectPicker(item)}
              className="h-6 px-2 text-[11px] font-medium gap-1 text-foreground hover:bg-[var(--dk-surface-hover)] rounded-lg"
            >
              <Plus size={11} className="text-primary" />
              <span>Add Node</span>
            </DkButton>
          )}

          {/* Connect Action for all regular nodes */}
          {type !== 'unclaimed_node' && onOpenConnectPicker && (
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Connect ${name}`}
              onClick={() => onOpenConnectPicker(item)}
              className="h-6 px-2 text-[11px] font-medium gap-1 text-foreground hover:bg-[var(--dk-surface-hover)] rounded-lg"
            >
              <LinkIcon size={11} />
              <span>Connect</span>
            </DkButton>
          )}

          {/* Node Actions */}
          {type === 'node' && (
            <>
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Open"
                onClick={() => onOpenNodeSettings?.(data.server)}
                className="h-6 px-2 text-[11px] font-medium gap-1 text-foreground hover:bg-[var(--dk-surface-hover)] rounded-lg"
              >
                <ExternalLink size={11} />
                <span>Open</span>
              </DkButton>

              {onEditNode && (
                <DkButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${data.server.name}`}
                  onClick={() => onEditNode(data.server)}
                  className="h-6 px-2 text-[11px] font-medium gap-1 text-foreground hover:bg-[var(--dk-surface-hover)] rounded-lg"
                >
                  <Pencil size={11} />
                  <span>Edit</span>
                </DkButton>
              )}

              {onRenameNode && (
                <DkButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Rename ${data.server.name}`}
                  onClick={() => onRenameNode(data.server)}
                  className="h-6 px-2 text-[11px] font-medium gap-1 text-foreground hover:bg-[var(--dk-surface-hover)] rounded-lg"
                >
                  <Pencil size={11} />
                  <span>Rename</span>
                </DkButton>
              )}

              {!data.server.isOnline && onPingNode && (
                <DkButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Test connection"
                  onClick={() => onPingNode(data.server)}
                  className="h-6 px-2 text-[11px] font-medium gap-1 text-amber-400 hover:text-amber-300 hover:bg-[var(--dk-surface-hover)] rounded-lg"
                >
                  <Radio size={11} />
                  <span>Ping</span>
                </DkButton>
              )}
            </>
          )}

          {/* Server Actions */}
          {type === 'server' && (
            <>
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Edit ${data.machine.name}`}
                onClick={() => onEditServer?.(data.machine)}
                className="h-6 px-2 text-[11px] font-medium gap-1 text-foreground hover:bg-[var(--dk-surface-hover)] rounded-lg"
              >
                <Pencil size={11} />
                <span>Edit</span>
              </DkButton>

              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Detect drives"
                onClick={() => onDetectDrives?.(data.machine)}
                className="h-6 px-2 text-[11px] font-medium gap-1 text-foreground hover:bg-[var(--dk-surface-hover)] rounded-lg"
              >
                <RefreshCw size={11} />
                <span>Drives</span>
              </DkButton>

              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Delete ${data.machine.name}`}
                onClick={() => onDeleteServer?.(data.machine)}
                className="h-6 px-2 text-[11px] font-medium gap-1 text-muted-foreground hover:text-destructive hover:bg-[var(--dk-surface-hover)] rounded-lg"
              >
                <Trash2 size={11} />
                <span>Delete</span>
              </DkButton>
            </>
          )}

          {/* Home Actions */}
          {type === 'home' && (
            <>
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Edit ${data.home.name}`}
                onClick={() => onEditHome?.(data.home)}
                className="h-6 px-2 text-[11px] font-medium gap-1 text-foreground hover:bg-[var(--dk-surface-hover)] rounded-lg"
              >
                <Pencil size={11} />
                <span>Edit</span>
              </DkButton>

              {!data.home.isDefault && (
                <DkButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete ${data.home.name}`}
                  onClick={() => onDeleteHome?.(data.home)}
                  className="h-6 px-2 text-[11px] font-medium gap-1 text-muted-foreground hover:text-destructive hover:bg-[var(--dk-surface-hover)] rounded-lg"
                >
                  <Trash2 size={11} />
                  <span>Delete</span>
                </DkButton>
              )}
            </>
          )}

          {/* Samba Actions */}
          {type === 'samba' && (
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Settings for ${data.samba.shareName}`}
              onClick={() => (onEditSamba ? onEditSamba(data.samba) : onOpenSambaSettings?.(data.samba))}
              className="h-6 px-2 text-[11px] font-medium gap-1 text-foreground hover:bg-[var(--dk-surface-hover)] rounded-lg"
            >
              <Pencil size={11} />
              <span>{onEditSamba ? 'Edit' : 'Settings'}</span>
            </DkButton>
          )}

          {/* Game Server Actions */}
          {type === 'game_server' && (
            <>
              {onOpenGameServerDrawer && (
                <DkButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Open ${data.gameServer.name}`}
                  onClick={() => onOpenGameServerDrawer(data.gameServer)}
                  className="h-6 px-2 text-[11px] font-medium gap-1 text-foreground hover:bg-[var(--dk-surface-hover)] rounded-lg"
                >
                  <ExternalLink size={11} />
                  <span>Open</span>
                </DkButton>
              )}

              {onCopyGameServerAddress && (
                <DkButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Copy server address"
                  onClick={(e) => onCopyGameServerAddress(data.gameServer, e)}
                  className="h-6 px-2 text-[11px] font-medium gap-1 text-foreground hover:bg-[var(--dk-surface-hover)] rounded-lg"
                >
                  <Copy size={11} />
                  <span>Copy</span>
                </DkButton>
              )}

              {onEditGameServer && (
                <DkButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${data.gameServer.name}`}
                  onClick={() => onEditGameServer(data.gameServer)}
                  className="h-6 px-2 text-[11px] font-medium gap-1 text-foreground hover:bg-[var(--dk-surface-hover)] rounded-lg"
                >
                  <Pencil size={11} />
                  <span>Edit</span>
                </DkButton>
              )}

              {onPingGameServer && (
                <DkButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Test connection"
                  onClick={() => onPingGameServer(data.gameServer)}
                  className="h-6 px-2 text-[11px] font-medium gap-1 text-amber-400 hover:text-amber-300 hover:bg-[var(--dk-surface-hover)] rounded-lg"
                >
                  <Radio size={11} />
                  <span>Ping</span>
                </DkButton>
              )}
            </>
          )}

          {/* Unclaimed Actions */}
          {type === 'unclaimed_node' && onClaimPendingNode && (
            <DkButton
              type="button"
              variant="primary"
              size="sm"
              aria-label="Claim Node"
              onClick={() => onClaimPendingNode(data.pending)}
              className="h-6 px-2.5 text-[11px] font-semibold gap-1 rounded-lg"
            >
              <KeyRound size={11} />
              <span>Claim Node</span>
            </DkButton>
          )}
        </div>
      )}
    </div>
  )
}
