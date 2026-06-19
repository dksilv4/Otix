# Library Settings Page — Refactor Design

## Overview
Rename, restyle, and add scan functionality to the game library settings section.
Rename "Game Library" → "Library". Add per-path + batch scan buttons.
Remove Organization sub-section (moved to Downloads).

## Scope
- **Route:** `/settings/game-library` → `/settings/library`
- **Nav label:** "Game Library" → "Library" in constants
- **Component:** `GameLibrarySection` → `LibrarySection`
- **File:** `game-library.tsx` → `library.tsx`

## Layout (top → bottom)

### 1. Page Header
"Library" title + "Manage installed games and scan for new ones."

### 2. Scan All Card
Glassmorphic card with prominent "Scan All Paths" button. Shows scanning state with spinner + current directory text. Badge showing total game count. Empty state when no paths configured.

### 3. Game Scan Paths
List of game directories with per-path "Scan" button + remove. "Add Game Path" button. Folder icon per row.

### 4. ISO Mount Paths
Same pattern with disc icon. Per-path scan + remove. "Add ISO Path" button.

### 5. Discovered Games
Match status card. Shows game count, "Match All to Catalog" / "Verify All Matches" buttons. Empty state: "No games found yet. Add scan paths above and click Scan All."

## States
- **Loading:** skeleton pulse for scan paths
- **Empty (no paths):** descriptive empty state
- **Empty (paths but no games):** "No games found" prompt
- **Populated:** games + match actions
- **Scanning:** spinner per path being scanned + overall Scan All spinner
- **Error:** toast on scan failure

## Style
Glassmorphic cards: `rounded-2xl p-6 bg-white/5 backdrop-blur-xl`
Shared `SectionHeader` from `../components/section-header`
Modern buttons (no `DkButton`) matching Appearance/Desktop sections

## Files Changed
| File | Change |
|------|--------|
| `constants.ts` | Label "Library", id "library" |
| `settings.router.ts` | Route path `/library` |
| `sections/game-library.tsx` → `sections/library.tsx` | Full rewrite |
| `pages/settings-game-library-page.tsx` → `pages/settings-library-page.tsx` | Rename + update import |
| `sections/downloads.tsx` | Add Organization section (relocated) |
| `index.ts` | Update exports |
