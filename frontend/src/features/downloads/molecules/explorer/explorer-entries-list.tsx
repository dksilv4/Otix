import {
  ChevronRight,
  Download,
  Folder,
  Lock,
  RefreshCw,
  Server,
  ShieldAlert,
} from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import type { GameServer } from '@/features/downloads/types'
import type { NodeExplorerBrowseResult, NodeExplorerEntry } from '../../node-explorer-types'
import { formatExplorerDate, getFormatBadgeColor } from '../../node-explorer-utils'
import { ExplorerFormatIcon } from './explorer-format-icon'

export interface ExplorerEntriesListProps {
  isModal: boolean
  isBrowsing: boolean
  browseData?: NodeExplorerBrowseResult
  browseError?: any
  sortedEntries: NodeExplorerEntry[]
  searchQuery: string
  nodes: GameServer[]
  nodeId?: number
  currentPath?: string
  isRefetching: boolean
  onRefetch: () => void
  onNavigate: (path?: string) => void
  onRequestPermission: (path?: string) => void
  isRequestingPermission: boolean
  onSelectNodeId: (id: number) => void
  onDownloadFile: (entry: NodeExplorerEntry) => void
  onClose?: () => void
}

export const ExplorerEntriesList = ({
  isModal,
  isBrowsing,
  browseData,
  browseError,
  sortedEntries,
  searchQuery,
  nodes,
  nodeId,
  currentPath,
  isRefetching,
  onRefetch,
  onNavigate,
  onRequestPermission,
  isRequestingPermission,
  onSelectNodeId,
  onDownloadFile,
  onClose,
}: ExplorerEntriesListProps) => {
  return (
    <div
      className={cn(
        'min-h-0 flex-1 overflow-y-auto overscroll-contain',
        isModal
          ? 'mx-4 mb-3 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]'
          : 'max-h-[min(55vh,480px)] min-h-[200px]',
      )}
    >
      {isBrowsing && !browseData ? (
        <div className="flex flex-col items-center justify-center gap-2 p-12 text-xs text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin text-primary" />
          <span>Scanning node storage…</span>
        </div>
      ) : browseData?.permission_denied ? (
        <div className="mx-auto max-w-md space-y-4 p-8 text-center text-xs">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-status-warning/10 text-status-warning">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Mac Folder Permission Required
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {browseData.permission_message ||
                `Otix Node running on your Mac needs permission to access "${browseData.current_path}".`}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => onRequestPermission(browseData.current_path)}
              disabled={isRequestingPermission}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
            >
              <Lock className="h-3.5 w-3.5" />
              {isRequestingPermission ? 'Requesting…' : 'Prompt Node for Permission'}
            </button>
            <button
              type="button"
              onClick={onRefetch}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.06] bg-[var(--dk-surface-ghost)] px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-[var(--dk-surface-ghost-hover)] cursor-pointer"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isRefetching && 'animate-spin')} />
              Retry
            </button>
          </div>
          <div className="pt-2 text-[11px]">
            <span className="text-muted-foreground">Or return to: </span>
            <button
              type="button"
              onClick={() => onNavigate(undefined)}
              className="font-semibold text-primary underline underline-offset-2 hover:opacity-80 cursor-pointer"
            >
              Home folder
            </button>
          </div>
        </div>
      ) : browseError ? (
        (() => {
          const errDetail = String(
            browseError?.response?.data?.detail || browseError.message || '',
          ).toLowerCase()
          const isDisconnectedOrNotFound =
            browseError?.response?.status === 404 ||
            errDetail.includes('not found') ||
            errDetail.includes('unreachable') ||
            errDetail.includes('could not contact')

          if (isDisconnectedOrNotFound) {
            return (
              <div className="space-y-3 p-8 text-center text-xs">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-status-warning/10 text-status-warning">
                  <Server className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    Node Disconnected or Removed
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {browseError?.response?.data?.detail ||
                      'This node is no longer connected to your account.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  {nodes.length > 0 && nodes[0].id !== nodeId ? (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectNodeId(nodes[0].id)
                        onNavigate(undefined)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 cursor-pointer"
                    >
                      Switch to {nodes[0].name}
                    </button>
                  ) : (
                    <a
                      href="/settings/library#downloads"
                      onClick={onClose}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 cursor-pointer"
                    >
                      Connect / Claim Node
                    </a>
                  )}
                </div>
              </div>
            )
          }

          return (
            <div className="space-y-3 p-8 text-center text-xs">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-destructive">Unable to access directory</p>
                <p className="text-[11px] text-muted-foreground">
                  {browseError?.response?.data?.detail || browseError.message}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onRequestPermission(currentPath)}
                  disabled={isRequestingPermission}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
                >
                  <Lock className="h-3 w-3" />
                  Prompt Permission
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate(undefined)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.06] bg-[var(--dk-surface-ghost)] px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-[var(--dk-surface-ghost-hover)] cursor-pointer"
                >
                  Back to Home
                </button>
              </div>
            </div>
          )
        })()
      ) : sortedEntries.length === 0 ? (
        <div className="space-y-2 p-12 text-center text-xs text-muted-foreground">
          <Folder className="mx-auto h-8 w-8 text-muted-foreground/30" />
          <p className="font-medium text-foreground/70">
            {searchQuery ? 'No matching files or folders' : 'This folder is empty'}
          </p>
          <p className="mx-auto max-w-xs text-[11px]">
            Installers and ISOs saved here on the node will show up for download.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {sortedEntries.map((entry) => {
            const badge = getFormatBadgeColor(entry.format_category)

            if (entry.is_dir) {
              return (
                <button
                  type="button"
                  key={entry.path}
                  onClick={() => onNavigate(entry.path)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors cursor-pointer',
                    isModal ? 'hover:bg-[var(--dk-surface-ghost-hover)]' : 'hover:bg-muted/40',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Folder className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-semibold text-foreground">
                          {entry.name}
                        </span>
                        {entry.is_download_location && (
                          <span className="rounded bg-status-online/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-status-online">
                            Download dir
                          </span>
                        )}
                      </div>
                      {entry.modified_at && (
                        <span className="text-[10px] text-muted-foreground">
                          {formatExplorerDate(entry.modified_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                </button>
              )
            }

            return (
              <div
                key={entry.path}
                className={cn(
                  'flex items-center justify-between gap-3 px-3.5 py-2.5',
                  isModal ? 'hover:bg-[var(--dk-surface-ghost-hover)]' : 'hover:bg-card/80',
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ExplorerFormatIcon format={entry.format_category} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-xs font-medium text-foreground">
                        {entry.name}
                      </span>
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                          badge.bg,
                          badge.text,
                        )}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="font-mono">{formatBytes(entry.size)}</span>
                      {entry.modified_at && (
                        <>
                          <span>·</span>
                          <span>{formatExplorerDate(entry.modified_at)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {entry.is_downloadable && (
                  <button
                    type="button"
                    onClick={() => onDownloadFile(entry)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 cursor-pointer"
                    title="Download to this device"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Download</span>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
