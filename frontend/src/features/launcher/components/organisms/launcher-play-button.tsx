import { useParams, useNavigate } from '@tanstack/react-router'
import { FolderOpen, Server, Pause, Play, X } from 'lucide-react'
import { formatBytes } from '@/lib/utils'
import { isTitleMatch } from '@media'
import { useLocalGame } from '@/features/launcher/data/game-queries'
import { useInstallProgress } from '@/features/launcher/data/install-store'
import { useServerGames, useRemoteDownloads } from '@/features/downloads/use-server-downloads'
import { matchServerGameFile } from '@/features/downloads/server-availability'
import { gameInstallCompatibility, treatInstallAsAvailable } from '@/features/downloads/os-compatibility'
import { PlayGameButton } from '@/features/launcher/components/atoms/launcher-play-game-button'
import { IncompatibleButton } from '@/features/launcher/components/atoms/launcher-incompatible-button'
import { IsoInstallingProgress } from '@/features/launcher/components/atoms/launcher-iso-installing-progress'
import { IsoInstallButton } from '@/features/launcher/components/atoms/launcher-iso-install-button'
import { MatchedPlayButton } from '@/features/launcher/components/atoms/launcher-matched-play-button'
import { MatchGameButton } from '@/features/launcher/components/atoms/launcher-match-game-button'
import { RejectSuggestionButton } from '@/features/launcher/components/atoms/launcher-reject-suggestion-button'
import { OTIX_DEFAULT_GAME_ID } from '@/features/launcher/data/otix-default-game'

interface LauncherPlayButtonProps {
  onOpenInstaller: () => void
}

export const LauncherPlayButton = ({ onOpenInstaller }: LauncherPlayButtonProps) => {
  const navigate = useNavigate()
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { data: g } = useLocalGame(gameId)
  const { activeInstalls, cancelInstall } = useInstallProgress()
  const { data: serverGamesData } = useServerGames()
  const {
    activeTransfers,
    startDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload: cancelRemoteDownload,
  } = useRemoteDownloads()

  if (!g) return null

  // Special Otix filler game action: prompt user to scan library
  if (g.id === OTIX_DEFAULT_GAME_ID) {
    return (
      <button
        onClick={() => navigate({ to: '/settings/library' })}
        className="h-10 px-6 bg-cyan-400 hover:bg-cyan-300 text-neutral-950 font-black rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-[0_0_24px_rgba(34,211,238,0.35)] hover:shadow-[0_0_30px_rgba(34,211,238,0.55)] active:scale-95 shrink-0"
      >
        <FolderOpen size={16} className="stroke-[2.5]" /> Scan Library
      </button>
    )
  }

  const isInstalled = !!g?.exePath && g?.platform !== 'iso' && !!g.data?.id
  const mediaId = g?.otixMediaId || g?.data?.id
  const installCompatibility = gameInstallCompatibility(g.data?.platforms)
  const treatAsAvailable = treatInstallAsAvailable(installCompatibility)
  const isIncompatible = g?.platform === 'iso' && !treatAsAvailable

  // ── Remote Download in Progress ──
  const activeTransfer = activeTransfers.find((t) => {
    if (g.title && isTitleMatch(t.gameTitle, g.title)) return true
    return false
  })

  const activePath = g.exePath?.toLowerCase()
  const activeInstall = activePath
    ? activeInstalls.find((i: { isoPath?: string }) => i.isoPath?.toLowerCase() === activePath)
    : null

  // ── Remote Transfer in progress UI ──
  if (activeTransfer) {
    const isDownloading = activeTransfer.status === 'downloading'
    const speedMBps = activeTransfer.speedBytesPerSec / (1024 * 1024)
    return (
      <div className="flex items-center gap-3 bg-[var(--dk-surface-overlay)] border border-cyan-500/30 px-4 py-2 rounded-xl backdrop-blur-md shadow-lg shadow-cyan-500/10">
        <div className="flex items-center gap-2.5">
          {isDownloading ? (
            <Server className="h-4 w-4 text-cyan-400 animate-pulse shrink-0" />
          ) : (
            <Pause className="h-4 w-4 text-amber-500 shrink-0" />
          )}
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <span>{isDownloading ? 'Streaming from Server' : 'Paused'}</span>
              <span className="text-cyan-500 tabular-nums font-mono">{activeTransfer.percentage}%</span>
              {speedMBps > 0 && isDownloading && (
                <span className="text-[10px] text-muted-foreground font-mono">({speedMBps.toFixed(1)} MB/s)</span>
              )}
            </div>
            <div className="w-36 h-1.5 bg-[var(--dk-surface-field)] rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-cyan-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, activeTransfer.percentage))}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 border-l border-[var(--dk-separator)] pl-2">
          {isDownloading ? (
            <button
              onClick={() => pauseDownload(activeTransfer.id)}
              className="p-1.5 hover:bg-[var(--dk-surface-field)] rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Pause download"
            >
              <Pause className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={() => resumeDownload(activeTransfer.id)}
              className="p-1.5 hover:bg-[var(--dk-surface-field)] rounded-lg text-cyan-500 hover:text-cyan-400 transition-colors cursor-pointer"
              title="Resume download"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
            </button>
          )}
          <button
            onClick={() => cancelRemoteDownload(activeTransfer.id)}
            className="p-1.5 hover:bg-destructive/20 rounded-lg text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
            title="Cancel download"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }

  // ── Play (installed) ──
  if (isInstalled) {
    return <PlayGameButton game={g} />
  }

  // ── Incompatible (ISO on non-Windows) ──
  if (isIncompatible) {
    return (
      <IncompatibleButton
        label={installCompatibility.button}
        title={installCompatibility.title}
      />
    )
  }

  // ── ISO installing ──
  if (g.platform === 'iso' && activeInstall) {
    return (
      <IsoInstallingProgress
        install={activeInstall}
        onOpenInstaller={onOpenInstaller}
        onCancel={cancelInstall}
      />
    )
  }

  // ── ISO ready to install ──
  if (g.platform === 'iso') {
    return <IsoInstallButton onClick={onOpenInstaller} />
  }

  // ── Available on Remote Game Server ──
  const matchingServerFile = matchServerGameFile(serverGamesData?.files, mediaId, g.title)

  if (matchingServerFile) {
    if (!treatAsAvailable) {
      return (
        <IncompatibleButton
          label={installCompatibility.button}
          title={installCompatibility.title}
        />
      )
    }
    return (
      <button
        onClick={async () => {
          await startDownload(matchingServerFile, mediaId)
        }}
        className="h-10 px-5 bg-green-600 hover:bg-green-500 text-white font-black rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-[0_0_24px_rgba(22,163,74,0.35)] hover:shadow-[0_0_30px_rgba(22,163,74,0.55)] active:scale-95 shrink-0"
        title={`On ${matchingServerFile.serverName}, not installed on this device (${formatBytes(matchingServerFile.filesize)})`}
      >
        <Server size={15} className="stroke-[2.5]" />
        <span>Install</span>
      </button>
    )
  }

  // ── Default: matched game ──
  if (mediaId) {
    return <MatchedPlayButton mediaId={mediaId} />
  }

  // ── Unmatched: match game + reject suggestion ──
  return (
    <div id="launcher-play-button" className="flex gap-1.5">
      <MatchGameButton game={g} />
      {g.matchSuggestion && (
        <RejectSuggestionButton
          gameId={g.id}
          suggestionMediaId={g.matchSuggestion.id}
        />
      )}
    </div>
  )
};
