import { useState } from 'react'
import { FileCode } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { LauncherPlaytimeStats } from '@/features/games/atoms/launcher-playtime-stats'
import { LauncherRatingStats } from '@/features/games/atoms/launcher-rating-stats'
import { LauncherCloudSyncStat } from '@/features/games/atoms/launcher-cloud-sync-stat'
import { LauncherFpsStats } from '@/features/games/molecules/launcher-fps-stats'

export function LauncherGameStats() {
  const { user } = useAuth()
  const [showJson, setShowJson] = useState(false)

  return (
    <div className="flex items-center gap-4">
      <div className="bg-white/5 backdrop-blur-2xl rounded-2xl px-6 py-4 shadow-2xl flex items-stretch gap-6">
        <LauncherPlaytimeStats />
        <LauncherRatingStats />
        <LauncherCloudSyncStat />

        {user?.isAdmin && (
          <button
            onClick={() => setShowJson(!showJson)}
            className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-amber-500/20 transition-all cursor-pointer active:scale-95"
            title="View game data JSON"
          >
            <FileCode size={13} className="text-amber-400/80" />
          </button>
        )}
      </div>

      <LauncherFpsStats />
    </div>
  )
}
