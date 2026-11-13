# Project: Otix Media Request, Download, Real-Time Notifications, Downloads Sync & Plex Streaming Pipeline

## Architecture
- **Frontend Video Player (`frontend/src/features/player/`, `frontend/src/features/media/`):** Universal video player engine supporting Direct Play and Hls.js transcode/direct-stream remux. Floating 3-pod soft glassmorphic control surface (`var(--dk-surface-glass)`, `backdrop-blur-2xl`), waveform scrubber bar, audio stream selector, quality options, and buffering recovery watchdog.
- **Frontend Media Detail & Request Lifecycle (`frontend/src/features/media/`):** Reactive media detail page with dynamic state machine CTA (`RequestMediaButton` ↔ `MediaPlaySplitButton`). TanStack Query-backed action discovery (`useMediaDetailPluginActions`), instant optimistic state transitions ("Request" → "Searching Indexers..." → "Downloading (X%, speed, ETA)" → "Play" / "Stream") without manual page reload.
- **Frontend Downloads Page (`frontend/src/features/downloads/`):** Multi-node aggregated download queue and unified history tracking. Real-time synchronization between active download items and media detail view. Completed download transition with grace-period rendering to prevent layout flashing.
- **Backend Plex Streaming & Arr Integration (`backend/apps/integrations/`, `backend/apps/library/`):** DRF endpoints for Plex connect info, stream spec extraction, PMS section scan triggers, and Arr proxies (Radarr/Sonarr). High-performance Redis pub/sub fan-out over SSE (`/api/v1/notifications/stream`).
- **In-App Notification Pipeline (`backend/apps/social/`, `frontend/src/features/notifications/`):** Exact-once delivery of 4 core acquisition lifecycle milestones (Request Received, Target Media Matched, Download Started, Media Ready to Stream) using database-enforced `dedupe_key` schema, Redis SSE push, one-click toast navigation, and Electron desktop IPC navigation.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Direct Play Connect-Info Prefetch & Rapid Spin-Up | Prefetch connect-info on detail view mount; remove redundant `video.load()` in player engine; start progressive Direct Play < 2.0s SLA | M1 | ORIGINAL_REQUEST §R1 |
| F2 | Plex HLS Transcode & Remux URL Offset Optimization | Append `offset` and `copyts=1` to `buildPlexHlsUrl`; set `startPosition` in Hls.js config to start transcode at target time < 3.0s SLA | M1 | ORIGINAL_REQUEST §R1 |
| F3 | Seamless Audio Stream Switching Without Reload | Capture `previousTime`, derive dedicated `playSessionId`, apply `offset`, and switch audio in < 2.0s without player or page reload | M1 | ORIGINAL_REQUEST §R1 |
| F4 | Player Scrubber Theming & Control Robustness | Refactor `player-scrubber-bar.tsx` to semantic design tokens; add 8s buffer stall recovery watchdog; verify all playback controls | M1 | ORIGINAL_REQUEST §R1, AGENTS.md |
| F5 | Query-Backed Plugin Actions & Play Widgets | Refactor `useMediaDetailPluginActions` to TanStack Query so download completions automatically re-evaluate `playWidgets` | M2 | ORIGINAL_REQUEST §R2 |
| F6 | Seamless In-Page Detail CTA State Transition | Optimistic transition from "Request" → "Searching Indexers..." → "Downloading (progress, speed, ETA)" → "Play" with zero reload | M2 | ORIGINAL_REQUEST §R2 |
| F7 | Automated Plex Library Indexing Trigger | Dispatch PMS section refresh upon Arr import completion and rapidly probe `UserPlexItem` to eliminate "Library Sync" stalls | M2 | ORIGINAL_REQUEST §R2 |
| F8 | Media Detail Polling Elimination & SSE Revalidation | Replace 5 concurrent polling loops on media detail page with event-driven TanStack Query revalidation via persistent SSE stream | M2 | ORIGINAL_REQUEST §R2, §R5 |
| F9 | Four-Stage Lifecycle Notification Persistence | Persist backend `Notification` records with unique `dedupe_key` for: Request Received, Media Matched, Download Started, Ready to Stream | M3 | ORIGINAL_REQUEST §R3 |
| F10 | Notification Metadata & One-Click Navigation | Attach structured media metadata (`link`, `mediaType`, `mediaId`, `posterUrl`) and enable one-click navigation on toast clicks | M3 | ORIGINAL_REQUEST §R3 |
| F11 | Desktop IPC Notification Navigation Integration | Wire Electron `notifications:navigate` IPC event to frontend router in `NotificationsProvider` | M3 | ORIGINAL_REQUEST §R3 |
| F12 | Notifications Theming & Registry Cleanup | Replace hardcoded palette colors in `notifications/registry/index.ts` and `toast-provider.tsx` with semantic theme tokens | M3 | ORIGINAL_REQUEST §R3, AGENTS.md |
| F13 | Multi-Node Downloads Page Aggregation | Aggregate active downloads across all accessible user nodes instead of hardcoding `servers[0]` | M4 | ORIGINAL_REQUEST §R4 |
| F14 | Unified Download History Panel | Include completed Radarr and Sonarr downloads alongside Usenet history items with release info, size, and date | M4 | ORIGINAL_REQUEST §R4 |
| F15 | Zero-Glitch Completion State Synchronization | Maintain a 15-second grace window when downloads complete to prevent items from vanishing before Plex library indexing completes | M4 | ORIGINAL_REQUEST §R4 |
| F16 | Downloads Page Design System & Theming Parity | Eliminate hardcoded classes in `download-episode-card.tsx` and `download-queue.tsx`; enforce soft glassmorphism & semantic tokens | M4 | ORIGINAL_REQUEST §R4, AGENTS.md |
| F17 | End-to-End Automated Lifecycle Simulation Test | Automated test suite simulating the full pipeline (Request → Download → Complete → Stream) passing 100% | M5 | ORIGINAL_REQUEST §Acceptance |
| F18 | Streaming Spin-Up & Audio Switch Automated Benchmark | Automated benchmark measuring Direct Play (<2.0s), Transcode (<3.0s), and Audio Switching (<2.0s) | M5 | ORIGINAL_REQUEST §Acceptance |
| F19 | Full Test Suite Execution & TypeScript Compilation | Clean execution of all frontend and desktop Vitest suites, backend tests, and `tsc --noEmit` across all projects | M5 | ORIGINAL_REQUEST §Acceptance |
| F20 | Forensic Integrity Audit & Adversarial Hardening | Independent forensic integrity audit verifying authentic implementations with zero mock cheats or dummy bypasses | M5 | ORIGINAL_REQUEST §Acceptance |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Plex Streaming Pipeline & Video Player Optimization | F1, F2, F3, F4 (Direct Play <2.0s, Transcode <3.0s, audio track switching <2.0s without reload, stall watchdog, scrubber theming) | None | IN_PROGRESS |
| M2 | Reactive Media Request & In-Page State Transition Engine | F5, F6, F7, F8 (Query-backed play widgets, optimistic request state transitions without reload, PMS scan trigger, SSE revalidation) | None | PLANNED |
| M3 | Four-Stage In-App Lifecycle Notification System | F9, F10, F11, F12 (4 lifecycle events with `dedupe_key`, one-click navigation, desktop IPC integration, theming token cleanup) | None | PLANNED |
| M4 | Downloads Page Synchronization & Multi-Node Aggregation | F13, F14, F15, F16 (Multi-node queue aggregation, unified Arr+Usenet history, zero-glitch completion grace window, theming parity) | M2, M3 | PLANNED |
| M5 | Full-Stack E2E Verification, Benchmarking & Forensic Audit | F17, F18, F19, F20 (Full lifecycle simulation test, latency benchmarks, full test suite passes 100%, clean forensic audit) | M1, M2, M3, M4 | PLANNED |

## Interface Contracts
### Plex Streaming Protocol
- `PlexHlsQualityOptions`:
  ```ts
  export interface PlexHlsQualityOptions {
    targetResolution?: string
    targetBitrateKbps?: number
    subtitlesMode?: 'none' | 'burn' | 'sidecar'
    audioStreamID?: string
    subtitleStreamID?: string
    offsetSeconds?: number
  }
  ```
- URL offset query parameters:
  PMS transcoder accepts `&offset=${Math.floor(offsetSeconds)}&copyts=1` to generate HLS segments beginning directly at the requested seek offset.
- Audio track switching session parameter:
  PMS transcode session ID must append `-a-${audioStreamID}` (e.g. `${baseSessionId}-a-${audioStreamID}`) to avoid PMS worker concurrency deadlocks.
- Direct play prefetch cache:
  `fetchPlexConnectInfoCached(mediaId, { tmdbId, mediaType })` stores responses in `connectInfoCache` with 5-minute TTL.

### Reactive Media Request State Machine
- `RequestMediaState`:
  ```ts
  export interface RequestMediaState {
    status: 'unrequested' | 'requesting' | 'requested' | 'processing' | 'downloading' | 'indexing' | 'available'
    progress?: number
    speed?: number
    etaSeconds?: number
    queueItem?: ActiveDownloadItem
    canStream: boolean
    hasPlayWidgets: boolean
  }
  ```
- Detail page action transition:
  `unrequested` (Show "Request Movie/Show") → `requesting` / `requested` (Show "Searching Indexers..." / "Requested") → `downloading` (Show Live Progress Pill: `progress%`, speed, ETA) → `available` (Transition dynamically to `MediaPlaySplitButton`).

### Four-Stage Lifecycle Notification Contract
- Event types: `media_request.received`, `media_request.matched`, `media_request.downloading`, `media_request.ready`.
- Deduplication key: `media_lifecycle:{user_id}:{media_type}:{identifier}:{stage}` (enforced by `unique=True` on `Notification.dedupe_key`).
- Notification payload:
  ```json
  {
    "type": "media_request.ready",
    "title": "Ready to Stream: Interstellar (2014)",
    "body": "Download complete and indexed in Plex. Click to stream.",
    "metadataJson": {
      "stage": "ready",
      "mediaType": "movie",
      "mediaId": "157336",
      "title": "Interstellar",
      "year": 2014,
      "posterUrl": "https://image.tmdb.org/t/p/w500/...",
      "link": "/media/movie/157336"
    }
  }
  ```
- Desktop navigation IPC: `notifications:navigate` passes `{ type, metadata: { link } }`.

### Multi-Node Downloads & History Contract
- Aggregated Queue:
  `GET /api/v1/library/nodes/media-activity` or client-side aggregation across all `activeNodes` returns combined Sonarr, Radarr, and Usenet queue records.
- Unified History:
  Combines Usenet history, completed Arr history, and `UserMediaRequest` records with `status in ('available', 'completed')`.

## Code Layout
- `frontend/src/features/media/hooks/use-unified-player-engine.ts`: HTML5 video & Hls.js playback engine, offset seeking, stall watchdog.
- `frontend/src/features/media/utils/plex-stream.ts`: Plex URL generation (`buildPlexHlsUrl`), audio switching session management.
- `frontend/src/features/media/hooks/use-stream-availability.ts`: Catalog stream discovery & background connect-info prefetching.
- `frontend/src/features/media/components/organisms/player/player-scrubber-bar.tsx`: Floating scrubber bar with semantic theme tokens.
- `frontend/src/features/media/hooks/use-media-detail-plugin-actions.ts`: Query-backed play widget discovery.
- `frontend/src/features/media/components/organisms/media-request-button.tsx`: In-page dynamic CTA state machine.
- `frontend/src/features/media/hooks/use-request-media.ts`: Media request execution & live progress tracking.
- `frontend/src/features/media/components/molecules/media-activity-tag.tsx`: Activity badge with semantic theme tokens.
- `backend/apps/library/services/media_requests.py`: Media request recording, lifecycle notifications, and deduplication.
- `backend/apps/library/views/nodes.py`: Arr proxy endpoints and automated PMS scan triggers.
- `backend/apps/social/models/notification.py`: Persistent notifications model with `dedupe_key`.
- `frontend/src/features/notifications/providers/notifications-provider.tsx`: SSE consumer, toast & desktop IPC navigation handler.
- `frontend/src/features/downloads/organisms/download-queue.tsx`: Multi-node download queue and unified history.
- `frontend/src/features/downloads/molecules/download-history-panel.tsx`: Unified history panel for Arr and Usenet.
