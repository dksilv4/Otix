import { useParams } from '@tanstack/react-router'
import { Clock } from 'lucide-react'
import { useGamePlaytime } from '@/features/launcher/hooks/use-launcher-playtime'
import { formatPlaytime } from '@/features/launcher/utils'

export const LauncherPlaytimeStats = () => {
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const playtime = useGamePlaytime(gameId)
  const playtimeStr = formatPlaytime(playtime, null)

  return (
    <div className="flex items-center gap-3 min-w-0">
      <Clock size={18} className="text-white/80 shrink-0" />
      <div>
        <p className="text-lg font-black text-white tracking-tight leading-none">{playtimeStr}</p>
        <p className="text-[10px] font-semibold text-white/60 tracking-wide">Played</p>
      </div>
    </div>
  )
};
