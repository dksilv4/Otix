/* ── PlayGameButton — launch installed game ── */

import { Play, Gamepad2 } from 'lucide-react'
import { getDesktopAPI } from '@/lib/desktop/api'
import { useToast } from '@ui/molecules/toast'
import { useRunningGame } from '@/features/launcher/hooks/use-running-game'
import { formatElapsed } from '@/features/launcher/utils'
import type { LocalGame } from '@/features/launcher/types'

interface Props {
  game: LocalGame
}

export const PlayGameButton = ({ game }: Props) => {
  const { toast } = useToast()
  const { runningGames, elapsedMs } = useRunningGame()

  const activeSession = runningGames.find(
    (rg) =>
      rg.game.id === game.id ||
      (Boolean(rg.game.exePath && game.exePath) &&
        (rg.game.exePath ?? "").toLowerCase() === (game.exePath ?? "").toLowerCase()) ||
      (Boolean(rg.game.title && game.title) &&
        rg.game.title.toLowerCase() === game.title.toLowerCase()),
  )

  const isRunning = Boolean(activeSession)

  const handleClick = () => {
    if (isRunning) {
      toast({
        title: 'Game Active',
        description: `${game.title} is already running (${formatElapsed(elapsedMs)} elapsed).`,
        variant: 'default',
      })
      return
    }

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

  if (isRunning) {
    return (
      <button
        onClick={handleClick}
        className="h-10 px-5 bg-primary/20 hover:bg-primary/25 text-primary rounded-xl text-xs uppercase tracking-wider font-black flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95 shrink-0 backdrop-blur-md border border-white/[0.05]"
        title={`${game.title} is currently running (${formatElapsed(elapsedMs)})`}
      >
        <Gamepad2 size={15} className="text-primary animate-pulse" />
        <span>Playing</span>
        <span className="font-mono text-[11px] font-bold text-primary/80 pl-1 border-l border-primary/20">
          {formatElapsed(elapsedMs)}
        </span>
      </button>
    )
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
