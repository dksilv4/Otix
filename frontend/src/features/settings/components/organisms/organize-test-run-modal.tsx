import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Folder,
  FolderOpen,
  Gamepad2,
  Info,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { MatchReviewCenterModal } from './match-review-center-modal'
import { FileRow } from './organize/file-row'
import { DirectorySection } from './organize/directory-section'
import { OrganizeControlPanel } from './organize/organize-control-panel'
import { OrganizeFooter } from './organize/organize-footer'
import { useOrganizeModalState } from '../../hooks/use-organize-modal-state'
import { getOrganizerApi } from '../../utils/organize-test-run'
import type { PreviewItem } from '../../utils/organize-test-run'

export type { PreviewItem }

export interface OrganizeTestRunModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodeId?: number | null
  template: string
  isoDirectory: string
  availableScanPaths?: Array<{ path: string; type?: string }>
  defaultDeleteEmptyFolders?: boolean
}

export const OrganizeTestRunModal = (props: OrganizeTestRunModalProps) => {
  const { open, onOpenChange, nodeId } = props
  const state = useOrganizeModalState(props)

  if (!open) return null

  return (
    <>
      <DkDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Organize Test Run"
        description="Live dry-run preview comparing every real file and folder before and after organization rules are applied."
        className="max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden"
      >
        <div className="flex flex-col flex-1 min-h-0 space-y-3">
          {/* Unified Top Control Panel */}
          <OrganizeControlPanel
            folderOptions={state.pathsState.folderOptions}
            selectedFolder={state.pathsState.selectedFolder}
            onSelectFolder={state.handleSelectFolder}
            onBrowseFolder={state.handleBrowseFolder}
            onRefresh={() => void state.fetchRealPreview(state.pathsState.selectedFolder)}
            loading={state.loading}
            filterTab={state.filterTab}
            onFilterTabChange={state.setFilterTab}
            metrics={state.metrics}
            searchQuery={state.searchQuery}
            onSearchQueryChange={state.setSearchQuery}
            groupByDir={state.groupByDir}
            onToggleGroupByDir={() => state.setGroupByDir((prev) => !prev)}
            allExpanded={state.allExpanded}
            onToggleExpandCollapse={() => state.setAllExpanded((prev) => (prev === true ? false : true))}
            hasDirectories={state.directoryGroups.length > 0}
          />

          {/* Progress Bar Banner */}
          {state.execution.executing && state.execution.progress && (
            <div className="p-3 sm:p-3.5 rounded-2xl bg-[var(--dk-surface-ghost)] border border-primary/20 space-y-2.5 transition-colors">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Loader2 size={13} className="animate-spin text-primary shrink-0" />
                  <span className="font-semibold text-foreground truncate">
                    Organizing items ({state.execution.progress.current} of {state.execution.progress.total})
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {state.execution.progress.failed > 0 && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-medium">
                      {state.execution.progress.failed} failed
                    </span>
                  )}
                  <span className="font-mono text-xs font-bold text-primary">
                    {state.execution.progress.percent}%
                  </span>
                </div>
              </div>

              {/* Progress Bar Track */}
              <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full bg-primary transition-colors duration-300 ease-out"
                  style={{ width: `${Math.max(2, Math.min(100, state.execution.progress.percent))}%` }}
                />
              </div>

              {/* Current moving file breadcrumb */}
              {state.execution.progress.currentName && (
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0 font-mono truncate">
                    <ArrowRight size={11} className="text-primary shrink-0" />
                    <span className="truncate">{state.execution.progress.currentName}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/70 font-mono shrink-0">
                    {state.execution.progress.succeeded} organized
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Success execution banner */}
          {state.execution.executedCount !== null && (
            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                <CheckCircle2 size={14} className="shrink-0" />
                <span>
                  Successfully organized {state.execution.executedCount} game artifacts!
                </span>
              </div>
              <DkButton
                size="sm"
                variant="ghost"
                onClick={() => state.execution.setExecutedCount(null)}
                className="text-xs h-6 px-2 text-primary hover:bg-primary/15"
              >
                Dismiss
              </DkButton>
            </div>
          )}

          {/* Execution error banner */}
          {state.execution.executionError !== null && (
            <div className="p-2.5 rounded-xl bg-destructive/15 border border-destructive/25 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-destructive">
                <AlertCircle size={14} className="shrink-0" />
                <span>{state.execution.executionError}</span>
              </div>
              <DkButton
                size="sm"
                variant="ghost"
                onClick={() => state.execution.setExecutionError(null)}
                className="text-xs h-6 px-2 text-destructive hover:bg-destructive/20"
              >
                Dismiss
              </DkButton>
            </div>
          )}

          {/* Unmatched games banner (Radarr / Sonarr style) */}
          {state.unmatchedItems.length > 0 && (
            <div className="p-3 sm:p-3.5 rounded-2xl bg-primary/10 border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-2.5 text-xs min-w-0">
                <AlertCircle size={16} className="text-primary shrink-0 mt-0.5 sm:mt-0" />
                <div className="space-y-0.5 min-w-0">
                  <p className="font-semibold text-foreground truncate">
                    {state.unmatchedItems.length} {state.unmatchedItems.length === 1 ? 'game requires' : 'games require'} matching before organizing
                  </p>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    Only matched games can be organized into your library. Unmatched games cannot be moved or renamed until resolved.
                  </p>
                </div>
              </div>
              <DkButton
                size="sm"
                variant="primary"
                onClick={() => state.setMatchReviewOpen(true)}
                className="text-xs h-7.5 px-3 shrink-0 cursor-pointer self-start sm:self-auto gap-1.5"
              >
                <Gamepad2 size={12} className="shrink-0" />
                <span>Review & Match Games</span>
              </DkButton>
            </div>
          )}

          {/* Scrollable Live Preview Stream */}
          <div className="flex-1 min-h-[300px] overflow-y-auto pr-1 space-y-2.5">
            {state.loading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
                <Loader2 size={16} className="animate-spin text-primary" />
                <span className="text-xs">
                  Scanning target directory and computing organization paths...
                </span>
              </div>
            ) : state.scanError ? (
              <div className="p-6 text-center rounded-2xl bg-[var(--dk-surface-ghost)] border border-destructive/20 space-y-2.5">
                <AlertCircle size={26} className="mx-auto text-destructive" />
                <p className="text-sm font-semibold text-foreground">
                  Folder Scan Error
                </p>
                <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                  {state.scanError}
                </p>
                <div className="pt-1 flex items-center justify-center gap-2">
                  {state.pathsState.selectedFolder && (
                    <DkButton
                      size="sm"
                      variant="primary"
                      onClick={() => void state.fetchRealPreview(state.pathsState.selectedFolder)}
                      className="cursor-pointer h-8 text-xs"
                    >
                      <RefreshCw size={11} className="mr-1.5" />
                      Retry Scan
                    </DkButton>
                  )}
                  {getOrganizerApi()?.selectDirectory && (
                    <DkButton
                      size="sm"
                      variant="ghost"
                      onClick={state.handleBrowseFolder}
                      className="cursor-pointer h-8 text-xs border border-white/[0.04]"
                    >
                      <FolderOpen size={12} className="mr-1.5" />
                      Browse Different Folder
                    </DkButton>
                  )}
                </div>
              </div>
            ) : !state.pathsState.selectedFolder ? (
              <div className="p-6 text-center rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] space-y-2.5">
                <FolderOpen size={26} className="mx-auto text-primary" />
                <p className="text-sm font-semibold text-foreground">
                  Select or Browse a Folder to Test
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                  Pick a library folder from the dropdown above, or browse your computer to select any directory containing games, ROMs, or repacks.
                </p>
                {getOrganizerApi()?.selectDirectory && (
                  <div className="pt-1 flex items-center justify-center">
                    <DkButton
                      size="sm"
                      variant="primary"
                      onClick={state.handleBrowseFolder}
                      className="cursor-pointer h-8 text-xs"
                    >
                      <FolderOpen size={12} className="mr-1.5" />
                      Browse Folder
                    </DkButton>
                  </div>
                )}
              </div>
            ) : state.filteredList.length === 0 ? (
              <div className="p-6 text-center rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] space-y-2.5">
                <Info size={22} className="mx-auto text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">
                  {state.searchQuery
                    ? 'No matching files found for search query'
                    : 'No game files found in this folder'}
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                  {state.searchQuery
                    ? `No items in ${state.pathsState.selectedFolder} match "${state.searchQuery}".`
                    : `No game files, ISOs, ROMs, or packages were discovered in "${state.pathsState.selectedFolder}". Select a different folder or browse computer.`}
                </p>
                <div className="pt-0.5 text-[10px] text-muted-foreground/80 flex flex-wrap justify-center gap-1.5 max-w-md mx-auto">
                  <span>Supported:</span>
                  <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-white/[0.04]">ISOs & ROMs</span>
                  <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-white/[0.04]">PC Game EXEs</span>
                  <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-white/[0.04]">Repack Bins & Archives</span>
                  <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-white/[0.04]">Console Packages</span>
                </div>
                {getOrganizerApi()?.selectDirectory && (
                  <div className="pt-1 flex items-center justify-center">
                    <DkButton
                      size="sm"
                      variant="ghost"
                      onClick={state.handleBrowseFolder}
                      className="cursor-pointer h-8 text-xs border border-white/[0.04]"
                    >
                      <FolderOpen size={12} className="mr-1.5" />
                      Browse Another Folder
                    </DkButton>
                  </div>
                )}
              </div>
            ) : state.groupByDir ? (
              /* Directory Sections: One single card per directory under target folder */
              state.directoryGroups.map((group) => (
                <DirectorySection
                  key={group.id}
                  group={group}
                  rootDir={state.pathsState.selectedFolder}
                  forceExpanded={state.allExpanded}
                />
              ))
            ) : (
              /* Flat view: Single container of file rows */
              <div className="rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] overflow-hidden">
                <div className="hidden md:grid grid-cols-2 gap-4 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider bg-white/[0.015] border-b border-white/[0.03]">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Folder size={11} />
                    <span>Current Source Location</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-primary pl-4">
                    <ArrowRight size={11} />
                    <span>Target Organized Location</span>
                  </div>
                </div>
                <div className="divide-y divide-white/[0.03]">
                  {state.filteredList.map((item, idx) => (
                    <FileRow
                      key={`${item.sourceFilename}-${idx}`}
                      item={item}
                      rootDir={state.pathsState.selectedFolder}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer Controls */}
          <OrganizeFooter
            canExecute={state.canExecute}
            executing={state.execution.executing}
            loading={state.loading}
            actionableCount={state.actionableItems.length}
            deleteEmptyFolders={state.deleteEmptyFolders}
            onToggleDeleteEmptyFolders={state.setDeleteEmptyFolders}
            onExecute={state.execution.handleExecute}
            onStopExecute={state.execution.handleStopExecute}
            onClose={() => onOpenChange(false)}
            progress={state.execution.progress}
            scanError={state.scanError}
            selectedFolder={state.pathsState.selectedFolder}
            filteredCount={state.filteredList.length}
            directoryCount={state.directoryGroups.length}
          />
        </div>
      </DkDialog>

      {/* Match Review Center Modal Integration */}
      {state.matchReviewOpen && (
        <MatchReviewCenterModal
          open={state.matchReviewOpen}
          onOpenChange={state.setMatchReviewOpen}
          nodeId={nodeId ?? 0}
        />
      )}
    </>
  )
}
