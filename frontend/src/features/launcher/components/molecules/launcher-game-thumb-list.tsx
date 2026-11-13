import { useEffect, useRef } from 'react'
import { Gamepad2 } from 'lucide-react'
import GameThumb from "@/features/launcher/components/atoms/launcher-game-thumb"
import type { DisplayGame } from "@/features/launcher/types"

interface GameThumbListProps {
  games: DisplayGame[]
  activeGameId: string | null
  onSelect: (id: string) => void
  onHover?: (game: DisplayGame) => void
}

export const GameThumbList = ({ games, activeGameId, onSelect, onHover }: GameThumbListProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      const container = containerRef.current
      const el = activeRef.current
      const containerRect = container.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const scrollTop = container.scrollTop + elRect.top - containerRect.top - containerRect.height / 2 + elRect.height / 2
      container.scrollTo?.({ top: scrollTop, behavior: 'smooth' })
    }
  }, [activeGameId])

  return (
    <div
      ref={containerRef}
      className="min-h-[2rem] flex-1 flex flex-col items-center gap-3 overflow-y-scroll overflow-x-hidden scrollbar-none w-full h-full px-1.5 pt-2 pb-4"
    >
      {games.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 px-1 text-center text-muted-foreground text-[10px] gap-1.5 animate-fadeIn m-auto">
          <Gamepad2 size={16} className="text-muted-foreground/60" />
          <span>No games ready</span>
        </div>
      ) : (
        games.map((game: DisplayGame) => {
          const isActive = game.id === activeGameId
          const isRunning = game.playtime === 'Now Playing'
          return (
            <button
              key={game.id}
              ref={isActive ? activeRef : undefined}
              onClick={() => onSelect(game.id)}
              onMouseEnter={() => onHover?.(game)}
              className={
                "w-[46px] h-[46px] rounded-xl overflow-hidden cursor-pointer border transition-colors duration-300 relative shrink-0 " +
                (isActive
                  ? "border-primary shadow-[var(--dk-shadow-glass)] scale-105"
                  : isRunning
                    ? "border-primary/60 shadow-[var(--dk-shadow-glass)] opacity-100 ring-1 ring-primary/30"
                    : "border-transparent opacity-50 hover:opacity-100 hover:border-[var(--dk-separator)]"
                )
              }
              title={`${game.title}${game.playtime ? ` ● ${game.playtime}` : ''}`}
            >
              <GameThumb icon={game.iconUrl || game.posterUrl || undefined} alt={game.title} />
              {isRunning && (
                <div className="absolute inset-0 border border-primary rounded-xl animate-pulse pointer-events-none" />
              )}
            </button>
          )
        })
      )}
    </div>
  )
}

export default GameThumbList
