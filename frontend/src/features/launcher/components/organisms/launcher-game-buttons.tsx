import { useParams } from '@tanstack/react-router'
import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'
import { LauncherPlayButton } from '@/features/launcher/components/organisms/launcher-play-button'
import { OpenFolderButton } from '@/features/launcher/components/atoms/launcher-open-folder-button'
import { PickExeButton } from '@/features/launcher/components/atoms/launcher-pick-exe-button'
import { GameDetailButton } from '@/features/launcher/components/atoms/launcher-game-detail-button'
import { IsoInstallerModal } from '@/features/launcher/components/organisms/iso-installer-modal'
import { useModal } from '@/lib/modals'

export function LauncherGameButtons() {
  const { gameId } = useParams({ strict: false })
  const { game: g } = useLauncherGame(gameId)
  const { openModal } = useModal()

  if (!g) return null

  const handleOpenInstaller = () => {
    const close = openModal(
      <IsoInstallerModal
        onClose={() => close()}
        games={[g]}
        initialIsoPath={g.exePath ?? undefined}
      />
    )
  }

  return (
    <div id="launcher-game-buttons" className="flex gap-2.5 items-center justify-end">
      <LauncherPlayButton onOpenInstaller={handleOpenInstaller} />

      {!!g.exePath && g.platform !== 'iso' && (
        <>
          <OpenFolderButton />
          <PickExeButton />
          <GameDetailButton />
        </>
      )}
    </div>
  )
}
