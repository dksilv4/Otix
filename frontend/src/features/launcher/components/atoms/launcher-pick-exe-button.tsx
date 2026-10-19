import { FileCode } from 'lucide-react'
import { getDesktopAPI } from '@/lib/desktop/api'
import { useToast } from '@ui/molecules/toast'
import {useParams} from "@tanstack/react-router";
import {useLocalGame} from "@/features/launcher/data/game-queries";

export const PickExeButton = () => {
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
      title="Choose a different executable (.exe)"
      aria-label="Choose a different executable (.exe)"
      className="w-10 h-10 bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] rounded-xl text-muted-foreground hover:text-foreground transition-all cursor-pointer backdrop-blur-md active:scale-95 flex items-center justify-center shrink-0"
    >
      <FileCode size={16} />
    </button>
  )
};
