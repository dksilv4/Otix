import { Gamepad2 } from 'lucide-react'
import { useRunningGame } from '@/features/launcher/hooks/use-running-game'
import { formatElapsed } from '@/features/launcher/utils'
import type { RunningGameData } from '@/lib/desktop/api'

export interface GameSessionStatusIndicatorProps {
  runningGame?: RunningGameData | null
  elapsedMs?: number
  variant?: 'pill' | 'card' | 'inline'
  className?: string
  showFps?: boolean
}

/**
 * Unified borderless soft glassmorphic session status indicator.
 * Displays live active game information using strictly semantic tokens.
 */
export const GameSessionStatusIndicator = ({
  runningGame: propRunningGame,
  elapsedMs: propElapsedMs,
  variant = 'pill',
  className = '',
  showFps = true,
}: GameSessionStatusIndicatorProps) => {
  const hookState = useRunningGame()
  const activeGame = propRunningGame !== undefined ? propRunningGame : hookState.runningGame
  const activeElapsedMs = propElapsedMs !== undefined ? propElapsedMs : hookState.elapsedMs

  if (!activeGame) {
    return null
  }

  const fps = activeGame.fpsSnapshot?.currentFps
  const hasFps = showFps && typeof fps === 'number' && fps > 0
  const formattedTime = formatElapsed(activeElapsedMs)

  if (variant === 'card') {
    return (
      <div
        data-testid="game-session-status-indicator"
        data-variant="card"
        className={`flex items-center gap-3 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-xl border border-white/[0.05] p-3 text-xs shadow-sm ${className}`}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
          <Gamepad2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="font-extrabold uppercase tracking-wider text-[10px] text-primary">
              Playing
            </span>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
              {hasFps && (
                <span className="font-bold text-primary">
                  {Math.round(fps)} FPS
                </span>
              )}
              <span>{formattedTime}</span>
            </div>
          </div>
          <p className="truncate font-semibold text-foreground text-xs mt-0.5">
            {activeGame.game.title}
          </p>
        </div>
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
    </div>
  )
}
