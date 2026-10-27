import { useState } from 'react'
import {
  FolderOpen,
  Copy,
  Trash2,
  Check,
  HardDrive,
  Download,
  Disc,
  SlidersHorizontal,
  RefreshCw,
  Network,
  Eye,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { cn } from '@/lib/utils'
import type { ConfiguredFolderItem } from '../../utils/paths'

export interface PathFolderCardProps {
  item: ConfiguredFolderItem & {
    isNetwork?: boolean
    watcherStatus?: 'Watching' | 'Indexing' | 'Active' | string
  }
  onToggleInstallation: (path: string) => void
  onAssignDownload: (path: string) => void
  onToggleIso: (path: string) => void
  onRemove: (path: string) => void
  onCopyPath: (path: string) => void
  onRescan?: (path: string) => void
  isScanning?: boolean
  watcherStatus?: 'Watching' | 'Indexing' | 'Active' | string
  isNetwork?: boolean
  className?: string
}

export const PathFolderCard = ({
  item,
  onToggleInstallation,
  onAssignDownload,
  onToggleIso,
  onRemove,
  onCopyPath,
  onRescan,
  isScanning = false,
  watcherStatus: watcherStatusProp,
  isNetwork: isNetworkProp,
  className,
}: PathFolderCardProps) => {
  const [showRoleSelect, setShowRoleSelect] = useState(false)

  const isNetwork = Boolean(
    isNetworkProp ??
      item.isNetwork ??
      (item.path.startsWith('\\\\') ||
        item.path.startsWith('//') ||
        item.path.toLowerCase().startsWith('smb://')),
  )
  const storageKind = isNetwork ? 'Network / Samba' : 'Local'
  const watcherStatus =
    watcherStatusProp ??
    item.watcherStatus ??
    (isScanning ? 'Indexing' : 'Watching')
  const isIndexing = isScanning || watcherStatus.toLowerCase() === 'indexing'

  return (
    <div
      className={cn(
        'group relative flex flex-col justify-between p-4 rounded-2xl transition-all duration-200',
        'bg-[var(--dk-surface-glass)] backdrop-blur-xl hover:bg-[var(--dk-surface-glass)]/90',
        'border border-white/[0.04] hover:border-white/[0.08]',
        className,
      )}
    >
      {/* Top Header: Icon, Name, and Quick Actions */}
      <div className="flex items-start justify-between gap-2.5 mb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FolderOpen className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-foreground truncate" title={item.name}>
              {item.name}
            </h4>
            <p className="text-[11px] font-mono text-muted-foreground truncate" title={item.path}>
              {item.path}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <DkButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowRoleSelect((prev) => !prev)}
            title="Manage folder roles"
            aria-label={`Manage roles for ${item.name}`}
            className={cn(
              'h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer rounded-lg',
              showRoleSelect && 'bg-[var(--dk-surface-ghost-hover)] text-primary',
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium hidden sm:inline">Roles</span>
          </DkButton>
          <DkButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onCopyPath(item.path)}
            title="Copy path"
            aria-label="Copy path"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer rounded-lg"
          >
            <Copy className="h-3.5 w-3.5" />
          </DkButton>
          <DkButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRemove(item.path)}
            title="Remove path"
            aria-label={`Remove ${item.name}`}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer rounded-lg"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </DkButton>
        </div>
      </div>

      {/* Status Badges & Direct Rescan Action */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {/* Storage Kind Badge */}
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border border-white/[0.04]',
              isNetwork
                ? 'bg-primary/15 text-primary'
                : 'bg-primary/10 text-primary',
            )}
            data-testid="storage-kind-badge"
          >
            {isNetwork ? <Network className="h-3 w-3" /> : <HardDrive className="h-3 w-3" />}
            <span>{storageKind}</span>
          </span>

          {/* Directory Watcher Status Badge */}
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-primary/10 text-primary border border-white/[0.04]"
            data-testid="watcher-status-badge"
          >
            {isIndexing ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <Eye className="h-3 w-3" />
            )}
            <span>{watcherStatus}</span>
          </span>
        </div>

        {/* Rescan & Match Metadata Button */}
        <DkButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onRescan?.(item.path)}
          disabled={isScanning}
          loading={isScanning}
          title="Rescan & Match Metadata"
          aria-label={`Rescan & Match Metadata for ${item.name}`}
          className="h-7 px-2.5 gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer rounded-lg bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)]"
        >
          <RefreshCw className={cn('h-3 w-3', isScanning && 'animate-spin')} />
          <span className="text-[11px] font-medium">Rescan & Match Metadata</span>
        </DkButton>
      </div>

      {/* Role Assignment: Badges by default, Toggles on demand */}
      {!showRoleSelect ? (
        <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            {item.isInstallation && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                <HardDrive className="h-3 w-3" />
                <span>Installation</span>
              </span>
            )}
            {item.isGamesDownload && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                <Download className="h-3 w-3" />
                <span>Download</span>
              </span>
            )}
            {item.isIso && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                <Disc className="h-3 w-3" />
                <span>ISO</span>
              </span>
            )}
            {!item.isInstallation && !item.isGamesDownload && !item.isIso && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium text-muted-foreground bg-[var(--dk-surface-base)] border border-white/[0.04]">
                <span>Game Library</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowRoleSelect(true)}
            className="text-[11px] text-muted-foreground hover:text-foreground font-medium transition-colors cursor-pointer shrink-0"
            aria-label={`Manage roles for ${item.name}`}
          >
            Edit
          </button>
        </div>
      ) : (
        <div className="pt-2 border-t border-white/[0.04] space-y-2 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Folder Roles
            </span>
            <button
              type="button"
              onClick={() => setShowRoleSelect(false)}
              className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
            >
              Done
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Installation Folder Toggle */}
            <button
              type="button"
              onClick={() => onToggleInstallation(item.path)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer border',
                item.isInstallation
                  ? 'bg-primary text-primary-foreground border-primary/20 shadow-xs'
                  : 'bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground border-white/[0.04]',
              )}
              title={item.isInstallation ? 'Assigned as Installation folder (Click to unassign)' : 'Click to assign as Installation folder'}
              aria-label={`Toggle installation for ${item.name}`}
              aria-pressed={item.isInstallation}
            >
              <HardDrive className="h-3 w-3" />
              <span>Installation</span>
              {item.isInstallation && <Check className="h-3 w-3 shrink-0" />}
            </button>

            {/* Games Download Folder Toggle (Strictly 1 max) */}
            <button
              type="button"
              onClick={() => onAssignDownload(item.path)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer border',
                item.isGamesDownload
                  ? 'bg-primary text-primary-foreground border-primary/20 shadow-xs'
                  : 'bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground border-white/[0.04]',
              )}
              title={
                item.isGamesDownload
                  ? 'Assigned as Games Download folder (Limit 1)'
                  : 'Click to assign as Games Download folder (replaces any other download folder)'
              }
              aria-label={`Assign download for ${item.name}`}
              aria-pressed={item.isGamesDownload}
            >
              <Download className="h-3 w-3" />
              <span>Download</span>
              <span
                className={cn(
                  'text-[9px] px-1 py-0.2 rounded font-mono',
                  item.isGamesDownload
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-[var(--dk-surface-ghost)] text-muted-foreground',
                )}
              >
                1 max
              </span>
              {item.isGamesDownload && <Check className="h-3 w-3 shrink-0" />}
            </button>

            {/* ISO Folder Toggle */}
            <button
              type="button"
              onClick={() => onToggleIso(item.path)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer border',
                item.isIso
                  ? 'bg-primary text-primary-foreground border-primary/20 shadow-xs'
                  : 'bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground border-white/[0.04]',
              )}
              title={item.isIso ? 'Assigned as ISO / ROM library (Click to change to game folder)' : 'Click to assign as ISO / ROM folder'}
              aria-label={`Toggle ISO for ${item.name}`}
              aria-pressed={item.isIso}
            >
              <Disc className="h-3 w-3" />
              <span>ISO Folder</span>
              {item.isIso && <Check className="h-3 w-3 shrink-0" />}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
