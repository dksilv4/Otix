import {
  RefreshCw,
  Trash2,
  LayoutGrid,
  List,
  Search,
  Sparkles,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { cn } from '@/lib/utils'
import type { PathsFilterTab, PathsViewMode } from '../../../utils/paths'

export interface PathsToolbarProps {
  filterTab: PathsFilterTab
  onFilterTabChange: (tab: PathsFilterTab) => void
  counts: {
    all: number
    installation: number
    download: number
    iso: number
  }
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  viewMode: PathsViewMode
  onViewModeChange: (mode: PathsViewMode) => void
  remoteNodeId: number | null
  isScanning: boolean
  isClearingScan: boolean
  isSyncingOtix: boolean
  isMatching: boolean
  onClearScannedList: () => void
  onRunCatalogMatching: () => void
  onTriggerScan: () => void
}

export const PathsToolbar = ({
  filterTab,
  onFilterTabChange,
  counts,
  searchQuery,
  onSearchQueryChange,
  viewMode,
  onViewModeChange,
  remoteNodeId,
  isScanning,
  isClearingScan,
  isSyncingOtix,
  isMatching,
  onClearScannedList,
  onRunCatalogMatching,
  onTriggerScan,
}: PathsToolbarProps) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2">
      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => onFilterTabChange('all')}
          className={cn(
            'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer',
            filterTab === 'all'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
          )}
        >
          All ({counts.all})
        </button>
        <button
          type="button"
          onClick={() => onFilterTabChange('installation')}
          className={cn(
            'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer',
            filterTab === 'installation'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
          )}
        >
          Installation ({counts.installation})
        </button>
        <button
          type="button"
          onClick={() => onFilterTabChange('download')}
          className={cn(
            'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer',
            filterTab === 'download'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
          )}
        >
          Downloads ({counts.download})
        </button>
        <button
          type="button"
          onClick={() => onFilterTabChange('iso')}
          className={cn(
            'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer',
            filterTab === 'iso'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
          )}
        >
          ISOs ({counts.iso})
        </button>
      </div>

      {/* Search & View Mode Switcher */}
      <div className="flex items-center gap-2">
        <div className="relative w-full sm:w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Filter folders..."
            className="w-full pl-8 pr-3 py-1 rounded-xl text-xs bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Cards vs List Mode Switcher */}
        <div
          className="flex items-center rounded-xl bg-[var(--dk-surface-ghost)] p-0.5 border border-white/[0.04] shrink-0"
          role="group"
          aria-label="View mode"
        >
          <button
            type="button"
            onClick={() => onViewModeChange('cards')}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer',
              viewMode === 'cards'
                ? 'bg-[var(--dk-surface-base)] text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
            aria-pressed={viewMode === 'cards'}
            aria-label="Card View"
            title="Card View"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Cards</span>
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('list')}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer',
              viewMode === 'list'
                ? 'bg-[var(--dk-surface-base)] text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
            aria-pressed={viewMode === 'list'}
            aria-label="List View"
            title="List View"
          >
            <List className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">List</span>
          </button>
        </div>

        {/* Scan Actions */}
        {remoteNodeId ? (
          <DkButton
            size="sm"
            variant="ghost"
            onClick={onClearScannedList}
            disabled={isScanning || isClearingScan || isSyncingOtix}
            loading={isClearingScan}
            className="h-8 shrink-0 cursor-pointer text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{isClearingScan ? 'Clearing…' : 'Clear list'}</span>
          </DkButton>
        ) : null}
        <DkButton
          size="sm"
          variant="outline"
          onClick={onRunCatalogMatching}
          disabled={isScanning || isClearingScan || isMatching}
          loading={isMatching}
          className="h-8 shrink-0 cursor-pointer text-xs"
          title="Run catalog metadata matcher"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>{isMatching ? 'Matching…' : 'Match Catalog'}</span>
        </DkButton>
        <DkButton
          size="sm"
          onClick={onTriggerScan}
          disabled={isScanning || isClearingScan || isMatching}
          loading={isScanning}
          className="h-8 shrink-0 cursor-pointer text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>{isScanning ? 'Scanning...' : 'Scan Now'}</span>
        </DkButton>
      </div>
    </div>
  )
}
