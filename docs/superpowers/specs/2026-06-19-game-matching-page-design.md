# Game Matching Page Design

## Overview
Dedicated matching sub-route `/settings/library/matching` with split-column layout — game list on left, match detail panel on right. Persists accept/reject decisions in local SQLite so rejected suggestions never reappear.

## Layout

```
/settings/library/matching
├── Header: "Matching" + stats bar (X total · Y matched · Z pending)
├── Filter bar: search input + tab filters (All | Matched | Unmatched | Suggested)
├── Game List (left column, 40% width)
│   ├── Each row: icon/fallback, title, platform badge, status badge, confidence bar
│   ├── Click to select → right panel updates
│   └── Statuses: ✅ Matched, ⏳ Suggested, ❌ Unmatched, 🚫 Rejected
└── Match Detail Panel (right column, 60% width)
    ├── Preview card: poster, title, platform, exe path, install dir
    ├── Current Match section:
    │   ├── Matched: catalog title, poster, confidence %, "Unmatch" button
    │   └── Unmatched: "No match set" message
    ├── Suggestions section:
    │   ├── Has suggestion: candidate card with Accept / Reject buttons
    │   └── No suggestion: "No suggestions available. Try manual search."
    └── Manual Match section:
        ├── Search input → debounced catalog search via /media/search?type=game
        ├── Results grid (small poster cards, max 6 visible)
        └── Click result → acceptSuggestion() with picked game
```

## Route & Nav
- Route: `/settings/library/matching` — sub-route of `/settings/library` (not a top-level settings nav item)
- Library settings page gets sub-tab navigation: "Library" (scan paths) | "Matching" (match games)
- Sub-tabs are inline pills/buttons in the page header, same pattern as launcher shelf tabs
- The `/settings/library/matching` route renders `MatchingSection` instead of `LibrarySection`

## Data Flow

### Match status logic per game:
| Condition | Status | Display |
|-----------|--------|---------|
| `data?.id` set | ✅ Matched | Green check, show catalog title + confidence |
| `otixMatchSuggestion` exists | ⏳ Suggested | Blue pending, show Accept/Reject buttons |
| Neither, not rejected | ❌ Unmatched | Dimmed, "Match" button available |
| Previously rejected | 🚫 Rejected | Greyed, hint: "Rejected — search manually to override" |

### Persistence:
- **Accept:** `acceptSuggestion(gameId, suggestion)` → clears any prior rejection → `useClaimGame({mediaType: 'game', mediaId})` → synced to backend
- **Reject:** `rejectSuggestion(gameId, suggestionMediaId)` → writes to `game_rejected_suggestions` table → clears `otix_match_suggestion` on game → `useMatchLocalGames()` filters rejected suggestions server-side
- **Manual match:** search catalog → user picks → `acceptSuggestion()` with picked game → clears any prior rejection
- **Unmatch:** clears `otix_media_id`, `otix_media_title`, etc. from game row; also calls `useUnclaimGame()`

### Search:
- Uses `mediaQueries.search({ query, type: 'game' })` → `/media/search?q=...&media_type=game`
- Results show poster, title, year
- Paginated with "Load more"
- Debounced 300ms

## Components

### `GameMatchingSection` (main, in `sections/game-matching.tsx`)
- State: selectedGameId, filterTab, searchQuery
- Orchestrates game list + detail panel
- Handles accept/reject/manual-match callbacks

### `GameRow` (in `atoms/game-row.tsx`)
- Props: game, selected, onClick
- Shows: icon/fallback circle, title, platform, status badge, confidence bar
- Highlighted when selected

### `MatchDetailPanel` (in `atoms/match-detail-panel.tsx`)
- Props: game, onAccept, onReject, onManualMatch, onUnmatch
- Sections: preview card, current match, suggestions, manual search

### `ManualSearch` (in `atoms/manual-search.tsx`)
- Props: gameTitle, onSelect
- Debounced search input
- Results grid with click-to-match

## States
| State | Game List | Detail Panel |
|-------|-----------|-------------|
| Loading | Skeleton rows | "Select a game" |
| Empty (no games) | "No games scanned" + link | Hidden |
| Empty (filtered) | "No games match filter" | Hidden |
| No selection | Normal | "Select a game to view details" |
| Normal | List with rows | Detail for selected game |
| Searching | Normal (filtered) | Search results loading |
| Error | — | Toast notification |
| Accepting | Spinner on row | Loading overlay on Accept button |
| Rejecting | Spinner on row | Loading overlay on Reject button |

## Files Changed
| File | Change |
|------|--------|
| `settings.router.ts` | Add `/settings/library/matching` route |
| `constants.ts` | Add "Matching" nav item under Library |
| `sections/game-matching.tsx` | NEW — main matching section with split layout |
| `atoms/game-row.tsx` | NEW — game list row |
| `atoms/match-detail-panel.tsx` | NEW — right panel with all match actions |
| `atoms/manual-search.tsx` | NEW — catalog search + results picker |
| `library.tsx` | Add sub-tab navigation (Library / Matching) |
