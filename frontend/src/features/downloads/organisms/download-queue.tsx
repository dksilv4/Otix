import { useState, useEffect, useMemo } from 'react';
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
  Tv,
  Film,
} from 'lucide-react';
import { useAuth } from '@/lib/providers/auth';
import { useFeature } from '@/features/_config';
import { useModal } from '@/lib/modals';
import { useDownloads } from '../use-downloads';
import { useRemoteDownloads, useServerGames } from '../use-server-downloads';
import { useMediaRequests } from '../use-media-requests';
import { DownloadCard } from '../molecules/download-card';
import { RemoteDownloadCard } from '../molecules/remote-download-card';
import { DownloadEpisodeCard } from '../molecules/download-episode-card';
import { DownloadMovieCard } from '../molecules/download-movie-card';
import { ServerFileExplorerModal } from '../molecules/server-file-explorer-modal';
import { ServerSabnzbdSettingsModal } from '../molecules/server-sabnzbd-settings-modal';
import { ServerJDownloaderSettingsModal } from '../molecules/server-jdownloader-settings-modal';
import { ServerGameSearchModal } from '../molecules/server-game-search-modal';
import { DownloadHistoryPanel } from '../molecules/download-history-panel';
import { DownloadRequestsPanel } from '../molecules/download-requests-panel';
import { useServerUsenetHistory, useServerUsenetQueue, useCancelServerQueueDownload } from '../use-server-usenet';
import {
  useServerSonarrQueue,
  useServerRadarrQueue,
  useCancelServerSonarrQueueItem,
  useCancelServerRadarrQueueItem,
} from '../use-server-arr';
import { resolveDownloadDisplayTitle } from '../utils';
import { parseEpisodeRelease } from '../utils/episode-download';
import type { ServerArrQueueItem } from '../arr-types';
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
  const { data: mediaRequestsData } = useMediaRequests();
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
  const activeUsenetIds = new Set((usenetQueueData?.items ?? []).map((item) => item.nzoId || item.nzo_id).filter(Boolean));
  const usenetHistoryItems = usenetHistory.filter((item) => !activeUsenetIds.has(item.nzoId || item.nzo_id));
  const usenetActiveItems = usenetQueueData?.items ?? [];

  const { data: sonarrQueueData, refetch: refetchSonarrQueue } = useServerSonarrQueue(activeServerId);
  const { data: radarrQueueData, refetch: refetchRadarrQueue } = useServerRadarrQueue(activeServerId);
  const cancelSonarrMutation = useCancelServerSonarrQueueItem(activeServerId);
  const cancelRadarrMutation = useCancelServerRadarrQueueItem(activeServerId);

  const sonarrRecords = useMemo(() => sonarrQueueData?.records ?? [], [sonarrQueueData?.records]);
  const radarrRecords = useMemo(() => radarrQueueData?.records ?? [], [radarrQueueData?.records]);

  // Usenet live speed lookup map by nzo_id
  const usenetByNzoId = useMemo(() => {
    const map = new Map<string, (typeof usenetActiveItems)[0]>();
    for (const item of usenetActiveItems) {
      const id = item.nzoId || item.nzo_id;
      if (id) map.set(id, item);
    }
    return map;
  }, [usenetActiveItems]);

  // Set of nzo_ids claimed by Sonarr or Radarr
  const claimedNzoIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of sonarrRecords) {
      if (r.downloadId) set.add(r.downloadId);
      if (r.download_id) set.add(r.download_id);
    }
    for (const r of radarrRecords) {
      if (r.downloadId) set.add(r.downloadId);
      if (r.download_id) set.add(r.download_id);
    }
    return set;
  }, [sonarrRecords, radarrRecords]);

  const standaloneUsenetItems = useMemo(() => {
    return usenetActiveItems.filter((item) => {
      const id = item.nzoId || item.nzo_id;
      return !id || !claimedNzoIds.has(id);
    });
  }, [usenetActiveItems, claimedNzoIds]);

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
  const totalActiveCount =
    activeDownloads.length +
    activeRemoteTransfers.length +
    standaloneUsenetItems.length +
    sonarrRecords.length +
    radarrRecords.length;

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
          <DkButton
            size="sm"
            variant="ghost"
            onClick={() => {
              pollQueue();
              refetchUsenetQueue();
              refetchSonarrQueue();
              refetchRadarrQueue();
            }}
            loading={loading}
            className="shadow-none"
          >
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

          {/* ── Recent Watchlist & Media Requests Pod ── */}
          {mediaRequestsCount > 0 && (
            <div className="mb-5 p-4 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-xl shadow-[var(--dk-shadow-glass)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-xl bg-primary/15 text-primary">
                    <BookmarkCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">
                      Watchlist &amp; Media Requests ({mediaRequestsCount})
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Titles automatically requested on Radarr &amp; Sonarr from your watchlist
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMainTab('requests')}
                  className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                >
                  View All &rarr;
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                {mediaRequestsData?.items?.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setMainTab('requests')}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] transition-colors cursor-pointer"
                  >
                    {item.posterUrl ? (
                      <img
                        src={item.posterUrl}
                        alt={item.title}
                        className="h-11 w-8 rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-11 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
                        <BookmarkCheck className="h-4 w-4" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                        <span className="capitalize">{item.service}</span>
                        <span>&bull;</span>
                        <span className="capitalize">{item.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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

          {/* ── Active Sonarr TV Episode Downloads ── */}
          {sonarrRecords.length > 0 && (
            <div className="mb-5 p-4 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-xl shadow-[var(--dk-shadow-glass)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-xl bg-primary/15 text-primary">
                    <Tv className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">
                      TV Downloads (Sonarr)
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {sonarrRecords.length} active episode download{sonarrRecords.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {sonarrRecords.map((item) => {
                  const liveSpeed =
                    (item.downloadId && usenetByNzoId.get(item.downloadId)?.speed) ||
                    (item.download_id && usenetByNzoId.get(item.download_id)?.speed) ||
                    usenetQueueData?.speed ||
                    null;
                  return (
                    <DownloadEpisodeCard
                      key={item.id}
                      item={item}
                      onCancel={(id) => cancelSonarrMutation.mutate({ queueId: id })}
                      isCancelling={cancelSonarrMutation.isPending}
                      liveSpeed={liveSpeed}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Active Radarr Movie Downloads ── */}
          {radarrRecords.length > 0 && (
            <div className="mb-5 p-4 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-xl shadow-[var(--dk-shadow-glass)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-xl bg-primary/15 text-primary">
                    <Film className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">
                      Movie Downloads (Radarr)
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {radarrRecords.length} active movie download{radarrRecords.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {radarrRecords.map((item) => (
                  <DownloadMovieCard
                    key={item.id}
                    item={item}
                    onCancel={(id) => cancelRadarrMutation.mutate({ queueId: id })}
                    isCancelling={cancelRadarrMutation.isPending}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Active Server SABnzbd Usenet Queue ── */}
          {hasGameServers && standaloneUsenetItems.length > 0 && (
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
                      Speed: <span className="text-primary font-semibold font-mono">{usenetQueueData?.speed || '0 KB/s'}</span> · {standaloneUsenetItems.length} active item{standaloneUsenetItems.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {standaloneUsenetItems.map((item) => {
                  const nzoId = item.nzoId || item.nzo_id || '';
                  const sizeMb = item.sizeMb ?? item.size_mb ?? 0;
                  const sizeLeftMb = item.sizeLeftMb ?? item.size_left_mb ?? 0;
                  const timeLeft = item.timeLeft || item.time_left || '';
                  const speed = item.speed || usenetQueueData?.speed;

                  const parsed = parseEpisodeRelease(item.filename || item.title);
                  if (parsed.seasonNumber != null && parsed.episodeNumber != null) {
                    const arrItem: ServerArrQueueItem = {
                      id: Number(nzoId.replace(/\D/g, '')) || 1,
                      title: item.filename || item.title || 'Episode',
                      status: item.status || 'Downloading',
                      size: sizeMb * 1024 * 1024,
                      sizeLeft: sizeLeftMb * 1024 * 1024,
                      timeleft: timeLeft,
                      protocol: 'usenet',
                      seasonNumber: parsed.seasonNumber,
                      episodeNumber: parsed.episodeNumber,
                      showTitle: parsed.showName || undefined,
                      episodeName: parsed.episodeTitle || undefined,
                    };
                    return (
                      <DownloadEpisodeCard
                        key={nzoId || item.filename}
                        item={arrItem}
                        onCancel={() => cancelUsenetDownloadMutation.mutate(nzoId)}
                        liveSpeed={speed}
                      />
                    );
                  }

                  const displayTitle = resolveDownloadDisplayTitle(item);
                  const totalBytes = sizeMb * 1024 * 1024;
                  const downloadedBytes = Math.max(0, (sizeMb - sizeLeftMb) * 1024 * 1024);

                  return (
                    <div
                      key={nzoId || item.filename}
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
                            type="button"
                            onClick={() => cancelUsenetDownloadMutation.mutate(nzoId)}
                            className="text-[11px] text-destructive hover:opacity-80 font-medium cursor-pointer"
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
                          {sizeMb > 0 && (
                            <span>
                              {sizeLeftMb > 0
                                ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`
                                : formatBytes(totalBytes)}
                            </span>
                          )}
                          {speed && speed !== '0 B/s' && <span>· {speed}</span>}
                        </div>
                        {timeLeft && <span className="font-mono">ETA: {timeLeft}</span>}
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
          {activeDownloads.length === 0 &&
          activeRemoteTransfers.length === 0 &&
          standaloneUsenetItems.length === 0 &&
          sonarrRecords.length === 0 &&
          radarrRecords.length === 0 ? (
            <div className="dk-downloads__empty">
              <Download className="h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="dk-downloads__empty-text">No active downloads</p>
              <p className="dk-downloads__empty-sub">
                Your queue is clear. Active Usenet releases and server downloads will appear here as they progress.
              </p>
            </div>
          ) : (
            (activeDownloads.length > 0 || activeRemoteTransfers.length > 0) && (
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
            )
          )}
        </>
      )}

      {/* Requests Tab: All Media & Download Requests sent from Otix */}
      {mainTab === 'requests' && (
        <DownloadRequestsPanel />
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
