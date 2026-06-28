/* ── PickExeButton — pick different executable via native dialog ── */

import { getDesktopAPI } from '@/lib/desktop/api'
import { useToast } from '@/old-features/ui/molecules/toast'
import {useParams} from "@tanstack/react-router";
import {useLocalGame} from "@/features/launcher/data/game-queries";



export function PickExeButton() {
  const { toast } = useToast()
  const {gameId} = useParams({ strict: false })
  const { data: g } = useLocalGame(gameId)

  const handleClick = async () => {
    if (!gameId || !getDesktopAPI()) return
    const api = getDesktopAPI()!
    if (!api.pickExecutable || !api.updateGamePath || !g) return
    const newExe = await api.pickExecutable(g.installDir)
    if (!newExe) return
    await api.updateGamePath(gameId, newExe)
    toast({ title: 'Executable Updated', description: `Exe changed to: ${newExe}`, variant: 'success' })
  }

  return (
    <button
      onClick={handleClick}
      className="px-3.5 py-2.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md active:scale-95 text-white/50"
      title="Choose a different executable"
    >
      Choose Exe
    </button>
  )
}
