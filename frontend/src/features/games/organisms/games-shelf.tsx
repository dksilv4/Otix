import type { ShelfRow } from "../types"
import { ShelfCard } from "../molecules/shelf-card"

interface GamesShelfProps {
  rows: ShelfRow[]
  onSelectGame: (id: string) => void
}

export function GamesShelf({ rows, onSelectGame }: GamesShelfProps) {
  if (rows.length === 0) return null

  return (
    <div className="space-y-5">
      {rows.map((row) => (
        <div key={row.id}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-white/35">
              {row.icon} {row.label}
            </span>
            <span className="text-[10px] text-white/10">
              {row.games.length} {row.games.length === 1 ? "game" : "games"}
            </span>
          </div>
          {row.games.length > 0 ? (
            <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
              {row.games.map((game) => (
                <ShelfCard key={game.id} game={game} onClick={onSelectGame} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/30 py-6 text-center">
              {row.emptyMessage || "No games here yet"}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
