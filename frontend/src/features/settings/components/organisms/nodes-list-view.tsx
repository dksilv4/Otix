import { useState } from 'react'
import {
  Copy,
  Pencil,
  Settings,
  Activity,
  Trash2,
  ExternalLink,
  Check,
  Search,
  Plus,
  HardDrive,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { useToast } from '@ui/molecules/toast'
import { cn } from '@/lib/utils'
import type { GameServer } from '@/features/downloads/types'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import type { DedicatedGameServer } from '@/features/gameservers/types'
import type { UserHome, UserServerMachine } from '../../types/server-machines'
import type { SambaShareConfig } from '../../types/node-map'
import type { UnifiedInfrastructureItem } from '../../utils/node-views'
import { NodeItemTypeIcon } from '../atoms/node-item-type-icon'

export interface NodesListViewProps {
  items: UnifiedInfrastructureItem[]
  onOpenNodeSettings?: (node: GameServer) => void
  onEditNode?: (node: GameServer) => void
  onRenameNode?: (node: GameServer) => void
  onDuplicateNode?: (node: GameServer) => void
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

export const NodesListView = ({
  items,
  onOpenNodeSettings,
  onEditNode,
  onRenameNode: _onRenameNode,
  onDuplicateNode,
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
}: NodesListViewProps) => {
  const { toast } = useToast()
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopy = (text: string, id: string, e: React.MouseEvent) => {
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

  return (
    <div
      className={cn(
        'w-full rounded-2xl sm:rounded-3xl bg-[var(--dk-surface-card)] backdrop-blur-xl border border-white/[0.04] shadow-[var(--dk-shadow-glass)] overflow-x-auto',
        className,
      )}
    >
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-white/[0.05] text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            <th className="py-3 px-4 sm:px-6">Name &amp; Type</th>
            <th className="py-3 px-4">Status</th>
            <th className="py-3 px-4">Location</th>
            <th className="py-3 px-4">Endpoint</th>
            <th className="py-3 px-4">Storage / Capacity</th>
            <th className="py-3 px-4 sm:px-6 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.03] text-xs">
          {items.map((item) => {
            const isUnclaimed = item.type === 'unclaimed_node'
            const isNode = item.type === 'node'
            const isServer = item.type === 'server'
            const isSamba = item.type === 'samba'
            const isGameServer = item.type === 'game_server'

            return (
              <tr
                key={item.id}
                className={cn(
                  'hover:bg-[var(--dk-surface-field)]/60 transition-colors duration-150',
                  isUnclaimed && 'bg-primary/[0.02]',
                )}
              >
                {/* 1. Name & Type */}
                <td className="py-3 px-4 sm:px-6">
                  <div className="flex items-center gap-3 min-w-[180px]">
                    <div className="h-8 w-8 rounded-xl bg-[var(--dk-surface-field)] border border-white/[0.04] flex items-center justify-center shrink-0">
                      <NodeItemTypeIcon type={item.type} size={15} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground truncate" title={item.name}>
                        {item.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {item.typeLabel}
                      </div>
                    </div>
                  </div>
                </td>

                {/* 2. Status & Latency */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
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
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {item.latencyMs}ms
                      </span>
                    )}
                  </div>
                </td>

                {/* 3. Location / Home */}
                <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">
                  {item.homeName || '—'}
                </td>

                {/* 4. Endpoint / Host */}
                <td className="py-3 px-4">
                  {item.endpoint ? (
                    <div className="flex items-center gap-1.5 max-w-[220px]">
                      <span
                        className="font-mono text-xs text-muted-foreground truncate"
                        title={item.endpoint}
                      >
                        {item.endpoint}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleCopy(item.endpoint, item.id, e)}
                        title="Copy endpoint"
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-colors shrink-0"
                      >
                        {copiedId === item.id ? (
                          <Check size={12} className="text-primary" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </td>

                {/* 5. Storage / Capacity */}
                <td className="py-3 px-4 min-w-[160px]">
                  {item.storagePercent != null ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{item.storagePercent}%</span>
                        <span className="font-mono text-[10px] truncate max-w-[110px]">
                          {item.storageSummary}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[var(--dk-surface-field)] overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${Math.max(4, item.storagePercent)}%` }}
                        />
                      </div>
                    </div>
                  ) : item.details ? (
                    <span className="text-[11px] text-muted-foreground line-clamp-1">
                      {item.details}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </td>

                {/* 6. Actions */}
                <td className="py-3 px-4 sm:px-6 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    {isUnclaimed && item.raw.unclaimed && (
                      <DkButton
                        type="button"
                        size="sm"
                        variant="primary"
                        onClick={() => onClaimPendingNode?.(item.raw.unclaimed!)}
                        className="gap-1 font-semibold"
                      >
                        <Plus size={12} />
                        <span>Claim</span>
                      </DkButton>
                    )}

                    {isNode && item.raw.node && (
                      <>
                        <DkButton
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => onOpenNodeSettings?.(item.raw.node!)}
                          className="gap-1 font-medium"
                        >
                          <Settings size={12} />
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
                          <Pencil size={12} />
                        </DkButton>
                        {onDuplicateNode && (
                          <DkButton
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => onDuplicateNode(item.raw.node!)}
                            title="Duplicate Node"
                            className="px-2"
                          >
                            <Copy size={12} />
                          </DkButton>
                        )}
                        {onPingNode && (
                          <DkButton
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => onPingNode(item.raw.node!)}
                            title="Ping Node"
                            className="px-2 text-muted-foreground hover:text-foreground"
                          >
                            <Activity size={12} />
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
                            <Trash2 size={12} />
                          </DkButton>
                        )}
                      </>
                    )}

                    {isServer && item.raw.machine && (
                      <>
                        <DkButton
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => onEditServer?.(item.raw.machine!)}
                          className="gap-1 font-medium"
                        >
                          <Pencil size={12} />
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
                            <HardDrive size={12} />
                          </DkButton>
                        )}
                        {onDeleteServer && (
                          <DkButton
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => onDeleteServer(item.raw.machine!)}
                            title="Remove Server"
                            className="px-2 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 size={12} />
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
                          <Pencil size={12} />
                          <span>Edit</span>
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
                            <Trash2 size={12} />
                          </DkButton>
                        )}
                      </>
                    )}

                    {isGameServer && item.raw.gameServer && (
                      <>
                        <DkButton
                          type="button"
                          size="sm"
                          variant="primary"
                          onClick={() => onOpenGameServerDrawer?.(item.raw.gameServer!)}
                          className="gap-1 font-medium"
                        >
                          <ExternalLink size={12} />
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
                            <Pencil size={12} />
                          </DkButton>
                        )}
                        {onPingGameServer && (
                          <DkButton
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => onPingGameServer(item.raw.gameServer!)}
                            title="Query Server Status"
                            className="px-2 text-muted-foreground hover:text-foreground"
                          >
                            <Activity size={12} />
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
                            <Copy size={12} />
                          </DkButton>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
