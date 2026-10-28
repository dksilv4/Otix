import {
  ChevronLeft,
  Network,
  LayoutGrid,
  List,
  Plus,
  Search,
  X,
  Cpu,
  Server,
  HardDrive,
  Gamepad2,
  Filter,
  Radio,
  Activity,
  AlertTriangle,
  PanelLeftClose,
  PanelLeftOpen,
  Wand2,
  Globe,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { useNavigate } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { DEFAULT_SETTINGS_SECTION, rememberSettingsSection } from '../../constants'
import { useNodesView } from '../../context/nodes-view-context'
import { useSettingsNode } from '../../context/settings-node-context'
import { GLOBAL_PROFILE_NODE_ID } from '../../utils/node-switcher'
import {
  NODES_WORKSPACE_TABS,
  getNodesTabIcon,
  type NodesViewMode,
  type NodesActiveTab,
} from '../../utils/node-views'

export interface NodesSecondarySettingsMenuProps {
  onBackToSettings?: () => void
  onActionComplete?: () => void
  onToggleCollapse?: () => void
  collapsed?: boolean
  className?: string
}

export const NodesSecondarySettingsMenu = ({
  onBackToSettings,
  onActionComplete,
  onToggleCollapse,
  collapsed,
  className,
}: NodesSecondarySettingsMenuProps) => {
  const navigate = useNavigate()
  const {
    activeTab,
    setActiveTab,
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    statusFilter,
    setStatusFilter,
    resetFilters,
    setAddModalOpen,
  } = useNodesView()

  const { servers, selectedNodeId, setSelectedNodeId } = useSettingsNode()

  const handleBack = () => {
    if (onBackToSettings) {
      onBackToSettings()
    } else {
      rememberSettingsSection(DEFAULT_SETTINGS_SECTION)
      navigate({ to: `/settings/${DEFAULT_SETTINGS_SECTION}` })
    }
  }

  const handleSelectTab = (tab: NodesActiveTab) => {
    setActiveTab(tab)
    onActionComplete?.()
  }

  const handleSelectMode = (mode: NodesViewMode) => {
    setViewMode(mode)
    onActionComplete?.()
  }

  const handleAddInfrastructure = () => {
    setAddModalOpen(true)
    onActionComplete?.()
  }

  const handleSelectNode = (nodeId: number | null) => {
    setSelectedNodeId(nodeId)
    onActionComplete?.()
  }

  const hasActiveFilters =
    Boolean(searchQuery.trim()) || categoryFilter !== 'all' || statusFilter !== 'all'

  const navItemClass = (isActive: boolean) =>
    cn(
      'flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 cursor-pointer w-full text-left',
      isActive
        ? 'bg-primary/10 text-primary shadow-xs font-semibold'
        : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
      collapsed && 'justify-center px-0 py-2.5 w-10 h-10 rounded-xl relative',
    )

  return (
    <div className={cn('flex flex-col h-full w-full select-none', className)}>
      {/* ── Top Header ── */}
      <div className={cn('flex items-center mb-3 w-full', collapsed ? 'flex-col gap-2 justify-center' : 'justify-between')}>
        <button
          type="button"
          onClick={handleBack}
          title="Back to Settings"
          aria-label="Back to Settings"
          className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-all cursor-pointer group shrink-0"
        >
          <ChevronLeft className="h-4 w-4 text-primary transition-transform group-hover:-translate-x-0.5 shrink-0" />
        </button>

        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand settings menu' : 'Collapse settings menu'}
            aria-label={collapsed ? 'Expand settings menu' : 'Collapse settings menu'}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-colors shrink-0 cursor-pointer"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="mb-3">
          <h1 className="text-lg font-bold text-foreground tracking-tight">
            Nodes
          </h1>
        </div>
      )}

      {/* ── Navigation Workspace Tabs (Infrastructure, Paths, Organize, Proposals) ── */}
      <div className="mb-2">
        {!collapsed && (
          <div className="mb-1">
            <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 flex items-center justify-between">
              <span>Sections</span>
            </span>
          </div>
        )}

        <div role="tablist" aria-label="Nodes workspace sections" className="flex flex-col gap-0.5 w-full">
          {NODES_WORKSPACE_TABS.map((tab) => {
            const Icon = getNodesTabIcon(tab.id)
            const isSelected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => handleSelectTab(tab.id)}
                title={collapsed ? tab.label : undefined}
                className={navItemClass(isSelected)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="flex-1 truncate">{tab.label}</span>}
                {collapsed && isSelected && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Divider */}
      <div className={cn('my-2 h-px bg-[var(--dk-separator)] shrink-0', collapsed ? 'w-8 mx-auto' : 'w-full')} />

      {/* ── Section Specific Secondary Content ── */}
      {activeTab === 'infrastructure' && (
        <>
          {/* Search Bar */}
          {!collapsed && (
            <div className="relative mb-3 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                id="nodes-menu-search"
                type="search"
                aria-label="Search infrastructure"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full rounded-xl bg-[var(--dk-surface-field)] pl-9 pr-7 py-2 text-xs text-foreground outline-none transition-colors border border-white/[0.04]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          {/* Scrollable Nav Groups */}
          <nav
            className={cn('flex flex-col gap-0.5 flex-1 overflow-y-auto pr-1 w-full', collapsed && 'items-center')}
            aria-label="Infrastructure navigation"
          >
            {/* Group 1: View Modes */}
            <div>
              {!collapsed ? (
                <div className="mb-1">
                  <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 flex items-center justify-between">
                    <span>View Mode</span>
                  </span>
                </div>
              ) : (
                <div className="my-1.5 h-px w-8 bg-[var(--dk-separator)] shrink-0 mx-auto" />
              )}

              <div role="tablist" aria-label="Nodes view mode" className="flex flex-col gap-0.5 w-full">
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'map'}
                  onClick={() => handleSelectMode('map')}
                  title={collapsed ? 'Map Topology' : undefined}
                  className={navItemClass(viewMode === 'map')}
                >
                  <Network className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="flex-1 truncate">Map Topology</span>}
                  {collapsed && viewMode === 'map' && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'grid'}
                  onClick={() => handleSelectMode('grid')}
                  title={collapsed ? 'Grid View' : undefined}
                  className={navItemClass(viewMode === 'grid')}
                >
                  <LayoutGrid className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="flex-1 truncate">Grid View</span>}
                  {collapsed && viewMode === 'grid' && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'list'}
                  onClick={() => handleSelectMode('list')}
                  title={collapsed ? 'List View' : undefined}
                  className={navItemClass(viewMode === 'list')}
                >
                  <List className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="flex-1 truncate">List View</span>}
                  {collapsed && viewMode === 'list' && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>
              </div>
            </div>

            {/* Group 2: Categories */}
            <div className="mt-2.5">
              {!collapsed ? (
                <div className="mb-1 pt-1.5">
                  <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 flex items-center justify-between">
                    <span>Category</span>
                  </span>
                </div>
              ) : (
                <div className="my-1.5 h-px w-8 bg-[var(--dk-separator)] shrink-0 mx-auto" />
              )}

              <div className="flex flex-col gap-0.5 w-full">
                <button
                  type="button"
                  onClick={() => setCategoryFilter('all')}
                  title={collapsed ? 'All Infrastructure' : undefined}
                  className={navItemClass(categoryFilter === 'all')}
                >
                  <Filter className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="flex-1 truncate">All Infrastructure</span>}
                  {collapsed && categoryFilter === 'all' && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setCategoryFilter('nodes')}
                  title={collapsed ? 'Worker Nodes' : undefined}
                  className={navItemClass(categoryFilter === 'nodes')}
                >
                  <Cpu className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="flex-1 truncate">Worker Nodes</span>}
                  {collapsed && categoryFilter === 'nodes' && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setCategoryFilter('machines')}
                  title={collapsed ? 'Server Machines' : undefined}
                  className={navItemClass(categoryFilter === 'machines')}
                >
                  <Server className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="flex-1 truncate">Server Machines</span>}
                  {collapsed && categoryFilter === 'machines' && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setCategoryFilter('storage')}
                  title={collapsed ? 'Network Storage (SMB)' : undefined}
                  className={navItemClass(categoryFilter === 'storage')}
                >
                  <HardDrive className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="flex-1 truncate">Network Storage (SMB)</span>}
                  {collapsed && categoryFilter === 'storage' && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setCategoryFilter('game_servers')}
                  title={collapsed ? 'Dedicated Game Servers' : undefined}
                  className={navItemClass(categoryFilter === 'game_servers')}
                >
                  <Gamepad2 className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="flex-1 truncate">Dedicated Game Servers</span>}
                  {collapsed && categoryFilter === 'game_servers' && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>
              </div>
            </div>

            {/* Group 3: Status */}
            <div className="mt-2.5">
              {!collapsed ? (
                <div className="mb-1 pt-1.5">
                  <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 flex items-center justify-between">
                    <span>Status</span>
                  </span>
                </div>
              ) : (
                <div className="my-1.5 h-px w-8 bg-[var(--dk-separator)] shrink-0 mx-auto" />
              )}

              <div className="flex flex-col gap-0.5 w-full">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  title={collapsed ? 'All Statuses' : undefined}
                  className={navItemClass(statusFilter === 'all')}
                >
                  <Radio className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="flex-1 truncate">All Statuses</span>}
                  {collapsed && statusFilter === 'all' && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter('online')}
                  title={collapsed ? 'Online Only' : undefined}
                  className={navItemClass(statusFilter === 'online')}
                >
                  <Activity className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="flex-1 truncate">Online Only</span>}
                  {collapsed && statusFilter === 'online' && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-status-online" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter('offline')}
                  title={collapsed ? 'Offline Only' : undefined}
                  className={navItemClass(statusFilter === 'offline')}
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="flex-1 truncate">Offline Only</span>}
                  {collapsed && statusFilter === 'offline' && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-status-offline" />
                  )}
                </button>
              </div>
            </div>

            {/* Reset Filters Link */}
            {hasActiveFilters && !collapsed && (
              <div className="px-3 pt-2">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                >
                  Reset all filters
                </button>
              </div>
            )}
          </nav>

          {/* Bottom Action Button (Add Infrastructure) */}
          <div className={cn('mt-auto pt-3 w-full border-t border-white/[0.04]', collapsed && 'flex justify-center')}>
            {!collapsed ? (
              <DkButton
                type="button"
                variant="primary"
                size="sm"
                onClick={handleAddInfrastructure}
                className="w-full gap-2 font-semibold shadow-xs rounded-xl cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Add Infrastructure</span>
              </DkButton>
            ) : (
              <DkButton
                type="button"
                variant="primary"
                size="sm"
                onClick={handleAddInfrastructure}
                title="Add Infrastructure"
                aria-label="Add Infrastructure"
                className="h-10 w-10 p-0 rounded-xl flex items-center justify-center cursor-pointer shadow-xs"
              >
                <Plus className="h-4 w-4" />
              </DkButton>
            )}
          </div>
        </>
      )}

      {(activeTab === 'paths' || activeTab === 'organize' || activeTab === 'connections') && (
        <nav
          className={cn('flex flex-col gap-0.5 flex-1 overflow-y-auto pr-1 w-full', collapsed && 'items-center')}
          aria-label="Node selection"
        >
          {!collapsed ? (
            <div className="mb-1">
              <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 flex items-center justify-between">
                <span>Target Node</span>
              </span>
            </div>
          ) : (
            <div className="my-1.5 h-px w-8 bg-[var(--dk-separator)] shrink-0 mx-auto" />
          )}

          <div className="flex flex-col gap-0.5 w-full">
            {activeTab === 'organize' && (
              <button
                type="button"
                onClick={() => handleSelectNode(GLOBAL_PROFILE_NODE_ID)}
                title={collapsed ? 'Global Profile' : undefined}
                className={navItemClass(selectedNodeId === GLOBAL_PROFILE_NODE_ID || selectedNodeId === null)}
              >
                <Globe className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="flex-1 truncate">Global Profile</span>}
                {collapsed && (selectedNodeId === GLOBAL_PROFILE_NODE_ID || selectedNodeId === null) && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>
            )}

            {servers.map((node) => {
              const isSelected = selectedNodeId === node.id
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => handleSelectNode(node.id)}
                  title={collapsed ? node.name : undefined}
                  className={navItemClass(isSelected)}
                >
                  <Server className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate">{node.name}</span>
                      <span
                        className={cn(
                          'w-1.5 h-1.5 rounded-full shrink-0',
                          node.isOnline ? 'bg-status-online' : 'bg-status-offline',
                        )}
                      />
                    </>
                  )}
                  {collapsed && isSelected && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>
              )
            })}
          </div>
        </nav>
      )}

      {activeTab === 'proposals' && (
        <div className="flex-1 px-1 py-2">
          {!collapsed && (
            <div className="p-3.5 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-xs text-muted-foreground space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <Wand2 className="h-4 w-4 text-primary" />
                <span>Match Proposals</span>
              </div>
              <p className="leading-relaxed">
                Review and approve metadata matching suggestions for titles scanned across your nodes.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
