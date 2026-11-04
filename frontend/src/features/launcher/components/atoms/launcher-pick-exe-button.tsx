import { FileCode } from 'lucide-react'
import { getDesktopAPI } from '@/lib/desktop/api'
import { useToast } from '@ui/molecules/toast'
import { useParams } from '@tanstack/react-router'
import { useLocalGame } from '@/features/launcher/data/game-queries'

interface PickExeButtonProps {
  gameId?: string
  installDir?: string | null
}

export const PickExeButton = ({ gameId: propGameId, installDir: propInstallDir }: PickExeButtonProps = {}) => {
  const { toast } = useToast()
  const { gameId: routeGameId } = useParams({ strict: false })
  const activeGameId = propGameId ?? routeGameId
  const { data: g } = useLocalGame(propInstallDir ? undefined : activeGameId)
  const installDir = propInstallDir ?? g?.installDir

  const handleClick = async () => {
    if (!activeGameId || !getDesktopAPI()) return
    const api = getDesktopAPI()!
    if (!api.pickExecutable || !api.updateGamePath) return
    const newExe = await api.pickExecutable(installDir ?? '')
    if (!newExe) return
    await api.updateGamePath(activeGameId, newExe)
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
