import { useState } from 'react'
import {
  Server,
  HardDrive,
  Gamepad2,
  Cpu,
  Copy,
  Pencil,
  Settings,
  Activity,
  Trash2,
  ExternalLink,
  Check,
  Radio,
  Search,
  Plus,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { useToast } from '@ui/molecules/toast'
import { cn } from '@/lib/utils'
import type { GameServer } from '@/features/downloads/types'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import type { DedicatedGameServer } from '@/features/gameservers/types'
import type { UserHome, UserServerMachine } from '../../types/server-machines'
import type { SambaShareConfig } from '../../types/node-map'
import {
  type UnifiedInfrastructureItem,
  type NodesCategoryFilter,
  groupInfrastructureItems,
} from '../../utils/node-views'
import { NodeItemTypeIcon } from '../atoms/node-item-type-icon'

export interface NodesGridViewProps {
  items: UnifiedInfrastructureItem[]
  categoryFilter: NodesCategoryFilter
  onOpenNodeSettings?: (node: GameServer) => void
  onEditNode?: (node: GameServer) => void
  onRenameNode?: (node: GameServer) => void
  onPingNode?: (node: GameServer) => void
  onDisconnectNode?: (node: GameServer) => void
  onEditServer?: (server: UserServerMachine) => void
  onDeleteServer?: (server: UserServerMachine) => void
  onDetectDrives?: (server: UserServerMachine) => void
  onEditHome?: (home: UserHome) => void
  onDeleteHome?: (home: UserHome) => void
  onEditSamba?: (samba: SambaShareConfig) => void
  onDeleteSamba?: (sambaId: string) => void
  onOpenGameServerDrawer?: (gameServer: DedicatedGameServer) => void
  onPingGameServer?: (gameServer: DedicatedGameServer) => void
  onEditGameServer?: (gameServer: DedicatedGameServer) => void
  onCopyGameServerAddress?: (gameServer: DedicatedGameServer, e: React.MouseEvent) => void
  onClaimPendingNode?: (pending: PendingNode) => void
  onAddNode: () => void
  onResetFilters?: () => void
  className?: string
}

export const NodesGridView = ({
  items,
  categoryFilter,
  onOpenNodeSettings,
  onEditNode,
  onRenameNode: _onRenameNode,
  onPingNode,
  onDisconnectNode,
  onEditServer,
  onDeleteServer,
  onDetectDrives,
  onEditSamba,
  onDeleteSamba,
  onOpenGameServerDrawer,
  onPingGameServer,
  onEditGameServer,
  onCopyGameServerAddress,
  onClaimPendingNode,
  onAddNode,
  onResetFilters,
  className,
}: NodesGridViewProps) => {
  const { toast } = useToast()
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopyEndpoint = (text: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!text) return
    void navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500)
    toast({
      title: 'Address copied',
      description: text,
      variant: 'default',
    })
  }

  if (items.length === 0) {
    return (
      <div
        className={cn(
          'w-full min-h-[360px] flex flex-col items-center justify-center p-8 text-center rounded-3xl',
          'bg-[var(--dk-surface-card)] backdrop-blur-xl border border-white/[0.04] shadow-[var(--dk-shadow-glass)]',
          className,
        )}
      >
        <div className="h-14 w-14 rounded-2xl bg-[var(--dk-surface-field)] border border-white/[0.04] flex items-center justify-center text-muted-foreground mb-4">
          <Search size={26} />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">
          No infrastructure matches
        </h3>
        <p className="text-xs text-muted-foreground max-w-sm mb-6">
          No nodes, server machines, or network storage shares match your search or filters.
        </p>
        <div className="flex items-center gap-3">
          {onResetFilters && (
            <DkButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={onResetFilters}
            >
              Reset Filters
            </DkButton>
          )}
          <DkButton
            type="button"
            variant="primary"
            size="sm"
            onClick={onAddNode}
            className="gap-1.5"
          >
            <Plus size={14} />
            <span>Add Infrastructure</span>
          </DkButton>
        </div>
      </div>
    )
  }

  const grouped = groupInfrastructureItems(items)
  const isAll = categoryFilter === 'all'

  const renderCard = (item: UnifiedInfrastructureItem) => {
    const isUnclaimed = item.type === 'unclaimed_node'
    const isNode = item.type === 'node'
    const isServer = item.type === 'server'
    const isSamba = item.type === 'samba'
    const isGameServer = item.type === 'game_server'

    return (
      <div
        key={item.id}
        className={cn(
          'group relative flex flex-col justify-between p-4 sm:p-5 rounded-2xl sm:rounded-3xl transition-all duration-200',
          'bg-[var(--dk-surface-card)] backdrop-blur-xl border border-white/[0.04] shadow-[var(--dk-shadow-glass)]',
          'hover:bg-[var(--dk-surface-card-hover)]',
          isUnclaimed && 'border-primary/30 bg-primary/[0.04]',
        )}
      >
        {/* Top: Icon, Titles, Online Status */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={cn(
                  'h-9 w-9 rounded-xl sm:rounded-2xl shrink-0 flex items-center justify-center',
                  'bg-[var(--dk-surface-field)] border border-white/[0.04]',
                )}
              >
                <NodeItemTypeIcon type={item.type} size={18} />
              </div>
              <div className="min-w-0">
                <h4
                  className="text-sm font-semibold text-foreground truncate"
                  title={item.name}
                >
                  {item.name}
                </h4>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {item.typeLabel}
                  </span>
                  {item.homeName && (
                    <>
                      <span className="text-muted-foreground/40 text-[10px]">·</span>
                      <span className="text-[11px] text-muted-foreground/80 truncate">
                        {item.homeName}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Status Pill */}
            <div className="shrink-0 flex items-center gap-1.5">
              <span
                className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded-full',
                  item.isOnline
                    ? 'text-status-online bg-status-online/10'
                    : 'text-status-offline bg-status-offline/10',
                )}
              >
                {item.isOnline ? 'Online' : 'Offline'}
              </span>
              {item.latencyMs != null && item.latencyMs > 0 && (
                <span className="text-[10px] font-mono text-muted-foreground hidden sm:inline">
                  {item.latencyMs}ms
                </span>
              )}
            </div>
          </div>

          {/* Endpoint / Host Address */}
          {item.endpoint && (
            <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[var(--dk-surface-field)] border border-white/[0.03]">
              <span
                className="text-xs font-mono text-muted-foreground truncate"
                title={item.endpoint}
              >
                {item.endpoint}
              </span>
              <button
                type="button"
                onClick={(e) => handleCopyEndpoint(item.endpoint, item.id, e)}
                title="Copy address"
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-colors shrink-0"
              >
                {copiedId === item.id ? (
                  <Check size={12} className="text-primary" />
                ) : (
                  <Copy size={12} />
                )}
              </button>
            </div>
          )}

          {/* Storage Capacity Bar */}
          {item.storagePercent != null && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Storage</span>
                <span className="font-mono">{item.storageSummary}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[var(--dk-surface-field)] overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(4, item.storagePercent)}%` }}
                />
              </div>
            </div>
          )}

          {/* Details / Notes */}
          {item.details && !item.storagePercent && (
            <p className="text-xs text-muted-foreground/90">{item.details}</p>
          )}
        </div>

        {/* Card Actions Footer */}
        <div className="flex items-center justify-between gap-2 pt-4 mt-3 border-t border-white/[0.04]">
          {isUnclaimed && item.raw.unclaimed && (
            <div className="w-full flex items-center justify-end">
              <DkButton
                type="button"
                size="sm"
                variant="primary"
                onClick={() => onClaimPendingNode?.(item.raw.unclaimed!)}
                className="w-full gap-1.5 font-semibold"
              >
                <Plus size={13} />
                <span>Claim Node</span>
              </DkButton>
            </div>
          )}

          {isNode && item.raw.node && (
            <>
              <div className="flex items-center gap-1.5">
                <DkButton
                  type="button"
                  size="sm"
                  variant="primary"
                  onClick={() => onOpenNodeSettings?.(item.raw.node!)}
                  className="gap-1 font-medium"
                >
                  <Settings size={13} />
                  <span>Configure</span>
                </DkButton>
                <DkButton
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onEditNode?.(item.raw.node!)}
                  title="Edit Node details"
                  className="px-2"
                >
                  <Pencil size={13} />
                </DkButton>
              </div>

              <div className="flex items-center gap-1">
                {onPingNode && (
                  <DkButton
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onPingNode(item.raw.node!)}
                    title="Ping Node"
                    className="px-2 text-muted-foreground hover:text-foreground"
                  >
                    <Activity size={13} />
                  </DkButton>
                )}
                {onDisconnectNode && (
                  <DkButton
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onDisconnectNode(item.raw.node!)}
                    title="Disconnect Node"
                    className="px-2 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={13} />
                  </DkButton>
                )}
              </div>
            </>
          )}

          {isServer && item.raw.machine && (
            <>
              <div className="flex items-center gap-1.5">
                <DkButton
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onEditServer?.(item.raw.machine!)}
                  className="gap-1 font-medium"
                >
                  <Pencil size={13} />
                  <span>Edit</span>
                </DkButton>
                {onDetectDrives && (
                  <DkButton
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onDetectDrives(item.raw.machine!)}
                    title="Detect hard drives"
                    className="px-2 text-muted-foreground hover:text-foreground"
                  >
                    <HardDrive size={13} />
                  </DkButton>
                )}
              </div>

              {onDeleteServer && (
                <DkButton
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onDeleteServer(item.raw.machine!)}
                  title="Remove Server"
                  className="px-2 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 size={13} />
                </DkButton>
              )}
            </>
          )}

          {isSamba && item.raw.samba && (
            <>
              <DkButton
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => onEditSamba?.(item.raw.samba!)}
                className="gap-1 font-medium"
              >
                <Pencil size={13} />
                <span>Edit Share</span>
              </DkButton>

              {onDeleteSamba && (
                <DkButton
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onDeleteSamba(item.raw.samba!.id)}
                  title="Delete Samba Share"
                  className="px-2 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 size={13} />
                </DkButton>
              )}
            </>
          )}

          {isGameServer && item.raw.gameServer && (
            <>
              <div className="flex items-center gap-1.5">
                <DkButton
                  type="button"
                  size="sm"
                  variant="primary"
                  onClick={() => onOpenGameServerDrawer?.(item.raw.gameServer!)}
                  className="gap-1 font-medium"
                >
                  <ExternalLink size={13} />
                  <span>Manage</span>
                </DkButton>
                {onEditGameServer && (
                  <DkButton
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onEditGameServer(item.raw.gameServer!)}
                    title="Edit Game Server"
                    className="px-2"
                  >
                    <Pencil size={13} />
                  </DkButton>
                )}
              </div>

              <div className="flex items-center gap-1">
                {onPingGameServer && (
                  <DkButton
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onPingGameServer(item.raw.gameServer!)}
                    title="Query Server Status"
                    className="px-2 text-muted-foreground hover:text-foreground"
                  >
                    <Activity size={13} />
                  </DkButton>
                )}
                {onCopyGameServerAddress && (
                  <DkButton
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={(e) => onCopyGameServerAddress(item.raw.gameServer!, e)}
                    title="Copy Address"
                    className="px-2 text-muted-foreground hover:text-foreground"
                  >
                    <Copy size={13} />
                  </DkButton>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // If filtered to a specific category, render flat responsive grid
  if (!isAll) {
    return (
      <div
        className={cn(
          'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4',
          className,
        )}
      >
        {items.map(renderCard)}
      </div>
    )
  }

  // Category 'all': Render structured sections with section headers
  return (
    <div className={cn('space-y-8', className)}>
      {/* Unclaimed Discovered Nodes Banner */}
      {grouped.unclaimed.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Radio size={16} className="text-primary" />
            <h3 className="text-sm font-bold text-foreground">
              Discovered Nodes ({grouped.unclaimed.length})
            </h3>
            <span className="text-[11px] text-muted-foreground">
              Ready to be paired with your Otix account
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {grouped.unclaimed.map(renderCard)}
          </div>
        </div>
      )}

      {/* Worker Nodes */}
      {grouped.nodes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Cpu size={16} className="text-primary" />
            <h3 className="text-sm font-bold text-foreground">
              Worker Nodes ({grouped.nodes.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {grouped.nodes.map(renderCard)}
          </div>
        </div>
      )}

      {/* Server Machines */}
      {grouped.servers.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Server size={16} className="text-primary" />
            <h3 className="text-sm font-bold text-foreground">
              Server Machines ({grouped.servers.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {grouped.servers.map(renderCard)}
          </div>
        </div>
      )}

      {/* Network Storage Shares (Samba) */}
      {grouped.samba.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <HardDrive size={16} className="text-primary" />
            <h3 className="text-sm font-bold text-foreground">
              Network Storage ({grouped.samba.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {grouped.samba.map(renderCard)}
          </div>
        </div>
      )}

      {/* Dedicated Game Servers */}
      {grouped.gameServers.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Gamepad2 size={16} className="text-primary" />
            <h3 className="text-sm font-bold text-foreground">
              Dedicated Game Servers ({grouped.gameServers.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {grouped.gameServers.map(renderCard)}
          </div>
        </div>
      )}
    </div>
  )
}
