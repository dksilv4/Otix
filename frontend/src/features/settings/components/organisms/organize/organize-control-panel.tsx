import {
  Folder,
  FolderOpen,
  FolderTree,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkDropdown } from '@ui/atoms/dropdown'
import { cn } from '@/lib/utils'
import {
  type TestRunFilterTab,
  type PreviewMetrics,
  getOrganizerApi,
} from '../../../utils/organize-test-run'

export interface OrganizeControlPanelProps {
  folderOptions: Array<{ label: string; value: string }>
  selectedFolder: string
  onSelectFolder: (path: string) => void
  onBrowseFolder: () => void
  onRefresh: () => void
  loading: boolean
  filterTab: TestRunFilterTab
  onFilterTabChange: (tab: TestRunFilterTab) => void
  metrics: PreviewMetrics
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  groupByDir: boolean
  onToggleGroupByDir: () => void
  allExpanded: boolean | null
  onToggleExpandCollapse: () => void
  hasDirectories: boolean
}

export const OrganizeControlPanel = ({
  folderOptions,
  selectedFolder,
  onSelectFolder,
  onBrowseFolder,
  onRefresh,
  loading,
  filterTab,
  onFilterTabChange,
  metrics,
  searchQuery,
  onSearchQueryChange,
  groupByDir,
  onToggleGroupByDir,
  allExpanded,
  onToggleExpandCollapse,
  hasDirectories,
}: OrganizeControlPanelProps) => {
  return (
    <div className="p-3 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] space-y-2.5">
      {/* Row 1: Target Folder Selection + Scan / Browse Actions */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
        <div className="flex items-center gap-1.5 shrink-0 text-xs font-semibold text-foreground pl-0.5">
          <Folder size={14} className="text-primary shrink-0" />
          <span>Target Folder</span>
          {folderOptions.length > 0 && (
            <span className="text-[10px] text-muted-foreground font-mono hidden md:inline">
              ({folderOptions.length})
            </span>
          )}
        </div>

        <div className="flex-1 min-w-[200px]">
          <DkDropdown
            options={folderOptions}
            value={selectedFolder}
            onChange={onSelectFolder}
            placeholder="Select target folder to test..."
            className="w-full font-mono text-xs"
          />
        </div>

        {getOrganizerApi()?.selectDirectory && (
          <DkButton
            size="sm"
            variant="ghost"
            onClick={onBrowseFolder}
            className="text-xs h-8 px-2.5 cursor-pointer border border-white/[0.04] hover:bg-white/[0.04] shrink-0"
            title="Browse computer for other folder"
          >
            <FolderOpen size={12} className="mr-1" />
            Browse
          </DkButton>
        )}

        <DkButton
          size="sm"
          variant="primary"
          onClick={onRefresh}
          disabled={loading || !selectedFolder.trim()}
          className="text-xs h-8 px-3 cursor-pointer shrink-0"
          title="Scan target folder"
        >
          <RefreshCw size={11} className={cn('mr-1.5', loading && 'animate-spin')} />
          <span>Scan</span>
        </DkButton>
      </div>

      {/* Row 2: Stats Strip (Inline, borderless, clean) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground px-1 pt-0.5 border-t border-white/[0.03]">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Total Scanned
          </span>
          <span className="font-mono text-xs font-bold text-foreground">{metrics.total}</span>
        </div>
        <span className="text-white/[0.1] hidden sm:inline">•</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
            To Organize
          </span>
          <span className="font-mono text-xs font-bold text-primary">{metrics.actionable}</span>
        </div>
        <span className="text-white/[0.1] hidden sm:inline">•</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            In Subdirs
          </span>
          <span className="font-mono text-xs font-bold text-foreground">{metrics.subdirectoriesCount}</span>
        </div>
        <span className="text-white/[0.1] hidden sm:inline">•</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Already Organized
          </span>
          <span className="font-mono text-xs font-bold text-foreground">{metrics.alreadyOrganized}</span>
        </div>
      </div>

      {/* Row 3: Filter Tabs + Search + Toolbar Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-white/[0.03]">
        {/* Pill Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto p-0.5 rounded-xl bg-white/[0.02]">
          <button
            type="button"
            onClick={() => onFilterTabChange('all')}
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap',
              filterTab === 'all'
                ? 'bg-primary/20 text-primary font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
            )}
          >
            All ({metrics.total})
          </button>
          <button
            type="button"
            onClick={() => onFilterTabChange('actionable')}
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap',
              filterTab === 'actionable'
                ? 'bg-primary/20 text-primary font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
            )}
          >
            To Move ({metrics.actionable})
          </button>
          <button
            type="button"
            onClick={() => onFilterTabChange('subdirectories')}
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap',
              filterTab === 'subdirectories'
                ? 'bg-primary/20 text-primary font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
            )}
          >
            In Subdirs ({metrics.subdirectoriesCount})
          </button>
          <button
            type="button"
            onClick={() => onFilterTabChange('organized')}
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap',
              filterTab === 'organized'
                ? 'bg-primary/20 text-primary font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
            )}
          >
            Organized ({metrics.alreadyOrganized})
          </button>
        </div>

        {/* Right Toolbar: Search + Expand/Collapse + Group Toggle */}
        <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
          {/* Search Box */}
          <div className="relative w-full sm:w-44">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Search files and folders..."
              className="w-full pl-7 pr-6 py-1 text-xs rounded-lg bg-[var(--dk-surface-field)]/60 border border-white/[0.06] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchQueryChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X size={11} />
              </button>
            )}
          </div>

          {/* Expand / Collapse All (Directory Mode) */}
          {groupByDir && hasDirectories && (
            <button
              type="button"
              onClick={onToggleExpandCollapse}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-white/[0.04] bg-white/[0.02] text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-all cursor-pointer whitespace-nowrap"
              title="Expand or collapse all directories"
            >
              <FolderTree size={12} />
              <span className="hidden lg:inline">{allExpanded === false ? 'Expand All' : 'Collapse All'}</span>
            </button>
          )}

          {/* Group by Directory Toggle */}
          <button
            type="button"
            onClick={onToggleGroupByDir}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer',
              groupByDir
                ? 'bg-primary/15 text-primary border-primary/25 font-semibold'
                : 'bg-white/[0.02] text-muted-foreground border-white/[0.04] hover:text-foreground hover:bg-white/[0.04]',
            )}
            title="Toggle grouping by parent directory"
          >
            <FolderTree size={12} />
            <span className="hidden md:inline">Group</span>
          </button>
        </div>
      </div>
    </div>
  )
}
