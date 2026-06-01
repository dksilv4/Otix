# Game Scanner Integration — Design Spec

**Date:** 2026-06-01
**Status:** Draft

## Goal

Move the Game Scanner from an admin-only test page (`/admin/desktop`) into the main Library as a "Local Games" tab. Redesign the UI from scratch to match the app's design language. Keep the ISO installer as a modal.

## Current State

- 2530-line `DesktopScanner` component in `features/experiments/desktop-scanner.tsx`
- Routed at `/admin/desktop` (admin-only via nav guard)
- `LocalGamePlayButton` already works on media detail pages (reads `otix_local_games_map` from localStorage)
- Electron auto-redirects to `/admin/desktop` on startup
- Backend `POST /media/match-local-games` endpoint functional
- Mock data and browser fallbacks mixed into production code
- ISO installer is a secondary tab within the scanner page

## Architecture

### New feature directory

```
features/game-scanner/
  index.ts                          # re-exports
  types.ts                          # DetectedGame, MountResult, UpdateFile, etc.
  storage.ts                        # localStorage read/write helpers
  queries.ts                        # useMatchLocalGames mutation
  molecules/
    game-card.tsx                   # individual scanned game card
    game-grid.tsx                   # responsive grid with stagger animation
    directory-manager.tsx           # add/remove scan directories (collapsible)
    scan-progress.tsx               # live progress bar during scan
    platform-filter.tsx             # filter pills (All/Steam/PC/ISO)
    empty-state.tsx                 # empty state (no games, no dirs, scanning)
  organisms/
    game-scanner-tab.tsx            # library tab content — composes above molecules
    iso-installer-modal.tsx         # modal with 4-step stepper
    iso-organizer-modal.tsx         # ISO file organizer modal
```

### Route

No new route. Added as `"local-games"` tab in existing `/library/$tab`.

### Tab visibility

- Only shown when `window.electronAPI` exists (Electron desktop app)
- Hidden entirely in browser — no download prompt

### Backwards compat

- `/admin/desktop` redirects to `/library/local-games`
- Old `DesktopScanner` component left as deprecated re-export
- Admin home page removes "Game Scanner" tool card
- Electron auto-redirect in router.tsx updated: `navigate({ to: "/library/local-games" })`

## Library Integration

Add `"local-games"` to `LIBRARY_TABS` and `TAB_LABELS` in `library-queries.ts`.

In `LibraryPage`, conditionally include the tab:
```tsx
if (typeof window !== "undefined" && window.electronAPI) {
  tabs.push({ id: "local-games", label: "Local Games", icon: <Gamepad2 /> })
}
```

## Component Design

### game-scanner-tab.tsx

Top-level tab content. Owns all scanner state (directories, games, scanning, filters). Composes sub-components.

```
┌──────────────────────────────────────────────────┐
│  ┌─ Summary Bar ────────────────────────────────┐│
│  │  12 Games  ·  8 Matched  ·  3 Platforms      ││
│  │  [Scan Now]  [Install ISO]                   ││
│  └───────────────────────────────────────────────┘│
│                                                   │
│  ┌─ Directory Manager (collapsible) ─────────────┐│
│  │  Games:  [D:\Games ✕]  [E:\SteamLibrary ✕]   ││
│  │  ISOs:   [D:\ISOs ✕]                          ││
│  │  [+ Add Game Folder]  [+ Add ISO Folder]      ││
│  └───────────────────────────────────────────────┘│
│                                                   │
│  [🔍 Search games...]  [All] [Steam] [PC] [ISO]  │
│                                                   │
│  GameGrid (see below)                             │
└──────────────────────────────────────────────────┘
```

### game-card.tsx

Horizontal card. Follows app's surface + shadow patterns.

```
┌──────────────────────────────────────────────────┐
│ ┌──────────┐                                     │
│ │          │  Portal                        🎮   │
│ │   Icon   │  C:\...\steamapps\common\Portal     │
│ │          │  ✓ Matched  ·  98%                   │
│ └──────────┘                           [▶ Play]  │
└──────────────────────────────────────────────────┘
```

- `rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-sm)]`
- Hover: `-translate-y-0.5 shadow-[var(--dk-shadow-md)]` transition
- Icon: `h-14 w-14 rounded-xl object-contain`, extracted base64 from .exe, fallback `Gamepad2` on `bg-[var(--dk-surface-glass)]`
- Platform badge: `DkBadge` (Steam=blue variant, PC=emerald/default, ISO=amber/warning)
- Match status: green check + confidence if matched, amber "Link to Otix" button if unmatched (opens GameLinker)
- Play button: `bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl px-4 py-2`, matching media-detail pattern
- Press: `active:scale-[0.97]`
- Entrance animation: framer-motion stagger, `initial={{ opacity: 0, y: 12 }}`

### game-grid.tsx

Responsive CSS grid. Matches `MediaGrid` pattern from dk-ui.
- `grid grid-cols-1 md:grid-cols-2 gap-3`
- Wraps `AnimatePresence` with staggered children

### directory-manager.tsx

Collapsible section, default open when directories exist, auto-expand when empty.
- Path chips: glass surface pills with folder icon + path + X remove button
- Add buttons: `DkButton variant="ghost"` with `FolderPlus` icon
- Two sections: Game Directories, ISO Directories

### scan-progress.tsx

Shown during active scan (replaces game grid).
- Glass surface container, `rounded-2xl`
- Spinning `Loader2` or `RefreshCw` icon
- Current directory path in mono font
- Progress bar: `h-1.5 rounded-full bg-[var(--dk-surface-glass)]` with animated fill
- Game count ticker: "Found 8 games so far..."

### empty-state.tsx

Three variants:
1. **No directories yet:** "Add folders to scan for your PC games" + Add buttons
2. **No games found:** "No games found in selected folders" + Rescan button
3. **All filtered out:** "No games match your search" + Clear filters button

Follows app's empty state pattern: centered layout, `h-16 w-16 rounded-2xl bg-[var(--dk-surface-glass)]` icon container, `text-lg font-semibold` title, `text-sm text-muted-foreground` description.

### iso-installer-modal.tsx

Triggered from toolbar "Install ISO" button. Full modal with 4-step flow.

```
┌───────────────────────────────────────────────────┐
│  Install from ISO                           ✕     │
├───────────────────────────────────────────────────┤
│                                                    │
│  ● Select ISO  ──○ Run Setup  ──○ Crack  ──○ Finish    │
│                                                    │
│  ┌─ Step Content ────────────────────────┐  ┌─ Queue ─┐│
│  │                                       │  │ 2 games ││
│  │  [Select ISO File]                    │  │ remaining││
│  │                                       │  │          ││
│  │  Selected: Elden.Ring.v1.10-RUNE.iso  │  │          ││
│  │                                       │  │          ││
│  │  □ Add to batch queue                 │  │          ││
│  │                                       │  │          ││
│  │  [Mount ISO Image]                    │  │          ││
│  └───────────────────────────────────────┘  └──────────┘│
│                                                    │
│  ┌─ Update Sequence ───────────────────────────────┐│
│  │  ✓ 1.12.0 → 1.12.3  [Run]                      ││
│  │  🔒 1.12.3 → 1.13.0  (locked)                  ││
│  │  🔒 1.14.0 → 1.15.0  (locked)                  ││
│  └────────────────────────────────────────────────┘│
│                                                    │
│                              [Cancel]  [Next Step]  │
└───────────────────────────────────────────────────┘
```

**Step indicators:** Horizontal pill chain with active/completed/upcoming states (not vertical — more compact, matches app's horizontal tab pattern).

**Step 1 — Select & Mount:**
- ISO file picker button
- Scanned ISO grid (quick-select from already-scanned ISOs)
- Batch queue checkbox + queue count badge
- Mount button

**Step 2 — Run Setup:**
- Mount info: drive letter, detected setup path, crack name
- "Run Setup" button (launches installer)
- "Next Step" manual advance

**Step 3 — Apply Crack:**
- Crack source (read-only from mount)
- "Link Install Folder" directory picker
- "Apply Crack" button
- "Skip Crack" when no crack detected

**Step 4 — Dismount & Finish:**
- Summary grid (ISO, drive, install dir, crack status)
- Update sequence manager (sequential, locked, with duplicate/gap detection from `analyzeUpdates`)
- "Run Update" button per step
- "Dismount & Finish" — dismounts, advances queue if batch

**Modal styling:**
- Uses `DkDialog` or equivalent glass+blur pattern
- `bg-[var(--dk-surface-overlay)] backdrop-blur-xl shadow-[var(--dk-shadow-dialog)]`
- `rounded-[2rem]`
- AnimatePresence for step transitions (slide left/right)
- Footer with Cancel + action button

### iso-organizer-modal.tsx

Triggered from directory manager section. Same modal pattern as ISO installer.

- Target directory selector (dropdown from `isoPaths` + custom picker)
- Naming presets: Scene Standard, Simple, Custom (same regex/template system)
- Preview table with Status/Type/Filename/Target columns
- Execute + auto-close

## Data Flow

```
localStorage                    electronAPI              Backend
─────────────                   ───────────              ───────
otix_scanner_paths      ←──→   selectDirectory()
otix_scanner_iso_paths   ←──→   selectDirectory()
otix_scanned_games      ←──→   scanPaths()       ←──→  POST /media/match-local-games
                                setLibrary()
                                launchGame()
                                mountIso()
                                dismountIso()
                                applyCrack()
                                launchSetup()
                                getUpdatesForIso()
                                onScannerProgress()
                                previewOrganization()
                                executeOrganization()
otix_local_games_map    ←──→   (GameLinker sync)        (read by media-detail LocalGamePlayButton)
```

## Design Tokens Reference

All components must use:
- **Surfaces:** `bg-[var(--dk-surface-base)]`, `bg-[var(--dk-surface-glass)]`, `bg-[var(--dk-surface-overlay)]`
- **Shadows:** `shadow-[var(--dk-shadow-sm)]` through `shadow-[var(--dk-shadow-dialog)]`
- **Radius:** `rounded-xl` (buttons/inputs), `rounded-2xl` (cards/containers), `rounded-full` (pills)
- **Colors:** oklch variables — never hardcoded hex (except emerald Play button matching media-detail)
- **Typography:** `text-2xl font-bold` (titles), `text-sm font-semibold uppercase tracking-wider text-muted-foreground` (section labels), `text-sm text-muted-foreground` (descriptions)
- **Press:** `active:scale-[0.97]` on all interactive elements
- **Animation:** `transition-all duration-[var(--dk-duration-fast)]` for micro-interactions, framer-motion for entrance/exit

## What Gets Removed

- All mock data (`MOCK_GAMES`, mock directory paths, mock ISO responses)
- Browser fallback logic (tab never renders in browser)
- Mock progress simulation (`setTimeout`-based scan progress)
- Two-column admin layout
- Tab-based ISO installer (replaced by modal)
- `activeTab` state (scanner vs installer tabs)
- Duplicate status toast system (use existing `DkToast` where available, or simple inline status)

## States Per Component

| Component | Loading | Empty | Error | Active |
|---|---|---|---|---|
| game-scanner-tab | Skeleton grid | Empty state (no dirs / no games) | Error text + retry | Full UI |
| game-card | Skeleton pulse | N/A | N/A | Card with data |
| directory-manager | N/A | "No directories added" inline | N/A | Path chips |
| scan-progress | Spinning + progress bar | N/A | "Scan failed" + retry | Live progress |
| iso-installer-modal | Step-specific spinners | N/A | Inline error + retry | Step content |
| iso-organizer-modal | Preview loading spinner | N/A | Inline error | Preview table |
