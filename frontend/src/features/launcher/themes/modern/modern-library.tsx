import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  LayoutGrid,
  StretchHorizontal,
  List,
  Filter,
  ArrowUpDown,
  Search,
  FolderPlus,
  Play,
  Clock,
  HardDrive,
  Gamepad2,
  CheckCircle2,
  ExternalLink,
} from "lucide-react"
import { MediaLogo } from "@/lib/media/media-logo"
import { LauncherActionButtons } from "../common/launcher-action-buttons"
import { LauncherMediaCard } from "@/features/launcher/components/molecules/launcher-media-card"
import { LauncherFoundGames } from "@/features/launcher/components/organisms/launcher-found-games"
import { PLATFORM_LABELS } from "@/constants/games"
import { isApplicationGame } from "@/features/launcher/utils"
import type { LocalGame, DisplayGame, LauncherPlatform } from "@/features/launcher/types"

type ViewMode = "grid" | "banner" | "list"
type SortField = "recent" | "title" | "platform" | "playtime"

interface ModernLibraryProps {
  localGames: LocalGame[]
  popularGames: any[]
  searchQuery: string
  setSearchQuery: (q: string) => void
  onOpenDetails: (game: LocalGame | DisplayGame) => void
}

export function ModernLibrary({
  localGames,
  popularGames,
  searchQuery,
  setSearchQuery,
  onOpenDetails,
}: ModernLibraryProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all")
  const [installedOnly, setInstalledOnly] = useState(false)
  const [sortField, setSortField] = useState<SortField>("recent")

  // Filter playable games
  const allGames = useMemo(() => {
    return localGames.filter((g) => !isApplicationGame(g))
  }, [localGames])

  // Extract platforms
  const platforms = useMemo(() => {
    const set = new Set<string>()
    allGames.forEach((g) => {
      if (g.platform) set.add(g.platform)
    })
    return Array.from(set).sort()
  }, [allGames])

  // Filter & sort
  const filteredGames = useMemo(() => {
    let result = [...allGames]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((g) => g.title.toLowerCase().includes(q))
    }

    if (selectedPlatform !== "all") {
      result = result.filter((g) => g.platform === selectedPlatform)
    }

    if (installedOnly) {
      result = result.filter((g) => !!g.exePath && g.platform !== "iso")
    }

    result.sort((a, b) => {
      if (sortField === "title") return a.title.localeCompare(b.title)
      if (sortField === "platform") return a.platform.localeCompare(b.platform) || a.title.localeCompare(b.title)
      // default: recent
      const aT = a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : 0
      const bT = b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : 0
      return bT !== aT ? bT - aT : a.title.localeCompare(b.title)
    })

    return result
  }, [allGames, searchQuery, selectedPlatform, installedOnly, sortField])

  return (
    <div className="w-full max-w-7xl mx-auto px-6 py-6 space-y-6 pb-28 select-none">
      {/* ── Toolbar & Filters ── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-3 rounded-2xl bg-neutral-950/80 backdrop-blur-xl border border-white/[0.08] shadow-lg">
        {/* Left: Platform Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setSelectedPlatform("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedPlatform === "all"
                ? "bg-[oklch(0.705_0.213_47.604)] text-white shadow-md"
                : "text-white/40 hover:text-white hover:bg-white/[0.04]"
            }`}
          >
            All Platforms
          </button>
          {platforms.map((plat) => (
            <button
              key={plat}
              onClick={() => setSelectedPlatform(plat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                selectedPlatform === plat
                  ? "bg-[oklch(0.705_0.213_47.604)] text-white shadow-md"
                  : "text-white/40 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              {PLATFORM_LABELS[plat] || plat}
            </button>
          ))}
        </div>

        {/* Right: Quick toggles & Sort & View Modes */}
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          {/* Installed Only Checkbox pill */}
          <button
            onClick={() => setInstalledOnly(!installedOnly)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              installedOnly
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-white/40 hover:text-white bg-white/[0.04] border border-white/[0.06]"
            }`}
          >
            <CheckCircle2 size={13} className={installedOnly ? "text-emerald-400" : "text-white/30"} />
            <span>Installed</span>
          </button>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <ArrowUpDown size={12} className="text-white/40" />
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="bg-transparent text-xs font-semibold text-white/80 outline-none cursor-pointer border-none"
            >
              <option value="recent" className="bg-neutral-900 text-white">Recent</option>
              <option value="title" className="bg-neutral-900 text-white">Title (A-Z)</option>
              <option value="platform" className="bg-neutral-900 text-white">Platform</option>
            </select>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <button
              onClick={() => setViewMode("grid")}
              title="Poster Grid"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === "grid" ? "bg-white/15 text-white" : "text-white/40 hover:text-white"
              }`}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode("banner")}
              title="Wide Banners"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === "banner" ? "bg-white/15 text-white" : "text-white/40 hover:text-white"
              }`}
            >
              <StretchHorizontal size={15} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              title="Detailed List Table"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === "list" ? "bg-white/15 text-white" : "text-white/40 hover:text-white"
              }`}
            >
              <List size={15} />
            </button>
          </div>

          <span className="text-[11px] font-mono text-white/30 font-semibold pl-1">
            {filteredGames.length} games
          </span>
        </div>
      </div>

      {/* ── Games Container ── */}
      {filteredGames.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 rounded-3xl bg-neutral-950/40 border border-white/[0.06] text-center space-y-3">
          <Gamepad2 size={48} className="text-white/20" />
          <h3 className="text-base font-bold text-white/80">No games found</h3>
          <p className="text-xs text-white/40 max-w-sm">
            {searchQuery
              ? `No games match "${searchQuery}". Try clearing search filters.`
              : "No games detected in your scanned libraries yet."}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        /* ── Grid View (2:3 Posters) ── */
        <motion.div
          key="grid"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5"
        >
          {filteredGames.map((game) => (
              <LauncherMediaCard
                key={game.id}
                game={game}
                onClick={() => onOpenDetails(game)}
              />
            ))}
        </motion.div>
      ) : viewMode === "banner" ? (
        /* ── Banner View (16:9 widescreen cards) ── */
        <motion.div
          key="banner"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {filteredGames.map((game) => {
            const backdrop = game.otixBackdropUrl || game.data?.backdropUrl || game.posterUrl
            const logo = game.otixLogoUrl || game.data?.logoUrl || game.logoUrl
            const isInstalled = !!game.exePath && game.platform !== "iso"

            return (
              <div
                key={game.id}
                onClick={() => onOpenDetails(game)}
                className="group relative h-48 rounded-2xl overflow-hidden bg-neutral-900 border border-white/[0.08] hover:border-white/30 transition-all duration-300 cursor-pointer shadow-lg hover:-translate-y-1"
              >
                {backdrop ? (
                  <img
                    src={backdrop}
                    alt={game.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 brightness-75"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/30">
                    <Gamepad2 size={40} />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />

                <div className="absolute inset-0 p-4 flex flex-col justify-between z-10">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-white/90 text-[9px] font-black uppercase tracking-wider">
                      {PLATFORM_LABELS[game.platform] || game.platform}
                    </span>
                    {isInstalled && (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                        Installed
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {logo ? (
                      <MediaLogo
                        src={logo}
                        alt={game.title}
                        className="h-10 max-w-[200px] object-contain object-left drop-shadow-md"
                        background="dark"
                      />
                    ) : (
                      <h4 className="text-base font-black text-white truncate drop-shadow-md">
                        {game.title}
                      </h4>
                    )}
                    <div className="flex items-center justify-between pt-1 border-t border-white/10">
                      <span className="text-[10px] text-white/50">
                        {game.lastPlayedAt
                          ? `Last played ${new Date(game.lastPlayedAt).toLocaleDateString()}`
                          : "Never played"}
                      </span>
                      <LauncherActionButtons game={game} size="sm" />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </motion.div>
      ) : (
        /* ── Detailed Table List View ── */
        <motion.div
          key="list"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="rounded-2xl bg-neutral-950/80 border border-white/[0.08] overflow-hidden shadow-xl"
        >
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.08] bg-white/[0.02] text-[10px] uppercase font-bold text-white/40 tracking-wider">
                <th className="p-4 pl-6">Title</th>
                <th className="p-4">Platform</th>
                <th className="p-4">Status</th>
                <th className="p-4">Last Played</th>
                <th className="p-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredGames.map((game) => {
                const isInstalled = !!game.exePath && game.platform !== "iso"

                return (
                  <tr
                    key={game.id}
                    onClick={() => onOpenDetails(game)}
                    className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                  >
                    <td className="p-4 pl-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-neutral-800 shrink-0 border border-white/10">
                          {(game.otixIconUrl || game.data?.iconUrl || game.posterUrl) ? (
                            <img
                              src={game.otixIconUrl || game.data?.iconUrl || game.posterUrl || ""}
                              alt={game.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/30">
                              <Gamepad2 size={18} />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-extrabold text-white text-xs group-hover:text-[oklch(0.705_0.213_47.604)] transition-colors">
                            {game.title}
                          </div>
                          {game.exePath && (
                            <div className="text-[10px] text-white/30 font-mono truncate max-w-xs">
                              {game.exePath}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="p-4 uppercase font-bold text-[10px] text-white/70">
                      {PLATFORM_LABELS[game.platform] || game.platform}
                    </td>

                    <td className="p-4">
                      {isInstalled ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-300 text-[10px] font-bold border border-emerald-500/25">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Ready
                        </span>
                      ) : game.platform === "iso" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/15 text-amber-300 text-[10px] font-bold border border-amber-500/25">
                          ISO Image
                        </span>
                      ) : (
                        <span className="text-[10px] text-white/30 font-semibold">
                          Uninstalled
                        </span>
                      )}
                    </td>

                    <td className="p-4 text-[11px] text-white/50">
                      {game.lastPlayedAt
                        ? new Date(game.lastPlayedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </td>

                    <td className="p-4 pr-6 text-right">
                      <div className="flex justify-end">
                        <LauncherActionButtons game={game} size="sm" />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </motion.div>
      )}

      <LauncherFoundGames />
    </div>
  )
}
