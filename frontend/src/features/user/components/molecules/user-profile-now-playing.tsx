import { Gamepad2, Zap } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import {
  useMatchedRunningGame,
  useGamingSessionXp,
  useCs2GameState,
  isCs2Game,
  formatCs2Status,
} from '@/features/launcher'
import { formatDuration } from '@/lib/utils'

/**
 * Super-streamlined status bar showing currently played game, cover thumbnail,
 * elapsed time, and XP inside the user hero card.
 */
export const UserProfileNowPlaying = () => {
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

  return (
    <div
      data-testid="user-profile-now-playing"
      className="inline-flex items-center gap-2 max-w-full rounded-xl bg-white/[0.05] hover:bg-white/[0.08] transition-colors border border-white/[0.08] px-2.5 py-1 text-xs backdrop-blur-md mb-2.5"
    >
      {/* Game cover thumbnail */}
      <div className="relative w-5 h-7 rounded overflow-hidden shrink-0 bg-white/[0.06] border border-white/10 flex items-center justify-center">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={displayTitle}
            className="w-full h-full object-cover"
          />
        ) : (
          <Gamepad2 className="h-3.5 w-3.5 text-white/40" />
        )}
      </div>

      {/* Playing + Title */}
      <div className="min-w-0 flex items-center gap-1.5 truncate">
        <span className="text-white/50 font-medium shrink-0">Playing</span>
        {matchedGame?.id ? (
          <Link
            to="/launcher/$gameId"
            params={{ gameId: matchedGame.id }}
            className="font-semibold text-white hover:text-primary transition-colors truncate"
          >
            {displayTitle}
          </Link>
        ) : (
          <span className="font-semibold text-white truncate">
            {displayTitle}
          </span>
        )}
      </div>

      {/* CS2 Live Match / Lobby Badge */}
      {gameState &&
        (isCs2Game(runningGame.game.title) ||
          isCs2Game(runningGame.game.exePath) ||
          isCs2Game(runningGame.game.processName)) && (
          <>
            <span className="text-white/20 select-none">·</span>
            <span className="font-medium text-primary text-[11px] truncate">
              {formatCs2Status(gameState)}
            </span>
          </>
        )}

      {/* Elapsed time */}
      {elapsedMs > 0 && (
        <>
          <span className="text-white/20 select-none">·</span>
          <span className="font-mono text-white/50 text-[11px] tabular-nums shrink-0">
            {formatDuration(elapsedMs)}
          </span>
        </>
      )}

      {/* Session XP */}
      {sessionXp > 0 && (
        <>
          <span className="text-white/20 select-none">·</span>
          <span className="inline-flex items-center gap-0.5 text-amber-300 font-mono text-[11px] font-bold shrink-0">
            <Zap size={10} className="fill-amber-300" />
            +{sessionXp} XP
          </span>
        </>
      )}
    </div>
  )
};
