import { AddPathFolderCard } from '../../molecules/add-path-folder-card'
import { PathFolderRow } from '../../molecules/path-folder-row'
import type { ConfiguredFolderItem, SuggestedPathItem } from '../../utils/paths'

export interface PathsListViewProps {
  isAddingFolder: boolean
  onStartAdding: () => void
  onCancelAdding: () => void
  draftPath: string
  onDraftPathChange: (path: string) => void
  draftRoles: {
    installation: boolean
    download: boolean
    iso: boolean
  }
  onToggleDraftRole: (role: 'installation' | 'download' | 'iso') => void
  onAddFolder: (path: string) => void
  suggestions: SuggestedPathItem[]
  folderTarget: 'server' | 'local'
  remoteNodeId: number | null
  desktop: boolean
  filteredFolders: ConfiguredFolderItem[]
  searchQuery: string
  onToggleInstallation: (path: string) => void
  onAssignDownload: (path: string) => void
  onToggleIso: (path: string) => void
  onRemove: (path: string) => void
  onCopyPath: (path: string) => void
}

export const PathsListView = ({
  isAddingFolder,
  onStartAdding,
  onCancelAdding,
  draftPath,
  onDraftPathChange,
  draftRoles,
  onToggleDraftRole,
  onAddFolder,
  suggestions,
  folderTarget,
  remoteNodeId,
  desktop,
  filteredFolders,
  searchQuery,
  onToggleInstallation,
  onAssignDownload,
  onToggleIso,
  onRemove,
  onCopyPath,
}: PathsListViewProps) => {
  return (
    <div className="space-y-2">
      <AddPathFolderCard
        isAdding={isAddingFolder}
        onStartAdding={onStartAdding}
        onCancelAdding={onCancelAdding}
        draftPath={draftPath}
        onDraftPathChange={onDraftPathChange}
        draftRoles={draftRoles}
        onToggleDraftRole={onToggleDraftRole}
        onSubmit={onAddFolder}
        suggestions={suggestions}
        onSelectSuggestion={(p) => onAddFolder(p)}
        folderTarget={folderTarget}
        remoteNodeId={remoteNodeId}
        desktop={desktop}
        viewMode="list"
      />
      {filteredFolders.length === 0 && searchQuery ? (
        <div className="flex flex-col items-center justify-center p-8 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-center">
          <p className="text-sm font-semibold text-foreground">No matching folders</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            No folders match &quot;{searchQuery}&quot;. Try a different search term or role filter.
          </p>
        </div>
      ) : (
        filteredFolders.map((item) => (
          <PathFolderRow
            key={item.path}
            item={item}
            onToggleInstallation={onToggleInstallation}
            onAssignDownload={onAssignDownload}
            onToggleIso={onToggleIso}
            onRemove={onRemove}
            onCopyPath={onCopyPath}
          />
        ))
      )}
    </div>
  )
}
