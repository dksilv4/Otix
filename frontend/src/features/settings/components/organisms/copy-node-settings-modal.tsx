import { useState, useId } from 'react'
import { Copy, Check, AlertCircle } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkSwitch } from '@ui/atoms/switch'
import { useToast } from '@ui/molecules/toast'
import type { GameServer } from '@/features/downloads/types'
import type { DownloadConfig } from '@/features/downloads/types'
import { replicateNodeSettings } from '../../utils/replicate-node-settings'
import { isGlobalProfileId } from '../../utils/node-switcher'
import { isLocalDesktopNode } from '../../local-desktop-node'
import { cn } from '@/lib/utils'

export interface CopyNodeSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceNodeId: number
  sourceNodeName: string
  servers: GameServer[]
  dlConfig?: DownloadConfig | null
  onSuccess?: () => void
}

export const CopyNodeSettingsModal = ({
  open,
  onOpenChange,
  sourceNodeId,
  sourceNodeName,
  servers,
  dlConfig,
  onSuccess,
}: CopyNodeSettingsModalProps) => {
  const { toast } = useToast()
  const copyOrganizeId = useId()
  const copyPathsId = useId()

  const [selectedTargetIds, setSelectedTargetIds] = useState<number[]>([])
  const [copyOrganize, setCopyOrganize] = useState(true)
  const [copyPaths, setCopyPaths] = useState(false)
  const [isCopying, setIsCopying] = useState(false)

  // Target candidates: remote worker nodes (and local desktop if source is a remote node)
  const targetCandidates = servers.filter((s) => s.id !== sourceNodeId)

  const handleToggleTarget = (nodeId: number) => {
    setSelectedTargetIds((prev) =>
      prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId],
    )
  }

  const handleSelectAll = () => {
    if (selectedTargetIds.length === targetCandidates.length) {
      setSelectedTargetIds([])
    } else {
      setSelectedTargetIds(targetCandidates.map((s) => s.id))
    }
  }

  const handleExecuteCopy = async () => {
    if (selectedTargetIds.length === 0) {
      toast({
        title: 'No targets selected',
        description: 'Please select at least one node to apply settings to.',
        variant: 'error',
      })
      return
    }

    if (!copyOrganize && !copyPaths) {
      toast({
        title: 'No settings selected',
        description: 'Please select at least one category (Organize or Paths) to copy.',
        variant: 'error',
      })
      return
    }

    setIsCopying(true)
    try {
      const result = await replicateNodeSettings({
        sourceNodeId,
        targetNodeIds: selectedTargetIds,
        copyOrganize,
        copyPaths,
        dlConfig,
      })

      if (result.successCount > 0) {
        toast({
          title: 'Settings copied',
          description: `Successfully replicated settings to ${result.successCount} node${result.successCount > 1 ? 's' : ''}.`,
          variant: 'success',
        })
        onOpenChange(false)
        onSuccess?.()
      } else {
        toast({
          title: 'Copy failed',
          description: result.errors[0]?.message || 'Could not replicate settings to target nodes.',
          variant: 'error',
        })
      }
    } catch (err: unknown) {
      toast({
        title: 'Error copying settings',
        description: (err as { message?: string })?.message || 'An unexpected error occurred.',
        variant: 'error',
      })
    } finally {
      setIsCopying(false)
    }
  }

  return (
    <DkDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Copy Node Settings"
      description={`Replicate configuration from ${sourceNodeName} to other connected nodes.`}
      className="max-w-lg"
    >
      <div className="space-y-4 pt-2">
        {/* Source Summary */}
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground block">
              Source Profile
            </span>
            <p className="text-xs font-semibold text-foreground truncate mt-0.5">{sourceNodeName}</p>
          </div>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-primary/10 text-primary shrink-0">
            {isGlobalProfileId(sourceNodeId) ? 'Global Defaults' : 'Active Node'}
          </span>
        </div>

        {/* Categories to Copy */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-foreground block">Settings Categories</span>
          <div className="space-y-2 rounded-xl bg-white/[0.02] border border-white/[0.04] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <label htmlFor={copyOrganizeId} className="text-xs font-medium text-foreground cursor-pointer">
                  Organize Configuration
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Naming template, wishlist auto-search, intervals, repackers, and auto-organize flags.
                </p>
              </div>
              <DkSwitch
                id={copyOrganizeId}
                checked={copyOrganize}
                onCheckedChange={setCopyOrganize}
              />
            </div>

            <div className="h-px bg-white/[0.04] my-1" />

            <div className="flex items-center justify-between gap-3">
              <div>
                <label htmlFor={copyPathsId} className="text-xs font-medium text-foreground cursor-pointer">
                  Folder & Library Paths
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Scan folder paths and default install/download directory locations.
                </p>
              </div>
              <DkSwitch
                id={copyPathsId}
                checked={copyPaths}
                onCheckedChange={setCopyPaths}
              />
            </div>
          </div>
        </div>

        {copyPaths && (
          <div className="p-2.5 rounded-xl bg-primary/5 border border-primary/10 text-[11px] text-muted-foreground flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <span>
              Note: Folder paths differ across operating systems (e.g. Windows drives vs. Linux mount points). Ensure target nodes have access to the specified paths.
            </span>
          </div>
        )}

        {/* Target Nodes Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Target Nodes</span>
            {targetCandidates.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
              >
                {selectedTargetIds.length === targetCandidates.length ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>

          {targetCandidates.length === 0 ? (
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] text-center text-xs text-muted-foreground">
              No other worker nodes are registered. Connect additional nodes to copy settings.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {targetCandidates.map((server) => {
                const isSelected = selectedTargetIds.includes(server.id)
                const isLocal = isLocalDesktopNode(server)
                return (
                  <button
                    key={server.id}
                    type="button"
                    onClick={() => handleToggleTarget(server.id)}
                    className={cn(
                      'w-full p-2.5 rounded-xl text-left flex items-center justify-between gap-3 transition-colors cursor-pointer',
                      isSelected
                        ? 'bg-primary/15 border border-primary/20 text-foreground'
                        : 'bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] text-muted-foreground',
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={cn(
                          'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                          isSelected
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-white/20 bg-transparent',
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{server.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {isLocal ? 'Local Desktop' : server.primaryUrl || 'Worker Node'}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded shrink-0 font-medium',
                        server.isOnline ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {server.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="flex justify-end gap-2 pt-3">
          <DkButton
            type="button"
            variant="ghost"
            size="sm"
            disabled={isCopying}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </DkButton>
          <DkButton
            type="button"
            variant="default"
            size="sm"
            loading={isCopying}
            disabled={selectedTargetIds.length === 0 || (!copyOrganize && !copyPaths)}
            onClick={handleExecuteCopy}
            className="gap-1.5"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>Apply to {selectedTargetIds.length} Node{selectedTargetIds.length !== 1 ? 's' : ''}</span>
          </DkButton>
        </div>
      </div>
    </DkDialog>
  )
}
