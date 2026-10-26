import { useState } from 'react'
import { Plus, X, FolderPlus, Check, HardDrive, Download, Disc, SlidersHorizontal } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { PathInput } from '@/components/path-picker/path-input'
import { cn } from '@/lib/utils'

import type { SuggestedPathItem } from '../../utils/paths'

export interface AddPathFolderCardProps {
  isAdding: boolean
  onStartAdding: () => void
  onCancelAdding: () => void
  draftPath: string
  onDraftPathChange: (val: string) => void
  draftRoles: {
    installation: boolean
    download: boolean
    iso: boolean
  }
  onToggleDraftRole: (role: 'installation' | 'download' | 'iso') => void
  onSubmit: (path: string) => void | Promise<void>
  suggestions?: SuggestedPathItem[]
  onSelectSuggestion?: (path: string) => void
  folderTarget?: 'local' | 'server'
  remoteNodeId?: number | null
  desktop: boolean
  viewMode?: 'cards' | 'list'
  className?: string
}

export const AddPathFolderCard = ({
  isAdding,
  onStartAdding,
  onCancelAdding,
  draftPath,
  onDraftPathChange,
  draftRoles,
  onToggleDraftRole,
  onSubmit,
  suggestions = [],
  onSelectSuggestion,
  folderTarget,
  remoteNodeId,
  desktop,
  viewMode = 'cards',
  className,
}: AddPathFolderCardProps) => {
  const [showRoles, setShowRoles] = useState(false)

  const hasAssignedRoles = draftRoles.installation || draftRoles.download || draftRoles.iso

  const placeholder =
    desktop && !remoteNodeId
      ? draftRoles.iso
        ? 'e.g. D:\\ISOs or /Volumes/Storage/ROMs'
        : 'e.g. D:\\Games\\Steam or ~/Games'
      : draftRoles.iso
        ? 'e.g. /media/isos'
        : 'e.g. /media/games'

  const handleCancel = () => {
    setShowRoles(false)
    onCancelAdding()
  }

  if (viewMode === 'list') {
    if (!isAdding) {
      return (
        <button
          type="button"
          onClick={onStartAdding}
          className={cn(
            'w-full flex items-center justify-center gap-2 p-3 rounded-2xl transition-all duration-200 cursor-pointer group select-none',
            'border border-dashed border-white/[0.08] hover:border-primary/40',
            'bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)]',
            className,
          )}
          aria-label="Add Folder"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:scale-105 transition-transform">
            <Plus className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
            Add Folder
          </span>
        </button>
      )
    }

    return (
      <div
        className={cn(
          'p-3.5 rounded-2xl bg-[var(--dk-surface-ghost)] border border-primary/25 shadow-[var(--dk-shadow-glass)] space-y-3 transition-all',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <FolderPlus className="h-3.5 w-3.5 text-primary" />
            <span>Add Folder</span>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-colors cursor-pointer"
            aria-label="Cancel adding folder"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex-1 min-w-0">
            <PathInput
              compact
              commitOnBlur={false}
              commitOnBrowse={false}
              showConfirmButton={false}
              value={draftPath}
              onChange={onDraftPathChange}
              onCommit={onSubmit}
              placeholder={placeholder}
              target={folderTarget}
              serverId={remoteNodeId ?? undefined}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="text-xs"
            >
              Cancel
            </DkButton>
            <DkButton
              type="button"
              variant="default"
              size="sm"
              onClick={() => onSubmit(draftPath)}
              disabled={!draftPath.trim()}
              className="gap-1.5 text-xs font-semibold shadow-xs"
              aria-label="Confirm & Add"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Add Folder</span>
            </DkButton>
          </div>
        </div>

        {suggestions.length > 0 && (
          <div className="pt-2">
            <div className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground mb-1.5">
              Quick Suggestions
            </div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onDraftPathChange(s.path)
                    onSelectSuggestion?.(s.path)
                  }}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-medium bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] border border-white/[0.04] transition-all cursor-pointer"
                >
                  <Plus className="h-3 w-3 text-primary" />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Optional Role Assignment Toggle */}
        <div className="pt-1 border-t border-white/[0.04]">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowRoles(!showRoles)}
              aria-label="Assign roles"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-0.5"
            >
              <SlidersHorizontal className="h-3 w-3" />
              <span>{showRoles ? 'Hide role options' : hasAssignedRoles ? 'Edit assigned roles' : '+ Assign roles (optional)'}</span>
            </button>

            {hasAssignedRoles && !showRoles && (
              <div className="flex items-center gap-1 text-[10px]">
                {draftRoles.installation && <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">Install</span>}
                {draftRoles.download && <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">Download</span>}
                {draftRoles.iso && <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">ISO</span>}
              </div>
            )}
          </div>

          {showRoles && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2">
              <button
                type="button"
                aria-label="Assign installation on add"
                onClick={() => onToggleDraftRole('installation')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer border',
                  draftRoles.installation
                    ? 'bg-primary text-primary-foreground border-primary/20 shadow-xs'
                    : 'bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground border-white/[0.04]',
                )}
              >
                <HardDrive className="h-3 w-3" />
                <span>Installation</span>
              </button>
              <button
                type="button"
                aria-label="Assign download on add"
                onClick={() => onToggleDraftRole('download')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer border',
                  draftRoles.download
                    ? 'bg-primary text-primary-foreground border-primary/20 shadow-xs'
                    : 'bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground border-white/[0.04]',
                )}
              >
                <Download className="h-3 w-3" />
                <span>Download (1 max)</span>
              </button>
              <button
                type="button"
                aria-label="Assign ISO on add"
                onClick={() => onToggleDraftRole('iso')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer border',
                  draftRoles.iso
                    ? 'bg-primary text-primary-foreground border-primary/20 shadow-xs'
                    : 'bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground border-white/[0.04]',
                )}
              >
                <Disc className="h-3 w-3" />
                <span>ISO Folder</span>
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Cards View
  if (!isAdding) {
    return (
      <button
        type="button"
        onClick={onStartAdding}
        className={cn(
          'group relative flex flex-col items-center justify-center min-h-[140px] p-5 rounded-2xl transition-all duration-200 cursor-pointer select-none text-center',
          'border border-dashed border-white/[0.08] hover:border-primary/40',
          'bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)]',
          'hover:shadow-[var(--dk-shadow-sm)]',
          className,
        )}
        aria-label="Add Folder"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary group-hover:scale-105 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-200 mb-2 shadow-xs">
          <Plus className="h-5 w-5" />
        </div>
        <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
          Add Folder
        </span>
      </button>
    )
  }

  return (
    <div
      className={cn(
        'group relative flex flex-col justify-between p-4 rounded-2xl transition-all duration-200',
        'bg-[var(--dk-surface-ghost)] border border-primary/30 shadow-[var(--dk-shadow-glass)]',
        'min-h-[140px] gap-3',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <FolderPlus className="h-3.5 w-3.5 text-primary" />
          <span>New Folder</span>
        </div>
        <button
          type="button"
          onClick={handleCancel}
          className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-colors cursor-pointer"
          aria-label="Cancel adding folder"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        <PathInput
          compact
          commitOnBlur={false}
          commitOnBrowse={false}
          showConfirmButton={false}
          value={draftPath}
          onChange={onDraftPathChange}
          onCommit={onSubmit}
          placeholder={placeholder}
          target={folderTarget}
          serverId={remoteNodeId ?? undefined}
        />

        {suggestions.length > 0 && (
          <div className="pt-2">
            <div className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground mb-1.5">
              Quick Suggestions
            </div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onDraftPathChange(s.path)
                    onSelectSuggestion?.(s.path)
                  }}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-medium bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] border border-white/[0.04] transition-all cursor-pointer"
                >
                  <Plus className="h-3 w-3 text-primary" />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Optional Role Assignment Toggle */}
        <div className="pt-0.5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowRoles(!showRoles)}
              aria-label="Assign roles"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-0.5"
            >
              <SlidersHorizontal className="h-3 w-3" />
              <span>{showRoles ? 'Hide role options' : hasAssignedRoles ? 'Edit assigned roles' : '+ Assign roles (optional)'}</span>
            </button>

            {hasAssignedRoles && !showRoles && (
              <div className="flex items-center gap-1 text-[10px]">
                {draftRoles.installation && <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">Install</span>}
                {draftRoles.download && <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">Download</span>}
                {draftRoles.iso && <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">ISO</span>}
              </div>
            )}
          </div>

          {showRoles && (
            <div className="flex flex-wrap items-center gap-1 pt-1.5 animate-in fade-in duration-150">
              <button
                type="button"
                aria-label="Assign installation on add"
                onClick={() => onToggleDraftRole('installation')}
                className={cn(
                  'flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer border',
                  draftRoles.installation
                    ? 'bg-primary text-primary-foreground border-primary/20 shadow-xs'
                    : 'bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground border-white/[0.04]',
                )}
              >
                <HardDrive className="h-3 w-3" />
                <span>Install</span>
              </button>
              <button
                type="button"
                aria-label="Assign download on add"
                onClick={() => onToggleDraftRole('download')}
                className={cn(
                  'flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer border',
                  draftRoles.download
                    ? 'bg-primary text-primary-foreground border-primary/20 shadow-xs'
                    : 'bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground border-white/[0.04]',
                )}
              >
                <Download className="h-3 w-3" />
                <span>Download</span>
              </button>
              <button
                type="button"
                aria-label="Assign ISO on add"
                onClick={() => onToggleDraftRole('iso')}
                className={cn(
                  'flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer border',
                  draftRoles.iso
                    ? 'bg-primary text-primary-foreground border-primary/20 shadow-xs'
                    : 'bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground border-white/[0.04]',
                )}
              >
                <Disc className="h-3 w-3" />
                <span>ISO</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/[0.04]">
        <DkButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          className="text-xs h-7 px-2.5"
        >
          Cancel
        </DkButton>
        <DkButton
          type="button"
          variant="default"
          size="sm"
          onClick={() => onSubmit(draftPath)}
          disabled={!draftPath.trim()}
          className="gap-1 text-xs font-semibold h-7 px-3 shadow-xs"
          aria-label="Confirm & Add"
        >
          <Check className="h-3.5 w-3.5" />
          <span>Add Folder</span>
        </DkButton>
      </div>
    </div>
  )
}
