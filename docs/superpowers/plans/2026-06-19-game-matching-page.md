# Game Matching Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dedicated matching sub-route to Library settings with game list, match detail panel, accept/reject/unmatch actions, and manual catalog search.

**Architecture:** Sub-route `/settings/library/matching` as sibling of `/settings/library`. Library page gets sub-tab navigation (Library | Matching). Matching page uses split layout: game list (left) + detail panel (right). Accept/reject persists to local SQLite via existing IPC bridge.

**Tech Stack:** React, TanStack Router, Electron IPC, Tailwind CSS, @tanstack/react-query

## Global Constraints

- No new dependencies
- Match existing glassmorphic pattern: `rounded-2xl p-6 bg-white/5 backdrop-blur-xl`
- Use existing `SectionHeader` from `../components/section-header`
- Accept/reject via existing `getDesktopAPI()!.acceptSuggestion()` / `.rejectSuggestion()` IPC
- Manual search via `apiClient.get('/media/search', { params: { q, media_type: 'game' } })`
- All states covered: loading, empty, no selection, error, accepting, rejecting
- `tsc --noEmit` must pass

---

### Task 1: Route + sub-tab navigation in Library page

**Files:**
- Modify: `frontend/src/features/settings/settings.router.ts`
- Modify: `frontend/src/features/settings/sections/library.tsx`
- Create: `frontend/src/features/settings/pages/settings-library-matching-page.tsx`

**Interfaces:**
- Consumes: existing `settingsRoute` parent, `SettingsLayout` component
- Produces: matching route at `/settings/library/matching`, sub-tab nav in Library page

- [ ] **Step 1: Add matching route and lazy import**

In `settings.router.ts`, add import and route after the library route:

```ts
const SettingsLibraryMatchingPage = lazy(() => import('./pages/settings-library-matching-page').then(m => ({ default: m.SettingsLibraryMatchingPage })))

// After settingsLibraryRoute definition:
const settingsLibraryMatchingRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/library/matching',
  component: SettingsLibraryMatchingPage,
})
```

Add to the routes array:
```ts
    settingsLibraryMatchingRoute,
```

Update the nav active check in `settings-layout.tsx` to handle sub-routes:

```ts
const activeSection = location.pathname.replace('/settings/', '').split('/')[0] || 'profile'
```

- [ ] **Step 2: Create matching page file**

Create `pages/settings-library-matching-page.tsx`:

```tsx
import { GameMatchingSection } from '../sections/game-matching'

export function SettingsLibraryMatchingPage() {
  return <GameMatchingSection />
}
```

- [ ] **Step 3: Add sub-tabs to LibrarySection**

Modify `library.tsx` — add tab bar at top and conditionally render scan content or link to matching:

```tsx
// At top of library.tsx, add imports
import { useNavigate, useLocation } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

// Inside LibrarySection, before the return, add:
const navigate = useNavigate()
const location = useLocation()
const activeSubTab = location.pathname.includes('/matching') ? 'matching' : 'library'

const SUB_TABS = [
  { id: 'library', label: 'Library', path: '/settings/library' },
  { id: 'matching', label: 'Matching', path: '/settings/library/matching' },
]
```

Replace the current header div with sub-tab nav:

```tsx
<div className="space-y-8">
  {/* Sub-tab navigation */}
  <div>
    <div className="flex items-center gap-1 mb-1">
      {SUB_TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => navigate({ to: tab.path })}
          className={cn(
            'px-4 py-2 rounded-xl text-sm font-medium transition-all',
            activeSubTab === tab.id
              ? 'bg-white/10 text-white'
              : 'text-white/50 hover:text-white hover:bg-white/5',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
    {/* If activeSubTab is library, render scan content */}
    {activeSubTab === 'library' && (
      <>
        <h2 className="text-lg font-semibold text-white tracking-tight">Library</h2>
        <p className="text-sm mt-1 text-white/60">
          Manage installed games and scan for new ones.
        </p>
      </>
    )}
  </div>

  {activeSubTab === 'library' && <ScannersSection />}
</div>
```

- [ ] **Step 4: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/settings/settings.router.ts \
        frontend/src/features/settings/sections/library.tsx \
        frontend/src/features/settings/pages/settings-library-matching-page.tsx
git commit -m "feat(settings): add matching sub-route and sub-tab nav to Library page"
```

---

### Task 2: GameRow component

**Files:**
- Create: `frontend/src/features/settings/components/game-row.tsx`

**Interfaces:**
- Consumes: `LocalGame` type from `@/old-features/game-scanner/types`
- Produces: `<GameRow game={LocalGame} selected={boolean} onClick={(game) => void} />`

- [ ] **Step 1: Create GameRow component**

Create `frontend/src/features/settings/components/game-row.tsx`:

```tsx
import { Gamepad2, CheckCircle2, Star, Loader2 } from 'lucide-react'
import type { LocalGame } from '@/old-features/game-scanner/types'
import { cn } from '@/lib/utils'

interface GameRowProps {
  game: LocalGame
  selected: boolean
  onClick: (game: LocalGame) => void
}

function getStatusInfo(game: LocalGame): {
  label: string
  color: string
  bg: string
  icon: typeof CheckCircle2
} {
  if (game.data?.id || game.otixMediaId)
    return { label: 'Matched', color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircle2 }
  if (game.otixMatchSuggestion)
    return { label: 'Suggested', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Star }
  return { label: 'Unmatched', color: 'text-white/30', bg: 'bg-white/5', icon: Gamepad2 }
}

export function GameRow({ game, selected, onClick }: GameRowProps) {
  const status = getStatusInfo(game)
  const StatusIcon = status.icon
  const confidence = game.otixConfidence ? Math.round(game.otixConfidence * 100) : null
  const iconUrl = game.localIconUrl || game.iconUrl

  return (
    <button
      onClick={() => onClick(game)}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors',
        selected ? 'bg-white/10' : 'hover:bg-white/5',
      )}
    >
      {/* Icon/fallback */}
      <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 overflow-hidden">
        {iconUrl ? (
          <img src={iconUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <Gamepad2 className="h-4 w-4 text-white/40" />
        )}
      </div>

      {/* Title + platform */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-white">{game.title}</p>
        <p className="text-[11px] text-white/40 capitalize">{game.platform}</p>
      </div>

      {/* Status badge */}
      <div className={cn('flex items-center gap-1 px-2 py-1 rounded-md shrink-0', status.bg)}>
        <StatusIcon className={cn('h-3 w-3', status.color)} />
        <span className={cn('text-[11px] font-medium', status.color)}>{status.label}</span>
      </div>

      {/* Confidence bar */}
      {confidence !== null && (
        <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden shrink-0">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(confidence, 100)}%` }}
          />
        </div>
      )}
    </button>
  )
}
```

- [ ] **Step 2: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/settings/components/game-row.tsx
git commit -m "feat(settings): add GameRow component for match game list"
```

---

### Task 3: ManualSearch component

**Files:**
- Create: `frontend/src/features/settings/components/manual-search.tsx`

**Interfaces:**
- Consumes: `apiClient` from `@/lib/api/client`
- Produces: `<ManualSearch onSelect={(media) => void} />`
  - `media` = `{ id: string; title: string; posterUrl?: string | null }`

- [ ] **Step 1: Create ManualSearch component**

Create `frontend/src/features/settings/components/manual-search.tsx`:

```tsx
import { useState, useEffect, useRef } from 'react'
import { Search, Loader2, Gamepad2 } from 'lucide-react'
import { apiClient } from '@/lib/api/client'

interface SearchResult {
  id: string
  title: string
  slug: string
  posterUrl: string | null
  releaseDate: string | null
}

interface ManualSearchProps {
  onSelect: (media: { id: string; title: string; posterUrl?: string | null }) => void
}

export function ManualSearch({ onSelect }: ManualSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    setSearched(true)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await apiClient.get<{ items: SearchResult[]; hasMore: boolean }>('/media/search', {
          params: { q: query, media_type: 'game', page_size: '12' },
        })
        setResults(data.items || [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search game catalog..."
          className="w-full h-9 rounded-xl bg-white/5 pl-9 pr-3 text-sm outline-none text-white/80 placeholder:text-white/30 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] focus:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)] transition-shadow"
        />
      </div>

      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-white/40" />
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => onSelect({ id: r.id, title: r.title, posterUrl: r.posterUrl })}
              className="rounded-xl overflow-hidden bg-white/5 hover:bg-white/10 transition-colors text-left group"
            >
              <div className="w-full aspect-[2/3] bg-white/5 overflow-hidden">
                {r.posterUrl ? (
                  <img src={r.posterUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Gamepad2 className="h-8 w-8 text-white/15" />
                  </div>
                )}
              </div>
              <p className="text-[10px] font-medium truncate px-1.5 py-1 text-white/70">{r.title}</p>
            </button>
          ))}
        </div>
      )}

      {!loading && searched && results.length === 0 && query.length >= 2 && (
        <p className="mt-2 text-xs text-white/40 text-center py-2">No results found</p>
      )}

      {!searched && (
        <p className="mt-2 text-xs text-white/30 text-center">Type at least 2 characters to search</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/settings/components/manual-search.tsx
git commit -m "feat(settings): add ManualSearch component for catalog search"
```

---

### Task 4: MatchDetailPanel component

**Files:**
- Create: `frontend/src/features/settings/components/match-detail-panel.tsx`

**Interfaces:**
- Consumes: `LocalGame` type, `ManualSearch`, desktopAPI IPC
- Produces: `<MatchDetailPanel game, onAccept, onReject, onUnmatch, onManualMatch, accepting, rejecting />`

- [ ] **Step 1: Create MatchDetailPanel component**

Create `frontend/src/features/settings/components/match-detail-panel.tsx`:

```tsx
import { CheckCircle2, X, Gamepad2, Folder, Loader2, Check } from 'lucide-react'
import type { LocalGame } from '@/old-features/game-scanner/types'
import { ManualSearch } from './manual-search'
import { getDesktopAPI } from '@/lib/desktop/api'

interface MatchDetailPanelProps {
  game: LocalGame | null
  onAccept: (game: LocalGame) => void
  onReject: (game: LocalGame) => void
  onUnmatch: (game: LocalGame) => void
  onManualMatch: (game: LocalGame, media: { id: string; title: string; posterUrl?: string | null }) => void
  accepting: boolean
  rejecting: boolean
}

export function MatchDetailPanel({
  game,
  onAccept,
  onReject,
  onUnmatch,
  onManualMatch,
  accepting,
  rejecting,
}: MatchDetailPanelProps) {
  if (!game) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
        <Gamepad2 className="h-12 w-12 text-white/10 mb-4" />
        <p className="text-sm text-white/40">Select a game to view match details</p>
      </div>
    )
  }

  const isMatched = !!(game.data?.id || game.otixMediaId)
  const hasSuggestion = !!game.otixMatchSuggestion
  const confidence = game.otixConfidence ? Math.round(game.otixConfidence * 100) : null
  const suggestion = game.otixMatchSuggestion
  const matchedTitle = game.data?.title || game.otixMediaTitle
  const posterUrl = game.data?.posterUrl || game.otixPosterUrl || game.posterUrl

  const handleOpenFolder = async () => {
    const api = getDesktopAPI()
    if (api && game.exePath) {
      await api.showItemInFolder(game.exePath).catch(() => {})
    }
  }

  return (
    <div className="space-y-5">
      {/* Preview card */}
      <div className="flex gap-4 p-4 rounded-xl bg-white/5">
        <div className="w-20 h-28 rounded-lg overflow-hidden shrink-0 bg-white/10">
          {posterUrl ? (
            <img src={posterUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Gamepad2 className="h-6 w-6 text-white/20" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{matchedTitle || game.title}</p>
          <p className="text-xs text-white/50 mt-0.5 capitalize">{game.platform}</p>
          {game.exePath && (
            <button
              onClick={handleOpenFolder}
              className="flex items-center gap-1.5 mt-3 text-[11px] text-white/40 hover:text-white/60 transition-colors"
            >
              <Folder className="h-3 w-3" />
              <span className="truncate">{game.exePath}</span>
            </button>
          )}
        </div>
      </div>

      {/* Current match status */}
      <div className="rounded-xl p-4 bg-white/5">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Current Match</p>
        {isMatched ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{matchedTitle}</p>
                {confidence !== null && (
                  <p className="text-xs text-white/50">{confidence}% confidence</p>
                )}
              </div>
            </div>
            <button
              onClick={() => onUnmatch(game)}
              className="shrink-0 text-xs text-red-400/70 hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
            >
              Unmatch
            </button>
          </div>
        ) : (
          <p className="text-sm text-white/40">No match set</p>
        )}
      </div>

      {/* Suggestion */}
      {hasSuggestion && suggestion && (
        <div className="rounded-xl p-4 bg-blue-500/5 border border-blue-500/10">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3">
            Suggested Match
          </p>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-14 rounded overflow-hidden shrink-0 bg-white/10">
              {suggestion.posterUrl ? (
                <img src={suggestion.posterUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Gamepad2 className="h-4 w-4 text-white/30" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{suggestion.title}</p>
              {confidence !== null && (
                <p className="text-xs text-blue-300">{confidence}% confidence</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onAccept(game)}
              disabled={accepting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-xs font-medium hover:bg-green-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {accepting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Accept
            </button>
            <button
              onClick={() => onReject(game)}
              disabled={rejecting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {rejecting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <X className="h-3 w-3" />
              )}
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Manual search */}
      <div className="rounded-xl p-4 bg-white/5">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
          Manual Match
        </p>
        <ManualSearch onSelect={(media) => onManualMatch(game, media)} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/settings/components/match-detail-panel.tsx
git commit -m "feat(settings): add MatchDetailPanel component"
```

---

### Task 5: GameMatchingSection — main orchestrator

**Files:**
- Create: `frontend/src/features/settings/sections/game-matching.tsx`

**Interfaces:**
- Consumes: `GameRow`, `MatchDetailPanel`, `useLocalGames()`, `useMatchLocalGames()`, `acceptSuggestionOnServer`/`rejectSuggestionOnServer` from storage, `useClaimGame()`/`useUnclaimGame()` from library-queries, `getDesktopAPI()` IPC
- Produces: `<GameMatchingSection />` — full matching page

- [ ] **Step 1: Create GameMatchingSection**

Create `frontend/src/features/settings/sections/game-matching.tsx`:

```tsx
import { useState, useCallback, useMemo } from 'react'
import { Search, Loader2, Gamepad2 } from 'lucide-react'
import type { LocalGame } from '@/old-features/game-scanner/types'
import { useLocalGames } from '@/old-features/game-scanner/game-queries'
import { useMatchLocalGames, useSyncLocalGames } from '@/old-features/game-scanner/queries'
import { useClaimGame, useUnclaimGame } from '@/old-features/library/library-queries'
import { acceptSuggestionOnServer, rejectSuggestionOnServer, fetchGames } from '@/old-features/game-scanner/storage'
import { GameRow } from '../components/game-row'
import { MatchDetailPanel } from '../components/match-detail-panel'
import { isDesktop } from '@/lib/desktop/api'

type FilterTab = 'all' | 'matched' | 'unmatched' | 'suggested'

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'matched', label: 'Matched' },
  { id: 'unmatched', label: 'Unmatched' },
  { id: 'suggested', label: 'Suggested' },
]

export function GameMatchingSection() {
  const { data: allGames = [], isLoading, refetch } = useLocalGames()
  const matchMutation = useMatchLocalGames()
  const syncMutation = useSyncLocalGames()
  const claimMutation = useClaimGame()
  const unclaimMutation = useUnclaimGame()

  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [accepting, setAccepting] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  const filteredGames = useMemo(() => {
    let games = allGames
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      games = games.filter((g) => g.title.toLowerCase().includes(q))
    }
    // Status filter
    switch (filterTab) {
      case 'matched':
        return games.filter((g) => g.data?.id || g.otixMediaId)
      case 'unmatched':
        return games.filter((g) => !g.data?.id && !g.otixMediaId && !g.otixMatchSuggestion)
      case 'suggested':
        return games.filter((g) => g.otixMatchSuggestion)
      default:
        return games
    }
  }, [allGames, filterTab, searchQuery])

  const selectedGame = useMemo(
    () => allGames.find((g) => g.id === selectedGameId) ?? null,
    [allGames, selectedGameId],
  )

  // Refresh games from DB
  const refreshGames = useCallback(async () => {
    await fetchGames()
    refetch()
  }, [refetch])

  // Accept a suggestion
  const handleAccept = useCallback(async (game: LocalGame) => {
    if (!game.otixMatchSuggestion) return
    setAccepting(true)
    try {
      const suggestion = game.otixMatchSuggestion
      await acceptSuggestionOnServer(game.id, suggestion as unknown as Record<string, unknown>)
      // Claim on backend
      if (suggestion.id) {
        claimMutation.mutate({ mediaType: 'game', mediaId: suggestion.id })
      }
      await refreshGames()
    } catch (err) {
      console.error('Accept failed:', err)
    } finally {
      setAccepting(false)
    }
  }, [claimMutation, refreshGames])

  // Reject a suggestion
  const handleReject = useCallback(async (game: LocalGame) => {
    if (!game.otixMatchSuggestion?.id) return
    setRejecting(true)
    try {
      await rejectSuggestionOnServer(game.id, game.otixMatchSuggestion.id)
      await refreshGames()
    } catch (err) {
      console.error('Reject failed:', err)
    } finally {
      setRejecting(false)
    }
  }, [refreshGames])

  // Unmatch a game
  const handleUnmatch = useCallback(async (game: LocalGame) => {
    const mediaId = game.data?.id || game.otixMediaId
    if (!mediaId) return
    try {
      // Clear the match via IPC
      const api = (await import('@/lib/desktop/api')).getDesktopAPI()
      if (api) {
        await api.saveLocalGamesMapEntry(mediaId, null as unknown as LocalGame)
      }
      // Unclaim on backend
      unclaimMutation.mutate({ mediaType: 'game', mediaId })
      await refreshGames()
    } catch (err) {
      console.error('Unmatch failed:', err)
    }
  }, [unclaimMutation, refreshGames])

  // Manual match
  const handleManualMatch = useCallback(async (game: LocalGame, media: { id: string; title: string; posterUrl?: string | null }) => {
    try {
      await acceptSuggestionOnServer(game.id, media as unknown as Record<string, unknown>)
      claimMutation.mutate({ mediaType: 'game', mediaId: media.id })
      await refreshGames()
    } catch (err) {
      console.error('Manual match failed:', err)
    }
  }, [claimMutation, refreshGames])

  if (!isDesktop()) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Gamepad2 className="h-10 w-10 text-white/20" />
        <p className="text-sm font-medium text-white">Desktop Only</p>
        <p className="text-xs text-white/60 mt-1">Matching is only available in the desktop app.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-white/5 animate-pulse" />
        ))}
      </div>
    )
  }

  if (allGames.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Gamepad2 className="h-10 w-10 text-white/20" />
        <p className="text-sm font-medium text-white">No Games Found</p>
        <p className="text-xs text-white/60 mt-1">
          Scan your library first to discover installed games.
        </p>
      </div>
    )
  }

  const stats = {
    total: allGames.length,
    matched: allGames.filter((g) => g.data?.id || g.otixMediaId).length,
    unmatched: allGames.filter((g) => !g.data?.id && !g.otixMediaId && !g.otixMatchSuggestion).length,
    suggested: allGames.filter((g) => g.otixMatchSuggestion).length,
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs text-white/50">
        <span>{stats.total} total</span>
        <span className="text-green-400/70">{stats.matched} matched</span>
        {stats.suggested > 0 && <span className="text-blue-400/70">{stats.suggested} suggested</span>}
        {stats.unmatched > 0 && <span className="text-white/30">{stats.unmatched} unmatched</span>}
      </div>

      {/* Filter + search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter games..."
            className="w-full h-8 rounded-lg bg-white/5 pl-8 pr-3 text-xs outline-none text-white/70 placeholder:text-white/30 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] focus:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)] transition-shadow"
          />
        </div>
        <div className="flex gap-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setFilterTab(tab.id); setSelectedGameId(null) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterTab === tab.id
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Split layout */}
      <div className="flex gap-4 min-h-[500px]">
        {/* Game list - left */}
        <div className="w-[40%] shrink-0 space-y-0.5 overflow-y-auto max-h-[600px] pr-1">
          {filteredGames.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-xs text-white/30">
              {searchQuery ? 'No games match your search' : 'No games in this filter'}
            </div>
          ) : (
            filteredGames.map((g) => (
              <GameRow
                key={g.id}
                game={g}
                selected={selectedGame?.id === g.id}
                onClick={(game) => setSelectedGameId(game.id)}
              />
            ))
          )}
        </div>

        {/* Detail panel - right */}
        <div className="flex-1 rounded-2xl p-5 bg-white/5 backdrop-blur-xl overflow-y-auto max-h-[600px]">
          <MatchDetailPanel
            game={selectedGame}
            onAccept={handleAccept}
            onReject={handleReject}
            onUnmatch={handleUnmatch}
            onManualMatch={handleManualMatch}
            accepting={accepting}
            rejecting={rejecting}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/settings/sections/game-matching.tsx
git commit -m "feat(settings): add GameMatchingSection with split-panel matching UI"
```

---

### Task 6: Verify full build

**Files:** None

- [ ] **Step 1: Full TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: Zero errors

- [ ] **Step 2: Check all routes load**

Verify the route changes compile correctly — no duplicate routes, no missing imports.
Check that `/settings/library/matching` is a sibling of `/settings/library` (both parented to `settingsRoute`).

- [ ] **Step 3: Commit any fixes**

If there are type issues, fix them, then commit.
