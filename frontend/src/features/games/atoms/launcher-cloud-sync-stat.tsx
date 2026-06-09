import { useParams } from '@tanstack/react-router'
import { Cloud, RefreshCw, AlertCircle } from 'lucide-react'
import { useLocalGame } from '@/features/game-scanner/game-queries'
import { useSaveLocations } from '@/features/games/games-queries'
import { useCloudSync } from '@/features/games/hooks/use-launcher-cloud-sync'

export function LauncherCloudSyncStat() {
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { data: g } = useLocalGame(gameId)
  const mediaId = g?.data?.id
  const { data: serverLocations, refetch: refetchServerLocations } = useSaveLocations(mediaId)
  const sync = useCloudSync({
    gameId: gameId || '',
    gameTitle: g?.data?.title || g?.title || '',
    serverLocations,
    refetchServerLocations,
  })

  const cloudIcon = sync.syncing
    ? <RefreshCw size={11} className="animate-spin text-blue-400" />
    : sync.syncError
    ? <AlertCircle size={11} className="text-red-400" />
    : sync.cloudSettings?.isPathConfirmed
    ? <Cloud size={11} className="text-emerald-400" />
    : <Cloud size={11} className="text-white/30" />

  const cloudTitle = sync.syncing
    ? 'Syncing...'
    : sync.syncError
    ? 'Sync error'
    : sync.cloudSettings?.lastSyncAt
    ? `Synced ${new Date(sync.cloudSettings.lastSyncAt).toLocaleTimeString()}`
    : 'Cloud saves'

  return (
    <>
      <div className="w-px h-10 bg-white/15" />
      <button
        onClick={sync.handleSyncNow}
        disabled={sync.syncing || !sync.cloudSettings?.isPathConfirmed}
        className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-white/10 transition-all cursor-pointer disabled:opacity-40 active:scale-95"
        title={cloudTitle}
      >
        {cloudIcon}
      </button>
    </>
  )
}
