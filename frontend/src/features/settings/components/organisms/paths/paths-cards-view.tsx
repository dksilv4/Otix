import { AddPathFolderCard } from '../../molecules/add-path-folder-card'
import { PathFolderCard } from '../../molecules/path-folder-card'
import type { ConfiguredFolderItem, SuggestedPathItem } from '../../utils/paths'

export interface PathsCardsViewProps {
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
  isScanning: boolean
  onToggleInstallation: (path: string) => void
  onAssignDownload: (path: string) => void
  onToggleIso: (path: string) => void
  onRemove: (path: string) => void
  onCopyPath: (path: string) => void
  onRescan: (path: string) => void
}

export const PathsCardsView = ({
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
  isScanning,
  onToggleInstallation,
  onAssignDownload,
  onToggleIso,
  onRemove,
  onCopyPath,
  onRescan,
}: PathsCardsViewProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
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
        viewMode="cards"
      />
      {filteredFolders.map((item) => (
        <PathFolderCard
          key={item.path}
          item={item}
          onToggleInstallation={onToggleInstallation}
          onAssignDownload={onAssignDownload}
          onToggleIso={onToggleIso}
          onRemove={onRemove}
          onCopyPath={onCopyPath}
          onRescan={(path) => onRescan(path)}
          isScanning={isScanning}
        />
      ))}
      {filteredFolders.length === 0 && searchQuery && (
        <div className="col-span-full flex flex-col items-center justify-center p-8 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-center">
          <p className="text-sm font-semibold text-foreground">No matching folders</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            No folders match &quot;{searchQuery}&quot;. Try a different search term or role filter.
          </p>
        </div>
      )}
    </div>
  )
}
