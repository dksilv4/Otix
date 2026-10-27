import type React from 'react'
import { FolderSync, ArrowRight, FolderOpen, CheckCircle2, ArrowRightLeft, X } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkSwitch } from '@ui/atoms/switch'
import { cn } from '@/lib/utils'
import {
  useDownloadRelocation,
  type RelocationItem,
} from '../../hooks/use-download-relocation'

export interface DownloadRelocationPromptProps {
  items?: RelocationItem[]
  activeItem?: RelocationItem | null
  totalCount?: number
  isRelocating?: boolean
  autoOrganizeEnabled?: boolean
  onRelocate?: (itemId: string) => Promise<boolean | void> | void
  onRelocateAll?: () => Promise<boolean | void> | void
  onAutoOrganizeToggle?: (enabled: boolean) => Promise<void> | void
  onDismiss?: (itemId: string) => void
  className?: string
}

export const DownloadRelocationPrompt = ({
  items: propItems,
  activeItem: propActiveItem,
  totalCount: propTotalCount,
  isRelocating: propIsRelocating,
  autoOrganizeEnabled: propAutoOrganizeEnabled,
  onRelocate: propOnRelocate,
  onRelocateAll: propOnRelocateAll,
  onAutoOrganizeToggle: propOnAutoOrganizeToggle,
  onDismiss: propOnDismiss,
  className,
}: DownloadRelocationPromptProps) => {
  const hook = useDownloadRelocation()

  const items = propItems ?? hook.unorganizedItems
  const currentItem = propActiveItem ?? (items.length > 0 ? items[0] : null)
  const totalCount = propTotalCount ?? items.length
  const isRelocating = propIsRelocating ?? hook.isRelocating
  const autoOrganize = propAutoOrganizeEnabled ?? hook.autoOrganizeEnabled

  const handleRelocate = propOnRelocate ?? hook.relocate
  const handleRelocateAll = propOnRelocateAll ?? hook.relocateAll
  const handleToggle = propOnAutoOrganizeToggle ?? hook.setAutoOrganizeEnabled
  const handleDismiss = propOnDismiss ?? hook.dismissItem

  if (!currentItem || items.length === 0) {
    return null
  }

  return (
    <div
      role="region"
      aria-label="Download relocation prompt"
      className={cn(
        'relative overflow-hidden rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-xl shadow-[var(--dk-shadow-glass)] p-4 sm:p-5 text-foreground border border-white/[0.05]',
        className,
      )}
    >
      {/* Header section */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FolderSync className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-tight text-foreground">
                Relocate to Library
              </h3>
              {totalCount > 1 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">
                  {totalCount} ready
                </span>
              )}
              {currentItem.platform && (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-primary/10 text-primary">
                  {currentItem.platform}
                </span>
              )}
              {currentItem.releaseGroup && (
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--dk-surface-ghost)] text-muted-foreground">
                  {currentItem.releaseGroup}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Completed download detected in staging. Confirm relocation to normalize paths and index game metadata.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleDismiss(currentItem.id)}
          aria-label="Dismiss prompt"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Destination path preview */}
      <div className="mt-3.5 space-y-2 rounded-xl bg-[var(--dk-surface-ghost)] p-3 sm:p-3.5">
        {/* Source path */}
        <div className="flex items-start gap-2.5 text-xs">
          <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
            <FolderOpen className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-medium text-muted-foreground block">
              Source (Staging)
            </span>
            <span
              data-testid="relocation-source-path"
              className="font-mono text-xs text-muted-foreground break-all select-all block mt-0.5"
            >
              {currentItem.sourcePath}
            </span>
          </div>
        </div>

        {/* Transition indicator */}
        <div className="flex items-center gap-2 pl-6 text-primary/70">
          <ArrowRight className="h-3.5 w-3.5" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">
            Proposed Destination
          </span>
        </div>

        {/* Destination path */}
        <div className="flex items-start gap-2.5 text-xs">
          <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-medium text-foreground block">
              Library Target
            </span>
            <span
              data-testid="relocation-target-path"
              className="font-mono text-xs font-semibold text-foreground break-all select-all block mt-0.5"
            >
              {currentItem.targetPath}
            </span>
          </div>
        </div>
      </div>

      {/* Action controls & Auto-organize toggle */}
      <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
        {/* Auto-organize setting toggle */}
        <div className="flex items-center gap-2.5">
          <DkSwitch
            id="auto-organize-toggle"
            data-testid="auto-organize-toggle"
            checked={autoOrganize}
            onCheckedChange={(checked) => void handleToggle(checked)}
          />
          <label
            htmlFor="auto-organize-toggle"
            className="text-xs text-muted-foreground cursor-pointer select-none"
          >
            <span className="font-semibold text-foreground">Auto-organize</span> future downloads
          </label>
        </div>

        {/* 1-Click Relocate button */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          {totalCount > 1 && (
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleRelocateAll()}
              disabled={isRelocating}
              className="text-xs"
            >
              Relocate All ({totalCount})
            </DkButton>
          )}
          <DkButton
            type="button"
            variant="primary"
            size="sm"
            data-testid="relocate-button"
            loading={isRelocating}
            loadingText="Relocating..."
            leftIcon={ArrowRightLeft}
            onClick={() => void handleRelocate(currentItem.id)}
            className="bg-primary text-primary-foreground font-semibold shadow-sm hover:bg-primary/90"
          >
            Relocate to Library
          </DkButton>
        </div>
      </div>
    </div>
  )
}
