import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'
import { LauncherPlayButton } from '@/features/launcher/components/organisms/launcher-play-button'
import { OpenFolderButton } from '@/features/launcher/components/atoms/launcher-open-folder-button'
import { PickExeButton } from '@/features/launcher/components/atoms/launcher-pick-exe-button'
import { GameDetailButton } from '@/features/launcher/components/atoms/launcher-game-detail-button'
import { IsoInstallerModal } from '@/old-features/game-scanner/organisms/iso-installer-modal'
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

export function LauncherGameButtons() {
  const { component } = useLauncherTheme()
  const ThemedButtons = component('GameButtons')
  if (ThemedButtons) return <ThemedButtons />

  const {gameId} = useParams({ strict: false })
  const { game: g } = useLauncherGame(gameId)

  const [isInstallerOpen, setIsInstallerOpen] = useState(false)

  if (!g) return null

  return (
    <>
      <div className="flex gap-2.5 items-center justify-end">
        <LauncherPlayButton onOpenInstaller={() => setIsInstallerOpen(true)} />

        {!!g.exePath && g.platform !== 'iso' && (
          <>
            <OpenFolderButton/>
            <PickExeButton/>
            <GameDetailButton />
          </>
        )}
      </div>

      <IsoInstallerModal
        open={isInstallerOpen}
        onClose={() => setIsInstallerOpen(false)}
        games={[g]}
        initialIsoPath={g.exePath ?? undefined}
      />
    </>
  )
}
