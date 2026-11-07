import {
  HardDrive,
  Network,
  RefreshCw,
  Server,
  ShieldAlert,
  X,
} from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import type { GameServer } from '@/features/downloads/types'
import type { NodeExplorerBrowseResult } from '../../node-explorer-types'
import { isPathOnDrive } from '../../node-explorer-utils'

export interface ExplorerHeaderProps {
  isModal: boolean
  activeNode?: GameServer
  nodes: GameServer[]
  nodeId?: number
  onSelectNodeId: (id: number) => void
  browseData?: NodeExplorerBrowseResult
  isRefetching: boolean
  onRefetch: () => void
  onRequestPermission: () => void
  isRequestingPermission: boolean
  onOpenConnectShare: () => void
  onNavigate: (path?: string) => void
  currentPath?: string
  onClose?: () => void
}

export const ExplorerHeader = ({
  isModal,
  activeNode,
  nodes,
  nodeId,
  onSelectNodeId,
  browseData,
  isRefetching,
  onRefetch,
  onRequestPermission,
  isRequestingPermission,
  onOpenConnectShare,
  onNavigate,
  currentPath,
  onClose,
}: ExplorerHeaderProps) => {
  return (
    <>
      {/* Toolbar: node + refresh */}
      <div
        className={cn(
          'flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
          isModal ? 'px-4 pb-3' : 'border-b border-white/[0.04] bg-card/60 p-4',
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {!isModal && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Server className="h-4 w-4 text-primary" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold text-foreground">
                {activeNode?.name || 'Node storage'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-status-online/10 px-2 py-0.5 text-[10px] font-bold text-status-online">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-online" />
                Online
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="truncate font-mono text-foreground/70">
                {activeNode?.primaryUrl}
              </span>
              {browseData?.disk_free_bytes != null && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <HardDrive className="h-3 w-3" />
                    {formatBytes(browseData.disk_free_bytes)} free
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          {nodes.length > 1 && (
            <select
              value={nodeId}
              onChange={(e) => {
                onSelectNodeId(Number(e.target.value))
                onNavigate(undefined)
              }}
              className="rounded-xl border border-white/[0.06] bg-[var(--dk-surface-field)] px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary cursor-pointer"
            >
              {nodes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={onRequestPermission}
            disabled={isRequestingPermission}
            className="inline-flex items-center gap-1 rounded-xl border border-white/[0.06] bg-[var(--dk-surface-ghost)] px-2.5 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground cursor-pointer"
            title="Request Mac folder permissions or open settings"
            aria-label="Request Mac folder permissions"
          >
            <ShieldAlert className="h-3.5 w-3.5 text-status-warning" />
            <span className="hidden sm:inline">Permissions</span>
          </button>
          <button
            type="button"
            onClick={onOpenConnectShare}
            className="inline-flex items-center gap-1 rounded-xl border border-white/[0.06] bg-[var(--dk-surface-ghost)] px-2.5 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground cursor-pointer"
            title="Connect to a network share or server folder"
            aria-label="Connect to network share"
          >
            <Network className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">Network share</span>
          </button>
          <button
            type="button"
            onClick={onRefetch}
            disabled={isRefetching}
            className="rounded-xl border border-white/[0.06] bg-[var(--dk-surface-ghost)] p-1.5 text-foreground/80 transition-colors hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground cursor-pointer"
            title="Refresh directory"
            aria-label="Refresh directory"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefetching && 'animate-spin')} />
          </button>
          {!isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/[0.06] bg-muted/60 p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Drives selector */}
      {browseData?.drives && browseData.drives.length > 0 && (
        <div
          className={cn(
            'flex shrink-0 items-center gap-1.5 overflow-x-auto no-scrollbar py-1.5',
            isModal ? 'mx-4 mb-2' : 'border-b border-white/[0.04] bg-muted/10 px-4',
          )}
        >
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Drives:
          </span>
          {browseData.drives.map((drive) => {
            const isActiveDrive = isPathOnDrive(browseData.current_path || currentPath, drive.path)
            return (
              <button
                key={drive.path}
                type="button"
                onClick={() => onNavigate(drive.path)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all shrink-0 cursor-pointer',
                  isActiveDrive
                    ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                    : 'bg-[var(--dk-surface-ghost)] text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground border border-white/[0.04]',
                )}
                title={drive.path}
              >
                <HardDrive className="h-3.5 w-3.5 shrink-0" />
                <span className="font-mono text-[11px] font-bold">{drive.name || drive.path}</span>
                {drive.free_bytes != null && (
                  <span
                    className={cn(
                      'text-[10px]',
                      isActiveDrive ? 'text-primary-foreground/80' : 'text-muted-foreground/70',
                    )}
                  >
                    ({formatBytes(drive.free_bytes)})
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
