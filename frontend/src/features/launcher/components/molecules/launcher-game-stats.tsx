import { LauncherPlaytimeStats } from '@/features/launcher/components/atoms/launcher-playtime-stats'
import { LauncherRatingStats } from '@/features/launcher/components/atoms/launcher-rating-stats'
import { LauncherCloudSyncStat } from '@/features/launcher/components/atoms/launcher-cloud-sync-stat'
import { LauncherFpsStats } from '@/features/launcher/components/molecules/launcher-fps-stats'

export const LauncherGameStats = () => {
  return (
    <div className="flex items-center gap-4">
      <div className="bg-white/5 backdrop-blur-2xl rounded-2xl px-6 py-4 shadow-2xl flex items-stretch gap-6">
        <LauncherPlaytimeStats />
        <LauncherRatingStats />
        <LauncherCloudSyncStat />
      </div>

      <LauncherFpsStats />
    </div>
  )
};
