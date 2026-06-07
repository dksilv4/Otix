import { useRef, useCallback, useEffect } from "react"
import { X, Search, Circle, Menu, Plus, RefreshCw, Link as LinkIcon } from "lucide-react"
import type { DetectedGame } from "@/features/game-scanner/types"
import type { GamesTab } from "../types"

interface GamesSidePanelProps {
  open: boolean
  onClose: () => void
  games: DetectedGame[]
  selectedId: string | null
  onSelect: (id: string) => void
  activeTab: GamesTab
  onTabChange: (tab: GamesTab) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  onRescan: () => void
  scanning?: boolean
  totalCount?: number
  matchedCount?: number
  unmatchedCount?: number
}

const platformColors: Record<string, string> = {
  steam: "from-emerald-600 to-emerald-800",
  pc: "from-emerald-600 to-emerald-800",
  gog: "from-violet-600 to-violet-800",
  epic: "from-amber-600 to-amber-800",
  iso: "from-amber-600 to-amber-800",
  battlenet: "from-blue-600 to-blue-800",
  xbox: "from-blue-600 to-blue-800",
  ea: "from-red-600 to-red-800",
  ubisoft: "from-red-600 to-red-800",
  riot: "from-red-600 to-red-800",
  itch: "from-pink-600 to-pink-800",
}

function lastDir(p: string): string {
  const bs = p.lastIndexOf("\\")
  const fs = p.lastIndexOf("/")
  return p.substring(Math.max(bs, fs) + 1)
}

export function GamesSidePanel({
  open,
  onClose,
  games,
  selectedId,
  onSelect,
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  onRescan,
  scanning,
  totalCount = 0,
  matchedCount = 0,
  unmatchedCount = 0,
}: GamesSidePanelProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && searchRef.current) {
      const t = setTimeout(() => searchRef.current?.focus(), 400)
      return () => clearTimeout(t)
    }
  }, [open])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) return
      if (e.key === "Escape") { onClose(); return }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        const ci = games.findIndex((g) => g.id === selectedId)
        const ni = e.key === "ArrowDown" ? Math.min(ci + 1, games.length - 1) : Math.max(ci - 1, 0)
        if (ni >= 0 && ni < games.length) {
          onSelect(games[ni].id)
          if (listRef.current) {
            (listRef.current.children[ni] as HTMLElement)?.scrollIntoView({ block: "nearest" })
          }
        }
      }
    },
    [open, games, selectedId, onSelect, onClose],
  )

  const tabs = [
    { id: "all" as GamesTab, label: "All", count: totalCount },
    { id: "matched" as GamesTab, label: "Matched", count: matchedCount },
    { id: "unmatched" as GamesTab, label: "Unmatched", count: unmatchedCount },
  ]

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden" onClick={onClose} />}
      <div
        className={`
          bg-[rgba(15,15,20,0.88)] backdrop-blur-xl
          shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_32px_rgba(0,0,0,0.5)]
          rounded-2xl flex flex-col overflow-hidden h-full
          transition-[width] duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)]
          ${open ? "w-[280px] p-4" : "w-0 p-0"}
        `}
        onKeyDown={handleKeyDown}
      >
        {open && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-2.5 flex-shrink-0">
              <span className="text-xs font-semibold text-white/80 flex items-center gap-1.5">
                <Menu size={14} /> Library
              </span>
              <button type="button" onClick={onClose}
                className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* Search */}
            <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground flex-shrink-0 mb-3">
              <Search size={12} />
              <input ref={searchRef} type="text" placeholder="Search games..."
                value={searchQuery} onChange={(e) => onSearchChange(e.target.value)}
                className="bg-transparent border-none text-white w-full outline-none text-xs placeholder:text-white/20" />
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-3 flex-shrink-0">
              {tabs.map((tab) => (
                <button key={tab.id} type="button" onClick={() => onTabChange(tab.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    activeTab === tab.id
                      ? "bg-emerald-500/10 text-emerald-400 font-semibold"
                      : "text-white/40 hover:text-white/60 hover:bg-white/5"
                  }`}>
                  {tab.label} <span className="ml-0.5 text-[10px] opacity-50">{tab.count}</span>
                </button>
              ))}
            </div>

            {/* Game list */}
            <div ref={listRef} className="flex-1 overflow-y-auto -mx-1 px-1 space-y-0.5 scrollbar-thin">
              {games.length === 0 ? (
                <p className="text-xs text-muted-foreground/50 text-center py-8">No games match</p>
              ) : (
                games.map((game) => {
                  const isSelected = game.id === selectedId
                  const isMatched = !!game.otixMediaId
                  const hasSuggestion = !!game.otixMatchSuggestion
                  const faded = !isMatched && !hasSuggestion
                  const posterUrl = game.otixPosterUrl || game.posterUrl
                  const displayTitle = game.otixMediaTitle || game.title

                  return (
                    <button key={game.id} type="button" onClick={() => onSelect(game.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all ${
                        isSelected
                          ? "bg-emerald-500/10 border-l-2 border-emerald-500 rounded-l-none"
                          : "hover:bg-white/5"
                      }`}>
                      {/* Thumbnail — catalog poster, or colored platform bar as fallback */}
                      {posterUrl ? (
                        <div className="w-7 h-10 rounded flex-shrink-0 overflow-hidden bg-white/5">
                          <img src={posterUrl} alt="" className={`w-full h-full object-cover ${faded ? "opacity-35" : ""}`}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }} />
                        </div>
                      ) : (
                        <div className={`w-7 h-10 rounded flex-shrink-0 bg-gradient-to-b ${
                          platformColors[game.platform] || "from-gray-600 to-gray-800"
                        } ${faded ? "opacity-35" : ""}`} />
                      )}

                      <div className={`flex-1 min-w-0 ${faded ? "opacity-35" : ""}`}>
                        <div className={`text-xs truncate ${isMatched || hasSuggestion ? "font-semibold" : ""}`}>
                          {displayTitle}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {game.platform.toUpperCase()}{" · "}{lastDir(game.installDir)}
                        </div>
                      </div>

                      {hasSuggestion ? (
                        <LinkIcon size={11} className="text-blue-400 flex-shrink-0" />
                      ) : isMatched ? (
                        <Circle size={6} className="text-emerald-400 fill-emerald-400 flex-shrink-0" />
                      ) : (
                        <Search size={11} className="text-blue-400 flex-shrink-0" />
                      )}
                    </button>
                  )
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-1.5 pt-3 mt-2 border-t border-white/5 flex-shrink-0">
              <button type="button"
                onClick={() => {
                  if (typeof window !== "undefined" && (window as any).desktopAPI)
                    (window as any).desktopAPI.selectDirectory()
                }}
                className="flex-1 text-center py-1.5 rounded-md text-[10px] text-white/40 hover:text-white/60 hover:bg-white/5 transition-all inline-flex items-center justify-center gap-1">
                <Plus size={10} /> Add Folder
              </button>
              <button type="button" onClick={onRescan} disabled={scanning}
                className="flex-1 text-center py-1.5 rounded-md text-[10px] text-white/40 hover:text-white/60 hover:bg-white/5 transition-all disabled:opacity-30 inline-flex items-center justify-center gap-1">
                <RefreshCw size={10} className={scanning ? "animate-spin" : ""} />
                {scanning ? "Scanning..." : "Rescan"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
