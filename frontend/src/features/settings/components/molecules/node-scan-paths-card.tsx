import { useState } from 'react'
import { Folder, FolderPlus, Trash2, RefreshCw, Server, HardDrive, ChevronDown, ChevronUp } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { NodeAddFolderModal } from '../organisms/node-add-folder-modal'
import type { ScanPathItem, PathType } from '../../utils/paths'
import { getBaseFolderName, isProviderPath } from '../../utils/paths'
import type { GameServer } from '@/features/downloads/types'
import { cn } from '@/lib/utils'

export interface NodeScanPathsCardProps {
  scanPaths: ScanPathItem[]
  isLoadingPaths: boolean
  isScanning: boolean
  onAddPath: (path: string, type: PathType, scanImmediately?: boolean, targetNodeId?: number | null) => Promise<void>
  onRemovePath: (path: string) => Promise<void>
  onScanSinglePath: (path: string) => void
  servers?: GameServer[]
  currentNodeId?: number | null
  remoteNodeId?: number | null
  nodeName?: string
  desktop: boolean
  className?: string
}

export const NodeScanPathsCard = ({
  scanPaths,
  isLoadingPaths,
  isScanning,
  onAddPath,
  onRemovePath,
  onScanSinglePath,
  servers = [],
  currentNodeId,
  remoteNodeId,
  nodeName,
  desktop,
  className,
}: NodeScanPathsCardProps) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)

  const handleModalAdd = async (
    path: string,
    type: PathType,
    scanImmediately: boolean,
    targetNodeId?: number | null,
  ) => {
    await onAddPath(path, type, scanImmediately, targetNodeId)
    if (scanImmediately) {
      onScanSinglePath(path)
    }
  }

  return (
    <>
      <div
        className={cn(
          'rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-2xl border border-white/[0.04] p-4 sm:p-5 shadow-[var(--dk-shadow-glass)] space-y-4 transition-colors',
          className,
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Folder className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span>Monitored Folders</span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--dk-surface-ghost)] text-muted-foreground border border-white/[0.04]">
                  {scanPaths.length}
                </span>
              </h2>
              <p className="text-xs text-muted-foreground truncate">
                Directories scanned on {nodeName || 'this node'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsAddModalOpen(true)}
              className="h-8 px-3 text-xs font-medium text-primary hover:bg-primary/10 rounded-xl"
            >
              <FolderPlus className="h-3.5 w-3.5 mr-1.5" />
              <span>Add Folder</span>
            </DkButton>

            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] transition-colors cursor-pointer"
              title={isExpanded ? 'Collapse folders' : 'Expand folders'}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Folders List */}
        {isExpanded && (
          <div className="space-y-2">
            {isLoadingPaths ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                Loading monitored paths...
              </div>
            ) : scanPaths.length === 0 ? (
              <div className="py-6 text-center rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] p-4">
                <Folder className="h-6 w-6 text-muted-foreground mx-auto mb-2 opacity-50" />
                <p className="text-xs font-medium text-foreground">No folders monitored yet</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Click Add Folder above to select directories to scan on this node.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {scanPaths.map((item) => {
                  const folderName = getBaseFolderName(item.path)
                  return (
                    <div
                      key={`${item.path}-${item.type}`}
                      className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] hover:bg-[var(--dk-surface-ghost-hover)] transition-colors group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--dk-surface-base)] text-muted-foreground shrink-0 group-hover:text-primary transition-colors">
                          {isProviderPath(item.type) ? (
                            <Server className="h-3.5 w-3.5" />
                          ) : (
                            <HardDrive className="h-3.5 w-3.5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-foreground truncate flex items-center gap-1.5">
                            <span className="truncate">{folderName}</span>
                            <span className={cn(
                              "text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.2 rounded border shrink-0",
                              isProviderPath(item.type)
                                ? "bg-[var(--dk-surface-base)] text-muted-foreground border-white/[0.04]"
                                : "bg-primary/10 text-primary border-primary/20",
                            )}>
                              {isProviderPath(item.type) ? 'PROVIDER' : 'INSTALLED'}
                            </span>
                          </div>
                          <div
                            className="text-[10px] text-muted-foreground font-mono truncate"
                            title={item.path}
                          >
                            {item.path}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <DkButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isScanning}
                          onClick={() => onScanSinglePath(item.path)}
                          title="Scan this folder only"
                          className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                        >
                          <RefreshCw
                            className={cn('h-3.5 w-3.5', isScanning && 'animate-spin')}
                          />
                        </DkButton>

                        <DkButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isScanning}
                          onClick={() => void onRemovePath(item.path)}
                          title="Remove folder from scan"
                          className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </DkButton>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Folder Modal */}
      <NodeAddFolderModal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddPath={handleModalAdd}
        servers={servers}
        currentNodeId={currentNodeId}
        remoteNodeId={remoteNodeId}
        desktop={desktop}
        nodeName={nodeName}
      />
    </>
  )
}
