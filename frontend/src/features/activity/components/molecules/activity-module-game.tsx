import { Gamepad2, Clock, Star, ExternalLink, Activity, Zap } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useMatchedRunningGame, useGamingSessionXp, useCs2GameState, isCs2Game } from '@/features/launcher'
import { formatDuration } from '@/lib/utils'
import { ActivityModuleSection } from './activity-module-section'
import { ActivityModuleCs2Telemetry } from './activity-module-cs2-telemetry'

interface ActivityModuleGameProps {
  onClose?: () => void
}

/** Molecule displaying the currently running game with matched Otix catalog info, live FPS, and elapsed time. */
export const ActivityModuleGame = ({ onClose }: ActivityModuleGameProps = {}) => {
  const { runningGame, elapsedMs, matchedGame } = useMatchedRunningGame()
  const { sessionXp } = useGamingSessionXp()
  const isCs2 = Boolean(
    runningGame &&
      isCs2Game(runningGame.game.title || runningGame.game.exePath || runningGame.game.processName),
  )
  const { gameState } = useCs2GameState({ enabled: isCs2 })

  if (!runningGame) return null

  const displayTitle = matchedGame?.title || runningGame.game.title
  const posterUrl = matchedGame?.posterUrl || runningGame.game.posterUrl || runningGame.game.iconUrl
  const releaseYear = matchedGame?.releaseDate ? new Date(matchedGame.releaseDate).getFullYear() : null
  const genresStr = matchedGame?.genres?.slice(0, 2).join(' · ')
  const subtitle = genresStr
    ? `${genresStr}${releaseYear ? ` (${releaseYear})` : ''}`
    : releaseYear
      ? `${releaseYear}`
      : null
  const currentFps = runningGame.fpsSnapshot?.currentFps ?? 0
  const fpsRounded = Math.round(currentFps)

  const fpsColorClass =
    fpsRounded >= 60
      ? 'text-emerald-400 bg-emerald-500/15'
      : fpsRounded >= 30
        ? 'text-amber-400 bg-amber-500/15'
        : 'text-rose-400 bg-rose-500/15'

  return (
    <ActivityModuleSection className="relative overflow-hidden group">
      {/* Subtle ambient backdrop glow */}
      {posterUrl && (
        <div
          className="absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-20 blur-2xl pointer-events-none transition-opacity duration-500 group-hover:opacity-30"
          style={{ backgroundImage: `url(${posterUrl})`, backgroundSize: 'cover' }}
        />
      )}

      <div className="relative flex items-start gap-3">
        <div className="relative w-14 h-20 rounded-xl overflow-hidden shrink-0 bg-muted shadow-md transition-colors">
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={displayTitle}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Gamepad2 size={24} className="text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-500 dark:text-emerald-400">
              Now Playing
            </span>
            {matchedGame?.rating != null && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500 dark:text-amber-400">
                <Star size={10} className="fill-amber-500 dark:fill-amber-400 text-amber-500 dark:text-amber-400" />
                {matchedGame.rating.toFixed(1)}
              </span>
            )}
          </div>

          {matchedGame?.id ? (
            <Link
              to="/launcher/$gameId"
              params={{ gameId: matchedGame.id }}
              onClick={onClose}
              className="group/link flex items-center gap-1 text-[15px] font-bold text-foreground hover:text-primary transition-colors truncate leading-tight"
            >
              <span className="truncate">{displayTitle}</span>
              <ExternalLink className="h-3 w-3 opacity-0 group-hover/link:opacity-80 transition-opacity shrink-0" />
            </Link>
          ) : (
            <h3 className="text-[15px] font-bold text-foreground truncate leading-tight">
              {displayTitle}
            </h3>
          )}

          {subtitle && (
            <p className="text-[11px] text-muted-foreground truncate mt-0.5 font-medium">
              {subtitle}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 mt-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-muted text-muted-foreground font-mono shrink-0">
                {runningGame.game.platform.toUpperCase()}
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums font-mono text-emerald-600 dark:text-emerald-400 shrink-0">
                <Clock size={10} />
                {formatDuration(elapsedMs)}
              </span>
              {fpsRounded > 0 && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold shrink-0 ${fpsColorClass}`}>
                  <Activity size={10} />
                  {fpsRounded} FPS
                </span>
              )}
            </div>
            {sessionXp > 0 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold text-amber-300 bg-amber-500/15 shrink-0 ml-auto">
                <Zap size={10} className="fill-amber-300" />
                +{sessionXp} XP
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Live CS2 GSI Telemetry — Full-width dedicated section */}
      {gameState && (
        <div className="w-full mt-3">
          <ActivityModuleCs2Telemetry state={gameState} />
        </div>
      )}
    </ActivityModuleSection>
  )
};
