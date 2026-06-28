/* ── PlayGameButton — launch installed game ── */

import { Play } from 'lucide-react'
import { getDesktopAPI } from '@/lib/desktop/api'
import { useToast } from '@/old-features/ui/molecules/toast'
import type { LocalGame } from '@/features/launcher/types'

interface Props {
  game: LocalGame
}

export function PlayGameButton({ game }: Props) {
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
      className="px-5.5 py-2.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent)] text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95"
    >
      <Play size={14} fill="currentColor" /> Play
    </button>
  )
}
