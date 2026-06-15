import { Gamepad2, Clock } from 'lucide-react'
import { useRunningGame } from '@/old-features/games/hooks/use-running-game'
import { formatDuration } from '@/lib/utils'
import { ActivityModuleSection } from './activity-module-section'

/** Molecule displaying the currently running game with elapsed time. */
export function ActivityModuleGame() {
  const { runningGame, elapsedMs } = useRunningGame()

  if (!runningGame) return null

  return (
    <ActivityModuleSection>
      <div className="flex items-center gap-3">
        <div className="relative w-14 h-14 rounded-2xl overflow-hidden shrink-0 bg-white/[0.04]">
          {runningGame.game.iconUrl || runningGame.game.posterUrl ? (
            <img
              src={runningGame.game.iconUrl || runningGame.game.posterUrl || undefined}
              alt={runningGame.game.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Gamepad2 size={24} className="text-white/30" />
            </div>
          )}
          <div className="absolute top-1 right-1">
            <span className="block w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)] animate-pulse" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-purple-300/95 mb-0.5">Now Playing</p>
          <h3 className="text-[15px] font-bold text-white/95 truncate leading-tight">{runningGame.game.title}</h3>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-white/65">
            <span className="font-bold tracking-wider">{runningGame.game.platform.toUpperCase()}</span>
            <span className="opacity-30">·</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Clock size={10} />
              {formatDuration(elapsedMs)}
            </span>
          </div>
        </div>
      </div>
    </ActivityModuleSection>
  )
}
