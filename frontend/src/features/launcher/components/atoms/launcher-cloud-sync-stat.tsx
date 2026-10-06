import { useParams } from '@tanstack/react-router'
import { Cloud, RefreshCw, AlertCircle } from 'lucide-react'
import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'
import { useSaveLocations } from '@/features/launcher/data/queries'
import { useCloudSync } from '@/features/launcher/hooks/use-cloud-sync'

export const LauncherCloudSyncStat = () => {
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { game: g } = useLauncherGame(gameId)
  const mediaId = g?.data?.id
  const { data: serverLocations, refetch: refetchServerLocations } = useSaveLocations(mediaId)
  const sync = useCloudSync({
    gameId: gameId || '',
    gameTitle: g?.data?.title || g?.title || '',
    serverLocations: serverLocations ?? undefined,
    refetchServerLocations,
  })

  const cloudIcon = sync.syncing
    ? <RefreshCw size={11} className="animate-spin text-blue-400" />
    : sync.syncError
    ? <AlertCircle size={11} className="text-red-400" />
    : sync.cloudSettings?.isPathConfirmed
    ? <Cloud size={11} className="text-primary" />
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
      <div className="w-px self-stretch bg-white/15" />
      <button
        onClick={sync.handleSyncNow}
        disabled={sync.syncing || !sync.cloudSettings?.isPathConfirmed}
        className="flex items-center justify-center min-w-9 rounded-lg hover:bg-white/10 transition-all cursor-pointer disabled:opacity-40 active:scale-95"
        title={cloudTitle}
      >
        {cloudIcon}
      </button>
    </>
  )
};
