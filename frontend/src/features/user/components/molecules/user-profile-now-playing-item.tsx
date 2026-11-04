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
import type { RunningGameData } from '@/lib/desktop/api'

export interface UserProfileNowPlayingItemProps {
  game: RunningGameData
  isFocused: boolean
  onFocus?: () => void
}

/** Individual status bar container for a running game in the user profile header. */
export const UserProfileNowPlayingItem = ({
  game,
  isFocused,
  onFocus,
}: UserProfileNowPlayingItemProps) => {
  const { matchedGame, elapsedMs } = useMatchedRunningGame(game)
  const { sessionXp } = useGamingSessionXp()
  const isCs2 = Boolean(
    isCs2Game(game.game.title || game.game.exePath || game.game.processName),
  )
  const { gameState } = useCs2GameState({ enabled: isCs2 })

  const displayTitle = matchedGame?.title || game.game.title
  const posterUrl = matchedGame?.posterUrl || game.game.posterUrl || game.game.iconUrl
  const currentFps = game.fpsSnapshot?.currentFps
  const hasFps = typeof currentFps === 'number' && currentFps > 0

  return (
    <div
      data-testid="user-profile-now-playing-item"
      className={`inline-flex items-center gap-2 max-w-full rounded-xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] transition-all border border-white/[0.05] px-2.5 py-1 text-xs backdrop-blur-md ${isFocused ? 'ring-1 ring-primary/25' : 'opacity-90 hover:opacity-100'}`}
    >
      {/* Game cover thumbnail */}
      <div className="relative w-5 h-7 rounded overflow-hidden shrink-0 bg-[var(--dk-surface-field)] border border-white/[0.05] flex items-center justify-center">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={displayTitle}
            className="w-full h-full object-cover"
          />
        ) : (
          <Gamepad2 className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>

      {/* Playing + Title */}
      <div className="min-w-0 flex items-center gap-1.5 truncate">
        <span className="text-muted-foreground font-medium shrink-0">Playing</span>
        {matchedGame?.id ? (
          <Link
            to="/launcher/$gameId"
            params={{ gameId: matchedGame.id }}
            className="font-semibold text-foreground hover:text-primary transition-colors truncate"
          >
            {displayTitle}
          </Link>
        ) : !isFocused && onFocus ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onFocus()
            }}
            className="font-semibold text-foreground hover:text-primary transition-colors truncate cursor-pointer text-left"
          >
            {displayTitle}
          </button>
        ) : (
          <span className="font-semibold text-foreground truncate">
            {displayTitle}
          </span>
        )}
      </div>

      {/* Focus status badge or Focus button */}
      {isFocused ? (
        <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-primary text-primary-foreground shrink-0">
          Focused
        </span>
      ) : (
        onFocus && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onFocus()
            }}
            title={`Focus ${displayTitle}`}
            className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-[var(--dk-surface-field)] hover:bg-primary/20 hover:text-primary text-muted-foreground transition-colors shrink-0 cursor-pointer"
          >
            Focus
          </button>
        )
      )}

      {/* Live FPS */}
      {hasFps && (
        <>
          <span className="text-muted-foreground/30 select-none">·</span>
          <span className="font-mono text-primary font-bold text-[11px] shrink-0">
            {Math.round(currentFps)} FPS
          </span>
        </>
      )}

      {/* CS2 Live Match / Lobby Badge */}
      {gameState &&
        (isCs2Game(game.game.title) ||
          isCs2Game(game.game.exePath) ||
          isCs2Game(game.game.processName)) && (
          <>
            <span className="text-muted-foreground/30 select-none">·</span>
            <span className="font-medium text-primary text-[11px] truncate">
              {formatCs2Status(gameState)}
            </span>
          </>
        )}

      {/* Elapsed time */}
      {elapsedMs > 0 && (
        <>
          <span className="text-muted-foreground/30 select-none">·</span>
          <span className="font-mono text-muted-foreground text-[11px] tabular-nums shrink-0">
            {formatDuration(elapsedMs)}
          </span>
        </>
      )}

      {/* Session XP */}
      {isFocused && sessionXp > 0 && (
        <>
          <span className="text-muted-foreground/30 select-none">·</span>
          <span className="inline-flex items-center gap-0.5 text-primary font-mono text-[11px] font-bold shrink-0">
            <Zap size={10} className="fill-primary" />
            +{sessionXp} XP
          </span>
        </>
      )}
    </div>
  )
};
