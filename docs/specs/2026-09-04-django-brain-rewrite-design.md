# Django/DRF Migration — Decision Design

- **Date:** 2026-09-04
- **Status:** Proposal (decision pending)
- **Scope:** Rewrite of the FastAPI backend (`backend/`) to Django + Django REST Framework
- **Motivation:** Django/DRF fluency; plugins should be Python and run server-side without a Node service; coherent with a self-hosted "brains" product

## 0. Decisions already made (this session)

1. **Self-hosted (Plex model)** — users run their own Otix server; browser connects. Not hosted-SaaS-only.
2. **Browser is the app** — full plugin/app use from a browser with no desktop download.
3. **Desktop Electron = optional companion** — device-bound + offline features, syncing to the server.
4. **Plugins are Python, running in the server** — no Node service beside the brain.
5. This design doc exists to size the Django move *honestly* before committing.

This doc is decision-support, not a build plan. Section 10 lists cheap "step 0" actions that make the decision concrete without committing to the rewrite.

## 1. Ground truth: what "completely" actually touches

Inventory was done from the live code on 2026-09-04.

### 1.1 API surface

- **263 route endpoints**: 119 GET / 95 POST / 33 DELETE / 11 PUT / 5 PATCH, across **110 files** with route decorators / **130 `*router*.py`** files, all mounted under **`/api/v1`** (`entrypoints/api/main.py:120`). Plus non-versioned `/health`, `/healthz`.
- Source of truth for the contract: the app's generated OpenAPI schema (`openapi.json`).

| Area | Routes | Representative prefix |
|---|---|---|
| Media (+reviews/votes/claims) | 53 | `/media/{media_type}/{media_id}` |
| User / social | 49 | `/users/{username}`, `/friends`, `/notifications` |
| Auth (incl. 2FA, SSO, OAuth-linking) | 45 | `/auth/*` |
| Integrations (plex/steam/tmdb/youtube) + saves | 24 | `/integrations/*`, `/saves` |
| List | 18 | `/list` |
| Workout | 11 | `/workout`, `/exercises` |
| Library | 10 | `/library/{tab}`, `/library/installed` |
| Search | 8 | `/search/*` |
| Proposals | 8 | `/proposals` |
| Blueprint | 7 | `/blueprints` |
| Admin | 6 | `/admin` |
| Company | 5 | `/company` |
| Discover | 4 | `/discover/*`, `/discover/free-games` |
| Push | 3 | `/push` |
| Track / Upload / Calendar | 2/1/1 | `/tracks`, `/upload`, `/calendar` |
| Health | 1 | `/api/v1/health` |

### 1.2 Data layer

- **86 ORM model classes / 86 `__tablename__`s**, in `backend/otix/domain/*.py` (30 modules). **87 tables in the live DB** — `game_content_items` exists with **no ORM model** (only raw SQL in `otix/services/media_service.py` merge-dedupe).
- Central **`media_items`** table (discriminator `media_type`, `search_vector`, `embedding`) with **1:1 subtype tables** (`movies/shows/seasons/episodes/games/albums/tracks`, PK = `media_item_id` FK → `media_items.id ON DELETE CASCADE`). This maps cleanly to Django **multi-table inheritance**.
- **pgvector semantic search**: `Vector(384)` columns + **HNSW** cosine indexes on `media_items`, `people`, `companies`, `users`; full-text `search_vector` TSVECTOR + GIN; `pg_trgm` trigram GIN on `media_items.title`, `people.name`; `similarity_threshold=0.2` set per-connection (`infrastructure/database.py`).
- **DB-authoritative machinery** (must be reproduced exactly, not approximated):
  - `trg_media_items_search_vector` **trigger** — plpgsql sets `NEW.search_vector` on insert/update of `title, overview`; the app only *reads* it.
  - Global unique **`uq_external_id_provider_media_type (provider, external_id, media_type)`** + partial uniques; the app relies on it via `ON CONFLICT DO NOTHING`.
  - Named unique constraints (`uq_media_assets_item_url_type`, `uq_match_skip_provider_ext`, …), **CHECK** constraints (`ck_media_type`, `ck_edit_proposal_status`, score ranges, …), extensions `vector` + `pg_trgm`, `DEFAULT NOW()` on NOT NULL timestamps.

### 1.3 Platform machinery a rewrite must reproduce

- **Auth**: JWT HS256 `Authorization: Bearer` access (15-min TTL) + refresh JWT in **httpOnly cookie `otix_refresh`** (path-scoped `/api/v1/auth/`, rotation + reuse detection). **2FA via TOTP** with a challenge-token flow. **OAuth providers: google, google_drive, plex, steam, tmdb** (+ youtube connector). Auth rate limiter (`api/rate_limit`), general limiter (`lib/rate_limiter.py`), Redis TTL helpers.
- **SSE / streaming**: `POST /media/match/stream`, `GET /media/{id}/rehydrate/{task}/stream`, plex/youtube sync streams, `GET /notifications/stream` (`lib/sse/*`).
- **Celery**: app in `otix/infrastructure/celery.py`; ~28 task modules (`otix/tasks/*`); dispatched from media/search/detail, plex webhook, user/badges, mood, search/providers.
- **Webhooks**: `POST /integrations/plex/webhook` — HMAC-SHA256 `X-Plex-Signature` vs `settings.plex_webhook_secret` → Celery.
- **Uploads**: `/upload` (image magic-byte checks), `/saves/{game_id}/upload`. Static mount `/uploads`.
- **Lifespan**: Alembic upgrade on boot, Redis connect, **ONNX embedding model pre-warm (~120s)**.
- **Desktop-launcher dependency** (confirmed): `/media/match*`, `/media/sync-local-games`, `/media/import`, `/media/{id}/rehydrate`, `/library/installed`, `/integrations/steam/{scan|owned-appids|resolve-unmatched|wishlist/scan}`, `/saves/{game_id}/…`, `/search/*`, and SSE match streams.

### 1.4 Reality check: a hosted product already exists

- Frontend production default is **`https://otix.app/api/v1`** (`frontend/src/lib/api/client.ts`); desktop dev hits `http://127.0.0.1:8000` → `/api/v1`.
- A `V1_PRODUCTION_RELEASE_REPORT.md` exists. **Treat otix.app as a live hosted product unless confirmed otherwise.** A rewrite must not strand it, which makes a no-parity flag-day unsafe.

## 2. What Django genuinely buys (honest)

- **Plugins as Django apps** — the actual motivation. Apps bring models+migrations (storage), signals (event bus), Django permissions (the `table:*`/`network:*` model), admin (config UI), app discovery. See §4.
- **Single Python runtime** on the server — no Node service, no `better-sqlite3`/ABI problem.
- **ORM fits the schema**: `media_items` + 1:1 subtypes → multi-table inheritance; pgvector via `django-pgvector`; Celery via `django-celery-beat`; async/ASGI supported for SSE.
- **Admin** for self-host configuration; mature auth ecosystem for the OAuth/2FA surface.
- **Your fluency** — you'll write far more Python in the plugin framework and platform than today; Django raises your throughput and lowers review effort.

## 3. What it costs & the real risks

1. **Contract preservation is mandatory.** All 263 routes must be re-served under identical `/api/v1` paths/JSON, or every client (hosted frontend, desktop, future browser) breaks. DRF ≠ FastAPI response shapes by default — needs an explicit parity harness.
2. **Data fidelity on a drifted schema.** The live DB is authoritative, not the models (known drift: `game_content_items` has no model; some migrations/models run ahead of the DB). Start from a live-DB snapshot, not the ORM.
3. **DB-side machinery must be reproduced exactly** — trigger, global/partial uniques, CHECKs, HNSW indexes, extensions, per-connection similarity threshold. Django can express most, but the trigger and `ON CONFLICT` semantics need deliberate care (DB-first, or `save()` overrides).
4. **Subtle subsystems are the long tail**: OAuth/2FA/cookie-rotation auth matrix, SSE, ONNX embedding warm-up + Celery embed pipelines, rate limiting, search ranking.
5. **Rewriting working logic = regression risk** across a big surface; needs a parity/golden-test strategy, not just ported unit tests.
6. **Sequencing cost**: big-bang = long period with no working increment and a live prod frozen from iteration; strangler = two codebases during the transition that drift if it stalls.
7. This is the **largest item in the whole thread** — bigger than the plugin migration. Treat it as its own workstream, not a slice of the plugin work.

## 4. Plugin framework → Django idioms (the payoff)

Current JS plugin concept → Django equivalent:

| Today (JS plugin system) | Django |
|---|---|
| Plugin = drop-in dir (`manifest.json` + `main.js`) | Plugin = discoverable app dir (`manifest.yaml` + `plugin.py`/package), found via a registry scan or `AppConfig` |
| Namespaced per-plugin SQLite (`table:*`) | Plugin's own Django models/migrations; optional per-plugin Postgres schema for private data |
| `ctx.db` gated by `table:*` permission | Django model/permission layer; raw-schema access as the exception |
| `ctx.fetch` (`network:external`) | Service client (httpx) behind an allowlist permission |
| `ctx.events` / event bus | Django signals + async dispatch |
| service registry / `discover` | Registry + lookup (service classes or ContentType-style) |
| Slots returning widget JSON | Plugins return serializable widget data; **React frontend unchanged** (it never saw plugin code) |
| Config store + settings tabs | Admin / a config model |
| `ctx.downloads`, match pipeline | Django apps/API + Celery tasks (the "centralized downloads" model survives) |
| Worker-thread isolation + timeouts | `asyncio.wait_for` on interactive handlers; **Celery** for background/long jobs (process-isolated) |

Open sub-decisions: authoring unit (drop-in folder vs pip package — affects self-host install UX), and isolation depth (in-process + Celery is fine for trusted self-host plugins; subprocess/container only if an untrusted *marketplace* is on the roadmap).

## 5. Data reconciliation — step 0, regardless of sequencing

- Treat **live Postgres (`otium_prod_v1`) as source of truth**. Snapshot it.
- Build Django models to **match the live schema**, not the current SQLAlchemy models. Reconcile the drift explicitly (decide per item: fix now vs faithfully copy).
- Reproduce DB machinery deliberately: `search_vector` trigger, `uq_external_id_provider_media_type` + partials, `ck_*` CHECKs, HNSW vector indexes, `vector`/`pg_trgm` extensions, per-connection `similarity_threshold`.
- Map `media_items` + subtype tables to multi-table inheritance with FK cascade semantics preserved.
- Add a **migrate-check analog for Django** (empty DB → migrate → smoke test), wired into CI.

## 6. API contract freeze — step 0, regardless of sequencing

- Export `openapi.json` from the current app → a frozen **contract artifact** (263 routes).
- DRF must reproduce it. Build a **parity harness**: run Django against recorded request/response samples (or diff generated OpenAPI), feature-area by feature-area.
- Decide **auth parity first** (JWT bearer + refresh cookie + 2FA + OAuth matrix) — it's cross-cutting and everything depends on it.

## 7. Sequencing options

### A. Big-bang rewrite
Port the whole backend to Django/DRF offline against a snapshotted schema, reach parity via the harness, then **one cutover** (DNS / deploy swap).
- *Pros*: cleanest mental model; no long-lived dual codebase; shortest total path to "completely Django."
- *Cons*: long stretch with no working increment; prod can't be iterated on FastAPI while you port (or it forks); highest data-fidelity risk at the end; auth/SSE/search subtleties all land at once.

### B. Strangler, plugins-first (recommended)
1. Stand up a **new Django project** next to FastAPI (same domain, routing split by prefix), migrations from the live-DB snapshot.
2. Build the **plugin framework as Django apps first** — it's greenfield, least coupled, and is the actual motivation. Plugins are born in Django, not ported.
3. Absorb FastAPI route areas **one at a time** behind the frozen `/api/v1` URLs (start with auth or the media core). Clients never change.
4. Retire FastAPI when Django owns everything.
- *Pros*: never breaks clients; derisks schema + auth early; plugin value arrives early; matches "plugins born in Django."
- *Cons*: two codebases during the transition; they drift if the migration stalls → needs the parity harness + discipline to finish area-by-area.

### C. Scoped "brain v2" (partial Django) — for completeness
Move only the **media / matching / search / integrations** core (the self-host brain) to Django + plugins, leaving the social/admin periphery (user social graph, workout, admin) on FastAPI or for later. Not what "completely" said; listed because it is the version that sizes sanely against the plugin goal.

## 8. Effort reality check (order of magnitude, solo)

- Models + migrations from reconciled schema, incl. DB machinery: ~1–2 wks.
- Auth parity (JWT cookie rotation + 2FA + 5 OAuth providers + rate limits): ~2–4 wks — subtle.
- DRF re-implementation by area (media 53, user 49, auth 45, integrations 24, list 18, …): weeks each; total is the bulk.
- Celery + embeddings/ONNX + SSE: ~2–4 wks.
- Plugin framework (Django apps): ~2–4 wks.
- Parity/golden tests, ongoing.

**Bottom line: several focused months for full parity solo; the same total for big-bang but back-loaded (no working increments until cutover).** This is a workstream of its own and should be sequenced against the product work, not bolted onto the plugin migration.

## 9. Open decisions to settle before greenlight

1. **otix.app hosted prod** — assume it stays live on FastAPI during the migration → points to strangler (B). Confirm.
2. **Full platform vs core-first** — you said "completely"; confirm the social/admin/workout periphery is in scope (it roughly doubles the route surface vs. the media core).
3. **Plugin marketplace / untrusted code** — determines isolation depth (§4).
4. **Desktop device-bound plugins** — become native companion features vs. stay a small local runtime.
5. **API contract stability** — treat `/api/v1` as frozen forever (v1), so a Django rewrite is invisible to clients.

## 10. Recommended step-0 actions (cheap, reversible, decide-with-facts)

These don't commit to the rewrite; they produce the artifacts the decision needs:

1. **Freeze the contract**: export the current `openapi.json` → inventory artifact of all 263 routes (method + path + shape), grouped by area.
2. **Data snapshot + reconcile**: dump live-DB schema → diff vs. SQLAlchemy models → list of (a) drift items and (b) DB machinery to reproduce in Django. Confirm which drift to fix vs copy.
3. **Django skeleton + parity spike**: stand up a minimal Django project with ASGI + DRF, serve one representative area (e.g. a small slice of media/search) against the frozen contract, and prove the parity harness (recorded request/response diff) works. This validates the approach end-to-end with ~a week of effort.

After 1–3 you can choose A/B/C with the real scope, schema, and parity story in hand.
