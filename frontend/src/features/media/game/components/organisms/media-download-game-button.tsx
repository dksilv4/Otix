import { useEffect, useId, useRef, useState } from 'react'
import { DkDialog } from '@/old-features/ui/molecules/dialog'
import { IsoInstallerModal } from '@/features/launcher/components/organisms/iso-installer-modal'
import { ServerGameSearchModal } from '@/features/downloads/molecules/server-game-search-modal'
import { Play, Download, Loader2, CheckCircle2, XCircle, FolderOpen, Disc, Server, Pause, X, AlertTriangle, ChevronDown } from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { DOWNLOAD_STATUS_LABELS } from '../../../constants'
import { useDownloadGame } from '../../hooks/use-download-game'
import { useModal } from '@/lib/modals'

export function DownloadGameButton() {
  const state = useDownloadGame()
  const { openModal } = useModal()
  const hvCloseRef = useRef<(() => void) | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setMenuOpen(false)
      menuButtonRef.current?.focus()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  useEffect(() => {
    if (state.hvDialogOpen) {
      hvCloseRef.current = openModal(
        <DkDialog
          open={true}
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
                onClick={async () => {
                  await state.handleHvConfirm()
                }}
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
      )
    } else {
      hvCloseRef.current?.()
      hvCloseRef.current = null
    }
    return () => {
      hvCloseRef.current?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.hvDialogOpen, state.hvCountdown, state.hvPendingGameName])

  if (state.hidden) return null

  const openServerSearch = () => {
    const server = state.activeServer
    if (!server) return
    const close = openModal(
      <ServerGameSearchModal
        onClose={() => close()}
        serverId={server.id}
        serverName={server.name}
        initialQuery={state.mediaTitle}
        mediaItemId={state.mediaId || undefined}
      />,
    )
  }

  // ── Installed → Play button ──
  if (state.isInstalled && state.matchingScannedGame) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={state.handlePlay}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all duration-200 hover:bg-emerald-400 active:scale-95 cursor-pointer"
        >
          <Play className="h-4 w-4 fill-current" />
          Play
        </button>
        <p className="text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-none">
          {state.matchingScannedGame.platform === 'steam' ? 'Launch via Steam' : 'Installed locally'}
          {state.serverFile && (
            <span className="ml-1 text-cyan-400/80">· Available on {state.serverFile.serverName}</span>
          )}
        </p>
      </div>
    )
  }

  // ── Remote Server Transfer in progress ──
  if (state.activeRemoteTransfer) {
    const t = state.activeRemoteTransfer
    const isDownloading = t.status === 'downloading'
    const isPaused = t.status === 'paused'
    const speedMBps = t.speedBytesPerSec / (1024 * 1024)

    return (
      <div className="group/dl flex flex-wrap items-center gap-2">
        {/* Progress pill button */}
        <button
          type="button"
          onClick={isDownloading ? state.handleRemotePause : isPaused ? state.handleRemoteResume : undefined}
          className="relative inline-flex items-center gap-2 overflow-hidden rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/15 transition-all duration-200 active:scale-95 cursor-pointer"
          title={isDownloading ? 'Click to pause' : isPaused ? 'Click to resume' : undefined}
        >
          {/* Background track */}
          <span className="absolute inset-0 bg-white/[0.10]" />
          {/* Progress fill */}
          <span
            className={cn(
              'absolute inset-y-0 left-0 transition-[width] duration-500 ease-out',
              isPaused ? 'bg-amber-500/60' : 'bg-cyan-500/50',
            )}
            style={{ width: `${Math.min(100, Math.max(0, t.percentage))}%` }}
          />
          {/* Content */}
          <span className="relative flex items-center gap-2">
            {isDownloading ? (
              <Server className="h-4 w-4 animate-pulse" />
            ) : isPaused ? (
              <Pause className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <span className="tabular-nums">{t.percentage}%</span>
            {isDownloading && speedMBps > 0 && (
              <span className="text-xs font-medium text-white/60">
                {speedMBps.toFixed(1)} MB/s
              </span>
            )}
          </span>
        </button>

        {/* Cancel */}
        <button
          onClick={state.handleRemoteCancel}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-red-400 hover:bg-red-500/15 hover:text-red-300 transition-all cursor-pointer opacity-0 group-hover/dl:opacity-100"
          title="Cancel download"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  // ── Server SABnzbd queue in progress ──
  if (state.activeServerQueueItem) {
    const item = state.activeServerQueueItem
    const pct = Math.min(100, Math.max(0, item.percentage ?? 0))
    const status = (item.status || 'Downloading').toLowerCase()
    const isPaused = status.includes('pause')

    return (
      <div className="group/dl flex flex-wrap items-center gap-2">
        {/* Progress pill button */}
        <div
          className="relative inline-flex items-center gap-2 overflow-hidden rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/15"
        >
          {/* Background track */}
          <span className="absolute inset-0 bg-white/[0.10]" />
          {/* Progress fill */}
          <span
            className={cn(
              'absolute inset-y-0 left-0 transition-[width] duration-500 ease-out',
              isPaused ? 'bg-amber-500/60' : 'bg-blue-500/50',
            )}
            style={{ width: `${pct}%` }}
          />
          {/* Content */}
          <span className="relative flex items-center gap-2">
            <Loader2 className={cn('h-4 w-4', !isPaused && 'animate-spin')} />
            <span className="tabular-nums">{pct.toFixed(0)}%</span>
            {item.speed && item.speed !== '0 B/s' && (
              <span className="text-xs font-medium text-white/60">{item.speed}</span>
            )}
          </span>
        </div>

        {/* Cancel */}
        <button
          onClick={state.handleCancelServerQueue}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-red-400 hover:bg-red-500/15 hover:text-red-300 transition-all cursor-pointer opacity-0 group-hover/dl:opacity-100"
          title="Cancel download"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  // ── Downloading → progress bar ──
  if (state.downloadsEnabled && state.isDownloading && state.existingDownload) {
    const cfg = DOWNLOAD_STATUS_LABELS[state.existingDownload.status] || DOWNLOAD_STATUS_LABELS.processing
    const Icon = cfg.icon
    const pct = state.existingDownload.percentage ?? 0

    return (
      <div className="group/dl flex flex-wrap items-center gap-2">
        {/* Progress pill button */}
        <button
          type="button"
          onClick={state.handlePollQueue}
          className="relative inline-flex items-center gap-2 overflow-hidden rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/15 transition-all duration-200 active:scale-95 cursor-pointer"
          title="Click to refresh status"
        >
          {/* Background track */}
          <span className="absolute inset-0 bg-white/[0.10]" />
          {/* Progress fill */}
          <span
            className="absolute inset-y-0 left-0 bg-blue-500/50 transition-[width] duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
          {/* Content */}
          <span className="relative flex items-center gap-2">
            <Icon className={`h-4 w-4 ${(state.existingDownload.status === 'downloading' || state.existingDownload.status === 'processing') ? 'animate-spin' : ''}`} />
            <span className="tabular-nums">{pct}%</span>
          </span>
        </button>

        {/* Cancel */}
        <button
          onClick={state.handleCancelDownload}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-red-400 hover:bg-red-500/15 hover:text-red-300 transition-all cursor-pointer opacity-0 group-hover/dl:opacity-100"
          title="Cancel download"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  // ── Installing → progress ──
  if (state.isInstallingThis) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {/* Installing pill button (indeterminate) */}
        <div className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/15">
          {/* Background track */}
          <span className="absolute inset-0 bg-white/[0.10]" />
          {/* Indeterminate shimmer fill */}
          <span className="absolute inset-0 animate-pulse bg-blue-500/40" />
          {/* Content */}
          <span className="relative flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Installing…</span>
          </span>
        </div>
      </div>
    )
  }

  // ── Just installed → completion + play ──
  if (state.justInstalled) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {state.installEntry!.result?.gameExe && (
          <button
            onClick={state.handlePlay}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all duration-200 hover:bg-emerald-400 active:scale-95 cursor-pointer"
          >
            <Play className="h-4 w-4 fill-current" />
            Play
          </button>
        )}
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
          Installed
        </span>
      </div>
    )
  }

  // ── ISO available → ISO status + install btn + re-download + modal ──
  if (state.isIsoAvailable) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            const close = openModal(
              <IsoInstallerModal
                onClose={() => close()}
                games={state.scannedGames}
                initialIsoPath={state.isoPath || undefined}
              />,
            )
          }}
          className="inline-flex items-center gap-2 rounded-full bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-green-600/25 transition-all duration-200 hover:bg-green-500 active:scale-95 cursor-pointer"
        >
          <Disc className="h-4 w-4" />
          Install
        </button>
        {state.downloadsEnabled && state.dlConfig && state.existingDownload?.status === 'completed' && (
          <button
            onClick={state.handlePostProcess}
            disabled={state.postProcessing}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3.5 py-2 text-xs font-medium transition-colors hover:bg-white/[0.14] disabled:opacity-50 cursor-pointer"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            {state.postProcessing ? 'Moving…' : 'Move to library'}
          </button>
        )}
        {state.downloadsEnabled && (
          <button
            onClick={state.handleDownload}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-muted-foreground hover:bg-white/[0.14] hover:text-foreground transition-colors cursor-pointer"
            title="Re-download"
          >
            <Download className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }

  // ── Failed download → error + retry ──
  if (state.downloadsEnabled && state.isFailed && state.existingDownload) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={state.handleDownload}
          className="inline-flex items-center gap-2 rounded-full bg-red-500/20 px-5 py-2.5 text-sm font-semibold text-red-400 transition-all duration-200 hover:bg-red-500/30 active:scale-95 cursor-pointer"
        >
          <XCircle className="h-4 w-4" />
          Retry Download
        </button>
      </div>
    )
  }

  // ── Available on game server (not installed locally) and/or indexer Download ──
  if (state.availableOnServer || state.hasGameServer || state.canLocalDownload) {
    const showInstall = state.availableOnServer
    return (
      <div className="flex flex-wrap items-center gap-3">
        {showInstall && (
          <div className="flex flex-wrap items-center gap-3">
            <div
              ref={menuRef}
              className={cn(
                'relative inline-flex overflow-visible rounded-full',
                state.installCompatibility.compatible
                  ? 'shadow-lg shadow-emerald-500/25'
                  : 'border border-amber-400/25 shadow-lg shadow-amber-500/10',
              )}
            >
              <button
                type="button"
                onClick={state.handleRemoteDownload}
                disabled={state.indexingServerFile || !state.installCompatibility.compatible}
                title={
                  state.installCompatibility.compatible
                    ? state.installCopy.title
                    : state.installCompatibility.title
                }
                className={cn(
                  'inline-flex items-center gap-2 rounded-l-full px-5 py-2.5 text-sm font-semibold transition-all duration-200 active:brightness-90 disabled:pointer-events-none',
                  state.installCompatibility.compatible
                    ? 'bg-emerald-500 text-white hover:bg-emerald-400 cursor-pointer'
                    : 'bg-amber-500/15 text-amber-300 cursor-not-allowed',
                  state.indexingServerFile && 'opacity-60',
                )}
              >
                {state.indexingServerFile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : !state.installCompatibility.compatible ? (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                ) : (
                  <Server className="h-4 w-4 shrink-0" />
                )}
                <span>
                  {state.indexingServerFile
                    ? 'Indexing…'
                    : state.installCompatibility.compatible
                      ? state.installCopy.button
                      : state.installCompatibility.button}
                </span>
              </button>
              <button
                ref={menuButtonRef}
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowDown') return
                  event.preventDefault()
                  setMenuOpen(true)
                }}
                aria-label="Show download options"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={menuId}
                className={cn(
                  'inline-flex items-center justify-center rounded-r-full border-l px-2.5 py-2.5 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  state.installCompatibility.compatible
                    ? 'border-white/20 bg-emerald-500 text-white hover:bg-emerald-400 active:brightness-90'
                    : 'border-amber-400/25 bg-amber-500/15 text-amber-200 hover:bg-amber-500/20',
                )}
              >
                <ChevronDown className={cn('h-4 w-4 transition-transform', menuOpen && 'rotate-180')} />
              </button>

              {menuOpen && (
                <div
                  id={menuId}
                  role="menu"
                  aria-label="Download options"
                  className="absolute left-0 top-full z-50 mt-2 min-w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#16181d]/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl"
                >
                  {/* Current source details */}
                  {(() => {
                    const f = state.serverFile
                    // Build title parts: size, edition/version from filename
                    const parts: string[] = []
                    if (f?.filesize) parts.push(formatBytes(f.filesize))
                    if (f?.filename) {
                      // Extract edition/version info from filename (strip title, extension, group tag)
                      const clean = f.filename
                        .replace(/\.[^.]+$/, '')        // remove extension
                        .replace(/[-.](?:[A-Z0-9]{2,8})$/, '') // remove scene group tag
                        .replace(/[._]/g, ' ')          // dots/underscores → spaces
                      // Remove the game title prefix to get edition/version suffix
                      const titleLower = (f.gameTitle || state.mediaTitle || '').toLowerCase()
                      const idx = clean.toLowerCase().indexOf(titleLower)
                      const suffix = idx >= 0
                        ? clean.slice(idx + titleLower.length).trim()
                        : clean.replace(new RegExp(titleLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim()
                      if (suffix) parts.push(suffix)
                    }
                    if (f?.formatCategory) parts.push(f.formatCategory.toUpperCase())
                    const title = parts.join(' · ') || 'Available'
                    const subtitle = f?.serverName ?? state.activeServer?.name ?? 'Server'
                    return (
                      <div className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10">
                            <Server className="h-4 w-4 text-emerald-400" />
                          </span>
                          <span className="flex min-w-0 flex-col">
                            <span className="text-sm font-medium text-white truncate">{title}</span>
                            <span className="text-xs text-white/40 truncate">From {subtitle}</span>
                          </span>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Divider */}
                  <div className="mx-2 border-t border-white/[0.06]" />

                  <p className="px-3 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                    Other options
                  </p>
                  {state.activeServer && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        openServerSearch()
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer focus-visible:bg-white/[0.08] focus-visible:outline-none"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10">
                        <Download className="h-4 w-4 text-cyan-400" />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium text-white">Find another release</span>
                        <span className="text-xs text-white/40">Browse files on {state.activeServer.name}</span>
                      </span>
                    </button>
                  )}
                  {state.canLocalDownload && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        void state.handleDownload()
                      }}
                      disabled={state.searching}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer focus-visible:bg-white/[0.08] focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-400/10">
                        {state.searching ? (
                          <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                        ) : (
                          <Disc className="h-4 w-4 text-violet-400" />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium text-white">
                          {state.searching ? 'Searching…' : 'Download ISO'}
                        </span>
                        <span className="text-xs text-white/40">Search configured download providers</span>
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

        {!showInstall && state.hasGameServer && state.activeServer && (
          <button
            onClick={openServerSearch}
            className="inline-flex items-center gap-2 rounded-full bg-blue-500 hover:bg-blue-400 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all duration-200 active:scale-95 cursor-pointer"
            title="Download"
          >
            <Download className="h-4 w-4" />
            <span>Download</span>
          </button>
        )}

        {!showInstall && state.canLocalDownload && (
          <button
            onClick={state.handleDownload}
            disabled={state.searching}
            className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-4 py-2.5 text-sm font-medium transition-all duration-200 hover:bg-white/[0.14] active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {state.searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {state.searching ? 'Searching…' : 'Download ISO'}
          </button>
        )}

        {state.errorMsg && (
          <p className="w-full text-xs text-red-400">{state.errorMsg}</p>
        )}
      </div>
    )
  }

  // ── Fallback (downloads disabled) → null content ──
  return null
}
