import { useMemo, useState } from 'react'
import { ChevronRight, CornerLeftUp, Folder, HardDrive, RefreshCw } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { cn } from '@/lib/utils'
import { useGameServers } from '@/features/downloads/use-server-downloads'
import { useServerExplorer } from '@/features/downloads/use-server-explorer'
import { normalizeExplorerBrowse, parseBreadcrumbs, sortExplorerEntries } from '@/features/downloads/server-explorer-utils'

export function FolderPickerModal({
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
}) {
  const { data: servers = [] } = useGameServers()
  const [selectedServerId, setSelectedServerId] = useState<number | undefined>(
    initialServerId ?? servers[0]?.id,
  )
  const [currentPath, setCurrentPath] = useState<string | undefined>(initialPath)

  const activeServer = servers.find((server) => server.id === selectedServerId) ?? servers[0]
  const serverId = activeServer?.id

  const { data: rawBrowseData, isLoading, error, refetch, isFetching } = useServerExplorer(
    serverId,
    currentPath,
  )
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
          <p className="text-sm text-white/60">No Otix nodes connected to browse folders.</p>
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
              <span className="text-xs font-medium text-white/50">Server</span>
              <select
                className="h-9 w-full rounded-xl bg-white/5 px-3 text-xs text-white outline-none"
                value={String(serverId ?? '')}
                onChange={(event) => {
                  setSelectedServerId(Number(event.target.value))
                  setCurrentPath(undefined)
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

          <div className="flex items-center gap-2 overflow-x-auto text-xs text-white/50">
            {browseData?.parent_path && (
              <button
                type="button"
                onClick={() => setCurrentPath(browseData.parent_path || undefined)}
                className="rounded-lg p-1 hover:bg-white/10 hover:text-white"
                title="Go up"
              >
                <CornerLeftUp className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setCurrentPath(undefined)}
              className={cn(
                'shrink-0 rounded-lg px-2 py-1 hover:text-white',
                !currentPath ? 'bg-primary/10 font-semibold text-primary' : '',
              )}
            >
              Server Root
            </button>
            {breadcrumbs.map((crumb, idx) => (
              <span key={crumb.fullPath} className="flex items-center gap-1.5">
                <ChevronRight className="h-3 w-3 text-white/20" />
                <button
                  type="button"
                  onClick={() => setCurrentPath(crumb.fullPath)}
                  className={cn(
                    'max-w-[140px] truncate rounded-lg px-2 py-1',
                    idx === breadcrumbs.length - 1 ? 'bg-white/10 font-semibold text-white' : 'hover:text-white',
                  )}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => refetch()}
              className="ml-auto rounded-lg p-1 text-white/40 hover:bg-white/10 hover:text-white"
              title="Refresh"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            </button>
          </div>

          <div className="max-h-72 min-h-[180px] overflow-y-auto rounded-2xl bg-white/[0.03]">
            {isLoading && !browseData ? (
              <div className="flex items-center justify-center gap-2 py-12 text-xs text-white/40">
                <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                Scanning folders...
              </div>
            ) : error ? (
              <div className="space-y-1 px-4 py-8 text-center text-xs text-rose-400">
                <p className="font-semibold">Unable to access directory</p>
                <p className="text-[11px] text-white/50">
                  {(error as any)?.response?.data?.detail || error.message || 'Node may be offline or disconnected.'}
                </p>
              </div>
            ) : folders.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs text-white/40">
                <Folder className="mx-auto mb-2 h-7 w-7 text-white/20" />
                This folder is empty
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {folders.map((folder) => (
                  <button
                    key={folder.path}
                    type="button"
                    onClick={() => setCurrentPath(folder.path)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5"
                  >
                    <Folder className="h-4 w-4 shrink-0 text-amber-300" />
                    <span className="truncate text-xs font-semibold text-white">{folder.name}</span>
                    <ChevronRight className="ml-auto h-3.5 w-3.5 text-white/20" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex min-w-0 items-center gap-2 text-xs text-white/50">
              <HardDrive className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="truncate font-mono text-[11px] text-white/70">{currentFolderPath}</span>
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
    </DkDialog>
  )
}
