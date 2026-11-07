import React from 'react'
import {
  ChevronRight,
  CornerLeftUp,
  Download,
  FileText,
  FolderPlus,
  HardDrive,
  Home,
  Monitor,
  Search,
  Server,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NodeExplorerBrowseResult, NodePathBreadcrumb } from '../../node-explorer-types'
import { isPathEqual } from '../../node-explorer-utils'

export interface ExplorerToolbarProps {
  isModal: boolean
  browseData?: NodeExplorerBrowseResult
  currentPath?: string
  breadcrumbs: NodePathBreadcrumb[]
  onNavigate: (path?: string) => void
  isCreatingFolder: boolean
  setIsCreatingFolder: (creating: boolean) => void
  newFolderName: string
  setNewFolderName: (name: string) => void
  onCreateFolder: (e: React.FormEvent) => void
  isCreatingFolderPending: boolean
  searchQuery: string
  setSearchQuery: (query: string) => void
}

export const ExplorerToolbar = ({
  isModal,
  browseData,
  currentPath,
  breadcrumbs,
  onNavigate,
  isCreatingFolder,
  setIsCreatingFolder,
  newFolderName,
  setNewFolderName,
  onCreateFolder,
  isCreatingFolderPending,
  searchQuery,
  setSearchQuery,
}: ExplorerToolbarProps) => {
  return (
    <>
      {/* Quick shortcuts */}
      {browseData?.shortcuts &&
        browseData.shortcuts.filter(
          (sc) => !browseData.drives?.some((d) => d.path === sc.path) && sc.icon !== 'root',
        ).length > 0 && (
          <div
            className={cn(
              'flex shrink-0 items-center gap-1.5 overflow-x-auto no-scrollbar py-1.5',
              isModal ? 'mx-4 mb-2' : 'border-b border-white/[0.04] bg-muted/10 px-4',
            )}
          >
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Quick access:
            </span>
            {browseData.shortcuts
              .filter(
                (sc) =>
                  !browseData.drives?.some((d) => d.path === sc.path) && sc.icon !== 'root',
              )
              .map((sc) => {
                const isActive = isPathEqual(currentPath || browseData.current_path, sc.path)
                return (
                  <button
                    key={sc.path}
                    type="button"
                    onClick={() => onNavigate(sc.path)}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                      isActive
                        ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                        : 'border border-white/[0.06] bg-[var(--dk-surface-ghost)] text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground',
                    )}
                    title={sc.path}
                  >
                    {sc.icon === 'home' && <Home className="h-3 w-3 shrink-0" />}
                    {sc.icon === 'downloads' && <Download className="h-3 w-3 shrink-0" />}
                    {sc.icon === 'documents' && <FileText className="h-3 w-3 shrink-0" />}
                    {sc.icon === 'desktop' && <Monitor className="h-3 w-3 shrink-0" />}
                    {sc.icon === 'volumes' && <HardDrive className="h-3 w-3 shrink-0" />}
                    {sc.icon === 'root' && <Server className="h-3 w-3 shrink-0" />}
                    <span>{sc.name}</span>
                  </button>
                )
              })}
          </div>
        )}

      {/* Breadcrumbs + actions */}
      <div
        className={cn(
          'flex shrink-0 items-center justify-between gap-2',
          isModal ? 'px-4 pb-2' : 'border-b border-white/[0.04] bg-card/40 px-4 py-2.5',
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5 text-xs no-scrollbar text-muted-foreground">
          {browseData?.parent_path && (
            <button
              type="button"
              onClick={() => onNavigate(browseData.parent_path!)}
              className="mr-1 shrink-0 rounded-lg p-1 transition-colors hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground cursor-pointer"
              title="Go up"
              aria-label="Go up"
            >
              <CornerLeftUp className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => onNavigate(undefined)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 font-medium transition-colors cursor-pointer',
              !currentPath
                ? 'bg-primary/15 font-semibold text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
            title="Go to Home folder"
          >
            <Home className="h-3 w-3 shrink-0" />
            <span>Home</span>
          </button>

          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.fullPath}>
              <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />
              <button
                type="button"
                onClick={() => onNavigate(crumb.fullPath)}
                className={cn(
                  'max-w-[140px] shrink-0 truncate rounded-lg px-2 py-1 transition-colors cursor-pointer',
                  idx === breadcrumbs.length - 1
                    ? 'bg-[var(--dk-surface-ghost-active)] font-semibold text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                title={crumb.fullPath}
              >
                {crumb.label}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative w-36 sm:w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search in folder…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 w-full rounded-lg bg-[var(--dk-surface-field)] pl-8 pr-6 text-xs text-foreground placeholder:text-muted-foreground/60 border border-white/[0.06] outline-none focus:border-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsCreatingFolder(!isCreatingFolder)}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-white/[0.06] bg-[var(--dk-surface-ghost)] px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-[var(--dk-surface-ghost-hover)] cursor-pointer"
          >
            <FolderPlus className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">New folder</span>
          </button>
        </div>
      </div>

      {isCreatingFolder && (
        <form
          onSubmit={onCreateFolder}
          className={cn(
            'flex shrink-0 items-center gap-2',
            isModal
              ? 'mx-4 mb-2 rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.06] p-2.5'
              : 'border-b border-white/[0.04] bg-muted/30 p-3',
          )}
        >
          <FolderPlus className="h-4 w-4 shrink-0 text-primary" />
          <input
            type="text"
            required
            autoFocus
            placeholder="Folder name…"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="h-8 flex-1 rounded-lg border border-white/[0.06] bg-[var(--dk-surface-field)] px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
          />
          <button
            type="submit"
            disabled={isCreatingFolderPending || !newFolderName.trim()}
            className="h-8 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
          >
            {isCreatingFolderPending ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => setIsCreatingFolder(false)}
            className="h-8 rounded-lg border border-white/[0.06] bg-[var(--dk-surface-ghost)] px-3 text-xs text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground cursor-pointer"
          >
            Cancel
          </button>
        </form>
      )}
    </>
  )
}
