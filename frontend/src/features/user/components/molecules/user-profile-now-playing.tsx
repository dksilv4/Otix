import { RotateCw } from 'lucide-react'
import { useMatchedRunningGame } from '@/features/launcher'
import type { RunningGameData } from '@/lib/desktop/api'
import { UserProfileNowPlayingItem } from './user-profile-now-playing-item'

/**
 * Status bar row rendering every running game session directly
 * in its own container capsule inside the user hero card.
 */
export const UserProfileNowPlaying = () => {
  const {
    runningGame,
    runningGames = [],
    cycleActiveGame,
    setActiveGame,
  } = useMatchedRunningGame()

  if (!runningGame && runningGames.length === 0) return null

  const gamesToRender: RunningGameData[] =
    runningGames.length > 0
      ? runningGames
      : runningGame
        ? [runningGame]
        : []

  const activeId = runningGame?.game.id || gamesToRender[0]?.game.id

  return (
    <div
      data-testid="user-profile-now-playing"
      className="flex items-center gap-2 max-w-full flex-wrap mb-2.5"
    >
      {gamesToRender.map((g) => (
        <UserProfileNowPlayingItem
          key={g.game.id || g.pid}
          game={g}
          isFocused={g.game.id === activeId}
          onFocus={() => void setActiveGame(g.game.id)}
        />
      ))}

      {gamesToRender.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void cycleActiveGame()
          }}
          title={`Running ${gamesToRender.length} games. Click or press Ctrl+Tab to cycle active game focus.`}
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 active:scale-95 transition px-2 py-1 rounded-xl shrink-0 cursor-pointer"
        >
          <RotateCw className="h-2.5 w-2.5" />
          <span>+{gamesToRender.length - 1} more</span>
        </button>
      )}
    </div>
  )
};
