import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Calendar, Clock, Star, Gamepad2, Info, ChevronRight } from "lucide-react"
import { MediaLogo } from "@/lib/media/media-logo"
import { LauncherActionButtons } from "../common/launcher-action-buttons"
import { PLATFORM_LABELS } from "@/constants/games"
import { heroImage } from "@/lib/utils"
import type { LocalGame, DisplayGame } from "@/features/launcher/types"

interface ModernHeroSpotlightProps {
  game: LocalGame | DisplayGame | null
  onOpenDetails: (game: LocalGame | DisplayGame) => void
  onSelectGame?: (gameId: string) => void
}

export function ModernHeroSpotlight({
  game,
  onOpenDetails,
}: ModernHeroSpotlightProps) {
  const [hoveredScreenshot, setHoveredScreenshot] = useState<string | null>(null)
  const [logoError, setLogoError] = useState(false)

  if (!game) return null

  const raw = ("rawGame" in game && game.rawGame ? game.rawGame : game) as LocalGame
  const detail = raw.data
  const title = detail?.title || raw.title
  const overview = detail?.overview || raw.description || ""
  const defaultBackdrop = raw.otixBackdropUrl || detail?.backdropUrl || raw.posterUrl
  const activeBackdrop = hoveredScreenshot || defaultBackdrop ? heroImage(hoveredScreenshot || defaultBackdrop || "") : null
  const logoUrl = raw.otixLogoUrl || detail?.logoUrl || raw.logoUrl
  const screenshots = detail?.screenshots?.slice(0, 6) || []

  return (
    <section className="relative w-full h-[520px] rounded-3xl overflow-hidden mb-8 border border-white/[0.08] shadow-[0_24px_70px_rgba(0,0,0,0.8)] group select-none">
      {/* Dynamic Ambient Background */}
      <AnimatePresence initial={false}>
        <motion.div
          key={activeBackdrop || "empty"}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="absolute inset-0"
        >
          {activeBackdrop && (
            <>
              <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-1000 ease-out group-hover:scale-[1.02]"
                style={{ backgroundImage: `url(${activeBackdrop})` }}
              />
              <div
                className="absolute -inset-[15%] bg-cover bg-center bg-no-repeat opacity-35 filter blur-[60px]"
                style={{ backgroundImage: `url(${activeBackdrop})` }}
              />
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Cinematic Vignette Gradients */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-black/30 z-[1]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent z-[1]" />

      {/* Hero Content Container */}
      <div className="absolute inset-0 z-10 flex flex-col justify-between p-8 lg:p-12">
        {/* Top meta tags */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="px-2.5 py-1 rounded-lg bg-white/10 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-widest border border-white/15 shadow-sm">
            {PLATFORM_LABELS[raw.platform] || raw.platform}
          </span>
          {raw.lastPlayedAt && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 text-[11px] font-bold border border-emerald-500/30">
              <Clock size={12} />
              <span>Last played {new Date(raw.lastPlayedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            </span>
          )}
          {detail?.avgRating && detail.avgRating > 0 && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 text-[11px] font-bold border border-amber-500/30">
              <Star size={12} fill="currentColor" />
              <span>{(detail.avgRating / 10).toFixed(1)}</span>
            </span>
          )}
        </div>

        {/* Middle: Game Logo/Title & Overview */}
        <div className="max-w-xl space-y-3">
          {logoUrl && !logoError ? (
            <div className="relative inline-block max-w-[360px]">
              <MediaLogo
                src={logoUrl}
                alt={title}
                className="h-24 max-w-[360px] object-contain object-left drop-shadow-[0_12px_24px_rgba(0,0,0,0.9)]"
                background="dark"
                onError={() => setLogoError(true)}
              />
            </div>
          ) : (
            <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight uppercase drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
              {title}
            </h1>
          )}

          {overview && (
            <p className="text-sm text-white/75 line-clamp-2 leading-relaxed font-normal max-w-lg drop-shadow-md">
              {overview}
            </p>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex items-center gap-3">
            <LauncherActionButtons
              game={raw}
              size="lg"
              onOpenDetails={() => onOpenDetails(raw)}
            />
          </div>
        </div>

        {/* Bottom: Screenshots interactive preview ribbon */}
        {screenshots.length > 0 && (
          <div className="flex items-center gap-3 pt-4 border-t border-white/10">
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 hidden sm:inline">
              Media
            </span>
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
              {screenshots.map((s, idx) => (
                <div
                  key={idx}
                  onMouseEnter={() => setHoveredScreenshot(s.url)}
                  onMouseLeave={() => setHoveredScreenshot(null)}
                  className={`relative w-24 h-14 rounded-xl overflow-hidden cursor-pointer border transition-all duration-200 shrink-0 ${
                    hoveredScreenshot === s.url
                      ? "border-[oklch(0.705_0.213_47.604)] scale-105 shadow-lg shadow-black/80"
                      : "border-white/15 opacity-70 hover:opacity-100 hover:border-white/40"
                  }`}
                >
                  <img
                    src={s.url}
                    alt={`Screenshot preview ${idx + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
