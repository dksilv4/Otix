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
      className="w-10 h-10 bg-white/8 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-xl text-white/70 hover:text-white transition-all cursor-pointer backdrop-blur-md active:scale-95 flex items-center justify-center shrink-0"
    >
      <FolderOpen size={16} />
    </button>
  )
};
