import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  Download,
  RefreshCw,
  Server,
  FolderOpen,
  HardDrive,
  DownloadCloud,
  Sliders,
  Search,
  History,
  BookmarkCheck,
} from 'lucide-react';
import { useAuth } from '@/lib/providers/auth';
import { useFeature } from '@/features/_config';
import { useModal } from '@/lib/modals';
import { useDownloads } from '../use-downloads';
import { useRemoteDownloads, useServerGames } from '../use-server-downloads';
import { useMediaRequests } from '../use-media-requests';
import { DownloadCard } from '../molecules/download-card';
import { RemoteDownloadCard } from '../molecules/remote-download-card';
import { ServerFileExplorerModal } from '../molecules/server-file-explorer-modal';
import { ServerSabnzbdSettingsModal } from '../molecules/server-sabnzbd-settings-modal';
import { ServerJDownloaderSettingsModal } from '../molecules/server-jdownloader-settings-modal';
import { ServerGameSearchModal } from '../molecules/server-game-search-modal';
import { DownloadHistoryPanel } from '../molecules/download-history-panel';
import { DownloadRequestsPanel } from '../molecules/download-requests-panel';
import { useServerUsenetHistory, useServerUsenetQueue, useCancelServerQueueDownload } from '../use-server-usenet';
import { resolveDownloadDisplayTitle } from '../utils';
import { DkButton } from '@ui/atoms/button';
import { cn, formatBytes } from '@/lib/utils';
import { isDesktop } from '@/lib/desktop/api';
import { DownloadRelocationPrompt } from '../components/molecules/download-relocation-prompt';
import './download-queue.scss';



export const DownloadQueuePage = () => {
  const { user } = useAuth();
  const downloadsEnabled = useFeature('downloads');
  const userId = user?.id;
  const { downloads, loading, pollQueue, cancelDownload } = useDownloads(userId);
  const { data: serverData } = useServerGames();
  const {
    activeTransfers,
    pauseDownload,
    resumeDownload,
    cancelDownload: cancelRemoteDownload,
  } = useRemoteDownloads();
  const [mainTab, setMainTab] = useState<'active' | 'requests' | 'history'>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'requests' || tab === 'history') return tab;
    } catch {
      // ignore
    }
    return 'active';
  });
  const { openModal } = useModal();

  const activeServer = serverData?.servers?.[0];
  const activeServerId = activeServer?.id;
  const { data: mediaRequestsData } = useMediaRequests({ serverId: activeServerId });
  const mediaRequestsCount = mediaRequestsData?.items?.length ?? 0;

  const openServerExplorer = () => {
    const close = openModal(
      <ServerFileExplorerModal
        initialServerId={activeServerId}
        serverName={activeServer?.name}
        onClose={() => close()}
      />,
    );
  };

  const { data: usenetQueueData, refetch: refetchUsenetQueue } = useServerUsenetQueue(activeServerId);
  const { data: usenetHistory = [], isLoading: historyLoading } = useServerUsenetHistory(activeServerId);
  const cancelUsenetDownloadMutation = useCancelServerQueueDownload(activeServerId);
  const activeUsenetIds = new Set((usenetQueueData?.items ?? []).map((item) => item.nzo_id));
  const usenetHistoryItems = usenetHistory.filter((item) => !activeUsenetIds.has(item.nzo_id));
  const usenetActiveItems = usenetQueueData?.items ?? [];
  const usenetActiveCount = usenetActiveItems.length;

  const [gamesDownloadPath, setGamesDownloadPath] = useState<string>(() => {


    try {
      return localStorage.getItem('otix:games-download-dir') || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    const api = window.desktopAPI as any;
    if (api?.getDesktopSettings) {
      api.getDesktopSettings().then((ds: any) => {
        if (ds?.gamesDownloadPath) {
          setGamesDownloadPath(ds.gamesDownloadPath);
        }
      }).catch(() => {});
    }
  }, []);

  const desktop = isDesktop();
  const hasGameServers = (serverData?.servers?.length ?? 0) > 0;
  const canAccess = Boolean(user?.isAdmin || downloadsEnabled || hasGameServers || activeTransfers.length > 0);

  // Admin + experiment gate
  if (!canAccess) {
    return (
      <div className="dk-downloads__gate">
        <Download className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h1 className="dk-downloads__gate-heading">Downloads</h1>
        <p className="dk-downloads__gate-desc">
          This feature is not available.
        </p>
      </div>
    );
  }

  if (!desktop && !hasGameServers) {
    return (
      <div className="dk-downloads__gate">
        <Download className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h1 className="dk-downloads__gate-heading">Downloads</h1>
        <p className="dk-downloads__gate-desc">
          Download management is only available in the Otix desktop app, or connect a self-hosted game server to browse and download games in your browser.
        </p>
      </div>
    );
  }

  const activeDownloads = downloads.filter((d) => d.status === 'queued' || d.status === 'downloading');
  const activeRemoteTransfers = activeTransfers.filter(
    (t) => t.status === 'downloading' || t.status === 'paused' || t.status === 'error',
  );
  const totalActiveCount = activeDownloads.length + activeRemoteTransfers.length + usenetActiveCount;

  return (
    <div id="download-queue" className="dk-downloads__page">
      <Helmet>
        <title>Downloads - Otix</title>
        <meta name="description" content="Manage your downloads on Otix." />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* Header */}
      <div className="dk-downloads__header">
        <div>
          <h1 className="dk-downloads__heading">Downloads</h1>
          {totalActiveCount > 0 && (
            <p className="dk-downloads__active-count">{totalActiveCount} active</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasGameServers && (
            <>
              <button
                type="button"
                onClick={() => {
                  const close = openModal(
                    <ServerGameSearchModal
                      serverId={activeServerId}
                      serverName={activeServer?.name}
                      onClose={() => close()}
                      onDownloadStarted={() => {
                        refetchUsenetQueue();
                      }}
                    />,
                  );
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Search Indexers</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const close = openModal(
                    <ServerSabnzbdSettingsModal
                      serverId={activeServerId}
                      serverName={activeServer?.name}
                      onClose={() => close()}
                    />,
                  );
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-muted/60 hover:bg-muted text-foreground text-xs font-semibold transition-colors"
                title="Configure SABnzbd"
              >
                <Sliders className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">SABnzbd Settings</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const close = openModal(
                    <ServerJDownloaderSettingsModal
                      serverId={activeServerId}
                      serverName={activeServer?.name}
                      onClose={() => close()}
                    />,
                  );
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-muted/60 hover:bg-muted text-foreground text-xs font-semibold transition-colors"
                title="Configure JDownloader 2"
              >
                <DownloadCloud className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">JDownloader Settings</span>
              </button>
            </>
          )}
          <DkButton size="sm" variant="ghost" onClick={pollQueue} loading={loading} className="shadow-none">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </DkButton>
        </div>
      </div>

      {/* Queue toolbar */}
      <div className="flex items-center gap-2 mb-4 pb-3">
        <button
          type="button"
          onClick={() => setMainTab('active')}
          className={cn(
            'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all border border-white/[0.04]',
            mainTab === 'active'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
          )}
        >
          <DownloadCloud className="h-3.5 w-3.5" />
          <span>Active Downloads</span>
          {totalActiveCount > 0 && (
            <span
              className={cn(
                'px-1.5 py-0.2 rounded-full text-[10px] font-bold',
                mainTab === 'active'
                  ? 'bg-black/25 text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {totalActiveCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setMainTab('requests')}
          className={cn(
            'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all border border-white/[0.04]',
            mainTab === 'requests'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
          )}
        >
          <BookmarkCheck className="h-3.5 w-3.5" />
          <span>Requests</span>
          {mediaRequestsCount > 0 && (
            <span
              className={cn(
                'px-1.5 py-0.2 rounded-full text-[10px] font-bold',
                mainTab === 'requests'
                  ? 'bg-black/25 text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {mediaRequestsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setMainTab('history')}
          className={cn(
            'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all border border-white/[0.04]',
            mainTab === 'history'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
          )}
        >
          <History className="h-3.5 w-3.5" />
          <span>Download History</span>
          {usenetHistoryItems.length > 0 && (
            <span
              className={cn(
                'px-1.5 py-0.2 rounded-full text-[10px] font-bold',
                mainTab === 'history'
                  ? 'bg-black/25 text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {usenetHistoryItems.length}
            </span>
          )}
        </button>

        {hasGameServers && (
          <button
            type="button"
            onClick={openServerExplorer}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border border-transparent"
          >
            <HardDrive className="h-3.5 w-3.5" />
            <span>Server Storage</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-muted text-muted-foreground">
              {serverData?.servers?.length || 1}
            </span>
          </button>
        )}
      </div>

      {/* Main Tab: Active Downloads Only */}
      {mainTab === 'active' && (
        <>
          {/* ── 1-Click Relocation Prompt & Destination Preview ── */}
          <DownloadRelocationPrompt className="mb-5" />

          {/* Assigned Save Location Banner */}
          <div className="mb-5 px-3.5 py-2.5 rounded-xl bg-[var(--dk-surface-ghost)] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-muted-foreground min-w-0">
              <FolderOpen className="h-4 w-4 text-primary shrink-0" />
              <span className="shrink-0 font-medium text-foreground">Local Save Folder:</span>
              <span className="font-mono text-[11px] truncate">
                {gamesDownloadPath || (desktop ? 'Default (~/Downloads/Games)' : 'Browser Default (~/Downloads)')}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {hasGameServers && (
                <button
                  type="button"
                  onClick={openServerExplorer}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary text-[11px] font-semibold transition-colors"
                >
                  <HardDrive className="h-3 w-3" />
                  <span>Browse Server</span>
                </button>
              )}
              <a
                href="/settings/library#downloads"
                className="text-[11px] text-muted-foreground hover:text-foreground hover:underline ml-1 font-medium"
              >
                Settings
              </a>
            </div>
          </div>

          {/* ── Active Server SABnzbd Usenet Queue ── */}
          {hasGameServers && usenetActiveItems.length > 0 && (
            <div className="mb-5 p-4 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-xl shadow-[var(--dk-shadow-glass)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-xl bg-primary/15 text-primary">
                    <DownloadCloud className="h-4 w-4 animate-bounce" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">
                      Server Usenet Downloads (SABnzbd)
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Speed: <span className="text-primary font-semibold font-mono">{usenetQueueData?.speed || '0 KB/s'}</span> · {usenetActiveItems.length} active item{usenetActiveItems.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {usenetActiveItems.map((item) => {
                  const displayTitle = resolveDownloadDisplayTitle(item);
                  const totalBytes = item.size_mb * 1024 * 1024;
                  const downloadedBytes = Math.max(0, (item.size_mb - item.size_left_mb) * 1024 * 1024);

                  return (
                    <div
                      key={item.nzo_id}
                      className="p-3.5 rounded-xl bg-muted/30 space-y-2.5 border border-white/[0.04]"
                    >
                      <div className="flex items-center justify-between text-xs gap-3">
                        <div className="min-w-0 flex-1">
                          <span
                            className="font-semibold text-foreground truncate block"
                            title={displayTitle}
                          >
                            {displayTitle}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-muted-foreground text-[11px]">
                            {item.percentage.toFixed(1)}%
                          </span>
                          <button
                            onClick={() => cancelUsenetDownloadMutation.mutate(item.nzo_id)}
                            className="text-[11px] text-destructive hover:opacity-80 font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>

                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${Math.max(2, item.percentage)}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground capitalize">{item.status || 'Downloading'}</span>
                          {item.size_mb > 0 && (
                            <span>
                              {item.size_left_mb > 0
                                ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`
                                : formatBytes(totalBytes)}
                            </span>
                          )}
                          {item.speed && item.speed !== '0 B/s' && <span>· {item.speed}</span>}
                        </div>
                        {item.time_left && <span className="font-mono">ETA: {item.time_left}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Web Mode: Connected Servers & Direct Download Library */}
          {!desktop && hasGameServers && (
            <div className="mb-6 space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/40">
                <div className="flex items-center gap-3">
                  <Server className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="font-semibold text-sm">Self-Hosted Otix Nodes</h3>
                    <p className="text-xs text-muted-foreground">
                      {serverData?.servers?.length} connected node{serverData?.servers?.length === 1 ? '' : 's'} · Direct browser streaming enabled
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Hosted Game Files ({serverData?.files?.length || 0})
                </h4>
                {serverData?.files?.map((file) => (
                  <div
                    key={`${file.serverId}-${file.fileId}`}
                    className="flex items-center justify-between p-4 rounded-xl bg-[var(--dk-surface-glass)] backdrop-blur-xl shadow-[var(--dk-shadow-glass)] transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{file.gameTitle}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary">
                          {file.formatCategory}
                        </span>
                        {file.isShared && file.sharedBy && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary">
                            Shared by @{file.sharedBy.username}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{file.filename}</span>
                        <span>•</span>
                        <span>{formatBytes(file.filesize)}</span>
                        <span>•</span>
                        <span className="text-primary/80">{file.serverName}</span>
                      </div>
                    </div>

                    <a
                      href={file.downloadUrl}
                      download={file.filename}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Direct Download
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Local and Remote Active Download list */}
          {activeDownloads.length === 0 && activeRemoteTransfers.length === 0 && usenetActiveItems.length === 0 ? (
            <div className="dk-downloads__empty">
              <Download className="h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="dk-downloads__empty-text">No active downloads</p>
              <p className="dk-downloads__empty-sub">
                Your queue is clear. Active Usenet releases and server downloads will appear here as they progress.
              </p>
            </div>
          ) : (
            <div className="dk-downloads__list space-y-3">
              {activeRemoteTransfers.map((transfer) => (
                <RemoteDownloadCard
                  key={transfer.id}
                  transfer={transfer}
                  onPause={pauseDownload}
                  onResume={resumeDownload}
                  onCancel={cancelRemoteDownload}
                />
              ))}
              {activeDownloads.map((dl) => (
                <DownloadCard
                  key={dl.id}
                  download={dl}
                  onCancel={cancelDownload}
                  onDelete={cancelDownload}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Requests Tab: All Media & Download Requests sent from Otix */}
      {mainTab === 'requests' && (
        <DownloadRequestsPanel serverId={activeServerId} />
      )}

      {/* History Tab: Dedicated SABnzbd & Usenet History */}
      {mainTab === 'history' && (
        <DownloadHistoryPanel
          items={usenetHistoryItems}
          isLoading={historyLoading}
        />
      )}
    </div>
  );
};
