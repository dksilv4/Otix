import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Calendar, Star, HardDrive, Layers, Image as ImageIcon, BookOpen, Sparkles, Server } from "lucide-react"
import { MediaLogo } from "@/lib/media/media-logo"
import { LauncherActionButtons } from "./launcher-action-buttons"
import { MatchGameModal } from "@/features/launcher/components/molecules/launcher-match-game-modal"
import { MediaGameServersSection, useGameServersByGame } from "@/features/gameservers"
import { useModal } from "@/lib/modals"
import { PLATFORM_LABELS } from "@/constants/games"
import type { LocalGame, DisplayGame } from "@/features/launcher/types"

interface LauncherGameSheetProps {
  game: LocalGame | DisplayGame | null
  onClose: () => void
}

export const LauncherGameSheet = ({ game, onClose }: LauncherGameSheetProps) => {
  const { openModal } = useModal()
  const [_selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'updates' | 'servers'>('overview')

  const raw = game ? (("rawGame" in game && game.rawGame ? game.rawGame : game) as LocalGame) : null
  const mediaId = raw?.otixMediaId || raw?.data?.mediaId || raw?.data?.id || ''
  const { data: gameServers = [] } = useGameServersByGame(mediaId)

  if (!game || !raw) return null
  const detail = raw.data
  const title = detail?.title || raw.title
  const overview = detail?.overview || raw.description || "No overview available for this title."
  const backdropUrl = raw.otixBackdropUrl || detail?.backdropUrl || raw.posterUrl
  const logoUrl = raw.otixLogoUrl || detail?.logoUrl || raw.logoUrl
  const screenshots = detail?.screenshots || []

  const handleOpenMatchModal = () => {
    const close = openModal(
      <MatchGameModal game={raw} onClose={() => close()} />
    )
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex justify-end">
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/75 backdrop-blur-md cursor-pointer"
        />

        {/* Slide-over panel */}
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="relative z-10 w-full max-w-2xl h-full bg-[var(--dk-surface-overlay)] border-l border-[var(--dk-separator)] shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header image banner */}
          <div className="relative h-64 w-full shrink-0 overflow-hidden bg-[var(--dk-surface-base)]">
            {backdropUrl && (
              <img
                src={backdropUrl}
                alt={title}
                className="w-full h-full object-cover brightness-60"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--dk-surface-overlay)] via-[var(--dk-surface-overlay)]/40 to-transparent" />

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white flex items-center justify-center border border-white/15 transition-all cursor-pointer"
            >
              <X size={18} />
            </button>

            {/* Logo or Title */}
            <div className="absolute bottom-6 left-6 right-6 z-10">
              {logoUrl ? (
                <MediaLogo
                  src={logoUrl}
                  alt={title}
                  className="h-20 max-w-[280px] object-contain object-left mb-2 drop-shadow-xl"
                  background="dark"
                />
              ) : (
                <h1 className="text-3xl font-black text-white tracking-tight uppercase drop-shadow-lg mb-2">
                  {title}
                </h1>
              )}

              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="px-2 py-0.5 rounded-md bg-white/10 text-white font-bold uppercase tracking-wider text-[10px] border border-white/10">
                  {PLATFORM_LABELS[raw.platform] || raw.platform}
                </span>
                {detail?.releaseDate && (
                  <span className="flex items-center gap-1 text-white/70">
                    <Calendar size={12} />
                    {detail.releaseDate.slice(0, 4)}
                  </span>
                )}
                {detail?.avgRating && detail.avgRating > 0 && (
                  <span className="flex items-center gap-1 text-amber-400 font-bold">
                    <Star size={12} fill="currentColor" />
                    {(detail.avgRating / 10).toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="px-6 py-4 border-b border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] flex items-center justify-between gap-4">
            <LauncherActionButtons game={raw} size="md" />
            <button
              onClick={handleOpenMatchModal}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-xs font-semibold text-foreground/80 hover:text-foreground border border-[var(--dk-separator)] transition-colors cursor-pointer"
            >
              <Layers size={13} />
              <span>{raw.data?.id ? "Edit Match" : "Match Game"}</span>
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="px-6 border-b border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)]/50 flex gap-6 flex-none">
            <button
              onClick={() => setActiveTab("overview")}
              className={`py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "overview"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <BookOpen size={13} /> Overview
            </button>

            <button
              onClick={() => setActiveTab("updates")}
              className={`py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "updates"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles size={13} /> Updates & Changelog
              {raw.updateFiles && raw.updateFiles.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </button>

            {gameServers.length > 0 && (
              <button
                onClick={() => setActiveTab("servers")}
                className={`py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
                  activeTab === "servers"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Server size={13} /> Dedicated Servers
                <span className="px-1.5 py-0.5 rounded-full bg-[var(--dk-surface-raised)] text-[10px] font-semibold text-foreground">
                  {gameServers.length}
                </span>
              </button>
            )}
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-none">
            {activeTab === "updates" ? (
              <LauncherGameChangelog game={game} />
            ) : activeTab === "servers" && gameServers.length > 0 ? (
              <MediaGameServersSection
                mediaId={mediaId}
                gameTitle={title}
              />
            ) : (
              <>
                {/* Overview */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Overview</h3>
                  <p className="text-sm text-foreground leading-relaxed font-normal">{overview}</p>
                </div>

                {/* Technical File Info */}
                <div className="p-4 rounded-2xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] space-y-2.5">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                    <HardDrive size={13} /> File & Launch Properties
                  </h3>
                  {raw.exePath && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">Executable</span>
                      <span className="text-xs text-foreground font-mono bg-[var(--dk-surface-field)] px-2.5 py-1.5 rounded-lg break-all border border-[var(--dk-separator)]">
                        {raw.exePath}
                      </span>
                    </div>
                  )}
                  {raw.installDir && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">Install Directory</span>
                      <span className="text-xs text-foreground font-mono bg-[var(--dk-surface-field)] px-2.5 py-1.5 rounded-lg break-all border border-[var(--dk-separator)]">
                        {raw.installDir}
                      </span>
                    </div>
                  )}
                </div>

                {/* Genres & Details */}
                {detail?.genres && detail.genres.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Genres</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {detail.genres.map((g) => (
                        <span
                          key={g.id}
                          className="px-2.5 py-1 rounded-lg bg-[var(--dk-surface-ghost)] text-foreground/80 text-xs font-medium border border-[var(--dk-separator)]"
                        >
                          {g.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Screenshots Gallery */}
                {screenshots.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                      <ImageIcon size={13} /> Screenshots ({screenshots.length})
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {screenshots.map((s, idx) => (
                        <div
                          key={idx}
                          onClick={() => setSelectedScreenshot(s.url)}
                          className="relative aspect-video rounded-xl overflow-hidden cursor-pointer group border border-[var(--dk-separator)] hover:border-foreground/20 transition-all"
                        >
                          <img
                            src={s.url}
                            alt={`Screenshot ${idx + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
        {selectedScreenshot && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() => setSelectedScreenshot(null)}
          >
            <img
              src={selectedScreenshot}
              alt="Screenshot full view"
              className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            />
          </div>
        )}
      </div>
    </AnimatePresence>
  )
};
