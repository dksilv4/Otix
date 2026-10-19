import { FolderOpen } from 'lucide-react'
import { getDesktopAPI } from '@/lib/desktop/api'
import { useToast } from '@ui/molecules/toast'
import {useParams} from "@tanstack/react-router";
import {useLocalGame} from "@/features/launcher/data/game-queries";



export const OpenFolderButton = () => {
  const { toast } = useToast()
  const {gameId} = useParams({ strict: false })
  const { data: g } = useLocalGame(gameId)
  const path = g?.exePath
  if(!path) return null


  const handleClick = () => {
    const api = getDesktopAPI()
    if (api?.showItemInFolder) {
      api.showItemInFolder(path).catch(console.error)
    } else {
      toast({ title: 'Folder', description: `Located at ${path}`, variant: 'info' })
    }
  }

  return (
    <button
      onClick={handleClick}
      title="Open game directory"
      aria-label="Open game directory"
      className="w-10 h-10 bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] rounded-xl text-muted-foreground hover:text-foreground transition-all cursor-pointer backdrop-blur-md active:scale-95 flex items-center justify-center shrink-0"
    >
      <FolderOpen size={16} />
    </button>
  )
};
