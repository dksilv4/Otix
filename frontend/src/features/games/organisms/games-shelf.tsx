import { useRef, useState } from "react"
import { ShelfCard } from "../molecules/shelf-card"
import type { ShelfRow } from "../types"
import type { DetectedGame } from "@/features/game-scanner/types"

interface GamesShelfProps {
  rows: ShelfRow[]
  onSelectGame: (id: string) => void
  onAcceptSuggestion?: (game: DetectedGame) => void
  onRejectSuggestion?: (game: DetectedGame) => void
}

function ShelfRowSection({
  row,
  onSelectGame,
  onAcceptSuggestion,
  onRejectSuggestion,
}: {
  row: ShelfRow
  onSelectGame: (id: string) => void
  onAcceptSuggestion?: (game: DetectedGame) => void
  onRejectSuggestion?: (game: DetectedGame) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }

  const hasLocalGames = row.games.length > 0
  const hasCatalogGames = (row.catalogGames?.length ?? 0) > 0
  const totalItems = row.games.length + (row.catalogGames?.length ?? 0)

  if (totalItems === 0) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-white/35 flex items-center gap-1">
          {row.icon} {row.label}
        </span>
        <span className="text-[10px] text-white/10">{totalItems} game{totalItems !== 1 ? "s" : ""}</span>
      </div>

      <div className="relative">
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-8 z-10 pointer-events-none bg-gradient-to-r from-[rgba(10,10,15,0.9)] to-transparent" />
        )}

        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin snap-x snap-mandatory"
        >
          {row.games.map((game) => (
            <div key={game.id} className="snap-start">
              <ShelfCard
                game={game}
                onClick={onSelectGame}
                onAcceptSuggestion={onAcceptSuggestion}
                onRejectSuggestion={onRejectSuggestion}
              />
            </div>
          ))}
          {row.catalogGames?.map((catGame) => (
            <div key={catGame.id} className="snap-start">
              <ShelfCard catalogGame={catGame} onClick={() => {}} />
            </div>
          ))}
        </div>

        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-8 z-10 pointer-events-none bg-gradient-to-l from-[rgba(10,10,15,0.9)] to-transparent" />
        )}
      </div>
    </div>
  )
}

export function GamesShelf({ rows, onSelectGame, onAcceptSuggestion, onRejectSuggestion }: GamesShelfProps) {
  if (rows.length === 0) return null

  return (
    <div className="space-y-5">
      {rows.map((row) => (
        <ShelfRowSection
          key={row.id}
          row={row}
          onSelectGame={onSelectGame}
          onAcceptSuggestion={onAcceptSuggestion}
          onRejectSuggestion={onRejectSuggestion}
        />
      ))}
    </div>
  )
}
