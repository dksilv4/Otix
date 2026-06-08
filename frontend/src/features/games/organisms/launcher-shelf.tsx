/* ── LauncherShelf — shelf tab bar + poster card grid ── */

import { Gamepad2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DisplayGame } from '@/features/games/types'

export type ShelfTab = 'popular' | 'downloaded' | 'rated'

interface LauncherShelfProps {
  id?: string
  games: DisplayGame[]
  activeGameId: string | null
  shelfTab: ShelfTab
  onTabChange: (tab: ShelfTab) => void
  onSelectGame: (id: string) => void
}

const TAB_LABELS: Record<ShelfTab, string> = {
  popular: 'Popular',
  downloaded: 'Most Downloaded',
  rated: 'Top Rated',
}

export function LauncherShelf({ id, games, activeGameId, shelfTab, onTabChange, onSelectGame }: LauncherShelfProps) {
  return (
    <div id={id}>
      {/* ── Tab bar ── */}
      <div className="flex items-center justify-between pb-2.5 mb-5">
        <h3 className="text-sm font-black text-white/90 uppercase tracking-wider">
          {TAB_LABELS[shelfTab]}
        </h3>

        <div className="flex gap-6 items-center">
          {(Object.keys(TAB_LABELS) as ShelfTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={cn(
                "text-[11px] font-semibold transition-all cursor-pointer pb-0.5",
                shelfTab === tab
                  ? "text-white border-b border-white"
                  : "text-white/35 hover:text-white/60"
              )}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Poster cards ── */}
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none scroll-smooth snap-x">
        {games.map((game) => (
          <button
            key={`shelf-${game.id}`}
            onClick={() => onSelectGame(game.id)}
            className={cn(
              "w-[120px] aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer border shadow-md relative hover:scale-105 active:scale-95 transition-all duration-300 shrink-0 snap-start",
              game.id === activeGameId
                ? "border-white shadow-[0_0_12px_rgba(255,255,255,0.15)]"
                : "border-white/5 hover:border-white/20"
            )}
            title={game.title}
          >
            {game.posterUrl ? (
              <img
                src={game.posterUrl}
                alt={game.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-white/5">
                <Gamepad2 size={18} className="opacity-30"/>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
