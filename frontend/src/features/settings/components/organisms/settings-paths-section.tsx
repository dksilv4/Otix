import { cn } from '@/lib/utils'
import { MatchingProgressCard } from '../molecules/matching-progress-card'
import { ScannedFilesSummary } from '../molecules/scanned-files-summary'
import { ViewScannedGamesModal } from './view-scanned-games-modal'
import { MatchReviewCenterModal } from './match-review-center-modal'
import { usePathsSectionState } from '../../hooks/use-paths-section-state'
import { DiscoveredNodeClaimBanner } from './paths/discovered-node-claim-banner'
import { GameMatchReviewBanner } from './paths/game-match-review-banner'
import { NodeOtixSidecarCard } from './paths/node-otix-sidecar-card'
import { PathsToolbar } from './paths/paths-toolbar'
import { PathsCardsView } from './paths/paths-cards-view'
import { PathsListView } from './paths/paths-list-view'

export interface SettingsPathsSectionProps {
  onScanComplete?: () => void
  onNavigateToOrganize?: () => void
  className?: string
  /** When set, load and save paths on this Otix node instead of the page-level selection. */
  nodeId?: number | null
}

export const SettingsPathsSection = ({
  onScanComplete,
  onNavigateToOrganize,
  className,
  nodeId,
}: SettingsPathsSectionProps) => {
  const state = usePathsSectionState({
    nodeId,
    onScanComplete,
    onNavigateToOrganize,
  })

  return (
    <div id="paths" className={cn('space-y-4 scroll-mt-28', className)}>
      <h2 className="sr-only">Paths</h2>

      {/* ── Discovered Node One-Click Claim Banner ── */}
      {state.unclaimedNodes.length > 0 && (
        <DiscoveredNodeClaimBanner
          unclaimedNode={state.unclaimedNodes[0]}
          isClaiming={state.isClaimingDiscovered}
          onClaim={() => state.handleClaimDiscoveredNode(state.unclaimedNodes[0])}
        />
      )}

      {/* ── Dedicated Matching Progress Bar & Live Status ── */}
      <MatchingProgressCard
        data={state.matching}
        onCancel={state.matching.cancelMatching}
      />

      {/* ── Scanned Files Quick Summary with Integrated Real-time Progress ── */}
      <ScannedFilesSummary
        summary={state.summaryState.summary}
        isLoading={state.summaryState.isSummaryLoading || state.scan.isScanning || state.isMatching}
        scanProgress={state.scan.scanProgress.progress}
        scanCurrentDir={state.scan.scanProgress.currentDir}
        scanPhase={state.scan.scanProgress.phase}
        onOrganizeClick={state.handleNavigateToOrganize}
        onRescanClick={state.scan.handleTriggerScan}
        onViewGamesClick={() => state.setViewGamesModalOpen(true)}
      />

      {/* ── Match Review Center Banner ── */}
      <GameMatchReviewBanner
        pendingMatchesCount={state.pendingMatchesCount}
        onOpenMatchCenter={() => state.setMatchCenterOpen(true)}
      />

      {/* Remote Otix Node Sidecar Options */}
      {state.remoteNodeId ? (
        <NodeOtixSidecarCard
          writeOtixAfterScan={state.otixSettings.writeOtixAfterScan}
          downloadOtixImages={state.otixSettings.downloadOtixImages}
          setWriteOtixAfterScan={state.otixSettings.setWriteOtixAfterScan}
          setDownloadOtixImages={state.otixSettings.setDownloadOtixImages}
          persistOtixSettings={state.otixSettings.persistOtixSettings}
        />
      ) : null}

      {/* ── Toolbar: Filter Tabs, Search & View Switcher ── */}
      <PathsToolbar
        filterTab={state.filterTab}
        onFilterTabChange={state.setFilterTab}
        counts={state.paths.counts}
        searchQuery={state.searchQuery}
        onSearchQueryChange={state.setSearchQuery}
        viewMode={state.viewMode}
        onViewModeChange={state.handleSetViewMode}
        remoteNodeId={state.remoteNodeId}
        isScanning={state.scan.isScanning}
        isClearingScan={state.scan.isClearingScan}
        isSyncingOtix={state.scan.isSyncingOtix}
        isMatching={state.isMatching}
        onClearScannedList={state.scan.handleClearScannedList}
        onRunCatalogMatching={state.scan.handleRunCatalogMatching}
        onTriggerScan={state.scan.handleTriggerScan}
      />

      {/* ── Configured Folders Display (Cards or List) ── */}
      {state.viewMode === 'cards' ? (
        <PathsCardsView
          isAddingFolder={state.isAddingFolder}
          onStartAdding={() => state.setIsAddingFolder(true)}
          onCancelAdding={() => {
            state.setIsAddingFolder(false)
            state.setDraftPath('')
            state.setDraftRoles({ installation: false, download: false, iso: false })
          }}
          draftPath={state.draftPath}
          onDraftPathChange={state.setDraftPath}
          draftRoles={state.draftRoles}
          onToggleDraftRole={state.onToggleDraftRole}
          onAddFolder={state.handleAddFolderSubmit}
          suggestions={state.suggestedPaths}
          folderTarget={state.folderTarget}
          remoteNodeId={state.remoteNodeId}
          desktop={state.desktop}
          filteredFolders={state.paths.filteredFolders}
          searchQuery={state.searchQuery}
          isScanning={state.scan.isScanning || state.isMatching}
          onToggleInstallation={state.paths.handleToggleInstallation}
          onAssignDownload={state.paths.handleAssignDownload}
          onToggleIso={state.paths.handleToggleIso}
          onRemove={state.paths.handleRemoveFolder}
          onCopyPath={state.paths.handleCopyPath}
          onRescan={(path) => state.scan.handleTriggerScan(path)}
        />
      ) : (
        <PathsListView
          isAddingFolder={state.isAddingFolder}
          onStartAdding={() => state.setIsAddingFolder(true)}
          onCancelAdding={() => {
            state.setIsAddingFolder(false)
            state.setDraftPath('')
            state.setDraftRoles({ installation: false, download: false, iso: false })
          }}
          draftPath={state.draftPath}
          onDraftPathChange={state.setDraftPath}
          draftRoles={state.draftRoles}
          onToggleDraftRole={state.onToggleDraftRole}
          onAddFolder={state.handleAddFolderSubmit}
          suggestions={state.suggestedPaths}
          folderTarget={state.folderTarget}
          remoteNodeId={state.remoteNodeId}
          desktop={state.desktop}
          filteredFolders={state.paths.filteredFolders}
          searchQuery={state.searchQuery}
          onToggleInstallation={state.paths.handleToggleInstallation}
          onAssignDownload={state.paths.handleAssignDownload}
          onToggleIso={state.paths.handleToggleIso}
          onRemove={state.paths.handleRemoveFolder}
          onCopyPath={state.paths.handleCopyPath}
        />
      )}

      {state.viewGamesModalOpen && (
        <ViewScannedGamesModal
          open={state.viewGamesModalOpen}
          onOpenChange={state.setViewGamesModalOpen}
          nodeId={state.remoteNodeId}
          nodeName={state.selectedNode?.name || 'Local Desktop'}
        />
      )}

      {state.matchCenterOpen && (
        <MatchReviewCenterModal
          open={state.matchCenterOpen}
          onOpenChange={state.setMatchCenterOpen}
          nodeId={state.remoteNodeId ?? 0}
        />
      )}
    </div>
  )
}
