/* ── MatchGameButton — opens match modal for unmatched game ── */

import { Sparkles } from 'lucide-react'
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
      className="h-10 px-5 bg-primary hover:bg-primary/90 text-primary-foreground font-black rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95 shrink-0"
    >
      <Sparkles size={15} className="stroke-[2.5]" />
      <span>Match to Play</span>
    </button>
  )
};
