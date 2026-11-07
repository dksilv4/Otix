import { Play, Loader2, CheckCircle2 } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import type { OrganizeProgress } from '../../../utils/organize-test-run'

export interface OrganizeFooterProps {
  canExecute: boolean
  executing: boolean
  loading: boolean
  actionableCount: number
  deleteEmptyFolders: boolean
  onToggleDeleteEmptyFolders: (val: boolean) => void
  onExecute: () => void
  onStopExecute: () => void
  onClose: () => void
  progress: OrganizeProgress | null
  scanError: string | null
  selectedFolder: string
  filteredCount: number
  directoryCount: number
}

export const OrganizeFooter = ({
  canExecute,
  executing,
  loading,
  actionableCount,
  deleteEmptyFolders,
  onToggleDeleteEmptyFolders,
  onExecute,
  onStopExecute,
  onClose,
  progress,
  scanError,
  selectedFolder,
  filteredCount,
  directoryCount,
}: OrganizeFooterProps) => {
  return (
    <div className="pt-2.5 border-t border-white/[0.04] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
      <div className="flex items-center gap-2 text-muted-foreground min-w-0">
        <CheckCircle2 size={13} className="text-primary shrink-0" />
        <span className="truncate">
          {scanError
            ? 'Check folder path or choose a different folder to preview.'
            : !selectedFolder
              ? 'Select or browse a target folder to preview organization rules.'
              : filteredCount === 0
                ? 'No game files discovered in the selected folder.'
                : `Read-only dry run on ${filteredCount} item${filteredCount === 1 ? '' : 's'} across ${directoryCount} ${directoryCount === 1 ? 'directory' : 'directories'}. No files on disk have been altered.`}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
        {canExecute && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground select-none cursor-pointer hover:text-foreground transition-colors mr-1">
            <input
              type="checkbox"
              checked={deleteEmptyFolders}
              onChange={(e) => onToggleDeleteEmptyFolders(e.target.checked)}
              className="rounded border-white/[0.08] text-primary focus:ring-primary h-3.5 w-3.5"
            />
            <span>Delete empty folders</span>
          </label>
        )}
        {canExecute && (
          <DkButton
            size="sm"
            variant="primary"
            onClick={executing ? onStopExecute : onExecute}
            disabled={loading}
            className="cursor-pointer h-8 text-xs gap-1.5"
          >
            {executing ? (
              <>
                <Loader2 size={12} className="animate-spin shrink-0" />
                <span>Stop ({progress?.percent ?? 0}%)</span>
              </>
            ) : (
              <>
                <Play size={12} className="shrink-0" />
                <span>Execute ({actionableCount})</span>
              </>
            )}
          </DkButton>
        )}
        <DkButton
          size="sm"
          variant="ghost"
          onClick={onClose}
          className="cursor-pointer h-8 text-xs"
        >
          Close
        </DkButton>
      </div>
    </div>
  )
}
