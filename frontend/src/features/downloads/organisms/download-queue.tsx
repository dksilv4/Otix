import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Download, RefreshCw, Server, ExternalLink, FolderOpen, HardDrive, DownloadCloud, Sliders, Search } from 'lucide-react';
import { useAuth } from '@/lib/providers/auth';
import { useFeature } from '@/features/_config';
import { useModal } from '@/lib/modals';
import { useDownloads } from '../use-downloads';
import { useRemoteDownloads, useServerGames } from '../use-server-downloads';
import { DownloadCard } from '../molecules/download-card';
import { RemoteDownloadCard } from '../molecules/remote-download-card';
import { ServerFileExplorer } from '../molecules/server-file-explorer';
import { ServerSabnzbdSettingsModal } from '../molecules/server-sabnzbd-settings-modal';
import { ServerGameSearchModal } from '../molecules/server-game-search-modal';
import { useServerUsenetHistory, useServerUsenetQueue, useCancelServerQueueDownload } from '../use-server-usenet';
import { DkButton } from '@ui/atoms/button';
import { cn, formatBytes } from '@/lib/utils';
import { isDesktop } from '@/lib/desktop/api';
import './download-queue.scss';



export function DownloadQueuePage() {
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
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'deleted'>('all');
  const [viewTab, setViewTab] = useState<'queue' | 'explorer'>('queue');
  const { openModal } = useModal();

  const activeServer = serverData?.servers?.[0];
  const activeServerId = activeServer?.id;
  const { data: usenetQueueData, refetch: refetchUsenetQueue } = useServerUsenetQueue(activeServerId);
  const { data: usenetHistory = [] } = useServerUsenetHistory(activeServerId);
  const cancelUsenetDownloadMutation = useCancelServerQueueDownload(activeServerId);
  const activeUsenetIds = new Set((usenetQueueData?.items ?? []).map((item) => item.nzo_id));
  const usenetHistoryItems = usenetHistory.filter((item) => !activeUsenetIds.has(item.nzo_id));

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
  const canAccess = user?.isAdmin && (downloadsEnabled || hasGameServers || activeTransfers.length > 0);

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

  const filtered = downloads.filter((d) => {
    if (filter === 'active') return d.status === 'queued' || d.status === 'downloading';
    if (filter === 'completed') return d.status === 'completed' || d.status === 'failed';
    if (filter === 'deleted') return d.status === 'deleted';
    if (filter === 'all') return d.status !== 'deleted';
    return true;
  });

  const filteredRemote = activeTransfers.filter((t) => {
    if (filter === 'active') return t.status === 'downloading' || t.status === 'paused' || t.status === 'error';
    if (filter === 'completed') return t.status === 'completed';
    if (filter === 'deleted') return false;
    return true;
  });

  const activeRemoteCount = activeTransfers.filter(t => t.status === 'downloading' || t.status === 'paused').length;
  const activeCount = downloads.filter(d => d.status === 'queued' || d.status === 'downloading').length + activeRemoteCount;

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
          {activeCount > 0 && (
            <p className="dk-downloads__active-count">{activeCount} active</p>
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
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-muted/60 hover:bg-muted text-foreground text-xs font-semibold border border-border transition-colors"
                title="Configure SABnzbd"
              >
                <Sliders className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">SABnzbd Settings</span>
              </button>
            </>
          )}
          <DkButton size="sm" variant="ghost" onClick={pollQueue} loading={loading} className="shadow-none">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </DkButton>
        </div>
      </div>


      {/* View Switcher: Queue vs Server Storage Explorer */}
      <div className="flex items-center gap-2 mb-4 border-b border-border pb-3">
        <button
          onClick={() => setViewTab('queue')}
          className={cn(
            'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors',
            viewTab === 'queue'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
        >
          <Download className="h-3.5 w-3.5" />
          <span>Downloads Queue</span>
          {activeCount > 0 && (
            <span
              className={cn(
                'px-1.5 py-0.2 rounded-full text-[10px] font-bold',
                viewTab === 'queue'
                  ? 'bg-black/25 text-primary-foreground'
                  : 'bg-primary/20 text-primary'
              )}
            >
              {activeCount}
            </span>
          )}
        </button>

        {hasGameServers && (
          <button
            onClick={() => setViewTab('explorer')}
            className={cn(
              'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors',
              viewTab === 'explorer'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <HardDrive className="h-3.5 w-3.5" />
            <span>Server Storage & Explorer</span>
            <span
              className={cn(
                'px-1.5 py-0.2 rounded-full text-[10px] font-bold',
                viewTab === 'explorer'
                  ? 'bg-black/25 text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {serverData?.servers?.length || 1}
            </span>
          </button>
        )}
      </div>

      {/* Assigned Save Location Banner */}
      <div className="mb-5 px-3.5 py-2.5 rounded-xl bg-card border border-border flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-muted-foreground min-w-0">
          <FolderOpen className="h-4 w-4 text-primary shrink-0" />
          <span className="shrink-0 font-medium text-foreground">Local Save Folder:</span>
          <span className="font-mono text-[11px] truncate">
            {gamesDownloadPath || (desktop ? 'Default (~/Downloads/Games)' : 'Browser Default (~/Downloads)')}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasGameServers && viewTab === 'queue' && (
            <button
              type="button"
              onClick={() => setViewTab('explorer')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary text-[11px] font-semibold border border-primary/25 transition-colors"
            >
              <HardDrive className="h-3 w-3" />
              <span>Browse Server</span>
            </button>
          )}
          <a
            href="/settings/downloads"
            className="text-[11px] text-muted-foreground hover:text-foreground hover:underline ml-1 font-medium"
          >
            Settings
          </a>
        </div>
      </div>

      {/* Explorer Tab Content */}
      {viewTab === 'explorer' ? (
        <ServerFileExplorer className="mb-6" />
      ) : (
        <>
          {/* ── Active Server SABnzbd Usenet Queue ── */}
          {hasGameServers && usenetQueueData && usenetQueueData.items.length > 0 && (
            <div className="mb-5 p-4 rounded-2xl bg-card border border-primary/30 shadow-md space-y-3">
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
                      Speed: <span className="text-primary font-semibold font-mono">{usenetQueueData.speed}</span> · {usenetQueueData.items.length} active item{usenetQueueData.items.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {usenetQueueData.items.map((item) => (
                  <div
                    key={item.nzo_id}
                    className="p-3 rounded-xl bg-muted/30 border border-border space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground truncate max-w-[70%]">
                        {item.filename}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-muted-foreground text-[11px]">
                          {item.percentage.toFixed(1)}%
                        </span>
                        <button
                          onClick={() => cancelUsenetDownloadMutation.mutate(item.nzo_id)}
                          className="text-[11px] text-rose-400 hover:text-rose-300 font-medium"
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

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Status: {item.status}</span>
                      {item.time_left && <span>ETA: {item.time_left}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasGameServers && usenetHistoryItems.length > 0 && (
            <div className="mb-5 p-4 rounded-2xl bg-card border border-border space-y-3">
              <h3 className="text-xs font-bold text-foreground">Download History</h3>
              <div className="space-y-2">
                {usenetHistoryItems.map((item) => (
                  <div
                    key={item.nzo_id || item.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/30 border border-border"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">
                        {item.status}
                        {item.size_bytes ? ` · ${formatBytes(item.size_bytes)}` : ''}
                      </p>
                    </div>
                    {item.status === 'failed' && item.error_message ? (
                      <p className="text-[10px] text-rose-400 max-w-[40%] truncate" title={item.error_message}>
                        {item.error_message}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filter tabs */}
          <div className="dk-downloads__filters">


        {(['all', 'active', 'completed', 'deleted'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'dk-downloads__filter-btn',
              filter === f
                ? 'dk-downloads__filter-btn--active'
                : 'dk-downloads__filter-btn--inactive',
            )}
          >
            {f === 'all' ? 'All' : f === 'active' ? 'Active' : f === 'completed' ? 'Completed' : 'Deleted'}
          </button>
        ))}
      </div>

      {/* Web Mode: Connected Servers & Direct Download Library */}
      {!desktop && hasGameServers && (
        <div className="mb-6 space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/40 border border-border">
            <div className="flex items-center gap-3">
              <Server className="h-5 w-5 text-primary" />
              <div>
                <h3 className="font-semibold text-sm">Self-Hosted Game Servers (Plex for Games)</h3>
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
                className="flex items-center justify-between p-4 rounded-xl bg-card border border-border hover:border-primary/40 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{file.gameTitle}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary">
                      {file.formatCategory}
                    </span>
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

      {/* Download list */}
      {filtered.length === 0 && filteredRemote.length === 0 ? (
        <div className="dk-downloads__empty">
          <Download className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="dk-downloads__empty-text">No downloads yet</p>
          <p className="dk-downloads__empty-sub">
            Browse a game and click Download to stream from your server or queue an ISO.
          </p>
        </div>
      ) : (
        <div className="dk-downloads__list space-y-3">
          {filteredRemote.map((transfer) => (
            <RemoteDownloadCard
              key={transfer.id}
              transfer={transfer}
              onPause={pauseDownload}
              onResume={resumeDownload}
              onCancel={cancelRemoteDownload}
            />
          ))}
          {filtered.map((dl) => (
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
    </div>
  );


}
