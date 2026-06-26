/* ── PlayGameButton — launch installed game ── */

import { Play } from 'lucide-react'
import { getDesktopAPI } from '@/lib/desktop/api'
import { useToast } from '@/old-features/dk-ui/molecules/toast'
import type { LocalGame } from '@/features/launcher/types'
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

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
      toast({ title: 'Launch Simulated', variant: 'info' })
    }
  }

  const { component } = useLauncherTheme()
  const ThemedComponent = component('PlayButton')
  if (ThemedComponent) return <ThemedComponent game={game} />

  return (
    <button
      onClick={handleClick}
      className="px-5.5 py-2.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent)] text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95"
    >
      <Play size={14} fill="currentColor" /> Play
    </button>
  )
}
