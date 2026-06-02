import type { DetectedGame } from "@/features/game-scanner/types"

interface ShelfCardProps {
  game: DetectedGame
  onClick: (id: string) => void
  onAcceptSuggestion?: (game: DetectedGame) => void
  onRejectSuggestion?: (game: DetectedGame) => void
}

function getGameHue(title: string): number {
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash) % 360
}

export function ShelfCard({ game, onClick, onAcceptSuggestion, onRejectSuggestion }: ShelfCardProps) {
  const isMatched = !!game.otixMediaId
  const hasSuggestion = !!game.otixMatchSuggestion
  const posterUrl = game.otixPosterUrl || game.posterUrl

  return (
    <button
      onClick={() => !hasSuggestion && onClick(game.id)}
      className={`
        min-w-[110px] aspect-[2/3] rounded-xl overflow-hidden relative flex-shrink-0
        transition-all duration-200 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)]
        ${!isMatched && !hasSuggestion ? "opacity-35" : ""}
        ${hasSuggestion ? "ring-1 ring-blue-500/30" : ""}
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

      {/* Suggestion badge */}
      {hasSuggestion && (
        <div className="absolute top-1.5 left-1.5 right-1.5 z-10 flex items-center justify-between gap-1">
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/80 text-white">
            {game.otixConfidence != null ? `${Math.round(game.otixConfidence * 100)}%` : "?"}
          </span>
        </div>
      )}

      {/* Bottom gradient + info */}
      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/95 via-black/60 to-transparent">
        <div className="text-[11px] font-semibold text-white truncate">{game.title}</div>
        <div className="text-[9px] text-white/40 truncate mt-0.5">
          {isMatched ? "Installed" : hasSuggestion ? "Suggestion" : game.platform === "iso" ? "Installable" : "Unmatched"}
        </div>
      </div>

      {/* Suggestion actions on hover */}
      {hasSuggestion && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-black/60 backdrop-blur-sm opacity-0 hover:opacity-100 transition-opacity">
          <span
            onClick={(e) => { e.stopPropagation(); onAcceptSuggestion?.(game) }}
            className="text-[10px] px-2 py-1 rounded bg-emerald-500 text-white font-semibold cursor-pointer hover:bg-emerald-400"
          >
            ✓
          </span>
          <span
            onClick={(e) => { e.stopPropagation(); onRejectSuggestion?.(game) }}
            className="text-[10px] px-2 py-1 rounded bg-white/10 text-white/70 cursor-pointer hover:bg-white/20"
          >
            ✕
          </span>
        </div>
      )}
    </button>
  )
}
