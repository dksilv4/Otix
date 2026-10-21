import { useState } from 'react'
import {
  Server,
  HardDrive,
  Home as HomeIcon,
  FolderTree,
  AlertTriangle,
  Plus,
  Sparkles,
  KeyRound,
  DownloadCloud,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { NodesFeatureTags } from '../nodes-feature-tags'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import { cn } from '@/lib/utils'

export interface NodesCentralHubStats {
  totalNodes: number
  onlineNodes: number
  offlineNodes: number
  serverCount: number
  homeCount: number
  sambaCount: number
}

export interface NodesCentralHubNodeProps {
  stats: NodesCentralHubStats
  unclaimedNodes?: PendingNode[]
  onAddNode: () => void
  onClaimPendingNode?: (pending: PendingNode) => void
  onOpenConnectModal?: (url?: string) => void
  onOpenDownloadModal?: () => void
  className?: string
}

export const NodesCentralHubNode = ({
  stats,
  unclaimedNodes = [],
  onAddNode,
  onClaimPendingNode,
  onOpenConnectModal,
  onOpenDownloadModal,
  className,
}: NodesCentralHubNodeProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const isHealthy = stats.offlineNodes === 0

  return (
    <div
      role="region"
      aria-label="Central Nodes Hub"
      className={cn(
        'pointer-events-auto rounded-3xl p-5 transition-all duration-300 shadow-2xl',
        'backdrop-blur-2xl bg-[var(--dk-surface-base)]/90 border border-white/[0.05]',
        'max-w-xl w-full min-w-[280px]',
        className,
      )}
    >
      {/* Top row: Icon, Status Light, Heading, Feature Tags, and Actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative h-10 w-10 rounded-2xl bg-primary/15 flex items-center justify-center text-primary shrink-0">
            <Server size={20} />
            {/* Status light */}
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-[var(--dk-surface-base)]',
                isHealthy ? 'bg-primary animate-pulse' : 'bg-amber-400',
              )}
              title={isHealthy ? 'All nodes active' : `${stats.offlineNodes} offline`}
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight text-foreground">Nodes</h1>
              <NodesFeatureTags />
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {stats.onlineNodes}/{stats.totalNodes} {stats.totalNodes === 1 ? 'node' : 'nodes'} active
              {stats.offlineNodes > 0 && ` • ${stats.offlineNodes} offline`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <DkButton
            type="button"
            variant="primary"
            size="sm"
            onClick={onAddNode}
            className="gap-1.5 font-semibold shadow-md shadow-primary/20 h-8 px-3 text-xs"
          >
            <Plus size={13} />
            <span>Add Node</span>
            {unclaimedNodes.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-primary-foreground/20 text-primary-foreground">
                {unclaimedNodes.length}
              </span>
            )}
          </DkButton>

          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            aria-label={isCollapsed ? 'Expand node hub' : 'Collapse node hub'}
            className="h-8 w-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {!isCollapsed && (
        <div className="mt-3.5 space-y-3 pt-3 border-t border-white/[0.05] animate-in fade-in duration-150">
          {/* Homelab Topology Metrics Chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {stats.offlineNodes > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-500 dark:text-amber-400">
                <AlertTriangle size={10} />
                <span>{stats.offlineNodes} offline</span>
              </span>
            )}

            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[var(--dk-surface-field)] text-muted-foreground">
              <span>
                {stats.onlineNodes}/{stats.totalNodes} {stats.totalNodes === 1 ? 'node' : 'nodes'} active
              </span>
            </span>

            {stats.serverCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[var(--dk-surface-field)] text-muted-foreground">
                <HardDrive size={10} className="text-primary" />
                <span>{stats.serverCount} machines</span>
              </span>
            )}

            {stats.homeCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[var(--dk-surface-field)] text-muted-foreground">
                <HomeIcon size={10} className="text-primary" />
                <span>
                  {stats.homeCount} {stats.homeCount === 1 ? 'home' : 'homes'}
                </span>
              </span>
            )}

            {stats.sambaCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[var(--dk-surface-field)] text-muted-foreground">
                <FolderTree size={10} className="text-primary" />
                <span>
                  {stats.sambaCount} {stats.sambaCount === 1 ? 'samba share' : 'samba shares'}
                </span>
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Interactive homelab topology map. Connect worker nodes, server machines, household environments, and network storage. Nodes are always available to setup from anywhere even when offline.
          </p>

          {/* Quick secondary actions */}
          {onOpenDownloadModal && (
            <div className="flex items-center gap-2 pt-0.5">
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={onOpenDownloadModal}
                className="h-7 px-2.5 text-[11px] font-medium gap-1 text-muted-foreground hover:text-foreground"
              >
                <DownloadCloud size={12} />
                <span>Download Companion Daemon</span>
              </DkButton>
            </div>
          )}

          {/* Unclaimed Nodes Notice */}
          {unclaimedNodes.length > 0 && (
            <div className="p-3 rounded-2xl bg-primary/[0.08] backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-sm">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-bold text-foreground">
                      Unclaimed Otix Node Detected:{' '}
                      <span className="text-primary">{unclaimedNodes[0].serverName}</span>
                    </p>
                    {unclaimedNodes[0].claimCode && (
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-[var(--dk-surface-field)] text-foreground">
                        PIN: {unclaimedNodes[0].claimCode}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Available at {unclaimedNodes[0].localUrl}. Claim this node to link it to your account.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                {unclaimedNodes[0].claimCode && onClaimPendingNode ? (
                  <DkButton
                    size="sm"
                    variant="primary"
                    onClick={() => onClaimPendingNode(unclaimedNodes[0])}
                    className="h-7 text-[11px] font-bold"
                  >
                    <KeyRound className="w-3 h-3 mr-1" />
                    Claim Node
                  </DkButton>
                ) : onOpenConnectModal ? (
                  <DkButton
                    size="sm"
                    variant="primary"
                    onClick={() => onOpenConnectModal(unclaimedNodes[0].localUrl)}
                    className="h-7 text-[11px] font-bold"
                  >
                    Claim with PIN
                  </DkButton>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
