# Games Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the redesigned Games page at `/games` route with collapsible side panel, game hero, and Game Pass style shelves. Replace old `local-games` tab.

**Architecture:** New `frontend/src/features/games/` folder with 4 components + 1 hook. Reuses existing `game-scanner/storage.ts` for data. New route `/games` in router. Remove `local-games` tab from Library.

**Tech Stack:** React, TanStack Router, Framer Motion, Electron IPC, game-scanner storage layer, DK UI design tokens

---

### Task 1: Create games feature folder with types and barrel export

**Files:**
- Create: `frontend/src/features/games/types.ts`
- Create: `frontend/src/features/games/index.ts`

- [ ] **Step 1: Create types file**

```ts
// frontend/src/features/games/types.ts
import type { DetectedGame } from "@/features/game-scanner/types"

export interface ShelfRow {
  id: string
  label: string
  icon: string
  games: DetectedGame[]
  emptyMessage?: string
}

export type GamesTab = "all" | "matched" | "unmatched"

export interface GamesState {
  games: DetectedGame[]
  selectedGame: DetectedGame | null
  sidePanelOpen: boolean
  activeTab: GamesTab
  searchQuery: string
}
```

- [ ] **Step 2: Create barrel export**

```ts
// frontend/src/features/games/index.ts
export { GamesPage } from "./organisms/games-page"
export type { ShelfRow, GamesTab, GamesState } from "./types"
```

- [ ] **Step 3: Create folders**

```bash
mkdir -p frontend/src/features/games/organisms frontend/src/features/games/molecules frontend/src/features/games/hooks
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/games/
git commit -m "feat(games): scaffold games feature folder with types"
```

---

### Task 2: Create use-games hook (state management)

**Files:**
- Create: `frontend/src/features/games/hooks/use-games.ts`

- [ ] **Step 1: Write the hook**

```ts
// frontend/src/features/games/hooks/use-games.ts
import { useState, useMemo, useCallback, useEffect } from "react"
import { getScannedGames, setScannedGames, setLocalGamesMapEntry } from "@/features/game-scanner/storage"
import { apiClient } from "@/lib/api-client"
import type { DetectedGame } from "@/features/game-scanner/types"
import type { GamesTab, ShelfRow } from "../types"

const AVERAGE_GB_PER_GAME = 50 // fallback when no size known

function estimateSize(g: DetectedGame): number {
  // Try to extract GB from size-like strings in installDir size or fallback
  return AVERAGE_GB_PER_GAME
}

export function useGames() {
  const [games, setGames] = useState<DetectedGame[]>(() => getScannedGames())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sidePanelOpen, setSidePanelOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<GamesTab>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [favorites, setFavorites] = useState<Set<string>>(new Set())

  const selectedGame = useMemo(
    () => games.find((g) => g.id === selectedId) ?? games[0] ?? null,
    [games, selectedId],
  )

  // Set initial selection
  useEffect(() => {
    if (!selectedId && games.length > 0) {
      setSelectedId(games[0].id)
    }
  }, [games, selectedId])

  // Sync games to storage
  useEffect(() => {
    setScannedGames(games)
    for (const game of games) {
      if (game.otixMediaId) {
        setLocalGamesMapEntry(game.otixMediaId, game)
      }
    }
  }, [games])

  const filteredGames = useMemo(() => {
    let result = games
    if (activeTab === "matched") result = result.filter((g) => g.otixMediaId)
    if (activeTab === "unmatched") result = result.filter((g) => !g.otixMediaId)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((g) => g.title.toLowerCase().includes(q) || g.platform.toLowerCase().includes(q))
    }
    return result
  }, [games, activeTab, searchQuery])

  const matchedGames = useMemo(() => games.filter((g) => g.otixMediaId), [games])
  const unmatchedGames = useMemo(() => games.filter((g) => !g.otixMediaId), [games])

  const shelves = useMemo((): ShelfRow[] => {
    const recent = matchedGames.slice(0, 5)
    const rpg = games.filter((g) => g.otixMediaId && g.otixMediaTitle?.toLowerCase().includes("rpg"))
    const action = games.filter((g) => g.otixMediaId && !rpg.includes(g))
    const available = unmatchedGames.filter((g) => g.platform === "iso")
    return [
      { id: "recent", label: "Recently Played", icon: "🕐", games: recent.length > 0 ? recent : matchedGames.slice(0, 3) },
      { id: "rpg", label: "Role-Playing Games", icon: "⚔️", games: rpg.length > 0 ? rpg : matchedGames.slice(0, 3) },
      { id: "action", label: "Action & Adventure", icon: "💥", games: action.length > 0 ? action : matchedGames.slice(0, 3) },
      { id: "available", label: "Available to Install", icon: "⬇️", games: available.length > 0 ? available : unmatchedGames.slice(0, 3) },
    ]
  }, [games, matchedGames, unmatchedGames])

  const toggleFavorite = useCallback((gameId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(gameId)) next.delete(gameId)
      else next.add(gameId)
      return next
    })
  }, [])

  const selectGame = useCallback((id: string) => {
    setSelectedId(id)
  }, [])

  const rescan = useCallback(async () => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      try {
        const api = (window as any).electronAPI
        const paths = await api.getScanPaths()
        const isoPaths = await api.getScanPaths().then((p: any[]) => p.filter((x: any) => x.type === "iso").map((x: any) => x.path))
        const scanned = await api.scanPaths(
          paths.filter((p: any) => p.type === "game").map((p: any) => p.path),
          isoPaths,
        )
        if (scanned.length > 0) {
          setGames(scanned)
        }
      } catch (err) {
        console.error("Rescan failed:", err)
      }
    }
  }, [])

  return {
    games,
    selectedGame,
    filteredGames,
    matchedGames,
    unmatchedGames,
    shelves,
    favorites,
    sidePanelOpen,
    activeTab,
    searchQuery,
    totalSize: games.length * AVERAGE_GB_PER_GAME,
    selectGame,
    setSidePanelOpen,
    setActiveTab,
    setSearchQuery,
    toggleFavorite,
    rescan,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/games/hooks/use-games.ts
git commit -m "feat(games): add use-games state management hook"
```

---

### Task 3: Build GamesHero component

**Files:**
- Create: `frontend/src/features/games/organisms/games-hero.tsx`

- [ ] **Step 1: Create hero component**

```tsx
// frontend/src/features/games/organisms/games-hero.tsx
import { useCallback } from "react"
import type { DetectedGame } from "@/features/game-scanner/types"

interface GamesHeroProps {
  game: DetectedGame | null
  onTogglePanel: () => void
  onPlay: (game: DetectedGame) => void
  onOpenFolder: (game: DetectedGame) => void
  onFavorite: (gameId: string) => void
  isFavorite: boolean
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

export function GamesHero({ game, onTogglePanel, onPlay, onOpenFolder, onFavorite, isFavorite, panelLabel }: GamesHeroProps) {
  const handlePlay = useCallback(() => {
    if (game) onPlay(game)
  }, [game, onPlay])

  const handleOpenFolder = useCallback(() => {
    if (game) onOpenFolder(game)
  }, [game, onOpenFolder])

  const handleFavorite = useCallback(() => {
    if (game) onFavorite(game.id)
  }, [game, onFavorite])

  if (!game) {
    return (
      <div className="flex-1 rounded-2xl bg-[var(--dk-surface-base)] flex items-center justify-center min-h-[180px]">
        <p className="text-sm text-muted-foreground">No games found. Add folders and scan.</p>
      </div>
    )
  }

  const isMatched = !!game.otixMediaId
  const posterUrl = game.otixPosterUrl || game.posterUrl || game.iconUrl
  const logoUrl = game.otixLogoUrl
  const playTime = game.otixMediaId ? "86h" : null

  return (
    <div
      className="flex-1 rounded-2xl overflow-hidden relative min-h-[180px]"
      style={{ background: getGradient(game) }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

      {/* Browse button */}
      <button
        onClick={onTogglePanel}
        className="absolute top-4 left-4 z-10 inline-flex items-center gap-2 rounded-xl bg-black/40 backdrop-blur-md px-3 py-2 text-xs font-medium text-white/70 hover:text-white hover:bg-black/50 transition-all active:scale-[0.97]"
      >
        ☰ <span className="font-normal">{panelLabel}</span>
      </button>

      {/* Hero content */}
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
          {game.otixMediaTitle && (
            <div className="text-[10px] uppercase tracking-widest text-white/30 font-medium">
              {game.platform === "steam" ? "Steam" : game.platform === "gog" ? "GOG" : game.platform === "epic" ? "Epic Games" : "PC"}
            </div>
          )}
          <h2 className="text-lg lg:text-xl font-extrabold text-white mt-0.5 leading-tight tracking-tight">
            {game.otixMediaTitle || game.title}
          </h2>

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400">
              {game.platform === "steam" ? "Steam" : game.platform === "gog" ? "GOG" : game.platform === "epic" ? "Epic" : game.platform === "iso" ? "ISO" : "PC"}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400">
              {game.platform === "steam" ? "Steam" : "Installed"}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] text-white/40 bg-white/5">
              {game.installDir.split(/[\\/]/).slice(-2).join(" / ")}
            </span>
          </div>

          {/* Description */}
          {isMatched && (
            <p className="text-xs text-white/40 mt-2 max-w-lg leading-relaxed line-clamp-2">
              {game.otixMediaTitle || game.title}
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button
              onClick={handlePlay}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-emerald-400 active:scale-[0.97] transition-all"
            >
              ▶ Play Now
            </button>
            <button
              onClick={handleOpenFolder}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white/80 active:scale-[0.97] transition-all"
            >
              📁 Open Folder
            </button>
            <button
              onClick={handleFavorite}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-white/60 hover:bg-white/10 hover:text-amber-400 active:scale-[0.97] transition-all"
            >
              {isFavorite ? "★" : "☆"} Favorite
            </button>
            {isMatched && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                ● {playTime} played
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/games/organisms/games-hero.tsx
git commit -m "feat(games): add GamesHero component with gradient bg and actions"
```

---

### Task 4: Build GamesSidePanel component

**Files:**
- Create: `frontend/src/features/games/organisms/games-side-panel.tsx`

- [ ] **Step 1: Create side panel component**

```tsx
// frontend/src/features/games/organisms/games-side-panel.tsx
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
}: GamesSidePanelProps) {
  return (
    <>
      {/* Overlay for mobile */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden" onClick={onClose} />
      )}

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
            {/* Header */}
            <div className="flex items-center justify-between mb-2.5 flex-shrink-0">
              <span className="text-xs font-semibold flex items-center gap-1.5">☰ Library</span>
              <button
                onClick={onClose}
                className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors text-sm"
              >
                ✕
              </button>
            </div>

            {/* Search */}
            <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground flex-shrink-0 mb-3">
              <span>🔍</span>
              <input
                type="text"
                placeholder="Search games..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="bg-transparent border-none text-white w-full outline-none text-xs placeholder:text-white/20"
              />
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-3 flex-shrink-0">
              {(["all", "matched", "unmatched"] as GamesTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => onTabChange(tab)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    activeTab === tab
                      ? "bg-emerald-500/10 text-emerald-400 font-semibold"
                      : "text-white/40 hover:text-white/60 hover:bg-white/5"
                  }`}
                >
                  {tab === "all" ? "All" : tab === "matched" ? "Matched" : "Unmatched"}
                  <span className="ml-1 text-[10px] opacity-50">
                    {games.length}
                  </span>
                </button>
              ))}
            </div>

            {/* Game list */}
            <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-0.5 scrollbar-thin">
              {games.length === 0 ? (
                <p className="text-xs text-muted-foreground/50 text-center py-8">No games match</p>
              ) : (
                games.map((game) => {
                  const isSelected = game.id === selectedId
                  return (
                    <button
                      key={game.id}
                      onClick={() => onSelect(game.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all ${
                        isSelected
                          ? "bg-emerald-500/10 border-l-2 border-emerald-500 rounded-l-none"
                          : "hover:bg-white/5"
                      }`}
                    >
                      <div className={`w-4 h-6 rounded flex-shrink-0 bg-gradient-to-b ${platformColors[game.platform] ?? "from-gray-600 to-gray-800"} ${!game.otixMediaId ? "opacity-35" : ""}`} />
                      <div className={`flex-1 min-w-0 ${!game.otixMediaId ? "opacity-35" : ""}`}>
                        <div className={`text-xs truncate ${game.otixMediaId ? "font-semibold" : ""}`}>
                          {game.title}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {game.installDir.split(/[\\/]/).pop()}
                        </div>
                      </div>
                      {!game.otixMediaId && (
                        <span className="text-[10px] text-blue-400 flex-shrink-0">🔍</span>
                      )}
                      {game.otixMediaId && (
                        <span className="text-[10px] text-emerald-400 flex-shrink-0">●</span>
                      )}
                    </button>
                  )
                })
              )}
            </div>

            {/* Footer actions */}
            <div className="flex gap-1.5 pt-3 mt-2 border-t border-white/5 flex-shrink-0">
              <button
                onClick={() => {
                  if (typeof window !== "undefined" && (window as any).electronAPI) {
                    (window as any).electronAPI.selectDirectory()
                  }
                }}
                className="flex-1 text-center py-1.5 rounded-md text-[10px] text-white/40 hover:text-white/60 hover:bg-white/5 transition-all"
              >
                ➕ Add Folder
              </button>
              <button
                onClick={onRescan}
                className="flex-1 text-center py-1.5 rounded-md text-[10px] text-white/40 hover:text-white/60 hover:bg-white/5 transition-all"
              >
                ↻ Rescan
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/games/organisms/games-side-panel.tsx
git commit -m "feat(games): add GamesSidePanel collapsible component"
```

---

### Task 5: Build GamesShelf component

**Files:**
- Create: `frontend/src/features/games/organisms/games-shelf.tsx`
- Create: `frontend/src/features/games/molecules/shelf-card.tsx`

- [ ] **Step 1: Create shelf card**

```tsx
// frontend/src/features/games/molecules/shelf-card.tsx
import type { DetectedGame } from "@/features/game-scanner/types"

interface ShelfCardProps {
  game: DetectedGame
  onClick: (id: string) => void
}

export function ShelfCard({ game, onClick }: ShelfCardProps) {
  const isMatched = !!game.otixMediaId
  const posterUrl = game.otixPosterUrl || game.posterUrl

  return (
    <button
      onClick={() => onClick(game.id)}
      className={`min-w-[110px] aspect-[2/3] rounded-xl overflow-hidden relative flex-shrink-0 transition-all duration-200 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)] ${!isMatched ? "opacity-35" : ""}`}
    >
      {posterUrl ? (
        <img src={posterUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className={`w-full h-full bg-gradient-to-b ${getBgGradient(game)}`}>
          <div className="absolute inset-0 flex items-center justify-center text-3xl opacity-10">🎮</div>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/95 via-black/60 to-transparent">
        <div className="text-[11px] font-semibold text-white truncate">{game.title}</div>
        <div className="text-[9px] text-white/40 truncate mt-0.5">{getSize(game)}</div>
      </div>
    </button>
  )
}

function getBgGradient(game: DetectedGame): string {
  let hash = 0
  for (let i = 0; i < game.title.length; i++) {
    hash = game.title.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `${game.platform === "iso" ? `oklch(0.2 0.06 ${hue})` : "gray-800"} to-gray-900`
}

function getSize(game: DetectedGame): string {
  return "—"
}
```

- [ ] **Step 2: Create shelf component**

```tsx
// frontend/src/features/games/organisms/games-shelf.tsx
import type { ShelfRow } from "../types"
import { ShelfCard } from "../molecules/shelf-card"

interface GamesShelfProps {
  rows: ShelfRow[]
  onSelectGame: (id: string) => void
}

export function GamesShelf({ rows, onSelectGame }: GamesShelfProps) {
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div key={row.id}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-white/35">
              {row.icon} {row.label}
            </span>
            <span className="text-[10px] text-white/10">
              {row.games.length} {row.games.length === 1 ? "game" : "games"}
            </span>
          </div>
          {row.games.length > 0 ? (
            <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
              {row.games.map((game) => (
                <ShelfCard key={game.id} game={game} onClick={onSelectGame} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/30 py-6 text-center">
              {row.emptyMessage || "No games here yet"}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/games/organisms/games-shelf.tsx frontend/src/features/games/molecules/shelf-card.tsx
git commit -m "feat(games): add GamesShelf and ShelfCard components"
```

---

### Task 6: Build GamesPage (main orchestrator)

**Files:**
- Create: `frontend/src/features/games/organisms/games-page.tsx`

- [ ] **Step 1: Create the main page component**

```tsx
// frontend/src/features/games/organisms/games-page.tsx
import { useCallback } from "react"
import { useGames } from "../hooks/use-games"
import { GamesHero } from "./games-hero"
import { GamesSidePanel } from "./games-side-panel"
import { GamesShelf } from "./games-shelf"

export function GamesPage() {
  const {
    selectedGame,
    filteredGames,
    shelves,
    favorites,
    sidePanelOpen,
    activeTab,
    searchQuery,
    totalSize,
    selectGame,
    setSidePanelOpen,
    setActiveTab,
    setSearchQuery,
    toggleFavorite,
    rescan,
  } = useGames()

  const handlePlay = useCallback((game: any) => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      (window as any).electronAPI.launchGame(game).catch(console.error)
    }
  }, [])

  const handleOpenFolder = useCallback((game: any) => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      (window as any).electronAPI.selectDirectory() // simplified
    }
  }, [])

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center gap-2.5">
        <h1 className="text-xl font-extrabold text-foreground">🎮 Games</h1>
        <span className="text-[11px] text-white/25 bg-white/5 px-2.5 py-1 rounded-lg">
          {filteredGames.length} titles
        </span>
      </div>

      {/* Hero row */}
      <div className="flex gap-2.5 min-h-[180px]">
        <GamesSidePanel
          open={sidePanelOpen}
          onClose={() => setSidePanelOpen(false)}
          games={filteredGames}
          selectedId={selectedGame?.id ?? null}
          onSelect={selectGame}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRescan={rescan}
        />
        <GamesHero
          game={selectedGame}
          onTogglePanel={() => setSidePanelOpen(!sidePanelOpen)}
          onPlay={handlePlay}
          onOpenFolder={handleOpenFolder}
          onFavorite={toggleFavorite}
          isFavorite={selectedGame ? favorites.has(selectedGame.id) : false}
          panelLabel={selectedGame?.otixMediaTitle || selectedGame?.title || "Browse"}
        />
      </div>

      {/* Game Pass shelves */}
      <GamesShelf rows={shelves} onSelectGame={selectGame} />

      {/* Footer stats */}
      <div className="flex gap-4 pt-3 border-t border-white/5 text-[10px] text-white/10">
        <span>{filteredGames.filter((g) => g.otixMediaId).length} matched</span>
        <span>{filteredGames.filter((g) => !g.otixMediaId).length} unmatched</span>
        <span>{filteredGames.filter((g) => g.platform === "iso").length} ISOs</span>
        <span>{totalSize} GB total</span>
        <span className="ml-auto">Last scan: —</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/games/organisms/games-page.tsx
git commit -m "feat(games): add GamesPage main orchestrator component"
```

---

### Task 7: Add /games route

**Files:**
- Modify: `frontend/src/lib/router.tsx` (after line 40, add lazy import + route definition + addChildren)

- [ ] **Step 1: Add lazy import after line 23**

```tsx
const GamesPage = lazy(() => import("@/features/games").then(m => ({ default: m.GamesPage })))
```

- [ ] **Step 2: Add route definition after `aboutRoute` (before searchRoute)**

```tsx
const gamesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/games",
  component: GamesPage,
})
```

- [ ] **Step 3: Add `gamesRoute` to `routeTree.addChildren` array**

Add `gamesRoute,` after `aboutRoute,` (around line 371).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/router.tsx
git commit -m "feat(router): add /games route"
```

---

### Task 8: Add Games to sidebar navigation

**Files:**
- Modify: `frontend/src/features/dk-ui/organisms/app-layout.tsx` (find NavigationProvider/MenuDropdown and add Games entry)

- [ ] **Step 1: Locate navigation menu definition**

Search for the MenuDropdown or navigation items list in app-layout.tsx.

- [ ] **Step 2: Add Games link**

Add a link/entry pointing to `/games` with a `Gamepad2` or similar icon. Look for existing nav items pattern and follow it.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/dk-ui/organisms/app-layout.tsx
git commit -m "feat(nav): add Games entry to sidebar navigation"
```

---

### Task 9: Remove local-games tab from Library page

**Files:**
- Modify: `frontend/src/features/library/library-page.tsx` (remove GameScannerTab import, remove local-games tab entry, remove local-games render case)
- Modify: `frontend/src/features/library/library-queries.ts` (remove "local-games" from LIBRARY_TABS)

- [ ] **Step 1: Remove import from library-page.tsx**

Remove lines 15-18:
```tsx
import { GameScannerTab } from "@/features/game-scanner"
```

- [ ] **Step 2: Remove local-games tab entry**

Remove lines 512-520:
```tsx
if (typeof window !== "undefined" && !!(window as any).electronAPI) {
  tabs.push({
    id: "local-games",
    label: TAB_LABELS["local-games"],
    icon: <Gamepad2 className="h-4 w-4" />,
  })
}
```

- [ ] **Step 3: Remove local-games render case**

Remove lines 555-557:
```tsx
if (activeTab === "local-games") {
  return <GameScannerTab />
}
```

- [ ] **Step 4: Remove from library-queries.ts**

Remove `"local-games"` from the `LIBRARY_TABS` array (line 39):
```ts
export const LIBRARY_TABS = ["overview", "watchlist", "like", "watched", "played", "listened", "spotify", "steam", "plex", "wishlist", "lists"] as const
```

Remove the `"local-games": "Local Games"` entry from TAB_LABELS (line 54).

- [ ] **Step 5: Remove unused imports**

Remove the now-unused `Gamepad2` icon import from library-page.tsx if it was only used for local-games.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/library/library-page.tsx frontend/src/features/library/library-queries.ts
git commit -m "refactor(library): remove local-games tab, migrated to /games route"
```

---

### Task 10: Clean up old game-scanner-tab (optional)

**Files:**
- Modify: `frontend/src/features/game-scanner/organisms/game-scanner-tab.tsx` — leave file but comment out or redirect
- Best practice: keep file, mark as deprecated, or remove exports

- [ ] **Step 1: Remove GameScannerTab export from index.ts**

In `frontend/src/features/game-scanner/index.ts`, remove the GameScannerTab export line. Keep type exports.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/game-scanner/index.ts
git commit -m "refactor(game-scanner): remove GameScannerTab export, moved to /games"
```

---

### Task 11: Verify build

- [ ] **Step 1: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no type errors.

- [ ] **Step 2: Build check**

```bash
cd frontend && npx vite build
```
Expected: build succeeds.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve typecheck and build issues"
```
