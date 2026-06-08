import { useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { getDesktopAPI } from '@/lib/desktop-api'
import { useToast } from '@/features/dk-ui/molecules/toast'
import { useLocalGame } from '@/features/game-scanner/game-queries'
import { LauncherPlayButton } from '@/features/games/organisms/launcher-play-button'
import { IsoInstallerModal } from '@/features/game-scanner/organisms/iso-installer-modal'

export function LauncherGameButtons() {
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: g } = useLocalGame(gameId)
  const mediaId = g?.data?.id

  const [isInstallerOpen, setIsInstallerOpen] = useState(false)

  if (!g) return null

  const handleOpenFolder = () => {
    if (!g.exePath) return
    const api = getDesktopAPI()
    if (api?.showItemInFolder) {
      api.showItemInFolder(g.exePath).catch(console.error)
    } else {
      toast({ title: 'Folder', description: `Located at ${g.exePath}`, variant: 'info' })
    }
  }

  const handlePickExe = async () => {
    if (!g.id || !getDesktopAPI()) return
    const api = getDesktopAPI()!
    if (!api.pickExecutable) return
    const newExe = await api.pickExecutable(g.installDir)
    if (!newExe) return
    toast({ title: 'Executable Updated', description: `Exe changed to: ${newExe}`, variant: 'success' })
  }

  return (
    <>
      <div className="flex gap-2.5 items-center justify-end">
        <LauncherPlayButton onOpenInstaller={() => setIsInstallerOpen(true)} />

        {!!g.exePath && g.platform !== 'iso' && (
          <>
            <button onClick={handleOpenFolder} className="px-3.5 py-2.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md active:scale-95 text-white/70">
              Open Folder
            </button>
            <button onClick={handlePickExe} className="px-3.5 py-2.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md active:scale-95 text-white/50" title="Choose a different executable">
              Choose Exe
            </button>
            {mediaId && (
              <button onClick={() => navigate({ to: '/media/$mediaType/$mediaId' as const, params: { mediaType: 'game', mediaId } })} className="px-3.5 py-2.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md active:scale-95 text-white/70">
                Details
              </button>
            )}
          </>
        )}
      </div>

      <IsoInstallerModal
        open={isInstallerOpen}
        onClose={() => setIsInstallerOpen(false)}
        games={g ? [g] : []}
        initialIsoPath={g?.exePath || undefined}
      />
    </>
  )
}
