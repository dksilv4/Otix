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
}: GamesSidePanelProps) {
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden" onClick={onClose} />}
      <div
        className={`
          bg-[rgba(15,15,20,0.88)] backdrop-blur-xl
          shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_32px_rgba(0,0,0,0.5)]
          rounded-2xl flex flex-col flex-shrink-0
          transition-[width] duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)]
          overflow-hidden
          ${open ? "w-[280px] p-4" : "w-0 p-0"}
        `}
      >
        {open && (
          <>
            <div className="flex items-center justify-between mb-2.5 flex-shrink-0">
              <span className="text-xs font-semibold flex items-center gap-1.5">☰ Library</span>
              <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors text-sm">✕</button>
            </div>
            <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground flex-shrink-0 mb-3">
              <span>🔍</span>
              <input type="text" placeholder="Search games..." value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} className="bg-transparent border-none text-white w-full outline-none text-xs placeholder:text-white/20" />
            </div>
            <div className="flex gap-1 mb-3 flex-shrink-0">
              {(["all", "matched", "unmatched"] as GamesTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => onTabChange(tab)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${activeTab === tab ? "bg-emerald-500/10 text-emerald-400 font-semibold" : "text-white/40 hover:text-white/60 hover:bg-white/5"}`}
                >
                  {tab === "all" ? "All" : tab === "matched" ? "Matched" : "Unmatched"}
                  <span className="ml-1 text-[10px] opacity-50">{games.length}</span>
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-0.5 scrollbar-thin">
              {games.length === 0 ? (
                <p className="text-xs text-muted-foreground/50 text-center py-8">No games match</p>
              ) : (
                games.map((game) => {
                  const isSelected = game.id === selectedId
                  const isSuggestion = !!game.otixMatchSuggestion
                  return (
                    <button
                      key={game.id}
                      onClick={() => onSelect(game.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all ${isSelected ? "bg-emerald-500/10 border-l-2 border-emerald-500 rounded-l-none" : "hover:bg-white/5"}`}
                    >
                      <div className={`w-4 h-6 rounded flex-shrink-0 bg-gradient-to-b ${platformColors[game.platform] || "from-gray-600 to-gray-800"} ${!game.otixMediaId && !isSuggestion ? "opacity-35" : ""}`} />
                      <div className={`flex-1 min-w-0 ${!game.otixMediaId && !isSuggestion ? "opacity-35" : ""}`}>
                        <div className={`text-xs truncate ${game.otixMediaId || isSuggestion ? "font-semibold" : ""}`}>{game.title}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{game.installDir.split(/[\/]/).pop()}</div>
                      </div>
                      {isSuggestion ? (
                        <span className="text-[10px] text-blue-400 flex-shrink-0">🔗</span>
                      ) : game.otixMediaId ? (
                        <span className="text-[10px] text-emerald-400 flex-shrink-0">●</span>
                      ) : (
                        <span className="text-[10px] text-blue-400 flex-shrink-0">🔍</span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
            <div className="flex gap-1.5 pt-3 mt-2 border-t border-white/5 flex-shrink-0">
              <button
                onClick={() => { if (typeof window !== "undefined" && (window as any).electronAPI) (window as any).electronAPI.selectDirectory() }}
                className="flex-1 text-center py-1.5 rounded-md text-[10px] text-white/40 hover:text-white/60 hover:bg-white/5 transition-all"
              >
                ➕ Add Folder
              </button>
              <button
                onClick={onRescan}
                disabled={scanning}
                className="flex-1 text-center py-1.5 rounded-md text-[10px] text-white/40 hover:text-white/60 hover:bg-white/5 transition-all disabled:opacity-30"
              >
                {scanning ? "↻ Scanning..." : "↻ Rescan"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
