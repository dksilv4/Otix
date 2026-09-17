import React, { useState, useMemo } from 'react';
import {
  Server,
  Folder,
  FolderPlus,
  CheckCircle2,
  Download,
  RefreshCw,
  Search,
  CornerLeftUp,
  HardDrive,
  Disc,
  Package,
  Gamepad2,
  Archive,
  FileText,
  Check,
  X,
  ChevronRight,
} from 'lucide-react';
import { cn, formatBytes } from '@/lib/utils';
import { useToast } from '@ui/molecules/toast';
import { isDesktop } from '@/lib/desktop/api';
import { useGameServers } from '../use-server-downloads';
import {
  useServerExplorer,
  useSetServerDownloadPath,
  useCreateServerFolder,
} from '../use-server-explorer';
import {
  formatExplorerDate,
  getFormatBadgeColor,
  isPathEqual,
  parseBreadcrumbs,
  sortExplorerEntries,
} from '../server-explorer-utils';
import type { FormatCategory, ServerExplorerEntry } from '../server-explorer-types';

interface ServerFileExplorerProps {
  initialServerId?: number;
  initialPath?: string;
  className?: string;
  onClose?: () => void;
}

export function ServerFileExplorer({
  initialServerId,
  initialPath,
  className,
  onClose,
}: ServerFileExplorerProps) {
  const { toast } = useToast();
  const desktop = isDesktop();

  // Servers
  const { data: servers = [], isLoading: serversLoading } = useGameServers();
  const [selectedServerId, setSelectedServerId] = useState<number | undefined>(() => {
    return initialServerId || servers[0]?.id;
  });

  // Pick first available server if none selected
  const activeServer = useMemo(() => {
    if (selectedServerId) {
      return servers.find((s) => s.id === selectedServerId);
    }
    return servers[0];
  }, [servers, selectedServerId]);

  const serverId = activeServer?.id;

  // Path & Search state
  const [currentPath, setCurrentPath] = useState<string | undefined>(initialPath);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Explorer query & mutations
  const {
    data: browseData,
    isLoading: isBrowsing,
    isRefetching,
    refetch,
    error: browseError,
  } = useServerExplorer(serverId, currentPath);

  const setDownloadPathMutation = useSetServerDownloadPath(serverId);
  const createFolderMutation = useCreateServerFolder(serverId);

  // Parse breadcrumbs
  const breadcrumbs = useMemo(() => {
    const raw = browseData?.current_path || currentPath || '';
    return parseBreadcrumbs(raw);
  }, [browseData?.current_path, currentPath]);

  // Sort and filter entries
  const sortedEntries = useMemo(() => {
    if (!browseData?.entries) return [];
    return sortExplorerEntries(browseData.entries, searchQuery);
  }, [browseData?.entries, searchQuery]);

  // Check if current viewed path is the active server download folder
  const isCurrentFolderDownloadTarget = useMemo(() => {
    const current = browseData?.current_path || currentPath;
    return isPathEqual(current, browseData?.active_download_path);
  }, [browseData?.current_path, currentPath, browseData?.active_download_path]);

  // Actions
  const handleNavigate = (newPath?: string) => {
    setCurrentPath(newPath);
    setSearchQuery('');
    setIsCreatingFolder(false);
    setNewFolderName('');
  };

  const handleSetDownloadLocation = async (targetPath?: string) => {
    const path = targetPath || browseData?.current_path || currentPath;
    if (!path) return;

    try {
      await setDownloadPathMutation.mutateAsync({
        path,
        create_if_missing: true,
        add_as_library: true,
      });
      toast({
        title: 'Server Download Location Updated',
        description: `All future game downloads on this server will save to ${path}.`,
        variant: 'success',
      });
      refetch();
    } catch (err: any) {
      toast({
        title: 'Failed to set download path',
        description: err.message || 'Could not update server configuration.',
        variant: 'error',
      });
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !browseData?.current_path) return;

    try {
      await createFolderMutation.mutateAsync({
        parent_path: browseData.current_path,
        folder_name: newFolderName.trim(),
      });
      toast({
        title: 'Folder Created',
        description: `Created folder "${newFolderName.trim()}" on server.`,
        variant: 'success',
      });
      setNewFolderName('');
      setIsCreatingFolder(false);
      refetch();
    } catch (err: any) {
      toast({
        title: 'Failed to create folder',
        description: err.message || 'Folder name may be invalid or already exists.',
        variant: 'error',
      });
    }
  };

  const handleDownloadFile = async (entry: ServerExplorerEntry) => {
    if (!activeServer) return;
    const targetUrl = (activeServer.primaryUrl || '').replace(/\/+$/, '');
    const tokenParam = activeServer.authToken ? `&token=${encodeURIComponent(activeServer.authToken)}` : '';
    const directDownloadUrl = `${targetUrl}/api/v1/explorer/download?path=${encodeURIComponent(entry.path)}${tokenParam}`;

    if (desktop && window.desktopAPI?.downloadsRemoteStart) {
      try {
        const destDir = localStorage.getItem('otix:games-download-dir') || undefined;
        await window.desktopAPI.downloadsRemoteStart({
          serverUrl: targetUrl,
          fileId: `explorer_${entry.name.replace(/\W+/g, '_')}`,
          filename: entry.name,
          filesize: entry.size,
          gameTitle: entry.name.replace(/\.[^/.]+$/, ''),
          destDir,
        });
        toast({
          title: 'Download Started',
          description: `Streaming ${entry.name} from ${activeServer.name} to your local device.`,
          variant: 'success',
        });
        return;
      } catch (err: any) {
        console.warn('Desktop download trigger failed, falling back to direct stream:', err);
      }
    }

    // Fallback: trigger browser direct download
    const link = document.createElement('a');
    link.href = directDownloadUrl;
    link.download = entry.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: 'Streaming from Server',
      description: `Downloading ${entry.name} (${formatBytes(entry.size)}) to this device.`,
      variant: 'default',
    });
  };

  const getFormatIcon = (format: FormatCategory) => {
    switch (format) {
      case 'iso':
        return <Disc className="h-4 w-4 text-purple-400 shrink-0" />;
      case 'installer':
        return <Package className="h-4 w-4 text-emerald-400 shrink-0" />;
      case 'archive':
        return <Archive className="h-4 w-4 text-amber-400 shrink-0" />;
      case 'rom':
        return <Gamepad2 className="h-4 w-4 text-cyan-400 shrink-0" />;
      case 'folder':
        return <Folder className="h-4 w-4 text-amber-300 shrink-0" />;
      default:
        return <FileText className="h-4 w-4 text-white/50 shrink-0" />;
    }
  };

  if (serversLoading) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
        <RefreshCw className="h-4 w-4 animate-spin text-primary" />
        <span>Loading connected game servers...</span>
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div className="p-8 text-center rounded-2xl bg-card border border-border space-y-3">
        <Server className="h-8 w-8 text-muted-foreground/40 mx-auto" />
        <h3 className="text-sm font-semibold text-foreground">No Game Servers Connected</h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Connect your self-hosted Otix server node in Launcher Settings to browse and manage its download storage.
        </p>
        <a
          href="/settings/launcher"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
        >
          Connect Server
        </a>
      </div>
    );
  }

  return (
    <div className={cn('rounded-2xl bg-card border border-border overflow-hidden flex flex-col', className)}>
      {/* ── Top Header: Server Info & Actions ── */}
      <div className="p-4 border-b border-border bg-card/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Server className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-foreground">
                {activeServer?.name || 'Server Storage'}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Online
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
              <span className="font-mono text-foreground/70">{activeServer?.primaryUrl}</span>
              {browseData?.disk_free_bytes != null && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <HardDrive className="h-3 w-3" />
                    {formatBytes(browseData.disk_free_bytes)} free
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          {servers.length > 1 && (
            <select
              value={serverId}
              onChange={(e) => {
                setSelectedServerId(Number(e.target.value));
                handleNavigate(undefined);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:border-primary"
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-1.5 rounded-xl bg-muted/60 hover:bg-muted text-foreground/80 hover:text-foreground border border-border text-xs transition-colors"
            title="Refresh Directory"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefetching && 'animate-spin')} />
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Active Server Download Location Indicator ── */}
      <div className="px-4 py-2.5 bg-muted/20 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <HardDrive className="h-4 w-4 text-primary shrink-0" />
          <span className="text-muted-foreground shrink-0 font-medium">Server Download Folder:</span>
          <span className="font-mono text-[11px] text-foreground truncate">
            {browseData?.active_download_path || 'storage/downloads'}
          </span>
        </div>

        {isCurrentFolderDownloadTarget ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-[11px] font-semibold shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Current Download Folder
          </span>
        ) : (
          <button
            onClick={() => handleSetDownloadLocation()}
            disabled={setDownloadPathMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-[11px] font-bold shrink-0 transition-colors shadow-sm disabled:opacity-50"
          >
            <Check className="h-3 w-3" />
            {setDownloadPathMutation.isPending ? 'Saving...' : 'Set as Server Download Folder'}
          </button>
        )}
      </div>

      {/* ── Breadcrumb & Action Bar ── */}
      <div className="px-4 py-2.5 border-b border-border bg-card/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs text-muted-foreground flex-1 min-w-0">
          {browseData?.parent_path && (
            <button
              onClick={() => handleNavigate(browseData.parent_path!)}
              className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors mr-1 shrink-0"
              title="Go Up"
            >
              <CornerLeftUp className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            onClick={() => handleNavigate(undefined)}
            className={cn(
              'px-2 py-1 rounded-lg transition-colors shrink-0 font-medium hover:text-foreground',
              !currentPath ? 'text-primary font-semibold bg-primary/10' : 'text-muted-foreground'
            )}
          >
            Server Root
          </button>

          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.fullPath}>
              <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              <button
                onClick={() => handleNavigate(crumb.fullPath)}
                className={cn(
                  'px-2 py-1 rounded-lg transition-colors shrink-0 truncate max-w-[140px]',
                  idx === breadcrumbs.length - 1
                    ? 'text-foreground font-semibold bg-muted'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title={crumb.fullPath}
              >
                {crumb.label}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsCreatingFolder(!isCreatingFolder)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/60 hover:bg-muted text-foreground text-xs font-medium border border-border transition-colors"
          >
            <FolderPlus className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">New Folder</span>
          </button>
        </div>
      </div>

      {/* ── Inline New Folder Creator ── */}
      {isCreatingFolder && (
        <form
          onSubmit={handleCreateFolder}
          className="p-3 bg-muted/30 border-b border-border flex items-center gap-2"
        >
          <FolderPlus className="h-4 w-4 text-primary shrink-0" />
          <input
            type="text"
            required
            autoFocus
            placeholder="Folder name (e.g. repacks, isos)..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="flex-1 px-3 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={createFolderMutation.isPending || !newFolderName.trim()}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setIsCreatingFolder(false)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </form>
      )}

      {/* ── Search Filter ── */}
      <div className="px-4 py-2 border-b border-border/60 bg-card/20 flex items-center gap-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="Filter files in this directory..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* ── Explorer File/Folder Rows ── */}
      <div className="flex-1 overflow-y-auto min-h-[260px] max-h-[480px]">
        {isBrowsing && !browseData ? (
          <div className="p-12 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin text-primary" />
            <span>Scanning server storage...</span>
          </div>
        ) : browseError ? (
          <div className="p-8 text-center text-xs text-rose-400 space-y-1">
            <p className="font-semibold">Unable to access directory</p>
            <p className="text-muted-foreground text-[11px]">
              {(browseError as any)?.response?.data?.detail || browseError.message}
            </p>
          </div>
        ) : sortedEntries.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-foreground space-y-2">
            <Folder className="h-8 w-8 text-muted-foreground/30 mx-auto" />
            <p className="font-medium text-foreground/70">
              {searchQuery ? 'No matching files or folders' : 'This folder is empty'}
            </p>
            <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
              Files and game installers downloaded here on the server will automatically appear and be ready to download to your devices.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {sortedEntries.map((entry) => {
              const badge = getFormatBadgeColor(entry.format_category);

              if (entry.is_dir) {
                return (
                  <div
                    key={entry.path}
                    onClick={() => handleNavigate(entry.path)}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/40 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Folder className="h-4 w-4 text-amber-300 group-hover:text-amber-200 shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                            {entry.name}
                          </span>
                          {entry.is_download_location && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                              Download Dir
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

                    <div className="flex items-center gap-2">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                    </div>
                  </div>
                );
              }

              // File entry
              return (
                <div
                  key={entry.path}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-card/80 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {getFormatIcon(entry.format_category)}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-foreground truncate">
                          {entry.name}
                        </span>
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border',
                            badge.bg,
                            badge.text,
                            badge.border
                          )}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span className="font-mono">{formatBytes(entry.size)}</span>
                        {entry.modified_at && (
                          <>
                            <span>•</span>
                            <span>{formatExplorerDate(entry.modified_at)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {entry.is_downloadable && (
                    <button
                      onClick={() => handleDownloadFile(entry)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0 shadow-sm"
                      title="Download to this device"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Download</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Footer Stats ── */}
      {browseData && (
        <div className="px-4 py-2 border-t border-border bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{browseData.total_items} items in folder</span>
          <span className="font-mono text-[10px] text-muted-foreground/80 truncate max-w-xs">
            {browseData.current_path}
          </span>
        </div>
      )}
    </div>
  );
}
