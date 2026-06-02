import type { DetectedGame } from "@/features/game-scanner/types"

interface ShelfCardProps {
  game: DetectedGame
  onClick: (id: string) => void
}

function getGameHue(title: string): number {
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash) % 360
}

export function ShelfCard({ game, onClick }: ShelfCardProps) {
  const isMatched = !!game.otixMediaId
  const posterUrl = game.otixPosterUrl || game.posterUrl

  return (
    <button
      onClick={() => onClick(game.id)}
      className={`
        min-w-[110px] aspect-[2/3] rounded-xl overflow-hidden relative flex-shrink-0
        transition-all duration-200 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)]
        ${!isMatched ? "opacity-35" : ""}
      `}
    >
      {posterUrl ? (
        <img src={posterUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div
          className="w-full h-full"
          style={{
            background: `linear-gradient(135deg, oklch(0.2 0.06 ${getGameHue(game.title)}), oklch(0.15 0.04 ${(getGameHue(game.title) + 60) % 360}))`,
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center text-3xl opacity-10">🎮</div>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/95 via-black/60 to-transparent">
        <div className="text-[11px] font-semibold text-white truncate">{game.title}</div>
        <div className="text-[9px] text-white/40 truncate mt-0.5">
          {game.platform === "iso" ? "Installable" : "Installed"}
        </div>
      </div>
    </button>
  )
}
