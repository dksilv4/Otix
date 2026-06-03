import { useCallback, useState } from "react"
import { Play, Folder, Check, X, Menu, Gamepad2, Star, ExternalLink } from "lucide-react"
import type { DetectedGame } from "@/features/game-scanner/types"

interface GamesHeroProps {
  game: (DetectedGame & {
    backdropUrl?: string | null
    overview?: string | null
    genres?: { id: string; name: string; slug: string }[]
    avgRating?: number | null
    releaseDate?: string | null
    isFree?: boolean
  }) | null
  onPlay: (game: DetectedGame) => void
  onOpenFolder: (game: DetectedGame) => void
  onAcceptSuggestion?: (game: DetectedGame) => void
  onRejectSuggestion?: (game: DetectedGame) => void
  onTogglePanel: () => void
  sidePanelOpen: boolean
}

function getGameHue(title: string): number {
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash) % 360
}

function getGradient(title: string): string {
  const hue = getGameHue(title)
  return `linear-gradient(135deg, oklch(0.2 0.06 ${hue}), oklch(0.15 0.04 ${(hue + 60) % 360}))`
}

function getPlatformIcon(platform: string): string {
  switch (platform) {
    case "steam": return "Steam"
    case "gog": return "GOG"
    case "epic": return "Epic"
    case "iso": return "ISO"
    default: return "PC"
  }
}

export function GamesHero({
  game,
  onPlay,
  onOpenFolder,
  onAcceptSuggestion,
  onRejectSuggestion,
  onTogglePanel,
  sidePanelOpen,
}: GamesHeroProps) {
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)

  const handlePlay = useCallback(() => { if (game) onPlay(game) }, [game, onPlay])
  const handleOpenFolder = useCallback(() => { if (game) onOpenFolder(game) }, [game, onOpenFolder])
  const handleAccept = useCallback(() => { if (game && onAcceptSuggestion) onAcceptSuggestion(game) }, [game, onAcceptSuggestion])
  const handleReject = useCallback(() => { if (game && onRejectSuggestion) onRejectSuggestion(game) }, [game, onRejectSuggestion])

  // ── Loading ──
  if (!game) {
    return (
      <div className="flex-1 rounded-2xl bg-[var(--dk-surface-base)] flex flex-col items-center justify-center min-h-[280px] gap-3">
        <Gamepad2 size={40} className="opacity-15" />
        <p className="text-sm text-muted-foreground">No games found</p>
        <p className="text-xs text-muted-foreground/50 max-w-[240px] text-center leading-relaxed">
          Add game folders in Settings → Scanners and run a scan to populate your library.
        </p>
      </div>
    )
  }

  const isMatched = !!game.otixMediaId
  const hasSuggestion = !!game.otixMatchSuggestion
  const posterUrl = game.otixPosterUrl || game.posterUrl || game.iconUrl
  const installDir = game.installDir.split(/[\/]/).slice(-2).join(" / ")

  const heroBg = getGradient(game.title)

  return (
    <div className="flex-1 rounded-2xl overflow-hidden relative min-h-[280px]" style={{ background: heroBg }}>
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

      {/* Panel toggle */}
      <button
        type="button"
        onClick={onTogglePanel}
        className="absolute top-4 left-4 z-10 inline-flex items-center gap-2 rounded-xl bg-black/40 backdrop-blur-md px-3 py-2 text-xs font-medium text-white/70 hover:text-white hover:bg-black/50 transition-all active:scale-[0.97]"
      >
        {sidePanelOpen ? <X size={14} /> : <Menu size={14} />}
        <span className="font-normal max-w-[100px] truncate">{game.otixMediaTitle || game.title}</span>
      </button>

      {/* Suggestion badge */}
      {hasSuggestion && (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 rounded-xl bg-blue-500/20 backdrop-blur-md px-3 py-1.5">
          <span className="text-[11px] font-semibold text-blue-400">
            {game.otixConfidence != null ? `${Math.round(game.otixConfidence * 100)}%` : "?"} match
          </span>
        </div>
      )}

      <div className="relative z-10 h-full flex items-end p-5 lg:p-6">
        <div className="flex gap-4 lg:gap-5 items-end w-full">
          {/* Poster */}
          <div className="w-[80px] h-[120px] lg:w-[96px] lg:h-[144px] rounded-xl flex-shrink-0 overflow-hidden bg-white/5 shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
            {posterUrl && !imgFailed ? (
              <>
                {!imgLoaded && <div className="w-full h-full animate-pulse bg-white/10" />}
                <img
                  src={posterUrl}
                  alt=""
                  onLoad={() => setImgLoaded(true)}
                  onError={() => setImgFailed(true)}
                  className={`w-full h-full object-cover transition-opacity duration-500 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
                />
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center opacity-20">
                <Gamepad2 size={32} />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Header line */}
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/30 font-medium flex-wrap">
              <span>{getPlatformIcon(game.platform)}</span>
              {game.releaseDate && (
                <><span className="opacity-30">·</span><span>{game.releaseDate.slice(0, 4)}</span></>
              )}
              {game.isFree && (
                <span className="text-green-400 font-bold">Free</span>
              )}
            </div>

            {/* Title */}
            <h2 className="text-xl lg:text-2xl font-extrabold text-white leading-tight tracking-tight">
              {game.otixMediaTitle || game.title}
            </h2>

            {/* Metadata */}
            <div className="flex flex-wrap items-center gap-2">
              {game.avgRating != null && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/12 text-amber-400">
                  <Star size={10} className="fill-current" /> {(game.avgRating * 10).toFixed(0)}
                  <span className="text-amber-400/40 font-normal">/100</span>
                </span>
              )}
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] text-white/40 bg-white/5">
                {installDir}
              </span>
            </div>

            {/* Genres */}
            {game.genres && game.genres.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {game.genres.slice(0, 4).map((g) => (
                  <span key={g.id} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/8 text-white/45 border border-white/5">
                    {g.name}
                  </span>
                ))}
              </div>
            )}

            {/* Overview */}
            {game.overview && (
              <p className="text-xs text-white/50 leading-relaxed line-clamp-2 max-w-[480px]">{game.overview}</p>
            )}

            {/* Suggestion callout */}
            {hasSuggestion && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/8 border border-blue-500/15">
                <span className="text-xs text-blue-400 font-medium">
                  Match with <strong>{game.otixMatchSuggestion!.title}</strong>?
                </span>
                <div className="flex gap-1 ml-auto">
                  <button
                    type="button"
                    onClick={handleAccept}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-400 active:scale-[0.97]"
                  >
                    <Check size={10} /> Yes
                  </button>
                  <button
                    type="button"
                    onClick={handleReject}
                    className="inline-flex items-center gap-1 rounded-md bg-white/8 px-2.5 py-1 text-[11px] text-white/60 hover:bg-white/15 active:scale-[0.97]"
                  >
                    <X size={10} /> No
                  </button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {isMatched ? (
                <>
                  <button
                    type="button"
                    onClick={handlePlay}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-emerald-400 active:scale-[0.97] transition-all"
                  >
                    <Play size={14} fill="currentColor" /> Play Now
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenFolder}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-2 text-xs font-medium text-white/60 hover:bg-white/12 active:scale-[0.97] transition-all"
                  >
                    <Folder size={12} /> Open Folder
                  </button>
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400/70">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60" />
                    installed
                  </span>
                </>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-white/30 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                  Not matched to catalog yet
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
