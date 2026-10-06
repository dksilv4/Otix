import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { SlidersHorizontal } from 'lucide-react'
import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'
import { LauncherPlayButton } from '@/features/launcher/components/organisms/launcher-play-button'
import { OpenFolderButton } from '@/features/launcher/components/atoms/launcher-open-folder-button'
import { PickExeButton } from '@/features/launcher/components/atoms/launcher-pick-exe-button'
import { GameDetailButton } from '@/features/launcher/components/atoms/launcher-game-detail-button'
import { IsoInstallerModal } from '@/features/launcher/components/organisms/iso-installer-modal'
import { LauncherGameSheet } from '@/features/launcher/themes/common/launcher-game-sheet'
import { useModal } from '@/lib/modals'

export const LauncherGameButtons = () => {
  const { gameId } = useParams({ strict: false })
  const { game: g } = useLauncherGame(gameId)
  const { openModal } = useModal()
  const [showProperties, setShowProperties] = useState(false)

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
    <>
      <div id="launcher-game-buttons" className="flex gap-2.5 items-center justify-end flex-wrap">
        <LauncherPlayButton onOpenInstaller={handleOpenInstaller} />

        {!!g.exePath && g.platform !== 'iso' && (
          <>
            <OpenFolderButton />
            <PickExeButton />
          </>
        )}

        <button
          onClick={() => setShowProperties(true)}
          title="Game Properties, Metadata & Updates"
          aria-label="Game Properties, Metadata & Updates"
          className="w-10 h-10 bg-white/8 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-xl text-white/70 hover:text-white transition-all cursor-pointer backdrop-blur-md active:scale-95 flex items-center justify-center shrink-0"
        >
          <SlidersHorizontal size={16} />
        </button>

        <GameDetailButton />
      </div>

      {showProperties && (
        <LauncherGameSheet
          game={g}
          onClose={() => setShowProperties(false)}
        />
      )}
    </>
  )
};
