/* ── MatchGameButton — opens match modal for unmatched game ── */

import { useModal } from '@/lib/modals'
import { MatchGameModal } from '@/features/launcher/components/molecules/launcher-match-game-modal'
import type { LocalGame } from '@/features/launcher/types'

interface Props {
  game: LocalGame
}

export const MatchGameButton = ({ game }: Props) => {
  const { openModal } = useModal()

  const handleOpenMatchModal = () => {
    const close = openModal(
      <MatchGameModal
        game={game}
        onClose={() => close()}
      />
    )
  }

  return (
    <button
      onClick={handleOpenMatchModal}
      className="px-5.5 py-2.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95"
    >
      Match to Play
    </button>
  )
};
