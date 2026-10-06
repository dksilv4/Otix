/* ── PlayGameButton — launch installed game ── */

import { Play } from 'lucide-react'
import { getDesktopAPI } from '@/lib/desktop/api'
import { useToast } from '@ui/molecules/toast'
import type { LocalGame } from '@/features/launcher/types'

interface Props {
  game: LocalGame
}

export const PlayGameButton = ({ game }: Props) => {
  const { toast } = useToast()

  const handleClick = () => {
    const api = getDesktopAPI()
    if (api?.launchGame) {
      api.launchGame(game).catch(console.error)
      toast({ title: 'Launching Game', description: `Running ${game.title}...`, variant: 'success' })
    } else {
      toast({
        title: 'Desktop App Required',
        description: 'Download the Otix desktop app to launch games natively with FPS overlay, cloud sync, and more.',
        variant: 'default',
      })
    }
  }

  return (
    <button
      onClick={handleClick}
      className="h-10 px-6 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs uppercase tracking-wider font-black flex items-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95 shrink-0"
    >
      <Play size={14} fill="currentColor" /> Play
    </button>
  )
};
