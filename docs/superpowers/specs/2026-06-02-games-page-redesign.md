# Games Page Redesign — Design Spec

## Overview

Completely redesign the Electron games tab from a clunky scanner interface into a modern, feature-rich game launcher inspired by Xbox Game Pass, Steam, and GOG Galaxy. Uses Otix DK UI design language (no borders, surface stacking, glass effects, emerald accent).

## Architecture

### Route
- **`/games`** — new top-level route in TanStack Router under standard `DkAppLayout`
- Tab accessible from sidebar navigation via `Gamepad2` icon

### Page Structure

```
┌─────────────────────────────────────────┐
│ 🎮 Games · 12 titles                    │
├─────────────────────────────────────────┤
│ ┌──────┐ ┌────────────────────────────┐ │
│ │ SIDE │ │       HERO                 │ │
│ │ PANEL│ │  poster + title + meta     │ │
│ │      │ │  + badges + desc + actions │ │
│ └──────┘ └────────────────────────────┘ │
│                                         │
│ [For You] [Recent] [Action] [RPG] [FPS] │
│                                         │
│ 🕐 Recently Played                      │
│ [card] [card] [card] ← horizontal shelf │
│                                         │
│ ⚔️ Role-Playing Games                   │
│ [card] [card] [card] ← horizontal shelf │
│                                         │
│ 💥 Action & Adventure                   │
│ [card] [card]                           │
│                                         │
│ ⬇️ Available to Install (via NZB)       │
│ [card] [card] [card] ← dimmed          │
└─────────────────────────────────────────┘
```

### Key Components

1. **Hero Row** — flex container: `[side panel | hero content]`
2. **Side Panel** — collapsible, width: 0 → 280px, glass surface, game list with tabs + search
3. **Hero Content** — background gradient, poster (80x120px), title, metadata badges, description, action buttons (Play, Open Folder, Favorite), playtime indicator
4. **Game Pass Shelves** — horizontal scrollable rows with section labels, categorized by genre/status
5. **Browser Background** — single `rgba(10,10,15,0.5)` surface behind everything

### Component Tree

```
/pages/games-page.tsx
├── games-hero-row.tsx
│   ├── games-side-panel.tsx (collapsible, glass)
│   │   ├── search input
│   │   ├── tab filters (All/Matched/Unmatched)
│   │   ├── game list (scrollable)
│   │   └── actions (Add Folder, Rescan)
│   └── games-hero.tsx
│       ├── background gradient (dynamic per game)
│       ├── poster image
│       ├── title + metadata + badges
│       ├── description
│       ├── action buttons (Play, Open Folder, Favorite)
│       └── playtime indicator
├── games-shelf-row.tsx (For You, Recent, Action, RPG, etc.)
│   └── games-shelf-card.tsx (poster card, horizontal scroll)
└── games-footer.tsx (stats: matched/unmatched/ISOs/GB)
```

## Visual Design

### Design Tokens Applied
- **No borders** — separation via surface contrast + shadows only
- **Glass surfaces** — `rgba(15,15,20,0.88)` + `backdrop-filter: blur(20px)` + `inset 0 1px 0 rgba(white, 0.08)`
- **Radii** — hero/side panel: 20px, buttons: 10px, shelf cards: 10px
- **Emerald accent** — `#10b981` for primary/play/active states
- **Typography** — system-ui sans-serif, JetBrains Mono for data
- **Elevation** — layered shadows, no hard box-shadows

### Hero States
- **Matched game** — full gradient background, poster, platform badges, genre badges, size, playtime, Play button
- **Unmatched game** — dimmed gradient, poster, "Find Match" hint, "Not installed" status

### Card States
- **Matched** — full opacity, platform badge, title, size, playtime
- **Unmatched** — 35% opacity, platform badge, dimmed title, "Find match" hint
- **Hover** — translateY(-3px) scale(1.02), elevation increase

### Side Panel States
- **Closed** — width: 0, overflow: hidden
- **Open** — width: 280px, glass surface, game list visible
- **Transition** — 0.4s cubic-bezier(0.16, 1, 0.3, 1)
- **Game list rows** — active state: green left border, active game highlighted
- **Tabs** — All/Matched/Unmatched filter the list + search

## Data Flow

### Scan → Display Pipeline
1. `electronAPI.scanPaths(paths, isoPaths)` → `DetectedGame[]`
2. Stored in Electron SQLite DB (`scanned_games` table)
3. Loaded via `getScannedGames()` from storage cache
4. Matched against Otix catalog via `POST /media/match-local-games`
5. Matched games get `otixMediaId`, `otixPosterUrl`, `otixLogoUrl`, etc.

### Game Interaction
- Click game in side panel → updates hero (no navigation)
- Click shelf card → updates hero
- Play button → `electronAPI.launchGame(game)` 
- Favorite → local state, persisted to SQLite
- Open Folder → `shell.openPath(game.installDir)`

### Shelf Categories
- **Recently Played** — games with recent `game:ended` events from game-detector
- **RPG / Action / FPS** — genre tagging from Otix catalog match
- **Available to Install** — unmatched ISOs + catalog games with NZBPlanet availability

## Features (from user requirements)
- [x] Large featured game hero
- [x] Collapsible side panel with game list
- [x] Game Pass style shelves by category
- [x] Clear matched/unmatched visual separation
- [x] Per-game size display
- [x] Play time tracking
- [x] Favorites
- [x] Right-click context menu (future: Open Folder, Run As Admin)
- [x] Auto-match on scan
- [x] Available to Install section
- [x] Recently Played tracking
- [x] Search + filter
- [x] Floating glass UI (Otix DK language)

## Migration from Existing Code
- Replace `game-scanner-tab.tsx` content with new layout
- Keep existing storage layer (`storage.ts`, queries.ts)
- Keep existing Electron IPC (scan, launch, match)
- Keep existing modals (ISO Installer, Match Games) accessible
- Remove: directory manager from page (move to settings), old game grid, old platform filter

## Files to Create/Modify

### New Files
- `frontend/src/features/games/` (new feature folder)
  - `organisms/games-page.tsx` — main page
  - `organisms/games-hero.tsx` — hero component
  - `organisms/games-side-panel.tsx` — collapsible panel
  - `organisms/games-shelf.tsx` — shelf row + cards
  - `molecules/games-shelf-card.tsx` — individual shelf card
  - `molecules/games-hero-content.tsx` — hero content block
  - `hooks/use-games.ts` — game state management
  - `types.ts` — game types

### Modified Files
- `frontend/src/features/game-scanner/storage.ts` — add favorites, shelf categorization
- Route config — add `/games` route
- Sidebar navigation — add Games entry
- `library-page.tsx` — remove local-games tab reference (moved to /games)

## Edge Cases
- **No games scanned** → show empty state with "Scan your first game" prompt
- **All unmatched** → hero shows first game, all shelves show dimmed cards
- **Scanning in progress** → loading state with progress bar
- **Search no results** → "No games match" message in side panel
- **Panel open + small window** → panel collapses automatically on resize < 768px
- **Click outside panel** → panel closes
- **Keyboard navigation** → Escape closes panel
