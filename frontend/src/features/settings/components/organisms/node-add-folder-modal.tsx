import { useState, useEffect, useMemo } from 'react'
import { FolderPlus, HardDrive, Server } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkCheckbox } from '@ui/atoms/checkbox'
import { DkDropdown } from '@ui/atoms/dropdown'
import { PathInput } from '@/components/path-picker/path-input'
import type { PathType } from '../../utils/paths'
import { isInstalledPath, isProviderPath } from '../../utils/paths'
import { isLocalDesktopNode, isLocalDesktopNodeId, LOCAL_DESKTOP_NODE_ID } from '../../local-desktop-node'
import type { GameServer } from '@/features/downloads/types'
import { cn } from '@/lib/utils'

export interface NodeAddFolderModalProps {
  open: boolean
  onClose: () => void
  onAddPath: (path: string, type: PathType, scanImmediately: boolean, targetNodeId?: number | null) => Promise<void>
  servers?: GameServer[]
  currentNodeId?: number | null
  remoteNodeId?: number | null
  desktop: boolean
  nodeName?: string
}

export const NodeAddFolderModal = ({
  open,
  onClose,
  onAddPath,
  servers = [],
  currentNodeId,
  remoteNodeId,
  desktop,
  nodeName,
}: NodeAddFolderModalProps) => {
  const [draftPath, setDraftPath] = useState('')
  const [draftType, setDraftType] = useState<PathType>('installed')
  const [scanImmediately, setScanImmediately] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const nodeOptions = useMemo(() => {
    return (servers || []).map((s) => ({
      value: String(s.id),
      label: `${s.name}${isLocalDesktopNode(s) || s.isLocalDesktop || s.id === LOCAL_DESKTOP_NODE_ID ? ' (Local)' : ''}`,
    }))
  }, [servers])

  // Auto-select last selected node, or if there's only one, the only one available
  const initialNodeId = useMemo(() => {
    if (servers && servers.length === 1) {
      return String(servers[0].id)
    }
    try {
      const lastStored =
        localStorage.getItem('otix:last-add-folder-node-id') ||
        localStorage.getItem('otix:settings-selected-node')
      if (lastStored && servers?.some((s) => String(s.id) === String(lastStored))) {
        return String(lastStored)
      }
    } catch {}
    if (currentNodeId != null && servers?.some((s) => s.id === currentNodeId)) {
      return String(currentNodeId)
    }
    if (servers && servers.length > 0) {
      return String(servers[0].id)
    }
    return currentNodeId != null ? String(currentNodeId) : ''
  }, [servers, currentNodeId])

  const [selectedTargetNodeId, setSelectedTargetNodeId] = useState<string>(initialNodeId)

  useEffect(() => {
    if (open) {
      setSelectedTargetNodeId(initialNodeId)
    }
  }, [open, initialNodeId])

  const handleNodeChange = (val: string) => {
    setSelectedTargetNodeId(val)
    try {
      localStorage.setItem('otix:last-add-folder-node-id', val)
    } catch {}
  }

  const selectedNodeObj = useMemo(() => {
    return (servers || []).find((s) => String(s.id) === String(selectedTargetNodeId))
  }, [servers, selectedTargetNodeId])

  const isTargetLocal = useMemo(() => {
    if (!desktop) return false
    if (!selectedTargetNodeId) return true
    const numId = Number(selectedTargetNodeId)
    if (numId === LOCAL_DESKTOP_NODE_ID || numId <= 0) return true
    if (isLocalDesktopNodeId(numId)) return true
    if (isLocalDesktopNode(selectedNodeObj)) return true
    if (desktop && (!servers || servers.length <= 1)) return true
    return false
  }, [desktop, selectedTargetNodeId, selectedNodeObj, servers])

  const folderTarget = isTargetLocal ? 'local' : 'server'
  const targetServerId = isTargetLocal
    ? undefined
    : selectedTargetNodeId
      ? Number(selectedTargetNodeId)
      : (remoteNodeId ?? undefined)

  const handleClose = () => {
    setDraftPath('')
    setDraftType('installed')
    setScanImmediately(true)
    onClose()
  }

  const handleSubmit = async () => {
    const trimmed = draftPath.trim()
    if (!trimmed) return
    setSubmitting(true)
    try {
      const targetId = selectedTargetNodeId ? Number(selectedTargetNodeId) : null
      await onAddPath(trimmed, draftType, scanImmediately, targetId)
      handleClose()
    } finally {
      setSubmitting(false)
    }
  }

  const isCurrentInstalled = isInstalledPath(draftType)
  const isCurrentProvider = isProviderPath(draftType)

  const effectiveDisplayName = selectedNodeObj?.name || nodeName || (isTargetLocal ? 'This PC' : 'Node')

  return (
    <DkDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose()
      }}
      title="Add Monitored Folder"
      description={`Add a directory on ${effectiveDisplayName} to monitor installed games or provider repositories.`}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4 pt-2">
        {/* Node Target Selection Dropdown */}
        {nodeOptions.length > 1 ? (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-primary" />
              <span>Target Node</span>
            </label>
            <DkDropdown
              label="Select Node"
              options={nodeOptions}
              value={selectedTargetNodeId}
              onChange={handleNodeChange}
              variant="default"
              className="w-full"
            />
            <p className="text-[11px] text-muted-foreground">
              {isTargetLocal
                ? 'Monitored directory on this local computer. Browse button opens native file dialog.'
                : `Monitored directory on remote server ${selectedNodeObj?.name || ''}. Browse button browses files on the remote node.`}
            </p>
          </div>
        ) : nodeOptions.length === 1 ? (
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-foreground">{nodeOptions[0].label}</span>
            </div>
            <span className="text-[10px] text-muted-foreground font-medium px-2 py-0.5 rounded-full bg-[var(--dk-surface-base)] border border-white/[0.04]">
              {isTargetLocal ? 'Local Desktop' : 'Remote Node'}
            </span>
          </div>
        ) : null}

        {/* Path Picker / Input */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <FolderPlus className="h-3.5 w-3.5 text-primary" />
            <span>Folder Directory Path</span>
          </label>
          <PathInput
            value={draftPath}
            onChange={setDraftPath}
            onCommit={setDraftPath}
            target={folderTarget}
            serverId={targetServerId}
            compact
            placeholder={
              isCurrentProvider
                ? isTargetLocal
                  ? 'e.g. D:\\ISOs, \\\\nas\\games, or /mnt/storage'
                  : 'e.g. /media/isos or /storage/roms'
                : isTargetLocal
                  ? 'e.g. C:\\Games, D:\\SteamLibrary, or /home/games'
                  : 'e.g. /media/games or /opt/games'
            }
          />
        </div>

        {/* Content Type Selector */}
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">Content Type</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDraftType('installed')}
              className={cn(
                'flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer',
                isCurrentInstalled
                  ? 'bg-primary/10 border-primary/40 text-foreground font-semibold shadow-xs'
                  : 'bg-[var(--dk-surface-ghost)] border-white/[0.04] text-muted-foreground hover:text-foreground',
              )}
            >
              <HardDrive
                className={cn(
                  'h-4 w-4 mt-0.5 shrink-0',
                  isCurrentInstalled ? 'text-primary' : 'text-muted-foreground',
                )}
              />
              <div>
                <div className="text-xs font-medium">Installed Location</div>
                <div className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                  Installation directory on local machine; games are ready and available to run directly.
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setDraftType('provider')}
              className={cn(
                'flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer',
                isCurrentProvider
                  ? 'bg-primary/10 border-primary/40 text-foreground font-semibold shadow-xs'
                  : 'bg-[var(--dk-surface-ghost)] border-white/[0.04] text-muted-foreground hover:text-foreground',
              )}
            >
              <Server
                className={cn(
                  'h-4 w-4 mt-0.5 shrink-0',
                  isCurrentProvider ? 'text-primary' : 'text-muted-foreground',
                )}
              />
              <div>
                <div className="text-xs font-medium">Provider Location</div>
                <div className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                  Storage / repository. Scanned games cannot be launched directly; must be downloaded and installed to run.
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Scan Immediately Checkbox */}
        <div className="pt-1">
          <DkCheckbox
            checked={scanImmediately}
            onCheckedChange={setScanImmediately}
            label="Scan immediately after adding"
            className="text-xs text-foreground cursor-pointer"
          />
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.04]">
          <DkButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="h-8 text-xs rounded-xl"
          >
            Cancel
          </DkButton>
          <DkButton
            type="button"
            variant="primary"
            size="sm"
            disabled={!draftPath.trim() || submitting}
            onClick={() => void handleSubmit()}
            className="h-8 text-xs rounded-xl"
          >
            {submitting ? 'Adding...' : 'Add Folder'}
          </DkButton>
        </div>
      </div>
    </DkDialog>
  )
}
