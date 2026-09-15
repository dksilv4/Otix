import { useMemo } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { FolderOpen, Server, Pause, Play, X } from 'lucide-react'
import { osName, formatBytes } from '@/lib/utils'
import { isTitleMatch } from '@media'
import { useLocalGame } from '@/features/launcher/data/game-queries'
import { useInstallProgress } from '@/features/launcher/data/install-store'
import { useServerGames, useRemoteDownloads } from '@/features/downloads/use-server-downloads'
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

export function LauncherPlayButton({ onOpenInstaller }: LauncherPlayButtonProps) {
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
        onClick={() => navigate({ to: '/settings/launcher' })}
        className="h-10 px-6 bg-cyan-400 hover:bg-cyan-300 text-neutral-950 font-black rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-[0_0_24px_rgba(34,211,238,0.35)] hover:shadow-[0_0_30px_rgba(34,211,238,0.55)] active:scale-95 shrink-0"
      >
        <FolderOpen size={16} className="stroke-[2.5]" /> Scan Library
      </button>
    )
  }

  const isInstalled = !!g?.exePath && g?.platform !== 'iso' && !!g.data?.id
  const isIncompatible = g?.platform === 'iso' && osName !== 'Windows'
  const mediaId = g?.otixMediaId || g?.data?.id

  // ── Remote Download in Progress ──
  const activeTransfer = activeTransfers.find((t) => {
    if (mediaId && t.mediaItemId === mediaId) return true
    if (g.title && isTitleMatch(t.gameTitle, g.title)) return true
    return false
  })

  const activeInstall = useMemo(() => {
    const activePath = g?.exePath?.toLowerCase()
    if (!activePath) return null
    return activeInstalls.find((i: { isoPath?: string }) => i.isoPath?.toLowerCase() === activePath)
  }, [activeInstalls, g])

  // ── Remote Transfer in progress UI ──
  if (activeTransfer) {
    const isDownloading = activeTransfer.status === 'downloading'
    return (
      <div className="flex items-center gap-3 bg-neutral-900/90 border border-cyan-500/30 px-4 py-2 rounded-xl backdrop-blur-md shadow-lg shadow-cyan-500/10">
        <div className="flex items-center gap-2.5">
          {isDownloading ? (
            <Server className="h-4 w-4 text-cyan-400 animate-pulse shrink-0" />
          ) : (
            <Pause className="h-4 w-4 text-amber-400 shrink-0" />
          )}
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <span>{isDownloading ? 'Streaming from Server' : 'Paused'}</span>
              <span className="text-cyan-400 tabular-nums font-mono">{activeTransfer.percentage}%</span>
              {activeTransfer.speedMBps > 0 && isDownloading && (
                <span className="text-[10px] text-neutral-400 font-mono">({activeTransfer.speedMBps.toFixed(1)} MB/s)</span>
              )}
            </div>
            <div className="w-36 h-1.5 bg-neutral-800 rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-cyan-400 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, activeTransfer.percentage))}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 border-l border-white/10 pl-2">
          {isDownloading ? (
            <button
              onClick={() => pauseDownload(activeTransfer.id)}
              className="p-1.5 hover:bg-white/10 rounded-lg text-neutral-300 hover:text-white transition-colors cursor-pointer"
              title="Pause download"
            >
              <Pause className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={() => resumeDownload(activeTransfer.id)}
              className="p-1.5 hover:bg-white/10 rounded-lg text-cyan-300 hover:text-white transition-colors cursor-pointer"
              title="Resume download"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
            </button>
          )}
          <button
            onClick={() => cancelRemoteDownload(activeTransfer.id)}
            className="p-1.5 hover:bg-red-500/20 rounded-lg text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
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
    return <IncompatibleButton />
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
  const matchingServerFile = serverGamesData?.files?.find((f) => {
    if (mediaId && f.catalogItem?.id === mediaId) return true
    if (f.catalogItem?.title && isTitleMatch(f.catalogItem.title, g.title)) return true
    if (f.gameTitle && isTitleMatch(f.gameTitle, g.title)) return true
    return false
  })

  if (matchingServerFile) {
    return (
      <button
        onClick={async () => {
          await startDownload(matchingServerFile, mediaId)
        }}
        className="h-10 px-5 bg-cyan-400 hover:bg-cyan-300 text-neutral-950 font-black rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-[0_0_24px_rgba(34,211,238,0.35)] hover:shadow-[0_0_30px_rgba(34,211,238,0.55)] active:scale-95 shrink-0"
        title={`Download ${matchingServerFile.filename} (${formatBytes(matchingServerFile.filesize)})`}
      >
        <Server size={15} className="stroke-[2.5]" />
        <span>Download from {matchingServerFile.serverName} ({formatBytes(matchingServerFile.filesize)})</span>
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
}
