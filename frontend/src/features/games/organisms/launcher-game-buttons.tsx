import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useLocalGame } from '@/features/game-scanner/game-queries'
import { LauncherPlayButton } from '@/features/games/organisms/launcher-play-button'
import { OpenFolderButton } from '@/features/games/atoms/open-folder-button'
import { PickExeButton } from '@/features/games/atoms/pick-exe-button'
import { GameDetailButton } from '@/features/games/atoms/game-detail-button'
import { IsoInstallerModal } from '@/features/game-scanner/organisms/iso-installer-modal'

export function LauncherGameButtons() {
  const {gameId} = useParams({ strict: false })
  const { data: g } = useLocalGame(gameId)

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
