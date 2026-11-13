import { useState } from 'react'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkDropdown } from '@ui/atoms/dropdown'
import type { ScannedGameItem } from '../../utils/scanned-summary'
import type {
  NodeScanFilterTab,
  NodeScanSortOption,
  NodeScanSortColumn,
  NodeScanStats,
  NodeScanColumnId,
} from '../../utils/node-scan-files'
import {
  getNextSortOption,
  getColumnSortState,
  SCAN_FILTER_OPTIONS,
  SCAN_SORT_OPTIONS,
  SCAN_PAGE_SIZE_OPTIONS,
  DEFAULT_VISIBLE_COLUMNS,
  loadStoredColumnVisibility,
  saveStoredColumnVisibility,
} from '../../utils/node-scan-files'
import { NodeScannedFilesTableRow } from '../molecules/node-scanned-files-table-row'
import { NodeScanColumnSettings } from '../molecules/node-scan-column-settings'
import { cn } from '@/lib/utils'

export interface NodeScannedFilesTableProps {
  files: ScannedGameItem[]
  totalFiles: number
  searchQuery: string
  onSearchChange: (q: string) => void
  filterTab: NodeScanFilterTab
  onFilterTabChange: (tab: NodeScanFilterTab) => void
  sortOption: NodeScanSortOption
  onSortChange: (sort: NodeScanSortOption) => void
  page: number
  onPageChange: (page: number) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  totalPages: number
  startIndex: number
  endIndex: number
  isLoading: boolean
  isScanning: boolean
  onTriggerScan: () => void
  onOpenMatchModal: (game: ScannedGameItem) => void
  onOpenDetails: (game: ScannedGameItem) => void
  onOpenMassMatch?: () => void
  onUnlinkSource?: (primaryId: string | number, sourceId: string | number) => void
  stats: NodeScanStats
  className?: string
}

export const NodeScannedFilesTable = ({
  files,
  totalFiles,
  searchQuery,
  onSearchChange,
  filterTab,
  onFilterTabChange,
  sortOption,
  onSortChange,
  page,
  onPageChange,
  pageSize,
  onPageSizeChange,
  totalPages,
  startIndex,
  endIndex,
  isLoading,
  isScanning,
  onTriggerScan,
  onOpenMatchModal,
  onOpenDetails,
  onOpenMassMatch: _onOpenMassMatch,
  onUnlinkSource,
  stats,
  className,
}: NodeScannedFilesTableProps) => {
  const [expandedIds, setExpandedIds] = useState<Set<string | number>>(() => new Set())
  const [visibleColumns, setVisibleColumns] = useState<Record<NodeScanColumnId, boolean>>(
    loadStoredColumnVisibility,
  )

  const handleToggleColumn = (id: NodeScanColumnId) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      saveStoredColumnVisibility(next)
      return next
    })
  }

  const handleResetColumns = () => {
    setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)
    saveStoredColumnVisibility(DEFAULT_VISIBLE_COLUMNS)
  }

  const handleToggleExpand = (id: string | number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleHeaderClick = (col: NodeScanSortColumn) => {
    const nextSort = getNextSortOption(col, sortOption)
    onSortChange(nextSort)
  }

  const renderSortIndicator = (col: NodeScanSortColumn) => {
    const state = getColumnSortState(col, sortOption)
    if (state === 'asc') {
      return <ArrowUp className="h-3 w-3 text-primary shrink-0 transition-transform" />
    }
    if (state === 'desc') {
      return <ArrowDown className="h-3 w-3 text-primary shrink-0 transition-transform" />
    }
    return (
      <ArrowUpDown className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    )
  }

  return (
    <div className={cn('space-y-3 transition-colors', className)}>
      {/* ── Top Header Container: Search, Filters, Sorts, Stats & Table Column Headers ── */}
      <div className="rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-2xl border border-white/[0.04] shadow-[var(--dk-shadow-glass)] sticky top-4 z-20">
        {/* Controls: Search, Filter Dropdown, Sort Dropdown */}
        <div className="p-4 sm:p-5 border-b border-white/[0.04] space-y-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Field */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Filter by title, path, platform, or format..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--dk-surface-field)] border border-white/[0.04] text-xs sm:text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/40 transition-colors"
              />
            </div>

            {/* Controls: Filter & Sort with DkDropdown */}
            <div className="flex items-center gap-2.5 flex-wrap self-end md:self-auto">
              {/* Filter Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground hidden sm:inline">Filter:</span>
                <DkDropdown<NodeScanFilterTab>
                  options={SCAN_FILTER_OPTIONS}
                  value={filterTab}
                  onChange={(val) => onFilterTabChange(val)}
                  variant="filter"
                  className="min-w-[130px]"
                />
              </div>

              {/* Sort Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground hidden sm:inline">Sort:</span>
                <DkDropdown<NodeScanSortOption>
                  options={SCAN_SORT_OPTIONS}
                  value={sortOption}
                  onChange={(val) => onSortChange(val)}
                  variant="filter"
                  className="min-w-[160px]"
                />
              </div>
            </div>
          </div>

          {/* Quick summary stats chips */}
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground pt-0.5 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <span>
                Total: <strong className="text-foreground">{stats.totalFiles}</strong>
              </span>
              <span className="opacity-40">•</span>
              <span>
                Matched: <strong className="text-primary">{stats.matchedCount}</strong>
              </span>
              <span className="opacity-40">•</span>
              <span>
                Unmatched: <strong className="text-foreground">{stats.unmatchedCount}</strong>
              </span>
              <span className="opacity-40">•</span>
              <span>
                ISOs: <strong className="text-foreground">{stats.isoCount}</strong>
              </span>
              {stats.duplicatesCount > 0 && (
                <>
                  <span className="opacity-40">•</span>
                  <button
                    type="button"
                    onClick={() => onFilterTabChange('duplicates')}
                    className="hover:underline cursor-pointer"
                  >
                    Multi-source: <strong className="text-primary font-semibold">{stats.duplicatesCount}</strong>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Table Column Header inside the top container */}
        <div className="px-3 pt-3 pb-1.5">
          <table className="w-full text-left text-xs table-fixed">
            <colgroup>
              {visibleColumns.icon && <col style={{ width: '56px' }} />}
              <col />
              {visibleColumns.filename && (
                <col className="hidden md:table-column" style={{ width: '28%' }} />
              )}
              {visibleColumns.platform && <col style={{ width: '85px' }} />}
              {visibleColumns.version && <col style={{ width: '80px' }} />}
              {visibleColumns.format && <col style={{ width: '75px' }} />}
              {visibleColumns.size && <col style={{ width: '90px' }} />}
              {visibleColumns.date && (
                <col className="hidden lg:table-column" style={{ width: '100px' }} />
              )}
              {visibleColumns.status && <col style={{ width: '64px' }} />}
            </colgroup>
            <thead>
              <tr className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider select-none">
                {/* Icon header: hosts the Column Settings button per user request */}
                {visibleColumns.icon && (
                  <th className="py-2.5 px-2 text-center" aria-label="Customize columns">
                    <NodeScanColumnSettings
                      visibleColumns={visibleColumns}
                      onToggleColumn={handleToggleColumn}
                      onResetColumns={handleResetColumns}
                    />
                  </th>
                )}

                {/* File / Title Sortable Header */}
                <th className="py-2.5 px-3">
                  <button
                    type="button"
                    onClick={() => handleHeaderClick('name')}
                    className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer group text-left"
                    title="Click to sort by Title"
                  >
                    <span>File / Title</span>
                    {renderSortIndicator('name')}
                  </button>
                </th>

                {/* File Name Sortable Header */}
                {visibleColumns.filename && (
                  <th className="py-2.5 px-3 hidden md:table-cell">
                    <button
                      type="button"
                      onClick={() => handleHeaderClick('path')}
                      className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer group text-left"
                      title="Click to sort by File Name"
                    >
                      <span>File Name</span>
                      {renderSortIndicator('path')}
                    </button>
                  </th>
                )}

                {/* Platform Sortable Header */}
                {visibleColumns.platform && (
                  <th className="py-3 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleHeaderClick('platform')}
                      className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer group"
                      title="Click to sort by Platform"
                    >
                      <span>Platform</span>
                      {renderSortIndicator('platform')}
                    </button>
                  </th>
                )}

                {/* Version Sortable Header */}
                {visibleColumns.version && (
                  <th className="py-3 px-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleHeaderClick('version')}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer group"
                      title="Click to sort by Version"
                    >
                      <span>Version</span>
                      {renderSortIndicator('version')}
                    </button>
                  </th>
                )}

                {/* Format Sortable Header */}
                {visibleColumns.format && (
                  <th className="py-3 px-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleHeaderClick('format')}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer group"
                      title="Click to sort by Format"
                    >
                      <span>Format</span>
                      {renderSortIndicator('format')}
                    </button>
                  </th>
                )}

                {/* Size Sortable Header */}
                {visibleColumns.size && (
                  <th className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleHeaderClick('size')}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer group ml-auto"
                      title="Click to sort by File Size"
                    >
                      <span>Size</span>
                      {renderSortIndicator('size')}
                    </button>
                  </th>
                )}

                {/* Date Sortable Header */}
                {visibleColumns.date && (
                  <th className="py-3 px-3 text-center hidden lg:table-cell">
                    <button
                      type="button"
                      onClick={() => handleHeaderClick('date')}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer group"
                      title="Click to sort by Date"
                    >
                      <span>Date</span>
                      {renderSortIndicator('date')}
                    </button>
                  </th>
                )}

                {/* Status Sortable Header */}
                {visibleColumns.status && (
                  <th className="py-3 px-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleHeaderClick('status')}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer group"
                      title="Click to sort by Matched Status"
                    >
                      <span>Status</span>
                      {renderSortIndicator('status')}
                    </button>
                  </th>
                )}
              </tr>
            </thead>
          </table>
        </div>
      </div>

      {/* ── Content: Loading, Empty State, or Floating Rows ── */}
      {isLoading ? (
        <div className="py-20 text-center text-xs text-muted-foreground flex items-center justify-center gap-2 rounded-2xl bg-[var(--dk-surface-glass)]/50 border border-white/[0.04]">
          <RefreshCw className="h-4 w-4 animate-spin text-primary" />
          <span>Loading scanned files...</span>
        </div>
      ) : files.length === 0 ? (
        <div className="py-16 text-center space-y-3 px-4 rounded-2xl bg-[var(--dk-surface-glass)]/50 border border-white/[0.04]">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--dk-surface-ghost)] text-muted-foreground mx-auto">
            <FolderOpen className="h-6 w-6 opacity-60" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {searchQuery || filterTab !== 'all' ? 'No matching files found' : 'No scanned files yet'}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              {searchQuery || filterTab !== 'all'
                ? 'Try clearing your filter or searching for another term.'
                : 'Add a monitored folder above, then click Scan Files Now.'}
            </p>
          </div>
          {!(searchQuery || filterTab !== 'all') && (
            <DkButton
              type="button"
              variant="primary"
              size="sm"
              disabled={isScanning}
              onClick={onTriggerScan}
              className="mt-2 rounded-xl text-xs"
            >
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isScanning && 'animate-spin')} />
              <span>Scan Files Now</span>
            </DkButton>
          )}
        </div>
      ) : (
        /* Floating Rows */
        <div className="px-3">
          <table className="w-full text-left text-xs table-fixed border-separate border-spacing-y-3.5">
            <colgroup>
              {visibleColumns.icon && <col style={{ width: '56px' }} />}
              <col />
              {visibleColumns.filename && (
                <col className="hidden md:table-column" style={{ width: '28%' }} />
              )}
              {visibleColumns.platform && <col style={{ width: '85px' }} />}
              {visibleColumns.version && <col style={{ width: '80px' }} />}
              {visibleColumns.format && <col style={{ width: '75px' }} />}
              {visibleColumns.size && <col style={{ width: '90px' }} />}
              {visibleColumns.date && (
                <col className="hidden lg:table-column" style={{ width: '100px' }} />
              )}
              {visibleColumns.status && <col style={{ width: '64px' }} />}
            </colgroup>
            <tbody>
              {files.map((item) => (
                <NodeScannedFilesTableRow
                  key={String(item.id)}
                  item={item}
                  isExpanded={expandedIds.has(item.id)}
                  onToggleExpand={handleToggleExpand}
                  onOpenMatchModal={onOpenMatchModal}
                  onOpenDetails={onOpenDetails}
                  onUnlinkSource={onUnlinkSource}
                  visibleColumns={visibleColumns}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Floating Footer & Pagination ── */}
      {files.length > 0 && (
        <div className="p-3 sm:p-4 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-2xl border border-white/[0.04] shadow-[var(--dk-shadow-glass)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              Showing <strong className="text-foreground">{startIndex + 1}</strong> to{' '}
              <strong className="text-foreground">{endIndex}</strong> of{' '}
              <strong className="text-foreground">{totalFiles}</strong> files
            </span>
            <div className="flex items-center gap-1">
              <span className="hidden sm:inline">Rows per page:</span>
              <DkDropdown
                options={SCAN_PAGE_SIZE_OPTIONS}
                value={String(pageSize)}
                onChange={(val) => onPageSizeChange(Number(val))}
                variant="filter"
                className="w-24"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="mr-1">
              Page <strong className="text-foreground">{page}</strong> of{' '}
              <strong className="text-foreground">{totalPages}</strong>
            </span>
            <DkButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="h-8 w-8 p-0 rounded-xl"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </DkButton>
            <DkButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="h-8 w-8 p-0 rounded-xl"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </DkButton>
          </div>
        </div>
      )}
    </div>
  )
}
