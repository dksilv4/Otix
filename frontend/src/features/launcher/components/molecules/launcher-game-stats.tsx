import { useState } from 'react'
import { FileCode } from 'lucide-react'
import { useAuth } from '@/lib/providers/auth'
import { LauncherPlaytimeStats } from '@/features/launcher/components/atoms/launcher-playtime-stats'
import { LauncherRatingStats } from '@/features/launcher/components/atoms/launcher-rating-stats'
import { LauncherCloudSyncStat } from '@/features/launcher/components/atoms/launcher-cloud-sync-stat'
import { LauncherFpsStats } from '@/features/launcher/components/molecules/launcher-fps-stats'
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

export function LauncherGameStats() {
  const { component } = useLauncherTheme()
  const ThemedComponent = component('GameStats')
  if (ThemedComponent) return <ThemedComponent />

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
