import { Check, CheckCircle2, HardDrive, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NodeExplorerBrowseResult } from '../../node-explorer-types'

export interface ExplorerFooterProps {
  isModal: boolean
  browseData?: NodeExplorerBrowseResult
  isCurrentFolderDownloadTarget: boolean
  onSetDownloadLocation: () => void
  onResetDownloadLocation: () => void
  isSettingDownloadPath: boolean
}

export const ExplorerFooter = ({
  isModal,
  browseData,
  isCurrentFolderDownloadTarget,
  onSetDownloadLocation,
  onResetDownloadLocation,
  isSettingDownloadPath,
}: ExplorerFooterProps) => {
  return (
    <>
      {/* Download folder strip */}
      <div
        className={cn(
          'flex shrink-0 flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between',
          isModal
            ? 'mx-4 mb-2 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] px-3 py-2.5'
            : 'border-b border-white/[0.04] bg-muted/20 px-4 py-2.5',
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <HardDrive className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="shrink-0 font-medium text-muted-foreground">Download folder</span>
          <span className="truncate font-mono text-[11px] text-foreground">
            {browseData?.active_download_path || 'storage/downloads'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isCurrentFolderDownloadTarget ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-status-online/10 px-2.5 py-1 text-[11px] font-semibold text-status-online">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Current folder
            </span>
          ) : (
            <button
              type="button"
              onClick={onSetDownloadLocation}
              disabled={isSettingDownloadPath}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
            >
              <Check className="h-3 w-3" />
              {isSettingDownloadPath ? 'Saving…' : 'Use this folder'}
            </button>
          )}

          {browseData?.active_download_path &&
            browseData.active_download_path !== './storage/downloads' && (
              <button
                type="button"
                onClick={onResetDownloadLocation}
                disabled={isSettingDownloadPath}
                title="Reset download location to default storage/downloads"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition-colors cursor-pointer border border-white/[0.06] bg-[var(--dk-surface-ghost)] text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset</span>
              </button>
            )}
        </div>
      </div>

      {/* Path status footer */}
      {browseData && (
        <div
          className={cn(
            'flex shrink-0 items-center justify-between gap-3 text-[11px]',
            isModal
              ? 'border-t border-white/[0.04] px-4 py-3 text-muted-foreground'
              : 'border-t border-white/[0.04] bg-muted/20 px-4 py-2 text-muted-foreground',
          )}
        >
          <span>{browseData.total_items} items</span>
          <span className="max-w-[65%] truncate font-mono text-[10px] opacity-80">
            {browseData.current_path}
          </span>
        </div>
      )}
    </>
  )
}
