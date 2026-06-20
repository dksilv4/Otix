/* ── MatchGameButton — trigger catalog match for unmatched game ── */

import { useToast } from '@/old-features/dk-ui/molecules/toast'
import { useMatchLocalGames, useSyncLocalGames } from '@/old-features/game-scanner/queries'
<<<<<<<< HEAD:frontend/src/features/launcher/atoms/match-game-button.tsx
import type { LocalGame } from '@/features/launcher/types'
========
import type { LocalGame } from '@/old-features/games/types'
>>>>>>>> d607927de356d7641bc4391ed7e97bc43aae7dc2:frontend/src/old-features/games/atoms/match-game-button.tsx

interface Props {
  game: LocalGame
}

export function MatchGameButton({ game }: Props) {
  const { toast } = useToast()
  const matchMutation = useMatchLocalGames()
  const syncMutation = useSyncLocalGames()

  const handleClick = () => {
    matchMutation.mutateAsync([game]).then((matched) => {
      if (matched?.length) {
        syncMutation.mutate(matched)
        toast({
          title: 'Game Matched',
          description: `"${matched[0]?.data?.title || matched[0]?.title}" found in catalog.`,
          variant: 'success',
        })
      }
    }).catch((err) => console.error('[Launcher] Match game failed:', err))
  }

  return (
    <button
      onClick={handleClick}
      className="px-5.5 py-2.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95"
    >
      Match to Play
    </button>
  )
}
