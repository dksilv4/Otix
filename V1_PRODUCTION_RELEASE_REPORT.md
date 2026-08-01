# Otix v1 Production Release Report

**Date:** 2026-07-18
**Version:** 0.2.14 (backend) / 0.0.1 (frontend) / 0.3.0 (desktop)
**Total Codebase:** ~182K lines (81K Python backend + 86K TS/TSX frontend + 15K TS desktop)

---

## Overview

Otix is a full-stack media tracking and discovery platform spanning a Python/FastAPI backend, React/TypeScript web frontend, and Electron desktop companion. It aggregates movies, TV shows, games, and music from multiple external providers (TMDB, IGDB, Steam, Spotify, MusicBrainz, etc.) with semantic embedding-based search, a game launcher, curated lists, reviews, social features, gamification, and an extensible plugin system.

---

## 1. Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│  Desktop (Electron)                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Game      │ │ Plugin   │ │ Save     │ │ Download/     │  │
│  │ Launcher  │ │ System   │ │ Daemon   │ │ Installer     │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  Web Frontend (React 19 / Vite / TanStack Router)             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Discover │ │ Media    │ │ Launcher │ │ Settings      │  │
│  │ Auth     │ │ Search   │ │ Library  │ │ Notifications │  │
│  │ Lists    │ │ Reviews  │ │ People   │ │ Activity      │  │
│  │ Proposals│ │ User     │ │ Plugins  │ │ Interaction   │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  Backend API (FastAPI / Python 3.12)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ REST API │ │ Auth/JWT │ │ SSE      │ │ Rate Limiting │  │
│  │ 30+      │ │ OAuth    │ │ Realtime │ │ Circuit       │  │
│  │ Routers  │ │ 2FA      │ │ Events   │ │ Breakers      │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  Task Workers (Celery / Redis)                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Ingest   │ │ Enrich   │ │ Embed    │ │ Maintenance   │  │
│  │ TMDB/Ste │ │ Fanart/  │ │ ONNX     │ │ CCU/House-    │  │
│  │ am/IGDB/ │ │ OMDb/    │ │ FastEmb  │ │ keeping/Feed  │  │
│  │ MB/Deezer│ │ SteamGrid│ │ Backfill │ │ Cleanup       │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  Data Layer                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ PGVector │ │ Redis    │ │ PgBouncer│ │ External APIs │  │
│  │ PG16     │ │ Cache/Br │ │ Pool     │ │ 10+ providers │  │
│  │ HNSW idx │ │ oker     │ │ tx mode  │ │               │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Production Deployment (docker-compose.prod.yml)

| Service | Concurrency | Memory Limit | Purpose |
|---------|-------------|-------------|---------|
| `db` (pgvector/pg16) | - | 1500M | Primary database with HNSW vector index |
| `pgbouncer` | 25 pool | 128M | Connection pooler (transaction mode) |
| `redis` | - | 512M | Cache + Celery broker (allkeys-lru, 400MB max) |
| `api` | - | 1024M | FastAPI application server |
| `worker-fast` | 6 | 512M | Low-latency reactive tasks |
| `worker-provider` | 3 | 512M | External API ingest + enrichment |
| `worker-user` | 2 | 512M | User-initiated reactive tasks |
| `worker-control` | 1 | 1024M | Embedding generation + maintenance |
| `beat` | - | 256M | Celery beat scheduler (40+ periodic tasks) |
| `frontend` (nginx) | - | 256M | Static SPA serving + /api reverse proxy |

---

## 2. Feature-by-Feature Analysis

### 2.1 Discover / Home Page

**Desktop:** Hero carousel with auto-cycling, inactivity detection triggers slideshow mode, trailer video playback with modal overlay, trending trailers section, screenshot gallery with thumbnail navigation.

**Frontend:** `/discover` route, `discover-hero` organism, `discover-media-section` organism, `discover-media-card` molecule, `trailer-video-modal` molecule, `trending-trailers-section` organism. Custom hooks: `use-hero-carousel.ts`, `use-section-fetch.ts`. Discover queries with React Query for sections: movie/popular, show/popular, game/popular, game/trending, music/popular, music/trending. Lazy-loaded route components. Animation via framer-motion.

**Backend:** `api/discover/` with sub-routers:
- `hero/router.py` — curated hero content
- `sections/router.py` — paginated section data
- `media_type/list_type/router.py` — type-specific listings
- `trailers/router.py` — trailer aggregation
- `free_games/router.py` — free game discovery
- `router_helpers.py` — shared query building

**Benchmark:** Avg 54ms, Median 53ms, Max 237ms. **Healthy.**

**Issues & Improvements:**
- [ ] Hero personalization uses no user preference signals — could incorporate watch history and ratings
- [ ] Section data has no server-side caching beyond Redis media:detail (30s TTL) — add section-level Redis cache with 5min TTL
- [ ] No A/B testing framework for different discover layouts or recommendation algorithms
- [ ] Free games section has no user-specific filtering (hide owned/ignored)

---

### 2.2 Semantic Search

**Desktop:** N/A (uses web frontend).

**Frontend:** `/search` route with search page, `search-input` molecule, `search-results` organism, hooks: `use-search.ts`, `use-search-suggestions.ts`, `use-search-history.ts`. Debounced input, suggestion dropdown, grouped results display.

**Backend:** `api/search/` with:
- `search.py` — main search logic (full-text + vector hybrid search)
- `embedding.py` — FastEmbed ONNX embedding generation (BAAI/bge-small-en-v1.5, 384-dim)
- `providers.py` — external search providers
- `services/search_log_service.py` — search analytics

**Benchmark:** CRITICAL. Search is the #1 performance bottleneck:
- `GET /api/v1/search`: **6938ms** (nearly 7 seconds)
- `GET /api/v1/search/grouped`: **4989ms**
- `GET /api/v1/search/poll`: **841ms**

**Issues & Improvements:**
- [ ] **CRITICAL: Search latency is unacceptable for v1.** 7s response time will drive users away. Root causes identified in benchmark:
  - N+1 query patterns in service layer (lazy-loaded relationships)
  - Serial embedding calls instead of batched/parallel
  - Missing composite indexes on search-related columns
  - No materialized search views
- [ ] **Immediate fix:** Add Redis caching for popular search queries (5min TTL)
- [ ] **Short-term:** Audit all search path queries with EXPLAIN ANALYZE, add missing indexes
- [ ] **Short-term:** Convert serial embedding calls to batched — the `_call_embed_query` should use connection-pooled async
- [ ] **Medium-term:** Pre-compute embeddings for all media via Celery at insert time (already partially done via backfill tasks)
- [ ] **Medium-term:** Implement materialized view for search with PostgreSQL full-text search as primary, vector as re-rank
- [ ] Search history logging adds write overhead on every search — batch writes or make async
- [ ] External search (`/api/v1/search/external` at 321ms) is reasonable but could be cached

---

### 2.3 Media Detail Pages

**Desktop:** Game detail in launcher has screenshot gallery with auto-cycling, active thumbnail highlight, company info display, library page routing.

**Frontend:** `/media/$mediaType/$mediaId` route (shared for movie/show/game/music). Media-specific subdirectories:
- `game/` — game-specific components + hooks
- `movie/components/organisms/`
- `music/components/{molecules,organisms}/`
- `show/components/organisms/`
- Shared `queries/media-queries.ts`, `queries/media-keys.ts`

**Backend:** `api/media/` with:
- `detail.py` — media detail endpoint
- `browse.py` — browsing endpoints
- `embedding.py` — media embedding operations
- `match_proposal.py` — match proposals
- `search.py` — media-scoped search
- `admin.py` — admin operations
- `interaction/router.py` — like/bookmark/watch interactions
- `review/router.py` — user reviews
- `review_vote/router.py` — review voting
- `episode_interaction/` — per-episode watch tracking

**Benchmark:** Avg 122ms, Median 100ms, Max 277ms. **Acceptable** but could improve.

**Issues & Improvements:**
- [ ] `GET /api/v1/media/certifications` at 277ms is slow for a reference endpoint — cache permanently in Redis
- [ ] Media detail queries likely suffer from N+1 on related entities (genres, keywords, credits, assets, releases, videos, watch providers, external ratings, external IDs, collections, franchises) — audit with `selectinload` eager loading
- [ ] Season/episode interaction endpoints do many small writes — consider batching
- [ ] No server-side media detail caching beyond the 30s Redis TTL — increase to 5min for stable data
- [ ] Game-specific data (CCU, platforms, game modes, system requirements) adds query complexity — consider separate lightweight detail endpoint
- [ ] Poster/image URL construction happens at query time — pre-compute and store full URLs

---

### 2.4 Game Launcher (Desktop)

**Desktop:** Core desktop feature. Routes: `/launcher` (home), `/launcher/$gameId` (detail), `/launcher/library` (library). Features:
- Game detection via `GameDetector` — monitors running processes, matches to installed games
- FPS overlay via `fps-capture` plugin (PresentMon)
- Game library scanning (`local-files` plugin with SQLite DB)
- ISO mounting support (innounp)
- Save file management (`SaveDaemon`)
- Download/install management
- System tray with minimize/close-to-tray
- Window state persistence
- Deep link handling (`otix://` protocol)
- OAuth callback handling (cookie SameSite rewriting for `media-cache://` protocol)

**Frontend:** `launcher/` feature (56 files — largest feature by file count):
- Pages: `launcher-home-page`, `launcher-game-page`, `launcher-library-page`, `launcher-slide-picker`
- Components: game cards, screenshot gallery, match/launch buttons, slide picker, settings
- Data layer: `game-queries.ts`, `install-store.ts`, `storage-utils.ts`, API client

**Backend:** `api/library/` with:
- `local_games.py` — local game management
- `plex/router.py`, `spotify/router.py`, `steam/router.py`, `youtube/router.py` — library integrations
- `tab/router.py` — tab-based library views
- `services/game_matcher.py` (1795 lines) — game name matching/fuzzy logic
- `services/steam_igdb_resolver.py` — Steam-to-IGDB resolution

**Issues & Improvements:**
- [ ] Game matcher (1795 lines) is the second-largest service file — needs refactoring into smaller matchers per provider
- [ ] Game detection relies on process name matching — fragile, needs regular expression pattern maintenance
- [ ] ISO mounting has platform-specific code paths — needs Windows testing (innounp)
- [ ] FPS capture requires admin privileges on Windows (PresentMon) — user guidance needed
- [ ] Save daemon has no conflict detection for cloud-synced saves
- [ ] Library scanning (local-files) builds a separate SQLite database — data model divergence from main PG
- [ ] Launcher settings page content is uncontrolled — `settings-launcher-page.tsx` and `settings-scanned-games-page.tsx` need design review
- [ ] No offline mode — launcher should cache game data locally for offline use

---

### 2.5 Authentication & Authorization

**Desktop:** OAuth deep link handling (`otix://` protocol), cookie rewriting for secure contexts.

**Frontend:** `auth/` feature (33 files):
- Pages: login, register, forgot-password, reset-password, two-factor, verify-email, callback
- Multiple OAuth providers: Google, Plex, Spotify, Steam, TMDB
- Auth provider with token management via React context
- Deep link handling hook
- Session test file

**Backend:** `api/auth/` with sub-routers:
- `login/`, `register/`, `refresh/`, `logout/`, `me/`
- `forgot_password/`, `reset_password/`, `verify_email/`
- `two_factor/` (enable, disable, setup, login_verify, sessions)
- `oauth/` (Google, Plex, Spotify, Steam, TMDB — each with callback, disconnect)
- `plex/login/`, `spotify/login/`, `tmdb/login/`
- Rate limiting on `auth/login` (20 attempts)

**Services:** 20 auth-related service files:
- `auth_service.py`, `refresh_service.py`, `two_factor_service.py`
- Individual OAuth services for Google, Plex, Spotify, Steam, TMDB (auth + library)
- `session_service.py`, `vapid.py`

**Issues & Improvements:**
- [ ] Refresh token rotation writes to DB on every refresh — batch cleanup of old tokens
- [ ] JWT secret validation has dev fallback — ensure production guard is enforced
- [ ] 2FA TOTP setup has no backup code generation
- [ ] OAuth state parameter should use cryptographically random nonce (verify current implementation)
- [ ] No session management UI for users to view/revoke active sessions on other devices
- [ ] Password strength requirements not documented — check if zxcvbn-style check exists
- [ ] Auth rate limiting uses in-memory counter — should use Redis sliding window for multi-instance
- [ ] Auth cookies lack `__Host-` prefix for maximum security

---

### 2.6 User Profiles & Social

**Desktop:** N/A (uses web frontend).

**Frontend:** `user/` feature (9 files):
- User profile page with activity, reviews, hall of fame, stats, top-rated
- Follow/unfollow functionality
- Friend system (requests, feed, activity)

**Backend:** `api/user/` with sub-routers:
- `detail/` — user detail
- `follow/` — follow/unfollow system
- `friend/` — friend requests and management
- `activity/` — user activity feed
- `badges/` — achievement badges
- `continue_watching/` — watch progress
- `daily_activity/` — daily activity tracking
- `karma/` — karma system
- `metrics/` — user metrics
- `mood/` — mood check-ins
- `notification/` — user notifications
- `rating/` — user ratings
- `stats/` — user statistics

**Domain Models:** User, Follow, Friend, UserBadge, KarmaTransaction, Mood, Notification, PushSubscription

**Benchmark:** User endpoints avg 7ms median. **Healthy.**

**Issues & Improvements:**
- [ ] Friend activity feed could be heavy with many friends — needs pagination and caching
- [ ] Mood timeline has no visualization support on frontend
- [ ] Activity heatmap (`/api/v1/users/me/activity-heatmap` at 13ms) is fine now but will degrade with data volume — pre-aggregate
- [ ] No block/mute functionality for abusive users
- [ ] No privacy controls (private profile, hidden activity, hidden library)
- [ ] Karma transactions table will grow unbounded — needs archiving strategy

---

### 2.7 Lists

**Desktop:** N/A (uses web frontend).

**Frontend:** `list/` feature (4 files):
- List index page and list detail page
- Lightweight compared to backend complexity

**Backend:** `api/list/` with sub-routers:
- `detail/` — list CRUD
- `item/` — item management
- `collaborators/` — shared list editing
- `export/` — list export
- `history/` — item rank history
- `like/` — list likes

**Domain Models:** MediaList, MediaListItem, ListItemRankHistory, ListLike, ListCollaborator
**Service:** `list_service.py` (453 lines)

**Issues & Improvements:**
- [ ] Frontend has only 4 files for a complex backend feature — incomplete UI implementation
- [ ] List export functionality exists in backend but no download button in frontend
- [ ] Collaborator management has no real-time sync (use SSE)
- [ ] List rank history will grow large — partition by list_id with retention policy
- [ ] No drag-and-drop reordering in frontend

---

### 2.8 Reviews & Ratings

**Desktop:** N/A (uses web frontend).

**Frontend:** `review/` feature (14 files) + `interaction/` (4 files):
- Interactive star rating component (swipe-based)
- Review card, review section organisms
- Rating and review queries with React Query
- Review vote (helpful/not helpful) queries
- Interaction buttons (like, bookmark, watchlist, watched, watch)

**Backend:** Dedicated routers: `review/router.py`, `review_vote/router.py`, `interaction/router.py`, `episode_interaction/`
**Services:** `review_service.py`, `interaction_service.py`, `episode_interaction_service.py`, `media_rating_service.py`, `rating_algorithm_service.py`
**Domain Models:** Review, ReviewVote, UserMediaInteraction, UserEpisodeInteraction, MediaItemRating

**Issues & Improvements:**
- [ ] Interactive star component uses swipe — need to ensure keyboard accessibility
- [ ] Review helpfulness algorithm (`rating_algorithm_service.py`) is undocumented — document weighting formula
- [ ] Episode interaction tracking creates many small records — consider per-season batch writes
- [ ] No review moderation/reporting system
- [ ] Review vote endpoint susceptible to manipulation — add rate limiting per user

---

### 2.9 People & Companies

**Desktop:** N/A (uses web frontend).

**Frontend:** `people/` feature (9 files):
- People detail page with filmography
- Person-related media queries

**Backend:** `api/people/` with sub-routers:
- `detail/` — person detail
- `follow/` — follow a person
- `rating/` — rate a person
- `related/` — related people
- `api/company/` — company detail, follow, rating

**Domain Models:** Person, MediaCredit, Company, InvolvedCompany, CompanyRating
**Services:** `people_service.py`, `person_service.py`, `company_service.py`
**Embeddings:** Person embeddings backfilled via Celery (every 5 min)

**Issues & Improvements:**
- [ ] Person embedding backfill runs every 5 min but has no completion check — add a "done" flag per person
- [ ] People search at 404/3ms during benchmark suggests missing test data — validate with real data
- [ ] Company detail queries likely join through involved_companies — ensure index on (company_id, media_item_id)
- [ ] People filmography queries may be slow for prolific actors — add pagination and caching

---

### 2.10 Notifications

**Desktop:** System notifications via Electron, desktop notification channel.

**Frontend:** `notifications/` feature (30 files):
- Notifications page with real-time updates
- Multi-channel architecture: badge, desktop, push, sound, toast, web
- Notification registry, types, hooks, providers
- Tests for hooks

**Backend:** `api/user/notification/router.py` + `api/push/router.py`
**Services:** `notification_service.py`, `push_service.py`, `email_service.py`
**Tasks:** `tasks/release_notifications.py`, `tasks/promotions/`
**Domain Models:** Notification, PushSubscription

**Benchmark:** Notifications avg 8ms, Push avg 5ms. **Healthy.**

**Issues & Improvements:**
- [ ] Push subscription uses `pywebpush` — VAPID key rotation strategy not documented
- [ ] Sound notification channel references audio files — verify they exist in build output
- [ ] Release notifications task has no deduplication mechanism — users may get duplicate alerts
- [ ] Email templates (forgot_password.html, verify_email.html) are minimal — review for branding consistency
- [ ] No notification preferences granularity (per-type toggles exist but may not cover all types)
- [ ] No notification grouping/digest option (user gets swarmed with individual notifications)

---

### 2.11 Settings

**Desktop:** Desktop settings IPC handler, `desktop-settings.ts` for Electron-level config.

**Frontend:** `settings/` feature (43 files — second largest):
- 18 settings pages: profile, account, appearance, notifications, general, integrations, launcher, library, downloads, desktop, plugins, scanned games, admin proposals, organizer, scanners, preferences
- Plugin settings integration via `PluginSettingsPage` component
- Custom hooks and constants

**Issues & Improvements:**
- [ ] 18 settings pages is a lot for v1 — some could be consolidated (scanners + scanned games, launcher + library + downloads)
- [ ] Plugin settings rendering via `PluginSettingsPage` is uncontrolled — plugins can render arbitrary React — need sandbox/validation
- [ ] Settings changes have no undo/confirmation pattern for destructive actions
- [ ] No settings import/export for migration between devices
- [ ] No search within settings

---

### 2.12 Plugin System (Desktop)

**Desktop:** Full plugin architecture:
- `PluginManager` — lifecycle management (enable/disable/install/uninstall)
- `PluginRuntime` — isolated Node.js process per plugin
- `PluginWorker` — worker thread bridge
- `ServiceRegistry` — dependency injection for plugins
- `SlotRegistry` — UI extension points
- `eventBus` — inter-plugin communication
- `PermissionManager` — permission model
- `marketplace.ts` — plugin registry fetching
- `api-proxy.ts` — authenticated API access for plugins

**19 plugins** in the extension submodule: battlenet, deals, downloads, ea, factorio-blueprints, fps-capture, gog, itch, local-files, nzbplanet, otix-epic, otix-lidarr, otix-radarr, otix-sonarr, riot, sabnzbd, steam, ubisoft, xbox

**Frontend:** `plugins/utils/matching.ts` — minimal plugin utilities

**Issues & Improvements:**
- [ ] Plugin permission model needs formal audit — plugins currently have wide file system access
- [ ] Plugin marketplace has no signature verification — man-in-the-middle risk for plugin downloads
- [ ] Plugin runtime isolation (separate Node process) is good, but resource limits are not enforced per-plugin
- [ ] No plugin telemetry/error reporting — plugin crashes are silent
- [ ] Plugin API surface (api-proxy) exposes full backend API — needs scoping per-plugin
- [ ] Plugin settings UI is generic JSON form — needs schema-driven form generation
- [ ] No plugin auto-update mechanism
- [ ] Plugin database (`plugins-db.ts`) uses better-sqlite3 alongside main PG — migration coordination needed

---

### 2.13 Gamification

**Desktop:** N/A (backend-driven).

**Backend:**
- **Services:** `gamification_service.py` (341 lines), `karma_service.py`
- **Tasks:** `tasks/gamification.py`, `tasks/xp.py`, `tasks/release_notifications.py`
- **Domain Models:** UserBadge, KarmaTransaction, UserStreak
- **Library:** `lib/xp.py`, `lib/levels.py`, `lib/badges.py`

**Issues & Improvements:**
- [ ] XP calculation logic is spread across multiple files — consolidate into single XP engine
- [ ] Badge claiming has integration test but badge criteria are hardcoded — should be data-driven
- [ ] No leaderboard endpoint for competitive engagement
- [ ] Streak tracking has no recovery/forgiveness mechanism (one missed day breaks streak)
- [ ] Gamification tasks fire on user action triggers — verify they don't cause write contention

---

### 2.14 Data Pipeline (Sync & Enrichment)

**Backend Infrastructure:**

The Celery beat schedule orchestrates a complex ETL pipeline:

**Daily cadence:**
- TMDB daily import (3:07 AM) — downloads TMDB export files, inserts stubs, detects deletions
- TMDB backlog drain (every 5 min) — processes 200 stubs per batch
- TMDB trending sync (every 2 hours)
- TMDB people cycle (every 30 min) — cascades to movies/shows via filmography
- Steam CCU batch (every 5 min) — concurrent player counts
- Spotify recently played sync (every 7 min)
- Spotify playlist refresh (every 6 hours)
- YouTube watch history sync (every 15 min)
- Deezer, MusicBrainz, Last.fm cycles (various intervals)
- Deduplication run (daily at 4:23 AM)

**Enrichment cascade:**
- Fanart enrichment (every 15 min) — primarily triggered inline from TMDB sync
- OMDb enrichment (every 30 min)
- SteamGridDB enrichment (every 30 min)
- Steam enrichment (every 15 min)
- Production companies enrichment (every 15 min)
- Content ratings enrichment (every 15 min)
- Embedding backfill (every 5 min) — media, people, and company embeddings

**Queue isolation:**
- `ingest-tmdb`, `ingest-steam`, `ingest-igdb`, `ingest-musicbrainz`, `ingest-deezer`
- `enrich-fanart`, `enrich-omdb`, `enrich-steamgrid`, `enrich-lastfm`, `enrich-theaudiodb`, `enrich-lrclib`
- `reactive-fast`, `reactive-user`
- `maintain`, `embedding`

**Issues & Improvements:**
- [ ] 40+ periodic tasks create significant Redis overhead for beat scheduler — consider Celery RedBeat or Django-celery-beat for persistence
- [ ] Embedding backfill runs every 5 min indefinitely — add stop condition when all items have embeddings
- [ ] TMDB daily import at 3:07 AM has no monitoring — if it fails, catalog goes stale silently
- [ ] Provider rate limiting is in-memory per worker — cumulative across workers could exceed API limits
- [ ] No dead letter queue — failed tasks are lost after max retries
- [ ] Per-provider stale item detection varies — standardize staleness check across all providers
- [ ] Celery tasks import at module level (40+ imports in celery.py) — slows worker startup
- [ ] `seed.tmdb_daily_import` downloads large exports — needs progress reporting and resume capability

---

### 2.15 Workouts

**Desktop:** N/A.

**Frontend:** Not present as a top-level feature (may be on roadmap).

**Backend:** `api/workout/` with sub-routers:
- `detail/` — workout CRUD
- `exercises/` — exercise library
- `today/` — today's workout
- `heatmap/` — workout heatmap

**Domain Models:** Workout, Exercise
**Service:** `workout_service.py`

**Issues & Improvements:**
- [ ] Workout feature has no frontend UI at all — dead backend code for v1
- [ ] Consider removing from v1 or building minimal frontend

---

### 2.16 Proposals System

**Desktop:** N/A.

**Frontend:** `proposals/` feature (4 files):
- Proposals page with proposal cards
- Submit and vote on edit/match proposals

**Backend:** `api/proposals/router.py`
**Services:** `proposals_service.py` (424 lines), `proposal_handlers/edit_handler.py`, `proposal_handlers/match_handler.py`
**Domain Models:** Proposal, MatchProposal, MatchSkip, AdminEdit

**Issues & Improvements:**
- [ ] Minimum XP requirement (500 XP) may be too high for early adopters — lower to 100
- [ ] Proposal voting has no Sybil resistance — one user, one vote should be enforced server-side
- [ ] Match proposal confirmation flow is complex (edit_handler + match_handler) — simplify into single workflow
- [ ] Admin edits table has no audit trail visible to regular users

---

### 2.17 Integrations

**Backend Providers (10+ external APIs):**

| Provider | Client | Hydrator | Transformer | Purpose |
|----------|--------|----------|-------------|---------|
| TMDB | tmdb/client.py | tmdb/hydrator.py | tmdb/transformer.py | Movies, TV, people |
| IGDB | igdb/client.py | igdb/hydrator.py | igdb/transformer.py | Games |
| Steam | steam/client.py | steam/hydrator.py | steam/transformer.py | Game data, CCU |
| Spotify | spotify/client.py | - | spotify/transformer.py | Music |
| MusicBrainz | musicbrainz/client.py | musicbrainz/hydrator.py | musicbrainz/transformer.py | Music metadata |
| Deezer | deezer/client.py | deezer/hydrator.py | deezer/transformer.py | Music |
| Fanart | fanart/client.py | fanart/hydrator.py | fanart/transformer.py | Artwork |
| OMDb | omdb/client.py | omdb/hydrator.py | omdb/transformer.py | Movie metadata |
| Last.fm | lastfm/client.py | lastfm/hydrator.py | lastfm/transformer.py | Music metadata |
| SteamGridDB | steamgrid/client.py | steamgrid/hydrator.py | - | Game artwork |
| TheAudioDB | theaudiodb/client.py | theaudiodb/hydrator.py | - | Music artwork |
| LRCLIB | lrclib/client.py | lrclib/hydrator.py | - | Lyrics |
| NZBPlanet | nzbplanet/client.py | nzbplanet/hydrator.py | nzbplanet/transformer.py | Usenet |
| YouTube | youtube/client.py | - | - | Watch history |

**OAuth Integrations:** Google, Plex, Spotify, Steam, TMDB (each with login, callback, disconnect)

**Library Integrations:** Plex (servers, libraries, sessions, sync, stream), Spotify (playlists, recently played, sync), Steam (owned apps, wishlist), YouTube (watch history sync), TMDB (ratings sync, watchlist import)

**Issues & Improvements:**
- [ ] Provider pattern is well-structured but `BaseProvider` rate limiting is per-worker — distributed rate limiting needs Redis-backed token bucket (partially implemented, verify)
- [ ] TMDB client at the center of the data pipeline — a TMDB API outage cascades to most enrichments
- [ ] Steam API key validation not checked at startup — fails silently at runtime
- [ ] Spotify OAuth token refresh has no retry-on-failure logic
- [ ] Plex sync service (2173 lines) is the LARGEST single file in the codebase — critical refactor target
- [ ] YouTube title parser (`lib/youtube_title_parser.py`) uses regex — fragile, needs test coverage maintenance
- [ ] MusicBrainz rate limit of 1 RPS is very restrictive — batch strategically or use local mirror
- [ ] No circuit breaker state persistence — if a provider is down, all workers need to independently discover it

---

### 2.18 Activity Panel (Plex)

**Desktop:** N/A.

**Frontend:** `activity/` feature (19 files):
- Plex session display with palette extraction from artwork
- Real-time session updates
- Panel context provider

**Issues & Improvements:**
- [ ] Plex-only activity panel — should support Spotify now-playing, Steam in-game status
- [ ] Palette extraction happens client-side — could be pre-computed
- [ ] Plex session polling frequency may be too aggressive

---

### 2.19 Navigation & Layout

**Frontend:** `navigation/` feature (12 files):
- Sidebar navigation, top bar, mobile navigation
- Navigation provider with context

**Issues & Improvements:**
- [ ] Mobile navigation is present in code but likely needs testing on real devices
- [ ] No keyboard shortcuts for navigation
- [ ] Breadcrumb component referenced in some pages but not consistently applied

---

## 3. Cross-Cutting Concerns

### 3.1 Performance

| Concern | Severity | Details |
|---------|----------|---------|
| Search latency | Critical | 7s response time (see §2.2) |
| N+1 queries | High | Service layer lazy-loads relationships without eager loading |
| Missing DB indexes | High | No systematic EXPLAIN ANALYZE audit |
| No CDN for assets | Medium | Static files served from Python/nginx |
| Hot Redis keys | Medium | `media:detail:*` at 30s TTL may cause cache stampede |
| Embedding cold start | Medium | 24s ONNX model load time, pre-warmed at startup but not in workers |
| Celery task overhead | Low | Per-game Celery fire instead of batching |

**Action items:**
- [ ] Run `EXPLAIN ANALYZE` on all endpoints that touch >3 tables
- [ ] Add `selectinload` or `joinedload` to all media detail, search, and discover queries
- [ ] Implement Redis cache stampede protection (probabilistic early recomputation)
- [ ] Add CloudFront or Cloudflare CDN for `/uploads/` and static assets
- [ ] Create database index review checklist and apply to consolidated schema migration

### 3.2 Security

| Concern | Severity | Details |
|---------|----------|---------|
| JWT dev fallback | Critical | Insecure key used if JWT_SECRET_KEY unset in production |
| Plugin permissions | High | Plugins have broad file system and API access |
| Plugin marketplace | High | No signature verification for plugin downloads |
| CORS regex | Medium | `https?://(localhost|127\.0\.0\.1):\d+` allows any localhost port |
| Rate limiting | Medium | Auth rate limits use in-memory counters |
| OAuth state | Low | Verify CSRF state parameter is cryptographically random |
| Upload validation | Low | Max 5MB upload, verify content-type validation |
| Cookie security | Low | `SameSite=Lax` with `Secure` rewriting for desktop |

**Action items:**
- [ ] **CRITICAL:** Add JWT_SECRET_KEY validation that fails startup in production if unset
- [ ] Audit plugin permission model — implement principle of least privilege
- [ ] Add plugin signature verification using Ed25519 or RSA
- [ ] Restrict CORS regex to known ports only (5173, 5174, 8080)
- [ ] Convert auth rate limiting to Redis-backed sliding window
- [ ] Add Content-Security-Policy header
- [ ] Add `__Host-` prefix to auth cookies for maximum security

### 3.3 Testing

| Layer | Test Files | Coverage Estimate | Status |
|-------|-----------|-------------------|--------|
| Backend unit | ~30 | 30-40% | Insufficient |
| Backend integration | ~30 | 10-20% | Insufficient |
| Frontend unit | ~23 | 10-15% | Insufficient |
| Desktop unit | 7 | 5-10% | Critical gap |
| E2E | 1 | <1% | Critical gap |

**Action items:**
- [ ] Define minimum test coverage thresholds: 60% backend services, 40% frontend components, 30% desktop
- [ ] Critical paths needing E2E tests: auth flow, search flow, discover browse, game launch
- [ ] Backend services missing tests entirely: embedding_service, company_service, personalization_service, external_id_service, search_log_service
- [ ] Add contract tests between API and frontend using generated OpenAPI types
- [ ] Desktop game detector and plugin manager need integration tests

### 3.4 Observability

| Concern | Severity | Details |
|---------|----------|---------|
| No error tracking | High | No Sentry/Datadog/OpenTelemetry integration |
| Structured logging | Medium | Structlog configured but no aggregation (ELK/Loki) |
| Health checks | Low | Basic health endpoints exist, no readiness probes |
| Metrics | Low | `lib/metrics.py` exists but scope unclear — Prometheus? |

**Action items:**
- [ ] Add Sentry SDK to backend and frontend
- [ ] Ship structured logs to a central aggregator or add JSON file logging
- [ ] Add `/ready` endpoint that checks DB + Redis connectivity
- [ ] Expose Prometheus metrics endpoint for request duration, error rate, DB pool usage

### 3.5 Code Quality

| Concern | Details |
|---------|---------|
| `# TODO: Review this file` markers | config.py, celery.py, media.py have this marker — indicate files not yet reviewed |
| Plex sync service (2173 lines) | Largest single file — needs decomposition into smaller service modules |
| Game matcher (1795 lines) | Second largest — split by provider |
| Media domain (612 lines) | Large model — could split into separate media type models |
| Old features directory | `frontend/src/old-features/` still present with legacy code |
| Inconsistent `__init__.py` exports | Some domains re-export everything, others don't |
| `_batch-convert.sh` in src/ | Shell script shouldn't be in source tree |
| Dev settings in production path | `settings.cors_origin_regex` allows `localhost` in production |

### 3.6 Database

| Concern | Details |
|---------|---------|
| Consolidated migration | Single 82K-line migration (aaaaaaaa0001) is risky for production deploy |
| Migration testing | No tests verify migration rollback safety |
| Missing indexes | No trigram index on media title (exists on people name only) |
| Vector index | HNSW index on embeddings — verify build time with production data volume |
| Timestamp defaults | Migration 0005 adds defaults — verify no NULL timestamps before applying |

**Action items:**
- [ ] Test migration on a production-sized database snapshot before deploying
- [ ] Add trigram index on `media_items.title` for better search prefix matching
- [ ] Review all foreign keys for ON DELETE behavior — many may be missing CASCADE/SET NULL
- [ ] Add database backup verification to deployment checklist

### 3.7 Desktop Application

**Key concerns specific to Electron app:**

- [ ] Only 7 test files for 15K lines of code — critical test gap for game detection and plugin system
- [ ] `better-sqlite3` is a native dependency — rebuild issues on different platforms
- [ ] Game detection uses polling (`startPeriodicScan`) — could use OS-level file watchers
- [ ] `media-cache://` custom protocol writes to disk unboundedly — needs cache eviction policy
- [ ] Window state saves to JSON synchronously on every resize event — debounce needed
- [ ] No auto-updater for the desktop app itself
- [ ] Plugin system has no crash recovery — if a plugin process dies, it stays dead
- [ ] Free games aggregator (`free-games/aggregator.ts`) has no tests
- [ ] PresentMon binary (Windows FPS capture) bundled as binary — licensing verification needed

---

## 4. v1 Release Readiness Scorecard

| Area | Score | Status |
|------|-------|--------|
| Core API stability | 7/10 | Most endpoints functional, some need performance work |
| Search | **3/10** | Blocker — 7s response time unacceptable |
| Discover | 8/10 | Functional, needs caching optimization |
| Media detail | 7/10 | Functional, needs eager loading audit |
| Auth | 7/10 | Feature-complete, needs security hardening |
| Game launcher | 6/10 | Works for happy path, needs error recovery |
| Social features | 7/10 | Needs privacy controls and blocking |
| Lists | 5/10 | Backend complete, frontend UI incomplete |
| Reviews/ratings | 7/10 | Functional, needs moderation |
| Notifications | 8/10 | Well-tested, needs notification digest |
| Settings | 6/10 | Too many pages, needs consolidation |
| Plugin system | 5/10 | Feature-rich but needs security audit |
| Data pipeline | 7/10 | Well-architected, needs monitoring |
| Gamification | 7/10 | Works, needs XP engine consolidation |
| Testing | **4/10** | Significantly under-tested across all layers |
| Observability | **3/10** | No error tracking, no metrics aggregation |
| Security | **5/10** | JWT dev fallback and plugin permissions are risks |
| Performance | **5/10** | Search is critical blocker |
| Documentation | 4/10 | No API docs, no architecture docs, no runbook |
| CI/CD | 6/10 | Basic CI, no deployment automation |

---

## 5. v1 Launch Prerequisites (Must-Fix)

### Blockers (Must fix before v1 launch)

1. **Search performance** — 6.9s is unacceptable. Target: <500ms P95.
   - Add Redis query cache for frequent searches
   - Audit and add missing DB indexes
   - Batch embedding calls
   - Implement materialized search view

2. **JWT secret production guard** — Startup must fail if JWT_SECRET_KEY is empty in production

3. **Security audit: plugin permissions** — Scope down file system and API access per-plugin

4. **Plugin marketplace signature verification** — Prevent MITM on plugin downloads

5. **Database migration safety** — Test consolidated migration on production-scale snapshot

### High Priority (Fix within first week of v1)

6. **Error tracking** — Add Sentry to backend, frontend, and desktop
7. **N+1 query audit** — Eager loading for all media/search/discover queries
8. **Auth rate limiting** — Redis-backed sliding window
9. **CORS restriction** — Remove wildcard localhost regex in production
10. **Desktop auto-updater** — Electron app needs update mechanism
11. **CDN for static assets** — Offload from Python/nginx
12. **Health check hardening** — Add `/ready` endpoint with dependency checks

### Medium Priority (Fix within first month of v1)

13. **Test coverage** — Backend services to 60%, frontend components to 40%
14. **E2E tests** — Auth flow, search, discover browse, game launch
15. **Plex sync service refactor** — Decompose 2173-line file
16. **Game matcher refactor** — Split by provider
17. **Settings page consolidation** — Merge related settings pages
18. **Privacy controls** — Profile visibility, activity visibility, block user
19. **Notification digest** — Group notifications to reduce noise
20. **Plugin crash recovery** — Automatic restart for dead plugin processes

---

## 6. Post-v1 Roadmap Recommendations

### Phase 2 (v1.1 — 2-4 weeks after v1)

- Media detail page performance optimization
- List feature frontend completion (drag-and-drop, collaborator real-time sync)
- People/company search with real data validation
- Offline mode for desktop launcher
- Workout feature: build frontend or remove backend
- Old features directory cleanup
- Database archiving strategy for large tables (karma_transactions, list_item_rank_history)

### Phase 3 (v1.2 — 4-8 weeks after v1)

- Recommendation engine using embeddings (collaborative filtering + content-based)
- Social feed with activity aggregation
- Leaderboard and competitive gamification
- A/B testing framework for discover page
- Plugin SDK documentation
- Admin dashboard for content moderation
- Multi-language support infrastructure

### Phase 4 (v2.0)

- Mobile app (React Native or PWA)
- Community features (comments, discussions, shared lists)
- Advanced search filters (faceted search with genre/year/rating)
- Machine learning personalization pipeline
- Multi-region infrastructure with CDN edge compute
- Public API for third-party integrations

---

## 7. Infrastructure Cost Estimates

Based on docker-compose.prod.yml resource allocations:

| Service | Spec | Estimated Monthly Cost |
|---------|------|----------------------|
| API server | 1GB RAM, 1-2 vCPU | $40-80 |
| Database | 1.5GB RAM, 2 vCPU, 50GB SSD | $60-120 |
| Redis | 512MB RAM | $15-30 |
| PgBouncer | 128MB RAM | $5-10 |
| Workers (4 types) | 2.5GB RAM total, 4 vCPU | $80-160 |
| Beat scheduler | 256MB RAM | $5-10 |
| Frontend (nginx) | 256MB RAM | $5-10 |
| CDN (CloudFront) | 50GB transfer | $5-15 |
| Error tracking (Sentry) | Developer tier | $0-26 |
| **Total (monthly)** | | **$215-461** |

These are single-instance estimates. High availability (multi-AZ) would approximately double costs.

---

## 8. Immediate Next Actions

1. **Today:** Fix search performance — this is the single biggest blocker
2. **Today:** Add JWT production guard
3. **This week:** Security audit of plugin system
4. **This week:** Add Sentry across all three platforms
5. **This week:** Run migration on production-scale test data
6. **Next week:** Begin N+1 query audit
7. **Next week:** Add E2E test for critical auth + search + discover paths

---

*Report generated from analysis of ~182K lines of code across 3 platforms, 30+ API modules, 21 frontend features, 10+ external integrations, and 19 plugins.*
