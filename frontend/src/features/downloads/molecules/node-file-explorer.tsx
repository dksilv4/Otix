import React, { useMemo, useState } from 'react'
import {
  Archive,
  Check,
  CheckCircle2,
  ChevronRight,
  CornerLeftUp,
  Disc,
  Download,
  FileText,
  Folder,
  FolderPlus,
  Gamepad2,
  HardDrive,
  Home,
  Lock,
  Monitor,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  ShieldAlert,
  X,
} from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { useToast } from '@ui/molecules/toast'
import { isDesktop } from '@/lib/desktop/api'
import { useNodes } from '../use-node-downloads'
import {
  useCreateNodeFolder,
  useNodeExplorer,
  useRequestNodePermission,
  useSetNodeDownloadPath,
} from '../use-node-explorer'
import {
  formatExplorerDate,
  getFormatBadgeColor,
  isPathEqual,
  parseBreadcrumbs,
  sortExplorerEntries,
} from '../node-explorer-utils'
import type { FormatCategory, NodeExplorerEntry } from '../node-explorer-types'

export interface NodeFileExplorerProps {
  initialNodeId?: number
  initialServerId?: number
  initialPath?: string
  className?: string
  onClose?: () => void
  /** `modal` strips card chrome and uses dialog-friendly surfaces. */
  variant?: 'panel' | 'modal'
}

export type ServerFileExplorerProps = NodeFileExplorerProps

export const NodeFileExplorer = ({
  initialNodeId,
  initialServerId,
  initialPath,
  className,
  onClose,
  variant = 'panel',
}: NodeFileExplorerProps) => {
  const { toast } = useToast()
  const desktop = isDesktop()
  const isModal = variant === 'modal'

  const { data: nodes = [], isLoading: nodesLoading } = useNodes()
  const [selectedNodeId, setSelectedNodeId] = useState<number | undefined>(
    () => initialNodeId || initialServerId || nodes[0]?.id,
  )

  const activeNode = useMemo(() => {
    if (selectedNodeId) return nodes.find((s) => s.id === selectedNodeId)
    return nodes[0]
  }, [nodes, selectedNodeId])

  const nodeId = activeNode?.id

  const [currentPath, setCurrentPath] = useState<string | undefined>(initialPath)
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  const {
    data: browseData,
    isLoading: isBrowsing,
    isRefetching,
    refetch,
    error: browseError,
  } = useNodeExplorer(nodeId, currentPath)

  const setDownloadPathMutation = useSetNodeDownloadPath(nodeId)
  const createFolderMutation = useCreateNodeFolder(nodeId)
  const requestPermissionMutation = useRequestNodePermission(nodeId)

  const handleRequestPermission = async (path?: string) => {
    const target = path || browseData?.current_path || currentPath || ''
    try {
      const res = await requestPermissionMutation.mutateAsync({ path: target })
      toast({
        title: res.granted ? 'Permission Granted' : 'Mac Permission Requested',
        description: res.message || 'Check your Mac screen for the system permission prompt.',
        variant: res.granted ? 'success' : 'default',
      })
      refetch()
    } catch (err: any) {
      toast({
        title: 'Permission Request Failed',
        description: err.message || 'Could not communicate with node.',
        variant: 'error',
      })
    }
  }

  const breadcrumbs = useMemo(() => {
    const raw = browseData?.current_path || currentPath || ''
    return parseBreadcrumbs(raw)
  }, [browseData?.current_path, currentPath])

  const sortedEntries = useMemo(() => {
    if (!browseData?.entries) return []
    return sortExplorerEntries(browseData.entries, searchQuery)
  }, [browseData?.entries, searchQuery])

  const isCurrentFolderDownloadTarget = useMemo(() => {
    const current = browseData?.current_path || currentPath
    return isPathEqual(current, browseData?.active_download_path)
  }, [browseData?.current_path, currentPath, browseData?.active_download_path])

  const handleNavigate = (newPath?: string) => {
    setCurrentPath(newPath)
    setSearchQuery('')
    setIsCreatingFolder(false)
    setNewFolderName('')
  }

  const handleSetDownloadLocation = async (targetPath?: string) => {
    const path = targetPath || browseData?.current_path || currentPath
    if (!path) return

    try {
      await setDownloadPathMutation.mutateAsync({
        path,
        create_if_missing: true,
        add_as_library: true,
      })
      toast({
        title: 'Node Download Location Updated',
        description: `All future game downloads on this node will save to ${path}.`,
        variant: 'success',
      })
      refetch()
    } catch (err: any) {
      toast({
        title: 'Failed to set download path',
        description: err.message || 'Could not update node configuration.',
        variant: 'error',
      })
    }
  }

  const handleResetDownloadLocation = async () => {
    try {
      await setDownloadPathMutation.mutateAsync({
        path: './storage/downloads',
        create_if_missing: true,
        add_as_library: false,
      })
      toast({
        title: 'Download Folder Reset',
        description: 'Reverted download location to node default storage/downloads.',
        variant: 'default',
      })
      refetch()
    } catch (err: any) {
      toast({
        title: 'Reset Failed',
        description: err.message || 'Could not update node configuration.',
        variant: 'error',
      })
    }
  }

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFolderName.trim() || !browseData?.current_path) return

    try {
      await createFolderMutation.mutateAsync({
        parent_path: browseData.current_path,
        folder_name: newFolderName.trim(),
      })
      toast({
        title: 'Folder Created',
        description: `Created folder "${newFolderName.trim()}" on node.`,
        variant: 'success',
      })
      setNewFolderName('')
      setIsCreatingFolder(false)
      refetch()
    } catch (err: any) {
      toast({
        title: 'Failed to create folder',
        description: err.message || 'Folder name may be invalid or already exists.',
        variant: 'error',
      })
    }
  }

  const handleDownloadFile = async (entry: NodeExplorerEntry) => {
    if (!activeNode) return
    const targetUrl = (activeNode.primaryUrl || '').replace(/\/+$/, '')
    const tokenParam = activeNode.authToken
      ? `&token=${encodeURIComponent(activeNode.authToken)}`
      : ''
    const directDownloadUrl = `${targetUrl}/api/v1/explorer/download?path=${encodeURIComponent(entry.path)}${tokenParam}`

    if (desktop && window.desktopAPI?.downloadsRemoteStart) {
      try {
        const destDir = localStorage.getItem('otix:games-download-dir') || undefined
        await window.desktopAPI.downloadsRemoteStart({
          serverUrl: targetUrl,
          fileId: `explorer_${entry.name.replace(/\W+/g, '_')}`,
          filename: entry.name,
          filesize: entry.size,
          gameTitle: entry.name.replace(/\.[^/.]+$/, ''),
          destDir,
        })
        toast({
          title: 'Download Started',
          description: `Streaming ${entry.name} from ${activeNode.name} to your local device.`,
          variant: 'success',
        })
        return
      } catch (err: any) {
        console.warn('Desktop download trigger failed, falling back to direct stream:', err)
      }
    }

    const link = document.createElement('a')
    link.href = directDownloadUrl
    link.download = entry.name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: 'Streaming from Node',
      description: `Downloading ${entry.name} (${formatBytes(entry.size)}) to this device.`,
      variant: 'default',
    })
  }

  const getFormatIcon = (format: FormatCategory) => {
    switch (format) {
      case 'iso':
        return <Disc className="h-4 w-4 text-purple-400 shrink-0" />
      case 'installer':
        return <Package className="h-4 w-4 text-emerald-400 shrink-0" />
      case 'game':
        return <Gamepad2 className="h-4 w-4 text-blue-400 shrink-0" />
      case 'archive':
        return <Archive className="h-4 w-4 text-amber-400 shrink-0" />
      case 'rom':
        return <Gamepad2 className="h-4 w-4 text-cyan-400 shrink-0" />
      case 'folder':
        return <Folder className="h-4 w-4 text-amber-300 shrink-0" />
      default:
        return <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
    }
  }

  if (nodesLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-12 text-xs text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin text-primary" />
        <span>Loading connected nodes...</span>
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
        <div className="rounded-2xl p-3 bg-muted text-muted-foreground/60">
          <Server className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold text-foreground">
          No nodes connected
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Connect a self-hosted Otix node in Library settings to browse its storage.
        </p>
        <a
          href="/settings/library#downloads"
          onClick={onClose}
          className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          Connect node
        </a>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden',
        !isModal && 'rounded-2xl border border-border bg-card',
        className,
      )}
    >
      {/* Toolbar: node + refresh */}
      <div
        className={cn(
          'flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
          isModal ? 'px-4 pb-3' : 'border-b border-border bg-card/60 p-4',
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {!isModal && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <Server className="h-4 w-4 text-primary" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold text-foreground">
                {activeNode?.name || 'Node storage'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                Online
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="truncate font-mono text-foreground/70">
                {activeNode?.primaryUrl}
              </span>
              {browseData?.disk_free_bytes != null && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <HardDrive className="h-3 w-3" />
                    {formatBytes(browseData.disk_free_bytes)} free
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          {nodes.length > 1 && (
            <select
              value={nodeId}
              onChange={(e) => {
                setSelectedNodeId(Number(e.target.value))
                handleNavigate(undefined)
              }}
              className="rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-field)] px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
            >
              {nodes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => handleRequestPermission()}
            disabled={requestPermissionMutation.isPending}
            className="inline-flex items-center gap-1 rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] px-2.5 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground"
            title="Request Mac folder permissions or open settings"
            aria-label="Request Mac folder permissions"
          >
            <ShieldAlert className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
            <span className="hidden sm:inline">Permissions</span>
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] p-1.5 text-foreground/80 transition-colors hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground"
            title="Refresh directory"
            aria-label="Refresh directory"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefetching && 'animate-spin')} />
          </button>
          {!isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border bg-muted/60 p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Download folder strip */}
      <div
        className={cn(
          'flex shrink-0 flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between',
          isModal
            ? 'mx-4 mb-2 rounded-2xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] px-3 py-2.5'
            : 'border-b border-border bg-muted/20 px-4 py-2.5',
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <HardDrive className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="shrink-0 font-medium text-muted-foreground">
            Download folder
          </span>
          <span className="truncate font-mono text-[11px] text-foreground">
            {browseData?.active_download_path || 'storage/downloads'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isCurrentFolderDownloadTarget ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Current folder
            </span>
          ) : (
            <button
              type="button"
              onClick={() => handleSetDownloadLocation()}
              disabled={setDownloadPathMutation.isPending}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
            >
              <Check className="h-3 w-3" />
              {setDownloadPathMutation.isPending ? 'Saving…' : 'Use this folder'}
            </button>
          )}

          {browseData?.active_download_path && browseData.active_download_path !== './storage/downloads' && (
            <button
              type="button"
              onClick={handleResetDownloadLocation}
              disabled={setDownloadPathMutation.isPending}
              title="Reset download location to default storage/downloads"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition-colors cursor-pointer border border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick shortcuts */}
      {browseData?.shortcuts && browseData.shortcuts.length > 0 && (
        <div
          className={cn(
            'flex shrink-0 items-center gap-1.5 overflow-x-auto no-scrollbar py-1.5',
            isModal ? 'mx-4 mb-2' : 'border-b border-border/40 bg-muted/10 px-4',
          )}
        >
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Quick access:
          </span>
          {browseData.shortcuts.map((sc) => {
            const isActive = isPathEqual(currentPath || browseData.current_path, sc.path)
            return (
              <button
                key={sc.path}
                type="button"
                onClick={() => handleNavigate(sc.path)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'border border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground',
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
          isModal ? 'px-4 pb-2' : 'border-b border-border bg-card/40 px-4 py-2.5',
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5 text-xs no-scrollbar text-muted-foreground">
          {browseData?.parent_path && (
            <button
              type="button"
              onClick={() => handleNavigate(browseData.parent_path!)}
              className="mr-1 shrink-0 rounded-lg p-1 transition-colors hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground"
              title="Go up"
              aria-label="Go up"
            >
              <CornerLeftUp className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => handleNavigate(undefined)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 font-medium transition-colors',
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
                onClick={() => handleNavigate(crumb.fullPath)}
                className={cn(
                  'max-w-[140px] shrink-0 truncate rounded-lg px-2 py-1 transition-colors',
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

        <button
          type="button"
          onClick={() => setIsCreatingFolder(!isCreatingFolder)}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-[var(--dk-surface-ghost-hover)]"
        >
          <FolderPlus className="h-3.5 w-3.5 text-primary" />
          <span className="hidden sm:inline">New folder</span>
        </button>
      </div>

      {isCreatingFolder && (
        <form
          onSubmit={handleCreateFolder}
          className={cn(
            'flex shrink-0 items-center gap-2',
            isModal ? 'mx-4 mb-2 rounded-xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] p-2.5' : 'border-b border-border bg-muted/30 p-3',
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
            className="h-8 flex-1 rounded-lg border border-[var(--dk-separator)] bg-[var(--dk-surface-field)] px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
          />
          <button
            type="submit"
            disabled={createFolderMutation.isPending || !newFolderName.trim()}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setIsCreatingFolder(false)}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </form>
      )}

      {/* Search */}
      <div
        className={cn(
          'flex shrink-0 items-center gap-2',
          isModal ? 'mx-4 mb-2 rounded-xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] px-3 py-2' : 'border-b border-border/60 bg-card/20 px-4 py-2',
        )}
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          type="text"
          placeholder="Filter this folder…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={cn(
            'w-full bg-transparent text-xs outline-none',
            isModal
              ? 'text-white placeholder:text-white/30'
              : 'text-foreground placeholder:text-muted-foreground/60',
          )}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className={isModal ? 'text-white/40 hover:text-white' : 'text-muted-foreground hover:text-foreground'}
            aria-label="Clear filter"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* File list */}
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain',
          isModal ? 'mx-4 mb-3 rounded-2xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)]' : 'max-h-[min(55vh,480px)] min-h-[200px]',
        )}
      >
        {isBrowsing && !browseData ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-xs text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin text-primary" />
            <span>Scanning node storage…</span>
          </div>
        ) : browseData?.permission_denied ? (
          <div className="mx-auto max-w-md space-y-4 p-8 text-center text-xs">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                Mac Folder Permission Required
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {browseData.permission_message ||
                  `Otix Node running on your Mac needs permission to access "${browseData.current_path}".`}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleRequestPermission(browseData.current_path)}
                disabled={requestPermissionMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <Lock className="h-3.5 w-3.5" />
                {requestPermissionMutation.isPending ? 'Requesting…' : 'Prompt Node for Permission'}
              </button>
              <button
                type="button"
                onClick={() => refetch()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-[var(--dk-surface-ghost-hover)]"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', isRefetching && 'animate-spin')} />
                Retry
              </button>
            </div>
            <div className="pt-2 text-[11px]">
              <span className="text-muted-foreground">
                Or return to:{' '}
              </span>
              <button
                type="button"
                onClick={() => handleNavigate(undefined)}
                className="font-semibold text-primary underline underline-offset-2 hover:opacity-80"
              >
                Home folder
              </button>
            </div>
          </div>
        ) : browseError ? (
          (() => {
            const errDetail = String((browseError as any)?.response?.data?.detail || browseError.message || '').toLowerCase()
            const isDisconnectedOrNotFound =
              (browseError as any)?.response?.status === 404 ||
              errDetail.includes('not found') ||
              errDetail.includes('unreachable') ||
              errDetail.includes('could not contact')

            if (isDisconnectedOrNotFound) {
              return (
                <div className="space-y-3 p-8 text-center text-xs">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
                    <Server className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      Node Disconnected or Removed
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {(browseError as any)?.response?.data?.detail || 'This node is no longer connected to your account.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    {nodes.length > 0 && nodes[0].id !== nodeId ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedNodeId(nodes[0].id)
                          handleNavigate(undefined)
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                      >
                        Switch to {nodes[0].name}
                      </button>
                    ) : (
                      <a
                        href="/settings/library#downloads"
                        onClick={onClose}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                      >
                        Connect / Claim Node
                      </a>
                    )}
                  </div>
                </div>
              )
            }

            return (
              <div className="space-y-3 p-8 text-center text-xs">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-rose-500">Unable to access directory</p>
                  <p className="text-[11px] text-muted-foreground">
                    {(browseError as any)?.response?.data?.detail || browseError.message}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleRequestPermission(currentPath)}
                    disabled={requestPermissionMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Lock className="h-3 w-3" />
                    Prompt Permission
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavigate(undefined)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-[var(--dk-surface-ghost-hover)]"
                  >
                    Back to Home
                  </button>
                </div>
              </div>
            )
          })()
        ) : sortedEntries.length === 0 ? (
          <div className="space-y-2 p-12 text-center text-xs text-muted-foreground">
            <Folder className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="font-medium text-foreground/70">
              {searchQuery ? 'No matching files or folders' : 'This folder is empty'}
            </p>
            <p className="mx-auto max-w-xs text-[11px]">
              Installers and ISOs saved here on the node will show up for download.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--dk-separator)]">
            {sortedEntries.map((entry) => {
              const badge = getFormatBadgeColor(entry.format_category)

              if (entry.is_dir) {
                return (
                  <button
                    type="button"
                    key={entry.path}
                    onClick={() => handleNavigate(entry.path)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors',
                      isModal ? 'hover:bg-[var(--dk-surface-ghost-hover)]' : 'hover:bg-muted/40',
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Folder className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-300" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-semibold text-foreground">
                            {entry.name}
                          </span>
                          {entry.is_download_location && (
                            <span className="rounded border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                              Download dir
                            </span>
                          )}
                        </div>
                        {entry.modified_at && (
                          <span className="text-[10px] text-muted-foreground">
                            {formatExplorerDate(entry.modified_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                  </button>
                )
              }

              return (
                <div
                  key={entry.path}
                  className={cn(
                    'flex items-center justify-between gap-3 px-3.5 py-2.5',
                    isModal ? 'hover:bg-[var(--dk-surface-ghost-hover)]' : 'hover:bg-card/80',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {getFormatIcon(entry.format_category)}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-xs font-medium text-foreground">
                          {entry.name}
                        </span>
                        <span
                          className={cn(
                            'rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                            badge.bg,
                            badge.text,
                            badge.border,
                          )}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="font-mono">{formatBytes(entry.size)}</span>
                        {entry.modified_at && (
                          <>
                            <span>·</span>
                            <span>{formatExplorerDate(entry.modified_at)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {entry.is_downloadable && (
                    <button
                      type="button"
                      onClick={() => handleDownloadFile(entry)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                      title="Download to this device"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Download</span>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {browseData && (
        <div
          className={cn(
            'flex shrink-0 items-center justify-between gap-3 text-[11px]',
            isModal
              ? 'border-t border-[var(--dk-separator)] px-4 py-3 text-muted-foreground'
              : 'border-t border-border bg-muted/20 px-4 py-2 text-muted-foreground',
          )}
        >
          <span>{browseData.total_items} items</span>
          <span className="max-w-[65%] truncate font-mono text-[10px] opacity-80">
            {browseData.current_path}
          </span>
        </div>
      )}
    </div>
  )
};

export const ServerFileExplorer = NodeFileExplorer
