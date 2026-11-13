import { useState } from 'react'
import { RotateCw } from 'lucide-react'
import { useMatchedRunningGame, useCs2GameState, isCs2Game } from '@/features/launcher'
import type { RunningGameData } from '@/lib/desktop/api'
import { ActivityGameCard } from './activity-game-card'

export interface ActivityModuleGameProps {
  onClose?: () => void
}

/**
 * Gaming activity module rendering every running game session directly
 * in its own full container card.
 */
export const ActivityModuleGame = ({ onClose }: ActivityModuleGameProps = {}) => {
  const {
    runningGame,
    runningGames = [],
    setActiveGame,
    cycleActiveGame,
  } = useMatchedRunningGame()

  const isCs2FromRunningGame = Boolean(
    runningGame &&
      isCs2Game(runningGame.game.title || runningGame.game.exePath || runningGame.game.processName),
  )
  const { gameState } = useCs2GameState({ enabled: isCs2FromRunningGame || !runningGame })
  const hasActiveCs2Gsi = Boolean(gameState && (gameState.isInGame || gameState.activity === 'playing'))
  const [cs2StartTime] = useState(() => Date.now())

  if (runningGames.length === 0 && !runningGame && !hasActiveCs2Gsi) {
    return null
  }

  const gamesToRender: RunningGameData[] =
    runningGames.length > 0
      ? runningGames
      : runningGame
        ? [runningGame]
        : []

  if (gamesToRender.length === 0 && hasActiveCs2Gsi) {
    gamesToRender.push({
      game: { id: '730', title: 'Counter-Strike 2', platform: 'pc' },
      startTime: cs2StartTime,
      launchedByOtix: false,
    })
  }

  const activeId = runningGame?.game.id || gamesToRender[0]?.game.id

  return (
    <div data-testid="activity-module-games" className="w-full flex flex-col gap-2.5">
      {gamesToRender.length > 1 && (
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-primary">
            Running Games ({gamesToRender.length})
          </span>
          <button
            type="button"
            onClick={() => void cycleActiveGame()}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-muted-foreground hover:text-foreground bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] transition-colors cursor-pointer shrink-0"
            title="Cycle active game focus (Ctrl+Tab)"
          >
            <RotateCw className="h-2.5 w-2.5" />
            <span>Cycle</span>
            <kbd className="text-[9px] font-mono px-1 py-0.2 rounded bg-[var(--dk-surface-field)] text-muted-foreground">
              Ctrl+Tab
            </kbd>
          </button>
        </div>
      )}

      {gamesToRender.map((g) => (
        <ActivityGameCard
          key={g.game.id || g.pid}
          game={g}
          isFocused={g.game.id === activeId}
          onFocus={() => void setActiveGame(g.game.id)}
          onClose={onClose}
        />
      ))}
    </div>
  )
};
