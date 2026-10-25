import { useMemo, useState } from 'react'
import { ChevronRight, CornerLeftUp, Folder, FolderPlus, HardDrive, Network, RefreshCw, X } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { useToast } from '@ui/molecules/toast'
import { cn, formatBytes } from '@/lib/utils'
import { useGameServers } from '@/features/downloads/use-server-downloads'
import { useCreateServerFolder, useServerExplorer } from '@/features/downloads/use-server-explorer'
import {
  isPathOnDrive,
  normalizeExplorerBrowse,
  parseBreadcrumbs,
  sortExplorerEntries,
} from '@/features/downloads/server-explorer-utils'
import { ConnectNetworkFolderModal } from './connect-network-folder-modal'

export const FolderPickerModal = ({
  initialServerId,
  initialPath,
  onSelect,
  onClose,
  isExiting,
}: {
  initialServerId?: number
  initialPath?: string
  onSelect: (path: string) => void
  onClose: () => void
  isExiting?: boolean
}) => {
  const { toast } = useToast()
  const { data: servers = [] } = useGameServers()
  const [selectedServerId, setSelectedServerId] = useState<number | undefined>(
    initialServerId ?? servers[0]?.id,
  )
  const [currentPath, setCurrentPath] = useState<string | undefined>(initialPath)
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [isConnectShareOpen, setIsConnectShareOpen] = useState(false)

  const activeServer = servers.find((server) => server.id === selectedServerId) ?? servers[0]
  const serverId = activeServer?.id

  const { data: rawBrowseData, isLoading, error, refetch, isFetching } = useServerExplorer(
    serverId,
    currentPath,
  )
  const createFolderMutation = useCreateServerFolder(serverId)
  const browseData = useMemo(
    () => (rawBrowseData ? normalizeExplorerBrowse(rawBrowseData) : undefined),
    [rawBrowseData],
  )

  const folders = useMemo(() => {
    if (!browseData?.entries) return []
    return sortExplorerEntries(browseData.entries).filter((entry) => entry.is_dir)
  }, [browseData?.entries])

  const breadcrumbs = useMemo(
    () => parseBreadcrumbs(browseData?.current_path || currentPath || ''),
    [browseData?.current_path, currentPath],
  )

  const currentFolderPath = browseData?.current_path || currentPath || '/'

  const drives = useMemo(() => browseData?.drives || [], [browseData?.drives])
  const shortcuts = useMemo(
    () =>
      (browseData?.shortcuts || []).filter(
        (sc) => !drives.some((d) => d.path === sc.path) && sc.icon !== 'root',
      ),
    [browseData?.shortcuts, drives],
  )

  const handleNavigate = (path?: string) => {
    setCurrentPath(path)
    setIsCreatingFolder(false)
    setNewFolderName('')
  }

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    const folderName = newFolderName.trim()
    const parentPath = browseData?.current_path || currentPath
    if (!folderName || !parentPath) return

    try {
      const res = await createFolderMutation.mutateAsync({
        parent_path: parentPath,
        folder_name: folderName,
      })
      toast({
        title: 'Folder created',
        description: `Created folder "${folderName}".`,
        variant: 'success',
      })
      setNewFolderName('')
      setIsCreatingFolder(false)
      await refetch()
      if (res?.path) {
        handleNavigate(res.path)
      }
    } catch (err: any) {
      toast({
        title: 'Failed to create folder',
        description:
          err?.response?.data?.detail ||
          err?.response?.data?.error ||
          err?.message ||
          'Folder name may be invalid or already exists.',
        variant: 'error',
      })
    }
  }

  return (
    <DkDialog
      open={!isExiting}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Select folder"
      description="Choose a folder on a connected Otix server node."
      className="max-w-2xl"
    >
      {servers.length === 0 ? (
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">No Otix nodes connected to browse folders.</p>
          <div className="flex justify-end gap-2">
            <DkButton size="sm" variant="ghost" onClick={() => onSelect('')}>
              Clear Path Selection
            </DkButton>
            <DkButton size="sm" variant="secondary" onClick={onClose}>
              Close
            </DkButton>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {servers.length > 1 && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Server</span>
              <select
                className="h-9 w-full rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-field)] px-3 text-xs text-foreground outline-none"
                value={String(serverId ?? '')}
                onChange={(event) => {
                  setSelectedServerId(Number(event.target.value))
                  handleNavigate(undefined)
                }}
              >
                {servers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Drives selection bar */}
          {drives.length > 0 && (
            <div className="space-y-1.5 rounded-2xl bg-[var(--dk-surface-ghost)] p-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Drives
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {drives.map((drive) => {
                  const isActive = isPathOnDrive(currentFolderPath, drive.path)
                  return (
                    <button
                      key={drive.path}
                      type="button"
                      onClick={() => handleNavigate(drive.path)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer',
                        isActive
                          ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                          : 'border border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground',
                      )}
                      title={drive.path}
                    >
                      {drive.is_network ? (
                        <Network className="h-3.5 w-3.5 shrink-0 text-primary" />
                      ) : (
                        <HardDrive className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span>{drive.name}</span>
                      {drive.free_bytes != null && (
                        <span className={cn('text-[10px]', isActive ? 'text-primary-foreground/80' : 'text-muted-foreground/70')}>
                          ({formatBytes(drive.free_bytes)} free)
                        </span>
                      )}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => setIsConnectShareOpen(true)}
                  className="inline-flex items-center gap-1 rounded-xl border border-dashed border-[var(--dk-separator)] px-2.5 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-foreground cursor-pointer transition-colors"
                  title="Connect to a network share or server folder"
                >
                  <Network className="h-3.5 w-3.5" />
                  <span>+ Network</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick shortcuts strip (Home, Downloads, Documents, etc.) */}
          {shortcuts.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Quick:
              </span>
              {shortcuts.map((sc) => {
                const isActive = currentFolderPath === sc.path
                return (
                  <button
                    key={sc.path}
                    type="button"
                    onClick={() => handleNavigate(sc.path)}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer',
                      isActive
                        ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                        : 'border border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground',
                    )}
                    title={sc.path}
                  >
                    <span>{sc.name}</span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex items-center gap-2 overflow-x-auto text-xs text-muted-foreground">
            {browseData?.parent_path && (
              <button
                type="button"
                onClick={() => handleNavigate(browseData.parent_path || undefined)}
                className="rounded-lg p-1 hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground cursor-pointer"
                title="Go up"
              >
                <CornerLeftUp className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => handleNavigate(undefined)}
              className={cn(
                'shrink-0 rounded-lg px-2 py-1 hover:text-foreground cursor-pointer',
                !currentPath ? 'bg-primary/10 font-semibold text-primary' : '',
              )}
            >
              Server Root
            </button>
            {breadcrumbs.map((crumb, idx) => (
              <span key={crumb.fullPath} className="flex items-center gap-1.5">
                <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                <button
                  type="button"
                  onClick={() => handleNavigate(crumb.fullPath)}
                  className={cn(
                    'max-w-[140px] truncate rounded-lg px-2 py-1 cursor-pointer',
                    idx === breadcrumbs.length - 1 ? 'bg-[var(--dk-surface-ghost-active)] font-semibold text-foreground' : 'hover:text-foreground',
                  )}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsConnectShareOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-[var(--dk-surface-ghost-hover)] cursor-pointer"
                title="Connect to a network share or server folder"
              >
                <Network className="h-3.5 w-3.5 text-primary" />
                <span className="hidden sm:inline">Network folder</span>
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingFolder((prev) => !prev)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                  isCreatingFolder
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'border border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
                )}
                title="Create a new folder in this location"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                <span>New folder</span>
              </button>
              <button
                type="button"
                onClick={() => refetch()}
                className="rounded-lg p-1 text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground cursor-pointer"
                title="Refresh"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
              </button>
            </div>
          </div>

          {isCreatingFolder && (
            <form
              onSubmit={handleCreateFolder}
              className="flex items-center gap-2 rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] p-2"
            >
              <FolderPlus className="h-4 w-4 shrink-0 text-primary" />
              <input
                type="text"
                required
                autoFocus
                placeholder="Folder name…"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="h-8 flex-1 rounded-lg border border-[var(--dk-separator)] bg-[var(--dk-surface-field)] px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
              />
              <DkButton
                type="submit"
                size="sm"
                disabled={createFolderMutation.isPending || !newFolderName.trim()}
              >
                {createFolderMutation.isPending ? 'Creating…' : 'Create'}
              </DkButton>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingFolder(false)
                  setNewFolderName('')
                }}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </form>
          )}

          <div className="max-h-72 min-h-[180px] overflow-y-auto rounded-2xl bg-[var(--dk-surface-ghost)]">
            {isLoading && !browseData ? (
              <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                Scanning folders...
              </div>
            ) : error ? (
              <div className="space-y-1 px-4 py-8 text-center text-xs text-rose-500 dark:text-rose-400">
                <p className="font-semibold">Unable to access directory</p>
                <p className="text-[11px] text-muted-foreground">
                  {(error as any)?.response?.data?.detail || error.message || 'Node may be offline or disconnected.'}
                </p>
              </div>
            ) : folders.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs text-muted-foreground">
                <Folder className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
                This folder is empty
              </div>
            ) : (
              <div className="divide-y divide-[var(--dk-separator)]">
                {folders.map((folder) => (
                  <button
                    key={folder.path}
                    type="button"
                    onClick={() => handleNavigate(folder.path)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--dk-surface-ghost-hover)] cursor-pointer"
                  >
                    <Folder className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-300" />
                    <span className="truncate text-xs font-semibold text-foreground">{folder.name}</span>
                    <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground/40" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              {currentFolderPath.startsWith('\\\\') ||
              currentFolderPath.startsWith('//') ||
              currentFolderPath.startsWith('smb:') ? (
                <Network className="h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <HardDrive className="h-3.5 w-3.5 shrink-0 text-primary" />
              )}
              <span className="truncate font-mono text-[11px] text-foreground/80">{currentFolderPath}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <DkButton
                size="sm"
                variant="ghost"
                onClick={() => onSelect('')}
                title="Clear or undo path selection"
              >
                Clear Selection
              </DkButton>
              <DkButton
                size="sm"
                onClick={() => onSelect(currentFolderPath)}
                disabled={!browseData}
              >
                Use this folder
              </DkButton>
            </div>
          </div>
        </div>
      )}

      {/* Connect to Network Folder Modal */}
      <ConnectNetworkFolderModal
        open={isConnectShareOpen}
        onClose={() => setIsConnectShareOpen(false)}
        serverId={serverId}
        onConnected={(newPath) => {
          handleNavigate(newPath)
          refetch()
        }}
      />
    </DkDialog>
  )
};
