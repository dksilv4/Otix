# Project: Otix Core Platform & UI/UX Elevation

## Architecture
Otix is an open-source cross-platform entertainment hub comprising:
- **Frontend**: Vite + React 18 + TypeScript + Tailwind CSS + TanStack Router & Query. Soft glassmorphic visual language, borderless cards/surfaces, semantic tokens (`bg-primary`, `var(--dk-surface-*)`).
- **Desktop**: Electron main process (`desktop/main.ts`), preload IPC bridge (`desktop/preload.ts`), node daemon engine (`desktop/node-daemon.ts`), auto-updater (`desktop/ipc/updater.ts`).
- **Backend**: Django REST Framework + uv/python. Integrations with Plex, Jellyfin, Steam, IGDB, TMDB, TVDB, Fanart, OMDB.
- **Data Flow**:
  - Media & Carousel browsing → TanStack Query → Django `/discover/*` & `/media/*`.
  - Playback → Unified Media Player modal (`useMediaStreamPlayer`) supporting HTML5/HLS (Plex/Jellyfin/Direct) and YouTube Trailer Iframe.
  - Library management → Django `/library/*` + local game detection + drag/drop custom order in local storage.
  - Desktop daemon → IPC bidirectional stream between NodeDaemonManager and React renderer.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Discover 3D Carousel Math & Perspective | Add container perspective (1400px, preserve-3d) on `#discover-fan-slides`, 3D `rotateY`/`translateZ` in `calculateCardTransform`, eliminate GPU re-rasterization blur | M1 | ORIGINAL_REQUEST §R1 |
| F2 | Personalized "New Seasons" Shelf | Pass user context to `trending_seasons`, join `UserMediaInteraction` / `UserEpisodeInteraction` to prioritize user's continue-watching/watchlist shows | M1 | ORIGINAL_REQUEST §R1 |
| F3 | Profile XP Shimmer Bar & Level Tiers | Extract `UserXpProgressionBar`, tokenize `LEVEL_TIERS` to CSS tokens, implement multi-layer fluid shimmer animation, eliminate inline border styles | M1 | ORIGINAL_REQUEST §R1 |
| F4 | Friends Social Interface Redesign | Audit & eliminate all lingering `border-[var(--dk-separator)]` strokes from Friends cards, requests, and dropdowns using soft glassmorphism | M1 | ORIGINAL_REQUEST §R1 |
| F5 | Pages Redesign & Route Decoupling | Decouple `/downloads` (in-app queue) from `/download` (installer landing); skin Docs, Welcome, Downloads, and Download pages in soft glassmorphism | M1 | ORIGINAL_REQUEST §R1 |
| F6 | Unified Borderless Glassmorphic Player | Unify `MediaStreamPlayerModal` (HTML5/HLS) and `TrailerVideoModal` (YouTube) into a single cohesive player component with dual-engine support | M2 | ORIGINAL_REQUEST §R2 |
| F7 | Player Layout: Auto-Resizing & Docked Controls | Dynamic video container aspect ratio auto-resizing, external docked playback controls pod with viewport space detection, borderless full-width theater mode | M2 | ORIGINAL_REQUEST §R2 |
| F8 | YouTube Embed Origin & Electron Fix | Fix origin parameter handling in Electron (`app://otix`) & add `onBeforeSendHeaders` referer spoofing in `desktop/main.ts` to prevent Error 150/101 | M2 | ORIGINAL_REQUEST §R2 |
| F9 | Media Detail Page AI Quick-Glance Modal | Lightweight AI preview modal with media metadata, synopsis, cast highlights, and instant 1-click Stream CTA without navigating away | M2 | ORIGINAL_REQUEST §R2 |
| F10 | Stream Availability & Latency Optimization | Replace full-catalog `useLibraryTab('plex')` scan in `useStreamAvailability` with targeted direct lookups and optimized Plex show queries | M2 | ORIGINAL_REQUEST §R2 |
| F11 | Library Overview Tab Overhaul | Actionable reels (continue watching, watchlist, favorites) and 4-pod interactive stats card without dashed separator borders | M3 | ORIGINAL_REQUEST §R3 |
| F12 | In-Tab Header Loading Spinner | Suppress full-page opaque router loader; render subtle micro-spinner inside active tab pill with gentle content fade | M3 | ORIGINAL_REQUEST §R3 |
| F13 | Library Tab Position Customization & Persistence | Tab Settings modal with drag/drop reordering, toggle visibility, and localStorage persistence (`otix:library-tabs:order`) | M3 | ORIGINAL_REQUEST §R3 |
| F14 | Media Card Context Menu Smooth Scrolling | Add settle delay (150ms) to ignore deceleration scroll events on smooth shelves, integrate AI Quick-Glance action | M3 | ORIGINAL_REQUEST §R3 |
| F15 | Desktop Node Daemon Immediate IPC Push | Implement lifecycle state machine (`stopped`, `starting`, `running`, `error`), push on `setWebContents`, process spawn, and port confirmation | M4 | ORIGINAL_REQUEST §R4 |
| F16 | Desktop Update Pre-Install Tamper Verification | SHA-512 cryptographic hash check against release manifest + OS-level digital signature verification before installer execution | M4 | ORIGINAL_REQUEST §R4 |
| F17 | TypeScript & Automated Test Suites Verification | Verify clean `tsc --noEmit`, resolve failing frontend Vitest tests, fix desktop test fetch mock, resolve backend media test failures | M5 | ORIGINAL_REQUEST §Acceptance |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Borderless Glassmorphic UI/UX Redesign | Features F1, F2, F3, F4, F5 (Discover carousel & shelf, Profile XP shimmer & Friends, Docs/Welcome/Downloads) | None | DONE |
| M2 | Media Detail Page & Video Player Unification | Features F6, F7, F8, F9, F10 (Unified player, auto-aspect, docked controls, YouTube fix, AI quick glance, stream latency) | None | DONE |
| M3 | Library Experience & Context Controls | Features F11, F12, F13, F14 (Overview overhaul, in-tab spinner, tab reorder persistence, context menu) | None | DONE |
| M4 | Desktop Engine, Node IPC & Security | Features F15, F16 (Daemon status immediate IPC push, update tamper verification) | None | DONE |
| M5 | Final Milestone: Full Verification & Automated Tests | Feature F17 (TypeScript clean, 100% frontend tests pass, 100% desktop tests pass, backend media tests pass) | M1, M2, M3, M4 | DONE |

## Interface Contracts

### M1: Discover & User APIs
- `GET /api/v1/discover/season/trending`:
  - Accepts authenticated `request.user`
  - Computes `user_show_ids` from `UserMediaInteraction` (`status in ['watching', 'started', 'watchlist']`) and `UserEpisodeInteraction`
  - Adds `affinity_rank = 0` for user shows, `1` for general shows in `_sort_key`
- `UserXpProgressionBar`:
  - Props: `{ currentXp: number, level: number, tier: UserLevelTier, className?: string }`
  - Zero inline borders; fluid shimmer CSS animation via CSS variable gradient.

### M2: Unified Video Player & Electron Security
- `UnifiedMediaPlayerModal`:
  - Session interface: `UnifiedPlayerSession` with `mode: 'stream' | 'trailer'`
  - Auto-resizing aspect ratio container: `style={{ aspectRatio, maxHeight }}`
  - Docked controls capsule below canvas when `window.innerHeight >= videoHeight + 140px`
  - Backward-compatible wrapper `TrailerVideoModal` proxying props to `UnifiedMediaPlayerModal`
- `desktop/main.ts`:
  - `sess.webRequest.onBeforeSendHeaders` intercepting `*://*.youtube.com/*`, `*://*.youtube-nocookie.com/*`
  - Sets `Referer: https://www.youtube.com/` and `Origin: https://www.youtube.com`
- `GET /api/v1/integrations/plex/connect-info/:id`:
  - Direct targeted lookups; avoids `allLeaves` traversal for show availability checks

### M3: Library & Tab Customization
- `otix:library-tabs:order`:
  - JSON string array `string[]` of tab IDs in display order
  - Helper functions: `readTabOrder()`, `writeTabOrder(order: string[])` in `features/library/utils.ts`
- Tab Bar Loading:
  - `loadingTabId?: string | null` prop on `TabBar`
  - Micro-spinner `<Loader2 className="h-3 w-3 animate-spin text-primary" />` inside tab capsule
  - `pendingComponent: () => null` on library child routes

### M4: Desktop Daemon IPC & Update Verification
- `desktop/preload-api.ts`:
  - `NodeDaemonStatus`: `{ state: 'stopped' | 'starting' | 'running' | 'error' | 'stopping', running: boolean, starting: boolean, port: number, url: string, pid: number | null, error?: string | null }`
  - IPC channel: `node-daemon:status-changed`
- `desktop/ipc/updater.ts`:
  - `verifyUpdatePackage(filePath: string, expectedSha512: string): Promise<boolean>`
  - `verifyExecutableSignature(filePath: string): Promise<{ valid: boolean, reason?: string }>`

## Code Layout
- Frontend UI / Features:
  - Discover: `frontend/src/features/discover/`
  - Media & Player: `frontend/src/features/media/`
  - Library: `frontend/src/features/library/`
  - User & Profile: `frontend/src/features/user/`
  - Friends: `frontend/src/features/friends/`
  - Docs & Welcome: `frontend/src/features/docs/`, `frontend/src/features/welcome/`
  - Downloads: `frontend/src/features/downloads/`, `frontend/src/features/download-page/`
  - Modals & Context: `frontend/src/lib/modals/`, `frontend/src/features/_config/context-menu/`
- Desktop:
  - Main & Electron: `desktop/main.ts`, `desktop/preload.ts`, `desktop/preload-api.ts`
  - Daemon: `desktop/node-daemon.ts`, `desktop/ipc/node-daemon.ts`
  - Updater: `desktop/ipc/updater.ts`, `desktop/tests/updater.test.ts`
- Backend:
  - Discover: `backend/apps/discover/`
  - Media & Interactions: `backend/apps/media/`
  - Integrations (Plex): `backend/apps/integrations/`
  - Library: `backend/apps/library/`
