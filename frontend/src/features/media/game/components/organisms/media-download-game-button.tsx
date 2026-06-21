import { DkDialog } from '@/old-features/dk-ui/molecules/dialog'
import { IsoInstallerModal } from '@/old-features/game-scanner/organisms/iso-installer-modal'
import { Play, Download, Loader2, CheckCircle2, XCircle, FolderOpen, Disc } from 'lucide-react'
import { DOWNLOAD_STATUS_LABELS } from '../../../constants'
import { useDownloadGame } from '../../hooks/use-download-game'

type LocalGame = import('@/old-features/game-scanner/types').LocalGame;

export function DownloadGameButton() {
  const state = useDownloadGame()

  if (state.hidden) return null

  // ── Installed → Play button ──
  if (state.isInstalled && state.matchingScannedGame) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={state.handlePlay}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all duration-200 hover:bg-emerald-400 active:scale-95"
        >
          <Play className="h-4 w-4 fill-current" />
          Play
        </button>
        <p className="text-xs text-muted-foreground">
          {state.matchingScannedGame.platform === 'steam' ? 'Launch via Steam' : 'Installed locally'}
        </p>
      </div>
    )
  }

  // ── Downloading → progress bar ──
  if (state.downloadsEnabled && state.isDownloading && state.existingDownload) {
    const cfg = DOWNLOAD_STATUS_LABELS[state.existingDownload.status] || DOWNLOAD_STATUS_LABELS.processing
    const Icon = cfg.icon
    const pct = state.existingDownload.percentage ?? 0

    return (
      <div className="space-y-2">
        <div className={`flex items-center gap-2 text-xs font-medium ${cfg.color || ''}`}>
          <Icon className={`h-4 w-4 ${(state.existingDownload.status === 'downloading' || state.existingDownload.status === 'processing') ? 'animate-spin' : ''}`} />
          <span>{cfg.label}</span>
          {state.existingDownload.nzbName && (
            <span className="max-w-[200px] truncate text-muted-foreground">
              — {state.existingDownload.nzbName}
            </span>
          )}
          <span className="tabular-nums ml-1">{pct}%</span>
        </div>
        <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-[var(--dk-surface-raised)]">
          <div
            className="h-full rounded-full bg-blue-500 transition-[width] duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={state.handlePollQueue}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Refresh status
          </button>
          <button
            onClick={state.handleCancelDownload}
            className="text-xs text-red-400 transition-colors hover:text-red-300"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // ── Installing → progress ──
  if (state.isInstallingThis) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-blue-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Installing {state.installEntry!.gameTitle ?? 'game'}...</span>
        </div>
        <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-[var(--dk-surface-raised)]">
          <div className="h-full w-full animate-pulse rounded-full bg-blue-500" />
        </div>
        <p className="text-xs text-muted-foreground">
          {state.installEntry!.progress?.message ?? state.installEntry!.progress?.phase ?? 'Starting...'}
        </p>
      </div>
    )
  }

  // ── Just installed → completion + play ──
  if (state.justInstalled) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          <span>Installation Complete</span>
          {state.installEntry!.result?.installDir && (
            <span className="max-w-[250px] truncate text-muted-foreground text-[10px]">
              {state.installEntry!.result.installDir}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {state.installEntry!.result?.gameExe && (
            <button
              onClick={state.handlePlay}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all duration-200 hover:bg-emerald-400 active:scale-95"
            >
              <Play className="h-4 w-4 fill-current" />
              Play
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── ISO available → ISO status + install btn + re-download + modal ──
  if (state.isIsoAvailable) {
    return (
      <>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            <span>ISO Available</span>
            {state.isoPath && (
              <span className="max-w-[250px] truncate text-muted-foreground text-[10px]">
                {state.isoPath}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => state.setIsInstallerOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-green-600/25 transition-all duration-200 hover:bg-green-500 active:scale-95"
            >
              <Disc className="h-4 w-4" />
              Install
            </button>
            {state.downloadsEnabled && state.dlConfig && state.existingDownload?.status === 'completed' && (
              <button
                onClick={state.handlePostProcess}
                disabled={state.postProcessing}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--dk-surface-raised)] px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--dk-surface-glass)] disabled:opacity-50"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                {state.postProcessing ? 'Moving...' : 'Move to library'}
              </button>
            )}
          </div>
          {state.downloadsEnabled && (
            <button
              onClick={state.handleDownload}
              className="block text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Re-download
            </button>
          )}
        </div>

        <IsoInstallerModal
          open={state.isInstallerOpen}
          onClose={() => state.setIsInstallerOpen(false)}
          games={state.scannedGames}
          initialIsoPath={state.isoPath || undefined}
        />
      </>
    )
  }

  // ── Failed download → error + retry ──
  if (state.downloadsEnabled && state.isFailed && state.existingDownload) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-red-400">
          <XCircle className="h-4 w-4" />
          <span>Download failed</span>
        </div>
        {state.existingDownload.errorMessage && (
          <p className="text-xs text-red-400">{state.existingDownload.errorMessage}</p>
        )}
        <button
          onClick={state.handleDownload}
          className="text-xs text-blue-400 transition-colors hover:text-blue-300"
        >
          Try again
        </button>
      </div>
    )
  }

  // ── Downloads enabled but idle → download button ──
  if (state.downloadsEnabled) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={state.handleDownload}
          disabled={state.searching}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all duration-200 hover:bg-blue-400 active:scale-95 disabled:opacity-50"
        >
          {state.searching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {state.searching ? 'Searching...' : 'Download ISO'}
        </button>
        {state.errorMsg && (
          <p className="text-xs text-red-400">{state.errorMsg}</p>
        )}
      </div>
    )
  }

  // ── Fallback (downloads disabled) → null content + hypervisor dialog ──
  return (
    <>
      {null}
      <DkDialog
        open={state.hvDialogOpen}
        onOpenChange={(open) => { if (!open) state.handleHvDismiss() }}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Only hypervisor-tagged releases found for <strong>{state.hvPendingGameName ?? 'this game'}</strong>.
            These often require VM setup and may not run natively.
          </p>
          <p className="text-xs text-muted-foreground">
            Auto-dismissing in <span className="font-mono font-bold text-foreground">{state.hvCountdown}</span>s
          </p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={state.handleHvConfirm}
              className="flex-1 rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-400 active:scale-95"
            >
              Download HV version
            </button>
            <button
              onClick={state.handleHvDismiss}
              className="flex-1 rounded-xl bg-[var(--dk-surface-raised)] px-4 py-2 text-sm font-medium transition-all hover:bg-[var(--dk-surface-glass)]"
            >
              Skip
            </button>
          </div>
        </div>
      </DkDialog>
    </>
  )
}
