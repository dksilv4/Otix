import { useMemo } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { FolderOpen } from 'lucide-react'
import { osName } from '@/lib/utils'
import { useLocalGame } from '@/features/launcher/data/game-queries'
import { useInstallProgress } from '@/features/launcher/data/install-store'
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

  const activeInstall = useMemo(() => {
    const activePath = g?.exePath?.toLowerCase()
    if (!activePath) return null
    return activeInstalls.find((i: { isoPath?: string }) => i.isoPath?.toLowerCase() === activePath)
  }, [activeInstalls, g])

  if (!g) return null

  // â”€â”€ Play (installed) â”€â”€
  if (isInstalled) {
    return <PlayGameButton game={g} />
  }

  // â”€â”€ Incompatible (ISO on non-Windows) â”€â”€
  if (isIncompatible) {
    return <IncompatibleButton />
  }

  // â”€â”€ ISO installing â”€â”€
  if (g.platform === 'iso' && activeInstall) {
    return (
      <IsoInstallingProgress
        install={activeInstall}
        onOpenInstaller={onOpenInstaller}
        onCancel={cancelInstall}
      />
    )
  }

  // â”€â”€ ISO ready to install â”€â”€
  if (g.platform === 'iso') {
    return <IsoInstallButton onClick={onOpenInstaller} />
  }

  // â”€â”€ Default: matched game â”€â”€
  if (mediaId) {
    return <MatchedPlayButton mediaId={mediaId} />
  }

  // â”€â”€ Unmatched: match game + reject suggestion â”€â”€
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
