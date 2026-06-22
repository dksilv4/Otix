import { useMemo } from 'react'
import { useParams } from '@tanstack/react-router'
import { osName } from '@/lib/utils'
import { useLocalGame } from '@/old-features/game-scanner/game-queries'
import { useInstallProgress } from '@/old-features/game-scanner/install-store'
import { PlayGameButton } from '@/old-features/games/atoms/play-game-button'
import { IncompatibleButton } from '@/old-features/games/atoms/incompatible-button'
import { IsoInstallingProgress } from '@/old-features/games/atoms/iso-installing-progress'
import { IsoInstallButton } from '@/old-features/games/atoms/iso-install-button'
import { MatchedPlayButton } from '@/old-features/games/atoms/matched-play-button'
import { MatchGameButton } from '@/old-features/games/atoms/match-game-button'
import { RejectSuggestionButton } from '@/old-features/games/atoms/reject-suggestion-button'

interface LauncherPlayButtonProps {
  onOpenInstaller: () => void
}

export function LauncherPlayButton({ onOpenInstaller }: LauncherPlayButtonProps) {
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { data: g } = useLocalGame(gameId)
  const { activeInstalls, cancelInstall } = useInstallProgress()

  const isInstalled = !!g?.exePath && g?.platform !== 'iso' && !!g.data?.id
  const isIncompatible = g?.platform === 'iso' && osName !== 'Windows'
  const mediaId = g?.data?.id

  const activeInstall = useMemo(() => {
    const activePath = g?.exePath?.toLowerCase()
    if (!activePath) return null
    return activeInstalls.find((i: { isoPath?: string }) => i.isoPath?.toLowerCase() === activePath)
  }, [activeInstalls, g])

  if (!g) return null

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

  // ── Default: matched game ──
  if (mediaId) {
    return <MatchedPlayButton mediaId={mediaId} />
  }

  // ── Unmatched: match game + reject suggestion ──
  return (
    <div className="flex gap-1.5">
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
