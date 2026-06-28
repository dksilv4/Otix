import { useMemo } from 'react'
import { useParams } from '@tanstack/react-router'
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
