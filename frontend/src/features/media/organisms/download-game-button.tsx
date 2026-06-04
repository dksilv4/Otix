import React, { useEffect, useState } from 'react'
import { useAuth } from '@/features/auth'
import { useDownloads, useDownloadConfig } from '@/features/downloads/use-downloads'
import type { HypervisorConfirmResponse } from '@/features/downloads/types'
import { DkDialog } from '@/features/dk-ui/molecules/dialog'
import { useExperiment } from '@/features/experiments/experiments-provider'
import { getScannedGames, setLocalGamesMapEntry, getLocalGamesMap } from '@/features/game-scanner/storage'
import { IsoInstallerModal } from '@/features/game-scanner/organisms/iso-installer-modal'
import { Play, Download, Loader2, CheckCircle2, Clock, XCircle, FolderOpen, Disc } from 'lucide-react'
import { cn } from '@/lib/utils'

type DetectedGame = import('@/features/game-scanner/types').DetectedGame;

function isTitleMatch(gameTitle: string, mediaTitle: string): boolean {
  if (!gameTitle || !mediaTitle) return false;
  const norm = (str: string) => {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\bii\b/g, '2')
      .replace(/\biii\b/g, '3')
      .replace(/\biv\b/g, '4')
      .replace(/\bv\b/g, '5')
      .replace(/\bvi\b/g, '6')
      .replace(/\bvii\b/g, '7')
      .replace(/\bviii\b/g, '8')
      .replace(/\bix\b/g, '9')
      .replace(/\bx\b/g, '10')
      .replace(/\s+/g, '')
      .trim();
  };
  return norm(gameTitle) === norm(mediaTitle);
}

export default function DownloadGameButton({ mediaId, mediaTitle }: { mediaId: string; mediaTitle: string }) {
  const { user } = useAuth();
  const { enabled: downloadsEnabled } = useExperiment('download_integration');
  const { downloads, searchAndDownload, cancelDownload, pollQueue } = useDownloads(user?.id);
  const { config: dlConfig } = useDownloadConfig(user?.id);
  const [searching, setSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [postProcessing, setPostProcessing] = useState(false);
  const [isInstallerOpen, setIsInstallerOpen] = useState(false);
  const [localGame, setLocalGame] = useState<DetectedGame | null>(null);
  const [scannedGames, setScannedGames] = useState<DetectedGame[]>([]);
  const [hvDialogOpen, setHvDialogOpen] = useState(false);
  const [hvCountdown, setHvCountdown] = useState(10);
  const [hvPending, setHvPending] = useState<HypervisorConfirmResponse | null>(null);

  // Load scanned games and local game map entry
  useEffect(() => {
    let currentLocal: DetectedGame | null = null;
    try {
      const map = getLocalGamesMap();
      currentLocal = map[mediaId] || null;
      setLocalGame(currentLocal);
    } catch {
      setLocalGame(null);
    }

    const scanned = getScannedGames();
    setScannedGames(scanned);

    // Auto-link if not in localGames map but matched by title
    if (!currentLocal && mediaTitle) {
      const match = scanned.find(g => g.otixMediaId === mediaId) ||
                    scanned.find(g => isTitleMatch(g.title, mediaTitle));
      if (match) {
        setLocalGamesMapEntry(mediaId, match);
        setLocalGame(match);
      }
    }
  }, [mediaId, mediaTitle]);

  // Hypervisor confirmation countdown — auto-dismiss after 10s
  useEffect(() => {
    if (!hvDialogOpen) {
      setHvCountdown(10);
      return;
    }
    if (hvCountdown <= 0) {
      setHvDialogOpen(false);
      setErrorMsg('Hypervisor download cancelled (timeout).');
      return;
    }
    const timer = setTimeout(() => setHvCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [hvDialogOpen, hvCountdown]);

  if (!window.electronAPI || !user?.isAdmin) return null;

  const matchingScannedGame = scannedGames.find(g => g.otixMediaId === mediaId) || localGame;
  const isInstalled = matchingScannedGame && matchingScannedGame.platform !== 'iso';

  if (!downloadsEnabled && !matchingScannedGame) return null;

  // Find existing download for this media item (most recent first)
  const existingDownload = downloads.find(d => d.mediaItemId === mediaId);
  const isDownloading = existingDownload && existingDownload.status !== 'completed' && existingDownload.status !== 'failed';
  const isCompleted = existingDownload?.status === 'completed';
  const isIsoAvailable = (matchingScannedGame && matchingScannedGame.platform === 'iso') || !!(existingDownload?.isoPath) || (isCompleted && existingDownload?.isoPath);
  const isoPath = existingDownload?.isoPath || (matchingScannedGame?.platform === 'iso' ? matchingScannedGame.exePath : null);

  const handleDownload = async () => {
    setSearching(true);
    setErrorMsg('');
    const result = await searchAndDownload(user!.id, mediaId, mediaTitle);
    if ('hypervisorAvailable' in result) {
      setHvPending(result);
      setHvCountdown(10);
      setHvDialogOpen(true);
    } else if ('error' in result) {
      setErrorMsg(result.error);
    }
    setSearching(false);
  };

  const handleHvConfirm = async () => {
    setHvDialogOpen(false);
    setHvPending(null);
    setSearching(true);
    setErrorMsg('');
    const result = await searchAndDownload(user!.id, mediaId, mediaTitle, true);
    if ('hypervisorAvailable' in result || 'error' in result) {
      setErrorMsg(result.error ?? '');
    }
    setSearching(false);
  };

  const handleHvDismiss = () => {
    setHvDialogOpen(false);
    setHvPending(null);
    setErrorMsg('Hypervisor download cancelled.');
  };

  // Status display helpers
  const statusConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
    queued: { icon: Clock, label: 'Queued in SABnzbd', color: 'text-amber-400' },
    downloading: { icon: Loader2, label: 'Downloading...', color: 'text-blue-400' },
    processing: { icon: Loader2, label: 'Unpacking/Verifying...', color: 'text-purple-400' },
    completed: { icon: CheckCircle2, label: 'Download complete', color: 'text-green-400' },
    failed: { icon: XCircle, label: 'Download failed', color: 'text-red-400' },
  };

  // 1. Installed: matchingScannedGame exists and is not 'iso'
  if (isInstalled && matchingScannedGame) {
    const handlePlay = async () => {
      try {
        await window.electronAPI!.launchGame(matchingScannedGame);
      } catch (err) {
        console.error('Failed to launch game:', err);
      }
    };

    return (
      <div className="flex items-center gap-3">
        <button
          onClick={handlePlay}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white px-5 py-2.5 font-semibold text-sm shadow-lg shadow-emerald-500/25 transition-all duration-200 active:scale-95"
        >
          <Play className="h-4 w-4 fill-current" />
          Play
        </button>
        <p className="text-xs text-muted-foreground">
          {matchingScannedGame.platform === 'steam' ? 'Launch via Steam' : 'Installed locally'}
        </p>
      </div>
    );
  }

  // 2. Downloading: active download in progress
  if (downloadsEnabled && isDownloading && existingDownload) {
    const cfg = statusConfig[existingDownload.status] || statusConfig.processing;
    const Icon = cfg.icon;
    const pct = existingDownload.percentage ?? 0;

    return (
      <div className="space-y-2">
        <div className={cn('flex items-center gap-2 text-xs font-medium', cfg.color)}>
          <Icon className={cn('h-4 w-4', (existingDownload.status === 'downloading' || existingDownload.status === 'processing') && 'animate-spin')} />
          <span>{cfg.label}</span>
          {existingDownload.nzbName && (
            <span className="text-muted-foreground truncate max-w-[200px]">
              — {existingDownload.nzbName}
            </span>
          )}
          <span className="tabular-nums ml-1">{pct}%</span>
        </div>
        <div className="h-1.5 w-full max-w-xs rounded-full bg-[var(--dk-surface-raised)] overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={pollQueue}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Refresh status
          </button>
          <button
            onClick={() => cancelDownload(existingDownload.id)}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // 3. ISO Available / Ready to Install
  if (isIsoAvailable) {
    return (
      <>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-green-400 font-medium">
            <CheckCircle2 className="h-4 w-4" />
            <span>ISO Available</span>
            {isoPath && (
              <span className="text-muted-foreground truncate max-w-[250px] text-[10px]">
                {isoPath}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsInstallerOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 hover:bg-green-500 text-white px-5 py-2.5 font-semibold text-sm shadow-lg shadow-green-600/25 transition-all duration-200 active:scale-95"
            >
              <Disc className="h-4 w-4" />
              Install
            </button>
            {downloadsEnabled && dlConfig && existingDownload?.status === 'completed' && (
              <button
                onClick={async () => {
                  setPostProcessing(true);
                  try {
                    await window.electronAPI!.downloadsPostProcess(
                      existingDownload.id,
                      dlConfig.id,
                      dlConfig.sabnzbdCompletePath ?? undefined,
                      dlConfig.downloadPath ?? undefined,
                    );
                    await pollQueue();
                  } finally {
                    setPostProcessing(false);
                  }
                }}
                disabled={postProcessing}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--dk-surface-raised)] hover:bg-[var(--dk-surface-glass)] px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                {postProcessing ? 'Moving...' : 'Move to library'}
              </button>
            )}
          </div>
          {downloadsEnabled && (
            <button
              onClick={handleDownload}
              className="block text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Re-download
            </button>
          )}
        </div>

        <IsoInstallerModal
          open={isInstallerOpen}
          onClose={() => setIsInstallerOpen(false)}
          games={scannedGames}
          initialIsoPath={isoPath || undefined}
        />
      </>
    );
  }

  // 4. Failed download
  if (downloadsEnabled && existingDownload?.status === 'failed') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-red-400 font-medium">
          <XCircle className="h-4 w-4" />
          <span>Download failed</span>
        </div>
        {existingDownload.errorMessage && (
          <p className="text-xs text-red-400">{existingDownload.errorMessage}</p>
        )}
        <button
          onClick={handleDownload}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  // 5. Download Available
  if (downloadsEnabled) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={handleDownload}
          disabled={searching}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white px-5 py-2.5 font-semibold text-sm shadow-lg shadow-blue-500/25 transition-all duration-200 active:scale-95"
        >
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {searching ? 'Searching...' : 'Download ISO'}
        </button>
        {errorMsg && (
          <p className="text-xs text-red-400">{errorMsg}</p>
        )}
      </div>
    );
  }

  // ── Hypervisor confirmation dialog ──
  return (
    <>
      {null}
      <DkDialog
        open={hvDialogOpen}
        onOpenChange={(open) => { if (!open) handleHvDismiss(); }}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Only hypervisor-tagged releases found for <strong>{hvPending?.gameName ?? 'this game'}</strong>.
            These often require VM setup and may not run natively.
          </p>
          <p className="text-xs text-muted-foreground">
            Auto-dismissing in <span className="font-mono font-bold text-foreground">{hvCountdown}</span>s
          </p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleHvConfirm}
              className="flex-1 rounded-xl bg-blue-500 hover:bg-blue-400 text-white px-4 py-2 text-sm font-semibold transition-all active:scale-95"
            >
              Download HV version
            </button>
            <button
              onClick={handleHvDismiss}
              className="flex-1 rounded-xl bg-[var(--dk-surface-raised)] hover:bg-[var(--dk-surface-glass)] px-4 py-2 text-sm font-medium transition-all"
            >
              Skip
            </button>
          </div>
        </div>
      </DkDialog>
    </>
  );
}
