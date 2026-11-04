import { Gamepad2, RotateCw } from 'lucide-react'
import { useRunningGame } from '@/features/launcher/hooks/use-running-game'
import { formatElapsed, formatMultiGameBadge } from '@/features/launcher/utils'
import type { RunningGameData } from '@/lib/desktop/api'

export interface GameSessionStatusIndicatorProps {
  runningGame?: RunningGameData | null
  runningGames?: RunningGameData[]
  elapsedMs?: number
  variant?: 'pill' | 'card' | 'inline'
  className?: string
  showFps?: boolean
  onCycleActive?: () => void
  onSetActive?: (gameId: string) => void
}

/**
 * Unified borderless soft glassmorphic session status indicator.
 * Displays live active game information and multi-game cycling controls using strictly semantic tokens.
 */
export const GameSessionStatusIndicator = ({
  runningGame: propRunningGame,
  runningGames: propRunningGames,
  elapsedMs: propElapsedMs,
  variant = 'pill',
  className = '',
  showFps = true,
  onCycleActive,
  onSetActive,
}: GameSessionStatusIndicatorProps) => {
  const hookState = useRunningGame()
  const activeGame = propRunningGame !== undefined ? propRunningGame : hookState.runningGame
  const allGames = propRunningGames !== undefined ? propRunningGames : hookState.runningGames || []
  const activeElapsedMs = propElapsedMs !== undefined ? propElapsedMs : hookState.elapsedMs

  if (!activeGame) {
    return null
  }

  const fps = activeGame.fpsSnapshot?.currentFps
  const hasFps = showFps && typeof fps === 'number' && fps > 0
  const formattedTime = formatElapsed(activeElapsedMs)
  const currentIndex = allGames.findIndex((g) => g.game.id === activeGame.game.id)

  const handleCycle = () => {
    if (onCycleActive) {
      onCycleActive()
    } else {
      void hookState.cycleActiveGame()
    }
  }

  const handleSelectGame = (gameId: string) => {
    if (onSetActive) {
      onSetActive(gameId)
    } else {
      void hookState.setActiveGame(gameId)
    }
  }

  if (variant === 'card') {
    const gamesList = allGames.length > 0 ? allGames : [activeGame]

    return (
      <div
        data-testid="game-session-status-indicator"
        data-variant="card"
        className={`flex flex-col gap-2 ${className}`}
      >
        {gamesList.length > 1 && (
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-primary">
                Running Games
              </span>
              {currentIndex >= 0 && (
                <span className="text-[10px] font-mono text-muted-foreground font-semibold">
                  {formatMultiGameBadge(currentIndex, gamesList.length)}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleCycle}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] transition-colors cursor-pointer shrink-0"
              title="Cycle active game (Ctrl+Tab)"
              aria-label="Cycle active game"
            >
              <RotateCw className="h-3 w-3" />
            </button>
          </div>
        )}

        {gamesList.map((g) => {
          const isCurrent = g.game.id === activeGame.game.id
          const gFps = g.fpsSnapshot?.currentFps
          const gHasFps = showFps && typeof gFps === 'number' && gFps > 0
          const gTime = formatElapsed(
            isCurrent && propElapsedMs !== undefined
              ? propElapsedMs
              : g.startTime
                ? Math.max(0, Date.now() - g.startTime)
                : activeElapsedMs,
          )

          return (
            <div
              key={g.game.id}
              className={`flex flex-col gap-2 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-xl border border-white/[0.05] p-3 text-xs shadow-sm transition-all ${
                isCurrent ? 'ring-1 ring-primary/25' : 'opacity-90 hover:opacity-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                  <Gamepad2 className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold uppercase tracking-wider text-[10px] text-primary">
                        Playing
                      </span>
                      <span
                        className={`text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded ${
                          isCurrent
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-[var(--dk-surface-field)] text-muted-foreground'
                        }`}
                      >
                        {isCurrent ? 'Focused' : 'Background'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                      {gHasFps && (
                        <span className="font-bold text-primary">
                          {Math.round(gFps)} FPS
                        </span>
                      )}
                      <span>{gTime}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    {isCurrent ? (
                      <p className="truncate font-semibold text-foreground text-xs">
                        {g.game.title}
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSelectGame(g.game.id)}
                        className="truncate font-semibold text-foreground hover:text-primary text-xs text-left cursor-pointer transition-colors"
                      >
                        {g.game.title}
                      </button>
                    )}
                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => handleSelectGame(g.game.id)}
                        className="text-[10px] font-medium text-muted-foreground hover:text-foreground bg-[var(--dk-surface-field)] hover:bg-primary/20 hover:text-primary px-2 py-0.5 rounded-lg transition-colors cursor-pointer shrink-0"
                      >
                        Focus
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (variant === 'inline') {
    return (
      <div
        data-testid="game-session-status-indicator"
        data-variant="inline"
        className={`inline-flex items-center gap-2 text-xs text-foreground ${className}`}
      >
        <Gamepad2 className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="font-semibold truncate">{activeGame.game.title}</span>
        {hasFps && (
          <span className="text-[11px] font-mono font-bold text-primary">
            {Math.round(fps)} FPS
          </span>
        )}
        <span className="text-[11px] font-mono text-muted-foreground">
          {formattedTime}
        </span>
        {allGames.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleCycle()
            }}
            className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary hover:underline cursor-pointer"
            title="Cycle active game (Ctrl+Tab)"
          >
            <RotateCw className="h-2.5 w-2.5" />
            <span>+{allGames.length - 1}</span>
          </button>
        )}
      </div>
    )
  }

  // Default: 'pill' variant
  return (
    <div
      data-testid="game-session-status-indicator"
      data-variant="pill"
      className={`flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-primary/10 border border-white/[0.05] backdrop-blur-xl text-primary text-xs font-semibold shadow-sm ${className}`}
    >
      <Gamepad2 className="h-3.5 w-3.5 text-primary shrink-0" />
      <span className="font-semibold text-foreground max-w-[180px] truncate">
        {activeGame.game.title}
      </span>
      {hasFps && (
        <span className="text-[11px] font-mono font-bold text-primary pl-1 border-l border-primary/20">
          {Math.round(fps)} FPS
        </span>
      )}
      <span className="text-[11px] font-mono text-primary/80 pl-1 border-l border-primary/20">
        {formattedTime}
      </span>
      {allGames.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            handleCycle()
          }}
          title={`Running ${allGames.length} games. Click or press Ctrl+Tab to cycle.`}
          className="inline-flex items-center gap-1 pl-1.5 border-l border-primary/20 text-[10px] font-semibold text-primary hover:text-primary-foreground hover:bg-primary/20 rounded px-1.5 py-0.5 transition-all cursor-pointer"
        >
          <RotateCw className="h-2.5 w-2.5" />
          <span>+{allGames.length - 1}</span>
        </button>
      )}
    </div>
  )
};
