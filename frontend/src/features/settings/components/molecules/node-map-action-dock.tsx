import {
  Server,
  Home as HomeIcon,
  Cpu,
  FolderTree,
  Sparkles,
  Link as LinkIcon,
  ExternalLink,
  Pencil,
  RefreshCw,
  Trash2,
  Radio,
  KeyRound,
  X,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import type { NodeMapItem, SambaShareConfig } from '../../types/node-map'
import type { GameServer } from '@/features/downloads/types'
import type { UserHome, UserServerMachine } from '../../types/server-machines'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import { getOSLabel } from '../../utils/server-machines'

interface NodeMapActionDockProps {
  selectedItem: NodeMapItem | null
  onClose: () => void
  onOpenConnectPicker?: (item: NodeMapItem) => void
  onOpenNodeSettings?: (server: GameServer) => void
  onEditNode?: (server: GameServer) => void
  onRenameNode?: (server: GameServer) => void
  onPingNode?: (server: GameServer) => void
  onEditServer?: (server: UserServerMachine) => void
  onDetectDrives?: (server: UserServerMachine) => void
  onDeleteServer?: (server: UserServerMachine) => void
  onEditHome?: (home: UserHome) => void
  onDeleteHome?: (home: UserHome) => void
  onOpenSambaSettings?: (samba: SambaShareConfig) => void
  onEditSamba?: (samba: SambaShareConfig) => void
  onClaimPendingNode?: (pending: PendingNode) => void
}

export const NodeMapActionDock = ({
  selectedItem,
  onClose,
  onOpenConnectPicker,
  onOpenNodeSettings,
  onEditNode,
  onRenameNode,
  onPingNode,
  onEditServer,
  onDetectDrives,
  onDeleteServer,
  onEditHome,
  onDeleteHome,
  onOpenSambaSettings,
  onEditSamba,
  onClaimPendingNode,
}: NodeMapActionDockProps) => {
  if (!selectedItem) return null

  const { type, name } = selectedItem
  const data = selectedItem.data as any

  return (
    <div
      role="region"
      aria-label="Node actions"
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-auto flex items-center gap-2 p-1.5 px-3 rounded-2xl bg-[var(--dk-surface-overlay)] backdrop-blur-2xl shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-150 max-w-[calc(100vw-3rem)] overflow-x-auto"
    >
      {/* Left: Selected Node Icon & Title */}
      <div className="flex items-center gap-2 pr-1 shrink-0">
        <div className="h-6 w-6 rounded-lg bg-[var(--dk-surface-field)] flex items-center justify-center text-primary shrink-0">
          {type === 'home' && <HomeIcon size={12} />}
          {type === 'server' && <Server size={12} />}
          {type === 'node' && <Cpu size={12} />}
          {type === 'samba' && <FolderTree size={12} />}
          {type === 'unclaimed_node' && <Sparkles size={12} />}
        </div>
        <div className="min-w-0 max-w-[120px] sm:max-w-[160px]">
          <p className="text-xs font-semibold text-foreground truncate leading-tight">
            {name}
          </p>
          <p className="text-[10px] text-muted-foreground truncate leading-tight">
            {type === 'node' && (data.server.isOnline ? 'Online' : 'Offline')}
            {type === 'server' && getOSLabel(data.machine.os)}
            {type === 'home' && (data.home.isDefault ? 'Default Home' : 'Home Location')}
            {type === 'samba' && `/${data.samba.shareName}`}
            {type === 'unclaimed_node' && 'Discovered Node'}
          </p>
        </div>
      </div>

      <div className="h-4 w-px bg-[var(--dk-separator)] shrink-0" />

      {/* Center: Contextual Action Buttons */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Connect Action - Available for all regular items */}
        {type !== 'unclaimed_node' && onOpenConnectPicker && (
          <DkButton
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Connect ${name}`}
            onClick={() => onOpenConnectPicker(selectedItem)}
            className="h-7 px-2 text-xs font-medium gap-1.5 text-foreground hover:bg-[var(--dk-surface-hover)]"
          >
            <LinkIcon size={12} className="text-primary" />
            <span className="hidden sm:inline">Connect</span>
          </DkButton>
        )}

        {/* Worker Node Actions */}
        {type === 'node' && (
          <>
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Open"
              onClick={() => onOpenNodeSettings?.(data.server)}
              className="h-7 px-2 text-xs font-medium gap-1.5 text-foreground hover:bg-[var(--dk-surface-hover)]"
            >
              <ExternalLink size={12} />
              <span>Open</span>
            </DkButton>

            {onEditNode && (
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Edit ${data.server.name}`}
                onClick={() => onEditNode(data.server)}
                className="h-7 px-2 text-xs font-medium gap-1.5 text-foreground hover:bg-[var(--dk-surface-hover)]"
              >
                <Pencil size={12} />
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
                className="h-7 px-2 text-xs font-medium gap-1.5 text-foreground hover:bg-[var(--dk-surface-hover)]"
              >
                <Pencil size={12} />
                <span className="hidden sm:inline">Rename</span>
              </DkButton>
            )}

            {!data.server.isOnline && onPingNode && (
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Test connection"
                onClick={() => onPingNode(data.server)}
                className="h-7 px-2 text-xs font-medium gap-1.5 text-amber-400 hover:text-amber-300 hover:bg-[var(--dk-surface-hover)]"
              >
                <Radio size={12} />
                <span>Ping</span>
              </DkButton>
            )}
          </>
        )}

        {/* Server Machine Actions */}
        {type === 'server' && (
          <>
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Edit ${data.machine.name}`}
              onClick={() => onEditServer?.(data.machine)}
              className="h-7 px-2 text-xs font-medium gap-1.5 text-foreground hover:bg-[var(--dk-surface-hover)]"
            >
              <Pencil size={12} />
              <span>Edit</span>
            </DkButton>

            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Detect drives"
              onClick={() => onDetectDrives?.(data.machine)}
              className="h-7 px-2 text-xs font-medium gap-1.5 text-foreground hover:bg-[var(--dk-surface-hover)]"
            >
              <RefreshCw size={12} />
              <span className="hidden sm:inline">Drives</span>
            </DkButton>

            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Delete ${data.machine.name}`}
              onClick={() => onDeleteServer?.(data.machine)}
              className="h-7 px-2 text-xs font-medium gap-1.5 text-muted-foreground hover:text-destructive hover:bg-[var(--dk-surface-hover)]"
            >
              <Trash2 size={12} />
              <span className="hidden sm:inline">Delete</span>
            </DkButton>
          </>
        )}

        {/* Home Environment Actions */}
        {type === 'home' && (
          <>
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Edit ${data.home.name}`}
              onClick={() => onEditHome?.(data.home)}
              className="h-7 px-2 text-xs font-medium gap-1.5 text-foreground hover:bg-[var(--dk-surface-hover)]"
            >
              <Pencil size={12} />
              <span>Edit</span>
            </DkButton>

            {!data.home.isDefault && (
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Delete ${data.home.name}`}
                onClick={() => onDeleteHome?.(data.home)}
                className="h-7 px-2 text-xs font-medium gap-1.5 text-muted-foreground hover:text-destructive hover:bg-[var(--dk-surface-hover)]"
              >
                <Trash2 size={12} />
                <span className="hidden sm:inline">Delete</span>
              </DkButton>
            )}
          </>
        )}

        {/* Samba Share Actions */}
        {type === 'samba' && (
          <DkButton
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Configure /${data.samba.shareName}`}
            onClick={() => (onEditSamba ? onEditSamba(data.samba) : onOpenSambaSettings?.(data.samba))}
            className="h-7 px-2 text-xs font-medium gap-1.5 text-foreground hover:bg-[var(--dk-surface-hover)]"
          >
            <Pencil size={12} />
            <span>{onEditSamba ? 'Edit' : 'Configure'}</span>
          </DkButton>
        )}

        {/* Unclaimed Node Actions */}
        {type === 'unclaimed_node' && onClaimPendingNode && (
          <DkButton
            type="button"
            variant="primary"
            size="sm"
            aria-label="Claim node"
            onClick={() => onClaimPendingNode(data.pending)}
            className="h-7 px-2.5 text-xs font-semibold gap-1.5"
          >
            <KeyRound size={12} />
            <span>Claim Node</span>
          </DkButton>
        )}
      </div>

      <div className="h-4 w-px bg-[var(--dk-separator)] shrink-0" />

      {/* Right: Deselect / Close button */}
      <DkButton
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Deselect"
        title="Deselect (Esc)"
        onClick={onClose}
        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-hover)] shrink-0"
      >
        <X size={13} />
      </DkButton>
    </div>
  )
}
