import { useState, memo } from "react"
import { Check, X, Gamepad2, Star } from "lucide-react"
import type { DetectedGame } from "@/features/game-scanner/types"
import type { CatalogGame } from "../types"

interface ShelfCardProps {
  game?: DetectedGame
  catalogGame?: CatalogGame
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

function CardFallback({ title }: { title: string }) {
  const hue = getGameHue(title)
  return (
    <div
      className="w-full h-full"
      style={{
        background: `linear-gradient(135deg, oklch(0.2 0.06 ${hue}), oklch(0.15 0.04 ${(hue + 60) % 360}))`,
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-3xl font-black text-white/10">{title.charAt(0).toUpperCase()}</span>
      </div>
    </div>
  )
}

export const ShelfCard = memo(function ShelfCard({
  game,
  catalogGame,
  onClick,
  onAcceptSuggestion,
  onRejectSuggestion,
}: ShelfCardProps) {
  const [imgFailed, setImgFailed] = useState(false)

  const isLocal = !!game

  // ── Local game ──
  if (isLocal && game) {
    const isMatched = !!game.otixMediaId
    const hasSuggestion = !!game.otixMatchSuggestion
    const posterUrl = game.otixPosterUrl || game.posterUrl
    const title = game.otixMediaTitle || game.title

    return (
      <button
        type="button"
        onClick={() => !hasSuggestion && onClick(game.id)}
        className={`
          min-w-[110px] aspect-[2/3] rounded-xl overflow-hidden relative flex-shrink-0 group
          transition-all duration-200 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)]
          ${!isMatched && !hasSuggestion ? "opacity-35" : ""}
          ${hasSuggestion ? "ring-1 ring-blue-500/30" : ""}
        `}
      >
        {/* Image or fallback */}
        {posterUrl && !imgFailed ? (
          <img
            src={posterUrl}
            alt=""
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <CardFallback title={game.title} />
        )}

        {/* Suggestion badge */}
        {hasSuggestion && (
          <div className="absolute top-1.5 left-1.5 z-10">
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/80 text-white">
              {game.otixConfidence != null ? `${Math.round(game.otixConfidence * 100)}%` : "?"}
            </span>
          </div>
        )}

        {/* Matched dot */}
        {isMatched && (
          <div className="absolute top-1.5 right-1.5 z-10">
            <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-500/80 shadow-lg">
              <Check size={8} className="text-white" />
            </span>
          </div>
        )}

        {/* Bottom info */}
        <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/95 via-black/60 to-transparent">
          <div className="text-[11px] font-semibold text-white truncate">{title}</div>
          <div className="text-[9px] text-white/40 truncate mt-0.5">
            {isMatched ? "Installed" : hasSuggestion ? "Suggested" : game.platform === "iso" ? "Installable" : "Unmatched"}
          </div>
        </div>

        {/* Suggestion actions on hover */}
        {hasSuggestion && (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAcceptSuggestion?.(game) }}
              className="inline-flex items-center justify-center w-7 h-7 rounded bg-emerald-500 text-white hover:bg-emerald-400"
            >
              <Check size={12} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRejectSuggestion?.(game) }}
              className="inline-flex items-center justify-center w-7 h-7 rounded bg-white/10 text-white/70 hover:bg-white/20"
            >
              <X size={12} />
            </button>
          </div>
        )}
      </button>
    )
  }

  // ── Catalog game ──
  if (catalogGame) {
    const title = catalogGame.title
    const posterUrl = catalogGame.posterUrl
    const rating = catalogGame.avgRating

    return (
      <button
        type="button"
        // Navigate to media detail
        onClick={() => {
          window.location.href = `/media/game/${catalogGame.id}`
        }}
        className="
          min-w-[110px] aspect-[2/3] rounded-xl overflow-hidden relative flex-shrink-0 group
          transition-all duration-200 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)]
        "
      >
        {posterUrl && !imgFailed ? (
          <img
            src={posterUrl}
            alt=""
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <CardFallback title={title} />
        )}

        {rating != null && (
          <div className="absolute top-1.5 left-1.5 z-10">
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/80 text-white shadow-lg inline-flex items-center gap-0.5">
              <Star size={8} className="fill-current" /> {(rating * 10).toFixed(0)}
            </span>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/95 via-black/60 to-transparent">
          <div className="text-[11px] font-semibold text-white truncate">{title}</div>
          <div className="text-[9px] text-white/40 truncate mt-0.5">In Catalog</div>
        </div>

        <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none shadow-[inset_0_0_20px_rgba(16,185,129,0.15)]" />
      </button>
    )
  }

  return null
})
