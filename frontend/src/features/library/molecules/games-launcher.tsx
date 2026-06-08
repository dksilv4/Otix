import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import {
  Search, Play, Download, Gamepad2, X, RefreshCw,
  ExternalLink, Star, Check, Folder, Circle, Disc,
} from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { cn } from "@/lib/utils"
import { getDesktopAPI, hasDesktopAPI } from "@/lib/desktop-api"
import { useGames, useRejectSuggestion } from "@/features/game-scanner/game-queries"
import { useMatchLocalGames } from "@/features/game-scanner/queries"
import { useGameDetail, usePopularGames } from "@/features/games/games-queries"
import { MediaCard } from "@ui/molecules/media-card"
import { MediaGrid } from "@ui/molecules/media-grid"
import { IsoInstallerModal } from "@/features/game-scanner/organisms/iso-installer-modal"
import type { LocalGame } from "@/features/game-scanner/types"
import type { CatalogGameDetail } from "@/features/games/types"

// ── CSS for hero background animation ─────────────────────────────

const heroBgStyleId = "game-hero-bg-anim"
if (typeof document !== "undefined" && !document.getElementById(heroBgStyleId)) {
  const style = document.createElement("style")
  style.id = heroBgStyleId
  style.textContent = `
    @keyframes hero-breath {
      0%, 100% { opacity: 0.4; transform: scale(1) translate(0, 0); }
      25% { opacity: 0.6; transform: scale(1.05) translate(2%, -1%); }
      50% { opacity: 0.3; transform: scale(0.95) translate(-1%, 1%); }
      75% { opacity: 0.5; transform: scale(1.02) translate(1%, -2%); }
    }
    @keyframes hero-shimmer {
      0% { transform: translateX(-100%) skewX(-15deg); }
      100% { transform: translateX(300%) skewX(-15deg); }
    }
  `
  document.head.appendChild(style)
}

// ── Constants ──────────────────────────────────────────────────────

type GamesTab = "all" | "matched" | "unmatched"

const TAB_DEFS: Array<{ id: GamesTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "matched", label: "Matched" },
  { id: "unmatched", label: "Unmatched" },
]

const PLATFORM_LABELS: Record<string, string> = {
  steam: "Steam",
  gog: "GOG",
  epic: "Epic Games",
  iso: "ISO",
  battlenet: "Battle.net",
  ubisoft: "Ubisoft",
  ea: "EA App",
  xbox: "Xbox",
  riot: "Riot",
  itch: "itch.io",
}

// ── Platform detection ─────────────────────────────────────────────

function detectPlatform(): "windows" | "mac" | "linux" {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes("win")) return "windows"
  if (ua.includes("mac")) return "mac"
  return "linux"
}

function isSuitable(game: LocalGame): boolean {
  if (game.platform === "steam" || game.platform === "gog") return true
  if (game.sources?.includes("iso") || game.platform === "iso") return detectPlatform() === "windows"
  if (game.exePath.endsWith(".exe")) return detectPlatform() === "windows"
  return true
}

// ── Gradient helpers ───────────────────────────────────────────────

function gameHue(title: string): number {
  let h = 0
  for (let i = 0; i < title.length; i++) h = title.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h) % 360
}

function gameGradient(title: string): string {
  const h = gameHue(title)
  return `linear-gradient(135deg, oklch(0.22 0.07 ${h}), oklch(0.14 0.04 ${(h + 60) % 360}))`
}

function gameGradientDark(title: string): string {
  const h = gameHue(title)
  const h2 = (h + 60) % 360
  const h3 = (h + 120) % 360
  return `linear-gradient(135deg, oklch(0.18 0.06 ${h}) 0%, oklch(0.13 0.04 ${h2}) 50%, oklch(0.1 0.03 ${h3}) 100%)`
}

// ── Rich hero background — gradient base + radial accent ───────────

function heroBackground(title: string, backdropUrl?: string | null): React.CSSProperties {
  if (backdropUrl) {
    return {
      background: `linear-gradient(to top, rgba(8,8,18,0.97) 0%, rgba(8,8,18,0.55) 45%, rgba(8,8,18,0.1) 100%), url(${backdropUrl}) center / cover`,
    }
  }
  const h = gameHue(title)
  return {
    background: [
      `radial-gradient(ellipse 80% 60% at 30% 20%, oklch(0.3 0.08 ${h} / 0.15) 0%, transparent 100%)`,
      `radial-gradient(ellipse 60% 50% at 70% 80%, oklch(0.3 0.08 ${(h + 120) % 360} / 0.1) 0%, transparent 100%)`,
      `linear-gradient(135deg, oklch(0.18 0.06 ${h}) 0%, oklch(0.13 0.04 ${(h + 60) % 360}) 50%, oklch(0.1 0.03 ${(h + 120) % 360}) 100%)`,
    ].join(", "),
  }
}

// ── Game card (for local detected game) ───────────────────────────

function GameCard({
  game,
  isSelected,
  onSelect,
}: {
  game: LocalGame
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)

  const isIso = game.sources?.includes("iso") || game.platform === "iso"
  const isMatched = !!game.data?.id && !isIso
  const hasSuggestion = !!game.matchSuggestion
  const isMatchedIso = !!game.data?.id && isIso
  const suitable = isSuitable(game)
  const title = game.data?.title || game.title
  const img = game.data?.posterUrl || game.posterUrl || game.iconUrl

  const badge = isMatched && suitable
    ? { label: "Play", color: "bg-emerald-500/90 text-white", icon: <Play size={9} fill="currentColor" /> }
    : isIso && suitable
      ? { label: "Install", color: "bg-blue-500/90 text-white", icon: <Download size={9} /> }
      : hasSuggestion
        ? { label: `${game.data?.confidence != null ? Math.round(game.data?.confidence * 100) : "?"}%`, color: "bg-blue-500/80 text-white", icon: null }
        : null

  return (
    <button
      type="button"
      onClick={() => onSelect(game.id)}
      className={cn(
        "group relative rounded-xl overflow-hidden aspect-[2/3]",
        "transition-all duration-200",
        "hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)]",
        isSelected && "ring-2 ring-emerald-500/50 ring-offset-2 ring-offset-[var(--dk-surface-root)]",
        !isMatched && !hasSuggestion && !isMatchedIso ? "opacity-50 grayscale-[30%]" : "",
      )}
    >
      {/* Poster image or fallback gradient */}
      {img && !imgFailed ? (
        <div className="relative w-full h-full">
          {!imgLoaded && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: gameGradient(title) }}
            >
              <Gamepad2 size={28} className="opacity-15" />
            </div>
          )}
          <img
            src={img}
            alt=""
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgFailed(true)}
            className={cn(
              "w-full h-full object-cover transition-opacity duration-500",
              imgLoaded ? "opacity-100" : "opacity-0",
            )}
          />
        </div>
      ) : (
        <div
          className="w-full h-full flex flex-col items-center justify-center gap-1"
          style={{ background: gameGradient(title) }}
        >
          <Gamepad2 size={28} className="opacity-20" />
          <span className="text-2xl font-black text-white/10">{title.charAt(0).toUpperCase()}</span>
        </div>
      )}

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute inset-0 ring-1 ring-inset ring-emerald-500/30 rounded-xl pointer-events-none" />
      )}

      {/* Badge */}
      {badge && (
        <div className="absolute top-2 left-2 z-10">
          <span className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold shadow-lg backdrop-blur-sm",
            badge.color,
          )}>
            {badge.icon}
            {badge.label}
          </span>
        </div>
      )}

      {/* Matched dot */}
      {(isMatched || isMatchedIso) && !badge && (
        <div className="absolute top-2 right-2 z-10">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/70 shadow-lg">
            <Check size={9} className="text-white" />
          </span>
        </div>
      )}

      {/* Suggestion dot */}
      {hasSuggestion && (
        <div className="absolute top-2 right-2 z-10">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500/70 shadow-lg">
            <Circle size={7} className="fill-white text-white" />
          </span>
        </div>
      )}

      {/* Bottom gradient + info */}
      <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/95 via-black/60 to-transparent pt-8">
        <p className="text-xs font-semibold text-white truncate leading-tight">{title}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[10px] text-white/40 uppercase">{PLATFORM_LABELS[game.platform] || game.platform}</span>
          {isMatched && <span className="w-1 h-1 rounded-full bg-emerald-400/60" />}
          {isMatched && <span className="text-[9px] text-emerald-400/60">Installed</span>}
          {isMatchedIso && <span className="w-1 h-1 rounded-full bg-amber-400/60" />}
          {isMatchedIso && <span className="text-[9px] text-amber-400/60">Available</span>}
        </div>
      </div>
    </button>
  )
}

// ── Hero Section ────────────────────────────────────────────────────

function HeroSection({
  game,
  detail,
  onPlay,
  onOpenFolder,
  onInstall,
  onAcceptSuggestion,
  onRejectSuggestion,
  onViewDetails,
}: {
  game: LocalGame
  detail?: CatalogGameDetail | null
  onPlay: (game: LocalGame) => void
  onOpenFolder: (game: LocalGame) => void
  onInstall?: (game: LocalGame) => void
  onAcceptSuggestion?: (game: LocalGame) => void
  onRejectSuggestion?: (game: LocalGame) => void
  onViewDetails: (id: string) => void
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)

  const isIso = game.sources?.includes("iso") || game.platform === "iso"
  const isMatched = !!game.data?.id
  const hasSuggestion = !!game.matchSuggestion
  const suitable = isSuitable(game)
  const title = game.data?.title || game.title

  console.log("[Hero] render", title, { isMatched, isIso, hasSuggestion, suitable, otixMediaId: game.data?.id, platform: game.platform })

  const posterUrl = detail?.textlessPosterUrl ?? detail?.posterUrl ?? game.data?.posterUrl ?? game.posterUrl
  const backdropUrl = detail?.backdropUrl
  const logoUrl = detail?.logoUrl
  const installDir = game.installDir.split(/[/\\]/).slice(-2).join(" / ")

  return (
    <div
      className="relative rounded-2xl overflow-hidden min-h-[240px] lg:min-h-[280px] bg-[var(--dk-surface-base)] shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
      style={{
        background: backdropUrl
          ? `linear-gradient(to top, rgba(8,8,18,0.97) 0%, rgba(8,8,18,0.55) 45%, rgba(8,8,18,0.1) 100%), url(${backdropUrl}) center / cover`
          : [
              `radial-gradient(ellipse 80% 60% at 30% 20%, oklch(0.3 0.08 ${gameHue(title)} / 0.15) 0%, transparent 100%)`,
              `radial-gradient(ellipse 60% 50% at 70% 80%, oklch(0.3 0.08 ${(gameHue(title) + 120) % 360} / 0.1) 0%, transparent 100%)`,
              `linear-gradient(135deg, oklch(0.18 0.06 ${gameHue(title)}) 0%, oklch(0.13 0.04 ${(gameHue(title) + 60) % 360}) 50%, oklch(0.1 0.03 ${(gameHue(title) + 120) % 360}) 100%)`,
            ].join(", "),
      }}
    >
      {/* Subtle overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

      {/* Animated ambient glow */}
      {!backdropUrl && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 50% 40% at 50% 50%, oklch(0.4 0.12 ${gameHue(title)} / 0.12) 0%, transparent 100%)`,
            animation: "hero-breath 8s ease-in-out infinite",
          }}
        />
      )}

      {/* Subtle shimmer sweep */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.015) 50%, transparent 100%)`,
          animation: "hero-shimmer 6s ease-in-out infinite",
          animationDelay: "2s",
        }}
      />

      {/* Decorative game logo overlay (faint, large) */}
      {logoUrl && !logoFailed && (
        <div className="absolute -right-8 top-1/2 -translate-y-1/2 w-[320px] h-[320px] opacity-[0.06] pointer-events-none hidden lg:block">
          <img
            src={logoUrl}
            alt=""
            onError={() => setLogoFailed(true)}
            className="w-full h-full object-contain"
          />
        </div>
      )}

      <div className="relative z-10 flex flex-col h-full min-h-[240px] lg:min-h-[280px]">
        {/* Top bar */}
        <div className="flex items-center gap-3 p-4 lg:p-5 text-[11px] uppercase tracking-widest font-medium flex-wrap">
            <span className="px-2.5 py-0.5 rounded-lg bg-white/10 text-white/60 backdrop-blur-sm">
              {PLATFORM_LABELS[game.platform] || game.platform}
            </span>
            {detail?.releaseDate && (
              <span className="text-white/40">{detail.releaseDate.slice(0, 4)}</span>
            )}
            {isMatched && !isIso && suitable && (
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                Installed
              </span>
            )}
            {isIso && suitable && (
              <span className="flex items-center gap-1 text-blue-400">
                <Download size={11} />
                Available
              </span>
            )}
            {!suitable && (
              <span className="text-amber-400">Unsupported</span>
            )}
            {detail?.releaseStatus && detail.releaseStatus !== "released" && (
              <span className="text-blue-400 font-bold">{detail.releaseStatus}</span>
            )}
            {detail?.isFree && (
              <span className="text-green-400 font-bold">Free</span>
            )}
          </div>

        {/* Main content */}
        <div className="flex-1 flex items-end p-4 lg:p-6">
          <div className="flex gap-4 lg:gap-5 items-end w-full">
            {/* Poster */}
            <div className="hidden sm:block w-[120px] h-[180px] lg:w-[150px] lg:h-[225px] rounded-xl overflow-hidden flex-shrink-0 shadow-[0_8px_32px_rgba(0,0,0,0.6)] bg-white/5 ring-1 ring-white/[0.06]">
              {posterUrl && !imgFailed ? (
                <>
                  {!imgLoaded && <div className="w-full h-full animate-pulse bg-white/10" />}
                  <img
                    src={posterUrl}
                    alt=""
                    onLoad={() => setImgLoaded(true)}
                    onError={() => setImgFailed(true)}
                    className={cn(
                      "w-full h-full object-cover transition-opacity duration-500",
                      imgLoaded ? "opacity-100" : "opacity-0",
                    )}
                  />
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center opacity-20">
                  <Gamepad2 size={36} />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-2.5">
              {/* Match suggestion label */}
              {hasSuggestion && (
                <div className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/15 backdrop-blur-sm px-2.5 py-1">
                  <span className="text-[11px] font-semibold text-blue-400">
                    {game.data?.confidence != null ? `${Math.round(game.data?.confidence * 100)}%` : "?"} match suggested
                  </span>
                </div>
              )}

              {/* Title */}
              <h2 className="text-2xl lg:text-3xl font-extrabold text-white leading-tight tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
                {title}
              </h2>

              {/* Metadata row */}
              <div className="flex flex-wrap items-center gap-2.5">
                {detail?.avgRating != null && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/12 px-2 py-0.5 text-xs font-bold text-amber-400">
                    <Star size={11} className="fill-current" />
                    {(detail.avgRating * 10).toFixed(0)}
                    <span className="text-amber-400/40 font-normal">/100</span>
                    {detail.ratingCount > 0 && (
                      <span className="text-amber-400/30 font-normal ml-0.5">({detail.ratingCount})</span>
                    )}
                  </span>
                )}
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs text-white/40 bg-white/[0.06]">
                  <Folder size={10} className="mr-1.5 opacity-50" />
                  {installDir}
                </span>
              </div>

              {/* Genres */}
              {detail?.genres && detail.genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {detail.genres.slice(0, 6).map((g) => (
                    <span
                      key={g.id}
                      className="text-[11px] font-medium px-3 py-0.5 rounded-full bg-white/[0.06] text-white/50 border border-white/[0.06] backdrop-blur-sm"
                    >
                      {g.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Developer / Publisher + Game modes */}
              {(detail?.involvedCompanies?.length > 0 || detail?.gameModes?.length > 0) && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-white/40">
                  {detail.involvedCompanies && detail.involvedCompanies.length > 0 && (
                    <span>
                      {detail.involvedCompanies.filter((c) => c.developer).slice(0, 2).map((c) => c.company.name).join(" & ")}
                      {detail.involvedCompanies.some((c) => c.publisher) && (
                        <> · Published by {detail.involvedCompanies.filter((c) => c.publisher).slice(0, 2).map((c) => c.company.name).join(" & ")}</>
                      )}
                    </span>
                  )}
                  {detail.gameModes && detail.gameModes.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      {detail.involvedCompanies?.length > 0 && <span className="opacity-30">·</span>}
                      {detail.gameModes.slice(0, 3).map((m) => m.gameMode.name).join(", ")}
                    </span>
                  )}
                  {detail?.hasMultiplayer && (
                    <>
                      <span className="opacity-30">·</span>
                      <span className="text-blue-400/60 font-medium">Multiplayer</span>
                    </>
                  )}
                </div>
              )}

              {/* Steam link */}
              {detail?.steamAppId && (
                <div className="flex items-center gap-1.5">
                  <a
                    href={`https://store.steampowered.com/app/${detail.steamAppId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-white/40 hover:text-white/70 bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 opacity-60">
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 1.8.6 3.45 1.61 4.77l2.14-.88a1.75 1.75 0 0 1-.28-.55l-.06-.22-2.1.86A6.5 6.5 0 0 1 8 1.5c3.59 0 6.5 2.91 6.5 6.5s-2.91 6.5-6.5 6.5a6.47 6.47 0 0 1-4.27-1.58l-.08.04-.03-.02 1.13-.47a5.5 5.5 0 1 0 5.13-9.87 5.5 5.5 0 0 0-3.8.07l-1.26-.51A6.98 6.98 0 0 1 8 0Z" />
                    </svg>
                    Steam
                  </a>
                </div>
              )}

              {/* Overview */}
              {detail?.overview && (
                <p className="text-sm text-white/45 leading-relaxed line-clamp-2 max-w-[640px]">
                  {detail.overview}
                </p>
              )}

              {/* Match suggestion callout */}
              {hasSuggestion && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-500/8 border border-blue-500/15">
                  <span className="text-sm text-blue-400 font-medium">
                    Match with <strong>{game.matchSuggestion!.title}</strong>?
                    {game.data?.confidence != null && (
                      <span className="ml-1.5 text-blue-400/60">({Math.round(game.data?.confidence * 100)}%)</span>
                    )}
                  </span>
                  <div className="flex gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => onAcceptSuggestion?.(game)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-400 active:scale-[0.97] transition-all"
                    >
                      <Check size={13} /> Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => onRejectSuggestion?.(game)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white/8 px-4 py-1.5 text-xs text-white/50 hover:bg-white/15 active:scale-[0.97] transition-all"
                    >
                      <X size={13} /> Reject
                    </button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                {isMatched && !isIso && suitable ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onPlay(game)}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_4px_16px_rgba(16,185,129,0.25)] hover:bg-emerald-400 hover:shadow-[0_4px_20px_rgba(16,185,129,0.35)] active:scale-[0.97] transition-all"
                    >
                      <Play size={15} fill="currentColor" /> Play Now
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenFolder(game)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-medium text-white/50 hover:bg-white/15 hover:text-white/70 active:scale-[0.97] transition-all backdrop-blur-sm"
                    >
                      <Folder size={13} /> Open Folder
                    </button>
                  </>
                ) : isIso && suitable ? (
                  <button
                    type="button"
                    onClick={() => onInstall?.(game)}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-6 py-2.5 text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_4px_16px_rgba(59,130,246,0.25)] hover:bg-blue-400 hover:shadow-[0_4px_20px_rgba(59,130,246,0.35)] active:scale-[0.97] transition-all"
                  >
                    <Download size={15} /> Install
                  </button>
                ) : hasSuggestion ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-white/30 py-2 px-1">
                    <span className="w-2 h-2 rounded-full bg-blue-400/50" /> Needs match confirmation
                  </span>
                ) : isMatched ? null : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-white/30 py-2 px-1">
                    <span className="w-2 h-2 rounded-full bg-white/20" /> No match found
                  </span>
                )}

                {isMatched && (
                  <button
                    type="button"
                    onClick={() => onViewDetails(game.data?.id!)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-white/8 px-4 py-2.5 text-xs font-medium text-white/40 hover:bg-white/12 hover:text-white/70 active:scale-[0.97] transition-all backdrop-blur-sm"
                  >
                    <ExternalLink size={12} /> Details
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Empty hero (when no game at all) ──────────────────────────────

function EmptyHero() {
  return (
    <div className="relative rounded-2xl overflow-hidden min-h-[240px] bg-[var(--dk-surface-base)] flex flex-col items-center justify-center gap-3">
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)]">
        <Gamepad2 size={32} className="opacity-30" />
      </div>
      <p className="text-sm font-semibold text-muted-foreground">No games in your library yet</p>
      <p className="text-xs text-muted-foreground/60 max-w-[260px] text-center leading-relaxed">
        Add game folders in Settings → Scanners and run a scan to populate your game library.
      </p>
    </div>
  )
}

// ── Shelf row (local game, horizontal scroll) ────────────────────

function LocalShelfRow({
  label,
  icon,
  items,
  onSelect,
}: {
  label: string
  icon: React.ReactNode
  items: LocalGame[]
  onSelect: (id: string) => void
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

  useEffect(() => {
    checkScroll()
  }, [items])

  if (items.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-xs font-semibold text-white/30 flex items-center gap-1.5 tracking-wide">
          {icon}
          {label}
        </span>
        <span className="text-[10px] text-white/10">· {items.length}</span>
      </div>

      <div className="relative">
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-8 z-10 pointer-events-none bg-gradient-to-r from-[var(--dk-surface-root)] to-transparent" />
        )}
        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin snap-x snap-mandatory"
        >
          {items.map((game) => {
            const isMatched = !!game.data?.id
            const hasSuggestion = !!game.matchSuggestion
            const title = game.data?.title || game.title
            const img = game.data?.posterUrl || game.posterUrl || game.iconUrl
            return (
              <button
                key={game.id}
                type="button"
                onClick={() => onSelect(game.id)}
                className={cn(
                  "min-w-[105px] w-[105px] aspect-[2/3] rounded-xl overflow-hidden relative flex-shrink-0 snap-start group",
                  "transition-all duration-200 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)]",
                  !isMatched && !hasSuggestion ? "opacity-35" : "",
                )}
              >
                {img && (
                  <img src={img} alt="" className="w-full h-full object-cover" />
                )}
                {!img && (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ background: gameGradient(title) }}
                  >
                    <Gamepad2 size={22} className="opacity-15" />
                  </div>
                )}

                <div className="absolute top-1.5 right-1.5 z-10">
                  {isMatched ? (
                    <span className="flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500/70 shadow-lg">
                      <Check size={7} className="text-white" />
                    </span>
                  ) : hasSuggestion ? (
                    <span className="flex h-3 w-3 items-center justify-center rounded-full bg-blue-500/70 shadow-lg">
                      <Circle size={5} className="fill-white text-white" />
                    </span>
                  ) : null}
                </div>

                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/95 via-black/60 to-transparent pt-6">
                  <p className="text-[11px] font-semibold text-white truncate">{title}</p>
                </div>
              </button>
            )
          })}
        </div>
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-8 z-10 pointer-events-none bg-gradient-to-l from-[var(--dk-surface-root)] to-transparent" />
        )}
      </div>
    </div>
  )
}

// ── Empty state for grid ──────────────────────────────────────────

function EmptyGridState({ activeTab, search, hasGames }: {
  activeTab: GamesTab
  search: string
  hasGames: boolean
}) {
  if (search) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Search size={28} className="opacity-10 mb-3" />
        <p className="text-sm text-muted-foreground">No games match &ldquo;{search}&rdquo;</p>
        <p className="text-xs text-muted-foreground/50 mt-1">Try a different search term</p>
      </div>
    )
  }

  const messages: Record<GamesTab, { title: string; desc: string }> = {
    all: { title: "No game found", desc: "" },
    matched: { title: "No matched game", desc: "Games you've matched to the catalog appear here." },
    unmatched: { title: "No unmatched game", desc: "Every local game either has a catalog match or a pending suggestion." },
  }
  const m = messages[activeTab]

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Gamepad2 size={28} className="opacity-10 mb-3" />
      <p className="text-sm text-muted-foreground">{m.title}</p>
      {m.desc && <p className="text-xs text-muted-foreground/50 mt-1">{m.desc}</p>}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────

export function GamesLauncher() {
  const navigate = useNavigate()
  const { data: games = [] } = useGames()
  const rejectSuggestionMutation = useRejectSuggestion()
  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState<GamesTab>("all")
  const [selectedGame, setSelectedGame] = useState<LocalGame | null>(null)
  const [scanning, setScanning] = useState(false)
  const matchMutation = useMatchLocalGames()

  // Always use the latest version of selectedGame from the game array
  const activeSelectedGame = useMemo(
    () => (selectedGame ? games.find((g) => g.id === selectedGame.id) ?? selectedGame : null),
    [games, selectedGame],
  )

  // Catalog detail for the active selected game
  const { data: gameDetail } = useGameDetail(activeSelectedGame?.data?.id)

  // Popular catalog game for shelf
  const { data: popularGames = [] } = usePopularGames()

  // Auto-select first game when games load and none is selected

  // Auto-select first game when game load and none is selected
  useEffect(() => {
    if (!selectedGame && games.length > 0) {
      setSelectedGame(games[0])
    }
  }, [games, selectedGame])

  // ── Derived ──────────────────────────────────────────────────────

  const matchedGames = useMemo(() => games.filter(
    (g) => g.data?.id && !(g.sources?.includes("iso") || g.platform === "iso"),
  ), [games])

  const isoGames = useMemo(() => games.filter(
    (g) => g.sources?.includes("iso") || g.platform === "iso",
  ), [games])

  const unmatchedGames = useMemo(() => games.filter(
    (g) => !g.data?.id && !g.matchSuggestion,
  ), [games])

  const suggestedGames = useMemo(() => games.filter(
    (g) => g.matchSuggestion,
  ), [games])

  // Tab counts matching the actual tab filter logic
  const tabMatchedCount = useMemo(() => games.filter((g) => g.data?.id).length, [games])
  const tabUnmatchedCount = useMemo(() => unmatchedGames.length, [unmatchedGames])

  // Filtered + sorted display list
  const filtered = useMemo(() => {
    let result = games

    if (activeTab === "matched") result = result.filter((g) => g.data?.id)
    if (activeTab === "unmatched") result = result.filter((g) => !g.data?.id && !g.matchSuggestion)

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (g) =>
          (g.data?.title || g.title).toLowerCase().includes(q) ||
          g.platform.toLowerCase().includes(q),
      )
    }

    const isIso = (g: LocalGame) => g.sources?.includes("iso") || g.platform === "iso"
    return [...result].sort((a, b) => {
      const aScore = a.data?.id && !isIso(a) ? 4 : a.data?.id && isIso(a) ? 3 : a.matchSuggestion ? 2 : 1
      const bScore = b.data?.id && !isIso(b) ? 4 : b.data?.id && isIso(b) ? 3 : b.matchSuggestion ? 2 : 1
      return bScore - aScore
    })
  }, [games, activeTab, search])

  const stats = useMemo(() => ({
    total: games.length,
    matched: matchedGames.length,
    iso: isoGames.length,
    suggested: suggestedGames.length,
    unmatched: unmatchedGames.length,
  }), [games, matchedGames, isoGames, suggestedGames, unmatchedGames])

  const installedShelf = useMemo(() => matchedGames.slice(0, 15), [matchedGames])

  // ── Helpers ──────────────────────────────────────────────────────

  const handleRescan = async () => {
    if (!hasDesktopAPI()) return
    setScanning(true)
    try {
      const api = getDesktopAPI()!
      const paths = await api.getScanPaths()
      const gamePaths = paths.filter((p) => p.type === 'game').map((p) => p.path)
      const isoPaths = paths.filter((p) => p.type === 'iso').map((p) => p.path)
      await api.scanPaths(gamePaths, isoPaths)
      // DB-change event triggers auto-refetch via subscribeToGameDbChanges
    } catch (err) {
      console.error("Rescan failed:", err)
    } finally {
      setScanning(false)
    }
  }

  const handleRematch = useCallback(async () => {
    setMatching(true)
    try {
      const result = await matchMutation.mutateAsync(games)
      if (result && result.length > 0) {
        const filtered = filterRejectedSuggestions(result)
        console.log(`[Re-match] matched: ${filtered.filter(g => g.data?.id).length}, suggested: ${filtered.filter(g => g.matchSuggestion).length}`)
        setGames(filtered)
        setScannedGames(filtered)
      }
    } catch (err) {
      console.error("[Re-match] failed:", err)
    } finally {
      setMatching(false)
    }
  }, [games, matchMutation])

  const selectGame = useCallback((id: string) => {
    const g = games.find((x) => x.id === id)
    if (g) setSelectedGame(g)
  }, [games])

  const handlePlay = useCallback((game: LocalGame) => {
    const api = getDesktopAPI()
    if (api) {
      api.launchGame(game).catch(console.error)
    }
  }, [])

  const handleOpenFolder = useCallback((game: LocalGame) => {
    const api = getDesktopAPI()
    if (api?.showItemInFolder) {
      api.showItemInFolder(game.installDir).catch(console.error)
    }
  }, [])

  const [installerOpen, setInstallerOpen] = useState(false)
  const [installIsoPath, setInstallIsoPath] = useState<string | undefined>()

  const openInstaller = useCallback((game: LocalGame) => {
    setInstallIsoPath(game.exePath)
    setInstallerOpen(true)
  }, [])

  const handleAcceptSuggestion = useCallback((game: LocalGame) => {
    if (!game.matchSuggestion) return
    const api = getDesktopAPI()
    if (api?.acceptSuggestion) {
      api.acceptSuggestion(game.id, game.matchSuggestion).catch(console.error)
    }
  }, [])

  const handleRejectSuggestion = useCallback((game: LocalGame) => {
    if (!game.matchSuggestion) return
    rejectSuggestionMutation.mutate({
      gameId: game.id,
      suggestionMediaId: game.matchSuggestion.id,
    })
  }, [rejectSuggestionMutation])

  // No longer sync to storage — data managed by useGames() query

  // ── Keyboard navigation ──────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      const ci = filtered.findIndex((g) => g.id === selectedGame?.id)
      if (ci === -1 && filtered.length > 0) {
        selectGame(filtered[0].id)
        return
      }
      const ni = e.key === "ArrowDown"
        ? Math.min(ci + 1, filtered.length - 1)
        : Math.max(ci - 1, 0)
      if (ni >= 0 && ni < filtered.length) {
        selectGame(filtered[ni].id)
      }
    }
    if (e.key === "Escape") {
      setSelectedGame(null)
    }
  }, [filtered, selectedGame, selectGame])

  return (
    <div className="space-y-5" onKeyDown={handleKeyDown}>
      {/* ── Top bar: stats + rescan ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-sm">
          <div className="flex items-center gap-2 bg-[var(--dk-surface-glass)] rounded-xl px-3.5 py-2">
            <Gamepad2 size={16} className="text-foreground/80" />
            <span className="font-bold text-foreground/90">{stats.total}</span>
            <span className="text-muted-foreground/60 text-xs">games</span>
          </div>

          {stats.matched > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 bg-emerald-500/8 rounded-xl px-3 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
              <span className="text-xs font-medium text-emerald-400/80">{stats.matched} installed</span>
            </div>
          )}

          {stats.iso > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 bg-blue-500/8 rounded-xl px-3 py-2">
              <Download size={11} className="text-blue-400/70" />
              <span className="text-xs font-medium text-blue-400/80">{stats.iso} available</span>
            </div>
          )}

          {stats.suggested > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 bg-blue-500/8 rounded-xl px-3 py-2">
              <Circle size={6} className="fill-blue-400/70 text-blue-400/70" />
              <span className="text-xs font-medium text-blue-400/80">{stats.suggested} suggestions</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRematch}
            disabled={matching}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-blue-400/70 hover:text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-40 shrink-0"
          >
            <RefreshCw size={13} className={matching ? "animate-spin" : ""} />
            {matching ? "Matching..." : "Re-match"}
          </button>
          <button
            type="button"
            onClick={handleRescan}
            disabled={scanning}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors disabled:opacity-40 shrink-0"
          >
            <RefreshCw size={13} className={scanning ? "animate-spin" : ""} />
            {scanning ? "Scanning..." : "Rescan"}
          </button>
        </div>
      </div>

      {/* ── Auto-match results notification ── */}
      {matchNotice && (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5 text-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20">
            <Check size={13} className="text-emerald-400" />
          </span>
          <span className="text-emerald-400/90 font-medium">
            Auto-match complete
          </span>
          {matchNotice.matched > 0 && (
            <span className="text-emerald-300/70">
              — {matchNotice.matched} game{matchNotice.matched !== 1 ? "s" : ""} matched
            </span>
          )}
          {matchNotice.suggested > 0 && (
            <span className="text-blue-300/70">
              — {matchNotice.suggested} suggestion{matchNotice.suggested !== 1 ? "s" : ""} to review
            </span>
          )}
          <button
            type="button"
            onClick={() => setMatchNotice(null)}
            className="ml-auto shrink-0 text-emerald-400/40 hover:text-emerald-300/70 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Hero section (always visible) ── */}
      {activeSelectedGame ? (
        <HeroSection
          game={activeSelectedGame}
          detail={gameDetail}
          onPlay={handlePlay}
          onOpenFolder={handleOpenFolder}
          onInstall={openInstaller}
          onAcceptSuggestion={handleAcceptSuggestion}
          onRejectSuggestion={handleRejectSuggestion}
          onViewDetails={(id) => navigate({ to: "/media/$mediaType/$mediaId", params: { mediaType: "game", mediaId: id } })}
        />
      ) : (
        <EmptyHero />
      )}

      {/* ── Search + Tab bar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 bg-white/[0.04] border border-white/[0.06] focus-within:border-white/20">
            <Search size={15} className="shrink-0 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search your library..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50 text-sm"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="shrink-0 text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-1 bg-[var(--dk-surface-glass)] rounded-xl p-1">
          {TAB_DEFS.map((tab) => {
            const count = tab.id === "all" ? games.length
              : tab.id === "matched" ? tabMatchedCount
                : tabUnmatchedCount
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  isActive
                    ? "bg-[var(--dk-surface-base)] text-foreground shadow-sm"
                    : "text-muted-foreground/60 hover:text-foreground",
                )}
              >
                {tab.label}
                <span className={cn(
                  "ml-1.5 text-[10px]",
                  isActive ? "text-muted-foreground/50" : "text-muted-foreground/30",
                )}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Game grid ── */}
      {filtered.length === 0 ? (
        <EmptyGridState activeTab={activeTab} search={search} hasGames={games.length > 0} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              isSelected={selectedGame?.id === game.id}
              onSelect={selectGame}
            />
          ))}
        </div>
      )}

      {/* ── Shelves ── */}
      {activeTab === "all" && !search && (
        <div className="space-y-5">
          {installedShelf.length > 0 && (
            <LocalShelfRow
              label="Installed Games"
              icon={<Play size={11} className="text-emerald-400/60" />}
              items={installedShelf}
              onSelect={selectGame}
            />
          )}

          {unmatchedGames.length > 0 && (
            <LocalShelfRow
              label="Unmatched Games"
              icon={<Search size={11} className="text-blue-400/60" />}
              items={unmatchedGames.slice(0, 10)}
              onSelect={selectGame}
            />
          )}

          {suggestedGames.length > 0 && (
            <LocalShelfRow
              label="Suggested Matches"
              icon={<Circle size={7} className="fill-blue-400/60 text-blue-400/60" />}
              items={suggestedGames.slice(0, 10)}
              onSelect={selectGame}
            />
          )}

          {/* Popular on Otix — using MediaCard */}
          {popularGames.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-xs font-semibold text-white/30 flex items-center gap-1.5 tracking-wide">
                  🔥 Popular on Otix
                </span>
                <span className="text-[10px] text-white/10">· {popularGames.length}</span>
              </div>
              <MediaGrid>
                {popularGames.slice(0, 12).map((game) => (
                  <MediaCard
                    key={game.id}
                    id={game.id}
                    mediaType="game"
                    title={game.title}
                    posterUrl={game.posterUrl}
                    textlessPosterUrl={game.textlessPosterUrl}
                    releaseDate={game.releaseDate}
                    avgRating={game.avgRating}
                    ratingCount={game.ratingCount}
                    isAdult={game.isAdult}
                    showTypeBadge={false}
                    zoomed={false}
                  />
                ))}
              </MediaGrid>
            </div>
          )}
        </div>
      )}

      <IsoInstallerModal
        open={installerOpen}
        onClose={() => setInstallerOpen(false)}
        games={games}
        initialIsoPath={installIsoPath}
      />
    </div>
  )
}
