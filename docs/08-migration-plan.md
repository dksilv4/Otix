# Migration Plan

## Strategy

**Phased migration with shadow traffic.** Build the new system alongside the old, validate with production traffic, cut over in a single weekend.

---

## Timeline

| Phase | Duration | Output | Risk Level |
|---|---|---|---|
| **0: Foundation** | 2-3 weeks | Project skeleton, CI/CD, DB migrations, auth | Low |
| **1: Core API** | 4-6 weeks | Auth, user profiles, media CRUD, TMDB movie sync | Medium |
| **2: Provider Sync** | 6-8 weeks | All 7 providers, catalog, discovery, recommendations | High |
| **3: Data Migration** | 1-2 weeks | Migration tool, validation | Medium |
| **4: Frontend Data Layer** | 3-4 weeks | New API client, query hooks, auth flow | Medium |
| **5: Cutover** | 1 weekend | DNS switch, monitoring | High |
| **Total** | **5-6 months** | | |

---

## Phase Details

### Phase 0: Foundation (Weeks 1-3)

**Goal:** Everything compiles, deploys, and auth works end-to-end.

- [ ] Project structure with FastAPI skeleton
- [ ] Docker Compose with PostgreSQL, Redis, API, worker, beat
- [ ] Alembic initial migration (users + auth tables)
- [ ] CI/CD pipeline (lint, type-check, test, build, deploy)
- [ ] Auth: register, login, refresh, logout
- [ ] GitHub Actions deploys to staging
- [ ] Prometheus metrics endpoint

**Exit criteria:** Can register, login, refresh a token, and access an authenticated endpoint. Database migrations run cleanly.

### Phase 1: Core API (Weeks 4-9)

**Goal:** Media CRUD works, TMDB movie sync pipeline is functional.

- [ ] Domain models: media_items, movies, external_ids, genres, people, credits
- [ ] Media endpoints: detail, list, credits
- [ ] Search: PostgreSQL tsvector with GIN index
- [ ] TMDB provider client + transformer + hydrator
- [ ] Sync pipeline: sync_entity → fanout → enrichment for TMDB movies
- [ ] Rate limiter + circuit breaker for TMDB
- [ ] User profiles, preferences
- [ ] User interactions (rate, watchlist, etc.)

**Exit criteria:** Can sync any TMDB movie with full relations, search by title, and view media detail with cast and genres.

### Phase 2: Provider Sync (Weeks 10-17)

**Goal:** All providers integrated. Catalog features complete.

- [ ] TMDB: shows, seasons, episodes, people
- [ ] Steam: game sync, CCU polling
- [ ] IGDB: game sync, platform/mode enrichment
- [ ] Fanart: image hydration by TMDB/IMDB ID
- [ ] OMDB: rating enrichment
- [ ] Plex: library sync, watch state
- [ ] Collection management
- [ ] Discovery feeds (trending, popular, upcoming)
- [ ] Recommendations (basic collaborative filtering)
- [ ] Catalog completeness scoring

**Exit criteria:** Full catalog sync runs without errors. All provider rate limiters active. Discovery feeds populated.

### Phase 3: Data Migration (Weeks 18-19)

**Goal:** Production data migrated and verified.

- [ ] Migration script: Django ORM → new schema
- [ ] Run against production data snapshot
- [ ] Verify: row counts, 100 random entities spot-checked, checksums
- [ ] Idempotency: run multiple times, same result
- [ ] Performance: migration completes in < 4 hours

**Exit criteria:** All production data loads into the new schema without data loss.

### Phase 4: Frontend Data Layer (Weeks 20-23)

**Goal:** Frontend uses the new API. UI components are unchanged.

- [ ] Generate `@otix/api-client` from OpenAPI spec
- [ ] Rewrite TanStack Query hooks to use new client
- [ ] Auth flow: JWT in memory, silent refresh on 401
- [ ] Migrate feature modules one by one (media → discover → search → sync → user)
- [ ] Discover persistence in IndexedDB
- [ ] Sync status via SSE
- [ ] Drop axios, CSRF interceptor, case conversion
- [ ] Drop SCSS mixins, Tailwind-only

**Exit criteria:** All routes render, all features work, CI type-checks API contract between frontend and backend.

### Phase 5: Cutover (Weekend)

**Goal:** Production traffic switches to the new system.

**Friday evening:**
- [ ] Set Django to read-only
- [ ] Run final data migration
- [ ] Verify row counts against Django DB

**Saturday:**
- [ ] DNS switch to new API
- [ ] Deploy new frontend build
- [ ] Enable shadow traffic comparison (route 1% of reads to old API, compare responses)
- [ ] Monitor: error rate, latency, sync status

**Sunday:**
- [ ] Review shadow traffic results
- [ ] Fix any discrepancies
- [ ] Full cutover — all traffic to new system
- [ ] 48-hour monitoring window

**Rollback plan:** Switch DNS back to Django. The old system remains deployed but read-only during the window.

---

## Risk Items

| Risk | Impact | Mitigation |
|---|---|---|
| Provider API changes during rebuild | Sync breaks for new fields | Provider clients are versioned. Tests run against recorded API responses (VCR-style). |
| Data migration takes > 4 hours | Extended read-only window | Test migration timing early with production-sized data. Optimize bulk inserts. |
| Frontend regressions | Broken UI for existing users | Phase 4 migrates features one at a time. Each can be tested in isolation. |
| Celery edge cases | Lost tasks, duplicate syncs | Celery config stays the same. Only routing changes. Task definitions are new but the broker is identical. |
| Refresh token theft | Account takeover | HTTP-only cookie, SameSite=Lax, refresh token rotation (issue new refresh token on each use). |

---

## What Gets Deleted

### Backend
- Django ORM (GenericForeignKey, ContentTypes, multi-table inheritance)
- Django admin
- Django Channels
- 30 Celery queues → 7
- Complex Celery routing function (200+ lines → 15 lines)

### Frontend
- axios instance with interceptors
- snake_case ↔ camelCase conversion
- CSRF token handling
- SCSS mixins (Tailwind-only)
- react-virtualized (already have @tanstack/react-virtual in deps)

### Infrastructure
- SilvaStack monorepo experiment

---

## What Gets Kept

### Backend
- Python expertise and ecosystem
- PostgreSQL + Redis + Celery (proven infra)
- Provider integration logic (translated, not thrown away)

### Frontend
- All React UI components
- TanStack Router route structure and code splitting
- Tailwind CSS 4 utilities
- Discover persistence concept (IndexedDB, lightweight)

### Infrastructure
- Docker Compose + Dokploy deployment model
