import { Network, LayoutGrid, List, Plus, Search, X } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { cn } from '@/lib/utils'
import {
  type NodesViewMode,
  type NodesCategoryFilter,
  type NodesStatusFilter,
  getNavPillsTopOffset,
} from '../../utils/node-views'

export interface NodesViewSwitcherProps {
  viewMode: NodesViewMode
  onViewModeChange: (mode: NodesViewMode) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  categoryFilter: NodesCategoryFilter
  onCategoryChange: (category: NodesCategoryFilter) => void
  statusFilter: NodesStatusFilter
  onStatusChange: (status: NodesStatusFilter) => void
  onAddNode: () => void
  totalCount: number
  onlineCount: number
  className?: string
}

export const NodesViewSwitcher = ({
  viewMode,
  onViewModeChange,
  searchQuery,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
  statusFilter,
  onStatusChange,
  onAddNode,
  totalCount,
  onlineCount,
  className,
}: NodesViewSwitcherProps) => {
  const isMap = viewMode === 'map'

  return (
    <div
      className={cn(
        'w-full flex flex-col gap-3 transition-all duration-200',
        isMap
          ? cn(
              'absolute left-0 right-0 px-4 sm:px-6 lg:px-8 z-20 pointer-events-none',
              getNavPillsTopOffset(true),
            )
          : 'relative z-10 mb-6',
        className,
      )}
    >
      {/* Top Header Card */}
      <div
        className={cn(
          'w-full flex flex-wrap items-center justify-between gap-3 p-2.5 sm:p-3 rounded-2xl sm:rounded-3xl',
          'bg-[var(--dk-surface-overlay)] backdrop-blur-2xl border border-white/[0.05]',
          'shadow-[var(--dk-shadow-glass)] pointer-events-auto',
        )}
      >
        {/* Left: Title & Quick Stats */}
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-foreground tracking-tight">
                Nodes &amp; Infrastructure
              </h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                {onlineCount}/{totalCount} online
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground hidden sm:block">
              {isMap
                ? 'Interactive 2D topology map. Drag nodes and connect infrastructure.'
                : viewMode === 'grid'
                  ? 'Responsive card grid with hardware metrics, storage, and direct actions.'
                  : 'High-density infrastructure list with sorting, search, and status filters.'}
            </p>
          </div>
        </div>

        {/* Right: View Mode Segments & Primary Action */}
        <div className="flex items-center gap-2 ml-auto">
          {/* View Mode Segmented Pill */}
          <div
            role="tablist"
            aria-label="Nodes view mode"
            className="flex items-center p-1 rounded-xl sm:rounded-2xl bg-[var(--dk-surface-field)] border border-white/[0.04]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'map'}
              onClick={() => onViewModeChange('map')}
              title="Topology Map View"
              className={cn(
                'flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-xs font-medium transition-all duration-150',
                viewMode === 'map'
                  ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
              )}
            >
              <Network size={13} className="shrink-0" />
              <span className="hidden md:inline">Map</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'grid'}
              onClick={() => onViewModeChange('grid')}
              title="Card Grid View"
              className={cn(
                'flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-xs font-medium transition-all duration-150',
                viewMode === 'grid'
                  ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
              )}
            >
              <LayoutGrid size={13} className="shrink-0" />
              <span className="hidden md:inline">Grid</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'list'}
              onClick={() => onViewModeChange('list')}
              title="Table List View"
              className={cn(
                'flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-xs font-medium transition-all duration-150',
                viewMode === 'list'
                  ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
              )}
            >
              <List size={13} className="shrink-0" />
              <span className="hidden md:inline">List</span>
            </button>
          </div>

          {/* Add Infrastructure Button */}
          <DkButton
            type="button"
            size="sm"
            variant="primary"
            onClick={onAddNode}
            className="gap-1.5 font-semibold shadow-xs"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Add Infrastructure</span>
            <span className="sm:hidden">Add</span>
          </DkButton>
        </div>
      </div>

      {/* Filter & Search Bar (Active for Grid and List views) */}
      {!isMap && (
        <div className="w-full flex flex-wrap items-center justify-between gap-2.5 p-2 px-3 rounded-2xl bg-[var(--dk-surface-overlay)]/80 backdrop-blur-xl border border-white/[0.04]">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter by name, IP, endpoint, or OS..."
              className="w-full rounded-xl bg-[var(--dk-surface-field)] pl-8 pr-7 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5 text-xs">
            {(
              [
                { id: 'all', label: 'All Items' },
                { id: 'nodes', label: 'Nodes' },
                { id: 'machines', label: 'Server Machines' },
                { id: 'storage', label: 'Storage' },
                { id: 'game_servers', label: 'Game Servers' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => onCategoryChange(cat.id)}
                className={cn(
                  'px-2.5 py-1 rounded-xl text-xs font-medium transition-colors shrink-0',
                  categoryFilter === cat.id
                    ? 'bg-primary/15 text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
                )}
              >
                {cat.label}
              </button>
            ))}

            <div className="h-4 w-px bg-[var(--dk-separator)] mx-1 shrink-0" />

            {/* Status Filter Toggle */}
            {(
              [
                { id: 'all', label: 'All Status' },
                { id: 'online', label: 'Online' },
                { id: 'offline', label: 'Offline' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => onStatusChange(st.id)}
                className={cn(
                  'px-2 py-1 rounded-xl text-xs font-medium transition-colors shrink-0',
                  statusFilter === st.id
                    ? 'bg-[var(--dk-surface-field)] text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
