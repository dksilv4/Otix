/* ── OpenFolderButton — reveals game exe in file explorer ── */

import { getDesktopAPI } from '@/lib/desktop/api'
import { useToast } from '@/old-features/dk-ui/molecules/toast'
import {useParams} from "@tanstack/react-router";
import {useLocalGame} from "@/old-features/game-scanner/game-queries.ts";



export function OpenFolderButton() {
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
      className="px-3.5 py-2.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md active:scale-95 text-white/70"
    >
      Open Folder
    </button>
  )
}
