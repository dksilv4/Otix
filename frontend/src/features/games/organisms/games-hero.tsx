import { useCallback } from "react"
import type { DetectedGame } from "@/features/game-scanner/types"

interface GamesHeroProps {
  game: DetectedGame | null
  onTogglePanel: () => void
  onPlay: (game: DetectedGame) => void
  onOpenFolder: (game: DetectedGame) => void
  onFavorite: (gameId: string) => void
  isFavorite: boolean
  onAcceptSuggestion?: (game: DetectedGame) => void
  onRejectSuggestion?: (game: DetectedGame) => void
  panelLabel: string
}

function getGameHue(title: string): number {
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash) % 360
}

function getGradient(game: DetectedGame | null): string {
  if (!game) return "linear-gradient(135deg, #1a1a2e, #0d0d1a)"
  const hue = getGameHue(game.title)
  return `linear-gradient(135deg, oklch(0.2 0.06 ${hue}), oklch(0.15 0.04 ${(hue + 60) % 360}))`
}

export function GamesHero({
  game,
  onTogglePanel,
  onPlay,
  onOpenFolder,
  onFavorite,
  isFavorite,
  onAcceptSuggestion,
  onRejectSuggestion,
  panelLabel,
}: GamesHeroProps) {
  const handlePlay = useCallback(() => { if (game) onPlay(game) }, [game, onPlay])
  const handleOpenFolder = useCallback(() => { if (game) onOpenFolder(game) }, [game, onOpenFolder])
  const handleFavorite = useCallback(() => { if (game) onFavorite(game.id) }, [game, onFavorite])
  const handleAccept = useCallback(() => { if (game && onAcceptSuggestion) onAcceptSuggestion(game) }, [game, onAcceptSuggestion])
  const handleReject = useCallback(() => { if (game && onRejectSuggestion) onRejectSuggestion(game) }, [game, onRejectSuggestion])

  if (!game) {
    return (
      <div className="flex-1 rounded-2xl bg-[var(--dk-surface-base)] flex items-center justify-center min-h-[180px]">
        <p className="text-sm text-muted-foreground">No games found. Add folders and scan.</p>
      </div>
    )
  }

  const isMatched = !!game.otixMediaId
  const hasSuggestion = !!game.otixMatchSuggestion
  const posterUrl = game.otixPosterUrl || game.posterUrl || game.iconUrl
  const installDir = game.installDir.split(/[\/]/).slice(-2).join(" / ")

  return (
    <div className="flex-1 rounded-2xl overflow-hidden relative min-h-[180px]" style={{ background: getGradient(game) }}>
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

      {/* Browse button */}
      <button
        onClick={onTogglePanel}
        className="absolute top-4 left-4 z-10 inline-flex items-center gap-2 rounded-xl bg-black/40 backdrop-blur-md px-3 py-2 text-xs font-medium text-white/70 hover:text-white hover:bg-black/50 transition-all active:scale-[0.97]"
      >
        ☰ <span className="font-normal">{panelLabel}</span>
      </button>

      {/* Match suggestion badge */}
      {hasSuggestion && (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 rounded-xl bg-blue-500/20 backdrop-blur-md px-3 py-1.5">
          <span className="text-[10px] font-semibold text-blue-400">
            {game.otixConfidence != null ? `${Math.round(game.otixConfidence * 100)}%` : "?"} match
          </span>
        </div>
      )}

      <div className="relative z-10 p-6 lg:p-7 flex gap-5 items-end">
        {/* Poster */}
        <div className="w-[72px] h-[108px] lg:w-[80px] lg:h-[120px] rounded-xl flex-shrink-0 overflow-hidden bg-white/5 shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
          {posterUrl ? (
            <img src={posterUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl opacity-20">🎮</div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-white/30 font-medium">
            {game.platform === "steam" ? "Steam" : game.platform === "gog" ? "GOG" : game.platform === "epic" ? "Epic Games" : game.platform === "iso" ? "ISO Disc" : "PC"}
          </div>
          <h2 className="text-lg lg:text-xl font-extrabold text-white mt-0.5 leading-tight tracking-tight">
            {game.otixMediaTitle || game.title}
          </h2>

          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400">
              {game.platform === "steam" ? "Steam" : game.platform === "gog" ? "GOG" : game.platform === "epic" ? "Epic" : game.platform === "iso" ? "ISO" : "PC"}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] text-white/40 bg-white/5">{installDir}</span>
          </div>

          {/* Suggestion callout */}
          {hasSuggestion && (
            <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
              <span className="text-[11px] text-blue-400 font-medium">
                Match with <strong>{game.otixMatchSuggestion!.title}</strong>?
              </span>
              <button onClick={handleAccept} className="text-[10px] px-2 py-0.5 rounded bg-blue-500 text-white font-semibold hover:bg-blue-400">Yes</button>
              <button onClick={handleReject} className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-white/60 hover:bg-white/20">No</button>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {isMatched ? (
              <>
                <button onClick={handlePlay} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-emerald-400 active:scale-[0.97] transition-all">▶ Play Now</button>
                <button onClick={handleOpenFolder} className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-white/60 hover:bg-white/10 active:scale-[0.97] transition-all">📁 Open Folder</button>
                <button onClick={handleFavorite} className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-white/60 hover:bg-amber-400/20 hover:text-amber-400 active:scale-[0.97] transition-all">{isFavorite ? "★" : "☆"}</button>
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">● installed</span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-white/30">○ Not matched to catalog yet</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
