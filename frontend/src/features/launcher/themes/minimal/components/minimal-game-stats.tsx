import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'
import { useGamePlaytime } from '@/features/launcher/hooks/use-launcher-playtime'

export function MinimalGameStats() {
  const { data: game } = useLauncherGame()
  const { playtimeMinutes } = useGamePlaytime()

  return (
    <div className="flex gap-6 text-sm text-white/60 font-mono">
      {playtimeMinutes != null && playtimeMinutes > 0 && (
        <span>{Math.round(playtimeMinutes / 60)}h played</span>
      )}
      {game?.rating != null && game.rating > 0 && (
        <span>★ {game.rating.toFixed(1)}</span>
      )}
    </div>
  )
}
