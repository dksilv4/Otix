import { useState, useMemo, lazy, Suspense } from 'react'
import {
  ScanLine,
  Server,
  RefreshCw,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Sparkles,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkDropdown } from '@ui/atoms/dropdown'
import { useNodeScanFiles } from '../hooks/use-node-scan-files'
import { NodeScanPathsCard } from '../components/molecules/node-scan-paths-card'
import { NodeScannedFilesTable } from '../components/organisms/node-scanned-files-table'
import { NodeFileMatchModal } from '../components/organisms/node-file-match-modal'
import { NodeGameDetailsModal } from '../components/organisms/node-game-details-modal'
import { ScanProgressBar } from '../components/molecules/scan-progress-bar'
import { formatScanSize } from '../utils/node-scan-files'
import type { ScannedGameItem } from '../utils/scanned-summary'
import { isLocalDesktopNode } from '../local-desktop-node'
import { isDesktop } from '@/lib/desktop/api'
import { cn } from '@/lib/utils'

const NodeMassMatchModal = lazy(() =>
  import('../components/organisms/node-mass-match-modal').then((m) => ({
    default: m.NodeMassMatchModal,
  }))
)

export const SettingsNewNodeScanFilesPage = () => {
  const desktop = isDesktop()
  const {
    servers,
    effectiveNodeId,
    remoteNodeId,
    activeNode,
    setSelectedNodeId,

    // Scan paths
    scanPaths,
    isLoadingPaths,
    addScanPath,
    removeScanPath,

    // Scanning
    isScanning,
    scanProgress,
    triggerScan,

    // Files & Data
    allFiles,
    isFilesLoading,
    refetchFiles,
    stats,
    unlinkSource,

    // Filtering, Sorting, Pagination
    searchQuery,
    setSearchQuery,
    filterTab,
    setFilterTab,
    sortOption,
    setSortOption,
    page,
    setPage,
    pageSize,
    setPageSize,
    filteredCount,
    pagedFiles,
    totalPages,
    startIndex,
    endIndex,
  } = useNodeScanFiles()

  // Details modal state
  const [selectedDetailsGame, setSelectedDetailsGame] = useState<ScannedGameItem | null>(null)
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false)

  // Match modal state
  const [selectedMatchGame, setSelectedMatchGame] = useState<ScannedGameItem | null>(null)
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false)

  // Mass match modal state
  const [isMassMatchOpen, setIsMassMatchOpen] = useState(false)

  const nodeOptions = useMemo(
    () =>
      (servers || []).map((s) => ({
        value: String(s.id),
        label: `${s.name}${s.isLocal || (s as any).is_local || isLocalDesktopNode(s) || s.id === -1 ? ' (Local)' : ''}`,
      })),
    [servers],
  )

  const unmatchedGames = useMemo(
    () => (allFiles || []).filter((g) => !g.matched),
    [allFiles],
  )

  const handleOpenDetails = (game: ScannedGameItem) => {
    setSelectedDetailsGame(game)
    setIsDetailsModalOpen(true)
  }

  const handleOpenMatch = (game: ScannedGameItem) => {
    setSelectedMatchGame(game)
    setIsMatchModalOpen(true)
  }

  const handleOpenMatchFromDetails = (game: ScannedGameItem) => {
    setIsDetailsModalOpen(false)
    setSelectedMatchGame(game)
    setIsMatchModalOpen(true)
  }

  const handleMatchSuccess = (updatedGame?: ScannedGameItem) => {
    void refetchFiles()
    if (
      updatedGame &&
      selectedDetailsGame &&
      String(selectedDetailsGame.id) === String(updatedGame.id)
    ) {
      setSelectedDetailsGame(updatedGame)
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* ── Top Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-white/[0.04]">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shrink-0 shadow-xs mt-0.5">
            <ScanLine className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                New Node Scan Files
              </h1>
              {activeNode && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-muted-foreground flex items-center gap-1.5">
                  <Server className="h-3 w-3 text-primary" />
                  <span>{activeNode.name}</span>
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Scan storage folders on your node and browse all indexed files, games, and disc images in a unified table.
            </p>
          </div>
        </div>

        {/* Node Switcher & Primary Actions */}
        <div className="flex items-center gap-2.5 flex-wrap self-start lg:self-center">
          {/* Node Switcher with DkDropdown */}
          {servers && servers.length > 1 && (
            <DkDropdown
              label="Node"
              options={nodeOptions}
              value={effectiveNodeId != null ? String(effectiveNodeId) : undefined}
              onChange={(val) => {
                const id = val ? Number(val) : null
                setSelectedNodeId(id)
                try {
                  localStorage.setItem('otix:last-add-folder-node-id', String(id))
                } catch {
                  /* ignore */
                }
              }}
              variant="filter"
              className="min-w-[160px]"
            />
          )}

          {/* Mass Match Action */}
          {stats.unmatchedCount > 0 && (
            <DkButton
              type="button"
              variant="secondary"
              size="md"
              disabled={isScanning}
              onClick={() => setIsMassMatchOpen(true)}
              className="rounded-xl shadow-xs"
            >
              <Sparkles className="h-4 w-4 mr-2 text-primary" />
              <span>Mass Match ({stats.unmatchedCount})</span>
            </DkButton>
          )}

          {/* Trigger Scan CTA */}
          <DkButton
            type="button"
            variant="primary"
            size="md"
            disabled={isScanning}
            onClick={() => void triggerScan()}
            className="rounded-xl shadow-xs"
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isScanning && 'animate-spin')} />
            <span>{isScanning ? 'Scanning Node...' : 'Scan Files Now'}</span>
          </DkButton>
        </div>
      </div>

      {/* ── Live Scan Progress Bar ── */}
      {(isScanning || scanProgress.phase !== 'idle') && (
        <div className="p-4 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-2xl border border-white/[0.04] shadow-[var(--dk-shadow-glass)]">
          <ScanProgressBar
            isScanning={isScanning}
            progress={scanProgress.progress}
            currentDir={scanProgress.currentDir}
            phase={scanProgress.phase}
          />
        </div>
      )}

      {/* ── Quick Stats Grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-2xl border border-white/[0.04] shadow-[var(--dk-shadow-glass)]">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Total Files</span>
            <FolderOpen className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {stats.totalFiles}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Indexed files</p>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-2xl border border-white/[0.04] shadow-[var(--dk-shadow-glass)]">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Matched</span>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold text-primary">
            {stats.matchedCount}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Linked to catalog</p>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-2xl border border-white/[0.04] shadow-[var(--dk-shadow-glass)]">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Unmatched</span>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {stats.unmatchedCount}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Need metadata match</p>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-2xl border border-white/[0.04] shadow-[var(--dk-shadow-glass)]">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Total Storage</span>
            <HardDrive className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {formatScanSize(stats.totalSizeBytes)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {stats.isoCount} disc images
            {stats.duplicatesCount > 0 ? ` • ${stats.duplicatesCount} multi-source` : ''}
          </p>
        </div>
      </div>

      {/* ── Monitored Folders Section ── */}
      <NodeScanPathsCard
        scanPaths={scanPaths}
        isLoadingPaths={isLoadingPaths}
        isScanning={isScanning}
        onAddPath={addScanPath}
        onRemovePath={removeScanPath}
        onScanSinglePath={(p) => void triggerScan(p)}
        remoteNodeId={remoteNodeId}
        currentNodeId={effectiveNodeId}
        nodeName={activeNode?.name}
        servers={servers}
        desktop={desktop}
      />

      {/* ── Scanned Files Table ── */}
      <NodeScannedFilesTable
        files={pagedFiles}
        totalFiles={filteredCount}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filterTab={filterTab}
        onFilterTabChange={setFilterTab}
        sortOption={sortOption}
        onSortChange={setSortOption}
        page={page}
        onPageChange={setPage}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        totalPages={totalPages}
        startIndex={startIndex}
        endIndex={endIndex}
        isLoading={isFilesLoading}
        isScanning={isScanning}
        onTriggerScan={() => void triggerScan()}
        onOpenMatchModal={handleOpenMatch}
        onOpenDetails={handleOpenDetails}
        onOpenMassMatch={() => setIsMassMatchOpen(true)}
        onUnlinkSource={unlinkSource}
        stats={stats}
      />

      {/* ── Game Details Modal ── */}
      <NodeGameDetailsModal
        open={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        game={selectedDetailsGame}
        onOpenMatch={handleOpenMatchFromDetails}
        onUnlinkSource={unlinkSource}
      />

      {/* ── Catalog Match Modal ── */}
      <NodeFileMatchModal
        open={isMatchModalOpen}
        onClose={() => setIsMatchModalOpen(false)}
        game={selectedMatchGame}
        onMatchSuccess={handleMatchSuccess}
      />

      {/* ── Mass Match Modal ── */}
      {isMassMatchOpen && (
        <Suspense fallback={null}>
          <NodeMassMatchModal
            open={isMassMatchOpen}
            onClose={() => setIsMassMatchOpen(false)}
            unmatchedGames={unmatchedGames}
            onMatchSuccess={handleMatchSuccess}
            onFinish={() => void refetchFiles()}
          />
        </Suspense>
      )}
    </div>
  )
}

