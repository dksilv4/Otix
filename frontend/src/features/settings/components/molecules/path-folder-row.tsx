import { useState } from 'react'
import { FolderOpen, Copy, Trash2, Check, HardDrive, Download, Disc, SlidersHorizontal } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { cn } from '@/lib/utils'
import type { ConfiguredFolderItem } from '../../utils/paths'

export interface PathFolderRowProps {
  item: ConfiguredFolderItem
  onToggleInstallation: (path: string) => void
  onAssignDownload: (path: string) => void
  onToggleIso: (path: string) => void
  onRemove: (path: string) => void
  onCopyPath: (path: string) => void
  className?: string
}

export const PathFolderRow = ({
  item,
  onToggleInstallation,
  onAssignDownload,
  onToggleIso,
  onRemove,
  onCopyPath,
  className,
}: PathFolderRowProps) => {
  const [showRoleSelect, setShowRoleSelect] = useState(false)

  return (
    <div
      className={cn(
        'group flex flex-col justify-between gap-2.5 p-3 rounded-2xl transition-all duration-200',
        'bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)]',
        'border border-white/[0.04] hover:border-white/[0.08]',
        className,
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left: Icon, Name & Path */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FolderOpen className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground truncate" title={item.name}>
                {item.name}
              </h4>
            </div>
            <p className="text-[11px] font-mono text-muted-foreground truncate" title={item.path}>
              {item.path}
            </p>
          </div>
        </div>

        {/* Right: Badges & Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Active Badges */}
          <div className="flex items-center gap-1.5">
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

      {/* Expandable Role Selection Toggles */}
      {showRoleSelect && (
        <div className="pt-2 border-t border-white/[0.04] flex flex-wrap items-center justify-between gap-2 animate-in fade-in duration-150">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mr-1">
              Roles:
            </span>
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

          <button
            type="button"
            onClick={() => setShowRoleSelect(false)}
            className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}
