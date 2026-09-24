# Backend Production Readiness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Structural cleanup of the backend: standardize router convention, consolidate config, organize tests, add CI.

**Architecture:** Extract route handler logic from `__init__.py` files into `router.py` files (one per route directory), keeping `__init__.py` as a one-line re-export. Consolidate to a single root `.env`. Reorganize tests into `unit/` and `integration/` directories mirroring source layout. Add GitHub Actions CI.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy, Celery, pytest, ruff, mypy, Docker Compose

## Global Constraints

- `__init__.py` = imports/exports only (one-line `from .router import router`)
- `router.py` = all route handler logic
- No API route path changes, no signature changes
- Root `.env` only (delete `backend/.env`)
- No logic changes in services, domain, schemas, providers, or tasks

---

### Task 1: Move stray files and fix .gitignore

**Files:**
- Move: `backend/epic_matches.json` → `backend/data/epic_matches.json`
- Move: `backend/backfill.py` → `backend/scripts/backfill.py`
- Move: `backend/bf.py` → `backend/scripts/bf.py`
- Move: `backend/run_seed_test.py` → `backend/tests/run_seed_test.py`
- Move: `backend/test_search.py` → `backend/tests/test_search.py`
- Modify: `.gitignore:12` (add `celerybeat-schedule`)

- [ ] **Step 1: Create target directories and move files**

```bash
cd backend
mkdir -p data scripts
mv epic_matches.json data/
mv backfill.py scripts/
mv bf.py scripts/
mv run_seed_test.py tests/
mv test_search.py tests/
```

- [ ] **Step 2: Add celerybeat-schedule to .gitignore**

Edit `.gitignore`, add after line 12:
```
celerybeat-schedule
```

- [ ] **Step 3: Verify moves**

```bash
git status
```
Expected: 5 moved files, 1 modified `.gitignore`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: move stray files, add celerybeat-schedule to gitignore"
```

---

### Task 2: Rename `api/_utils.py` → `api/deps.py` and `api/media/_utils.py` → `api/media/embedding.py`

**Files:**
- Rename: `backend/otix/api/_utils.py` → `backend/otix/api/deps.py`
- Rename: `backend/otix/api/media/_utils.py` → `backend/otix/api/media/embedding.py`
- Modify: all files importing from these modules

**Interfaces:**
- Produces: `otix.api.deps` with `get_db`, `get_current_user`, `get_current_admin_user`, `get_trusted_or_admin_user`, `get_optional_user`, `resolve_country_code`
- Produces: `otix.api.media.embedding` with `_embed_query`, `_cache_key`, `_embedding_cache_key`, `SEARCH_CACHE_TTL`, `EMBEDDING_CACHE_TTL`

- [ ] **Step 1: Find all imports of `_utils` and `media._utils`**

```bash
cd backend
grep -r "from otix.api._utils import" otix/ --include="*.py" -l
grep -r "from otix.api.media._utils import" otix/ --include="*.py" -l
grep -r "from otix.api._utils import" tests/ --include="*.py" -l
```

- [ ] **Step 2: Rename files**

```bash
cd backend
mv otix/api/_utils.py otix/api/deps.py
mv otix/api/media/_utils.py otix/api/media/embedding.py
```

- [ ] **Step 3: Update all import statements**

In every file found in Step 1, replace:
- `from otix.api._utils import` → `from otix.api.deps import`
- `from otix.api.media._utils import` → `from otix.api.media.embedding import`

Also update `entrypoints/api/main.py` line 57: `from otix.api.media._utils import _embed_query` → `from otix.api.media.embedding import _embed_query`

- [ ] **Step 4: Verify imports resolve**

```bash
cd backend
python -c "from otix.api.deps import get_db, get_current_user; print('deps OK')"
python -c "from otix.api.media.embedding import _embed_query; print('embedding OK')"
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: rename _utils.py to deps.py and embedding.py"
```

---

### Task 3: Extract router.py from `auth/` and `admin/` `__init__.py` files

**Files:** Create ~25 `router.py` files, modify ~25 `__init__.py` files under `backend/otix/api/auth/` and `backend/otix/api/admin/`

**Pattern for every route directory:**

Before (`__init__.py`):
```python
from fastapi import APIRouter
router = APIRouter()

@router.get("/something")
async def handler(): ...
```

After:

New file `router.py`:
```python
from fastapi import APIRouter
router = APIRouter()

@router.get("/something")
async def handler(): ...
```

`__init__.py` becomes:
```python
from .router import router
```

**Directories to convert:**

`admin/`: `deleted_tmdb_ids/`, `edit_proposals/`, `hydration/`, `metrics/`, `stats/`, plus `admin/` itself

`auth/`: `forgot_password/`, `login/`, `logout/`, `register/`, `refresh/`, `reset_password/`, `verify_email/`, `sessions/`, `two_factor/`, `two_factor/disable/`, `two_factor/enable/`, `two_factor/login_verify/`, `two_factor/setup/`, `me/`, `me/integrations/`, `me/preferences/`, `oauth/`, `oauth/google/`, `oauth/google/callback/`, `oauth/google/disconnect/`, `oauth/plex/`, `oauth/plex/callback/`, `oauth/plex/disconnect/`, `oauth/spotify/`, `oauth/spotify/callback/`, `oauth/spotify/disconnect/`, `oauth/steam/`, `oauth/steam/callback/`, `oauth/steam/disconnect/`, `oauth/steam/login/`, `oauth/steam/login/callback/`, `oauth/tmdb/`, `oauth/tmdb/callback/`, `oauth/tmdb/disconnect/`, `oauth/tmdb/redirect/`, `google/`, `google/login/`, `google/login/callback/`, `plex/`, `plex/login/`, `plex/login/callback/`, `spotify/`, `spotify/login/`, `spotify/login/callback/`, `tmdb/`, `tmdb/login/`, `tmdb/login/callback/`

- [ ] **Step 1: Convert `admin/` subtree** — for each `__init__.py` in `admin/` that has >3 lines: move contents to new `router.py`, replace `__init__.py` with `from .router import router`

- [ ] **Step 2: Convert `auth/` level** — move `auth/__init__.py` router logic to `auth/router.py`, keep `__init__.py` as re-export

- [ ] **Step 3: Convert `auth/` leaf routes** — `login/`, `logout/`, `register/`, `refresh/`, `forgot_password/`, `reset_password/`, `verify_email/` — each gets a `router.py`

- [ ] **Step 4: Convert `auth/sessions/`** — move list.py, revoke.py, revoke_all.py logic into `sessions/router.py`; delete the separate files

- [ ] **Step 5: Convert `auth/two_factor/`** subtree — `enable/`, `disable/`, `setup/`, `login_verify/`

- [ ] **Step 6: Convert `auth/me/`** and subdirectories — `integrations/`, `preferences/`

- [ ] **Step 7: Convert `auth/oauth/`** and all 5 provider subtrees (google, plex, spotify, steam, tmdb)

- [ ] **Step 8: Convert `auth/google/`**, `auth/plex/`, `auth/spotify/`, `auth/tmdb/` login trees

- [ ] **Step 9: Verify all imports and the app starts**

```bash
cd backend
python -c "from otix.api.router import api_router; print(len(api_router.routes))"
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: extract router.py from auth/ and admin/ __init__.py files"
```

---

### Task 4: Extract router.py from `discover/`, `media/`, `integrations/` `__init__.py` files

**Files:** Create ~30 `router.py` files, modify ~30 `__init__.py` files

**Directories:** `discover/` (hero, media_type/list_type, sections, trailers, free_games), `media/` (interaction, episode_interaction tree, review, review_vote), `integrations/` (plex subtree, spotify subtree, steam subtree, tmdb subtree, youtube subtree, saves)

- [ ] **Step 1: Convert `discover/`** — `router.py` stays; extract `free_games/__init__.py`, `hero/router.py` (already correct), `media_type/list_type/router.py` (already correct), `sections/router.py` (correct), `trailers/router.py` (correct). Main work: `free_games/__init__.py` → `free_games/router.py`.

- [ ] **Step 2: Convert `media/`** — `interaction/`, `episode_interaction/` tree, `review/`, `review_vote/`. Check which already have `router.py` vs `__init__.py` logic.

- [ ] **Step 3: Convert `integrations/`** — `plex/` subtree (connect_info, servers, libraries, sessions, stream, sync, album_tracks, webhook, watchlist/sync), `spotify/` subtree (playlists, sync, recently_played/sync), `steam/` subtree (owned_appids, scan, resolve_unmatched, wishlist/scan), `tmdb/` subtree (rating_sync, watchlist_import), `youtube/` subtree (sync), plus `saves.py` (already a named file)

- [ ] **Step 4: Verify imports**

```bash
cd backend
python -c "from otix.api.router import api_router; print(len(api_router.routes))"
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: extract router.py from discover/ media/ integrations/ __init__.py"
```

---

### Task 5: Extract router.py from remaining API modules

**Files:** Create ~30 `router.py` files, modify ~30 `__init__.py` files

**Directories:** `user/` subtree, `library/` subtree, `list/` subtree, `people/` subtree, `company/` subtree, `workout/` subtree, `blueprint/`, `proposals/`, `push/`, `track/`, `upload/`, `rate_limit/`

- [ ] **Step 1: Convert `user/`** — detail, activity, badges, stats, follow, friend, friend_feed, karma, mood, notification, continue_watching, daily_activity, meta, metrics, rating

- [ ] **Step 2: Convert `library/`** — plex, spotify, steam, youtube, tab, local_games

- [ ] **Step 3: Convert `list/`** — detail, item, collaborators, like, history, export, plus the `list/__init__.py` itself

- [ ] **Step 4: Convert `people/`** — detail, follow, rating, related

- [ ] **Step 5: Convert `company/`** — detail, follow, rating

- [ ] **Step 6: Convert `workout/`** — detail, today, exercises, heatmap

- [ ] **Step 7: Convert remaining flat modules** — `blueprint/__init__.py`, `proposals/router.py` (check), `push/__init__.py`, `track/__init__.py`, `track/rating/__init__.py`, `upload/__init__.py`, `rate_limit/__init__.py`

- [ ] **Step 8: Verify full app startup**

```bash
cd backend
python -c "from otix.api.router import api_router; print(f'{len(api_router.routes)} routes')"
python -c "from entrypoints.api.main import app; print(f'App created: {app.title}')"
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: extract router.py from remaining api __init__.py files"
```

---

### Task 6: Add API versioning and clean main router

**Files:**
- Modify: `backend/entrypoints/api/main.py:116`
- Modify: `backend/otix/api/router.py:1`

- [ ] **Step 1: Remove TODO from api/router.py**

Delete line 1 (`# TODO: Review this file`) from `backend/otix/api/router.py`.

- [ ] **Step 2: Add v1 prefix to API routes**

In `backend/entrypoints/api/main.py` line 116, change:
```python
app.include_router(api_router, prefix="/api")
```
to:
```python
app.include_router(api_router, prefix="/api/v1")
```

- [ ] **Step 3: Verify health endpoints still work at root**

```bash
cd backend
python -c "
from entrypoints.api.main import app
# Health routes should be at root, not under /api/v1
routes = [(r.path, r.methods) for r in app.routes if hasattr(r, 'path')]
health_routes = [r for r in routes if 'health' in r[0]]
print(health_routes)
"
```
Expected: `[('/health', ...), ('/healthz', ...)]` — not under `/api/v1`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add /api/v1 versioning, remove TODO from router"
```

---

### Task 7: Consolidate to root .env

**Files:**
- Modify: `.env` (merge CORS values from `backend/.env`)
- Delete: `backend/.env`
- Modify: `docker-compose.yml` (all `env_file` paths)
- Modify: `.env.example:2` (comment)

- [ ] **Step 1: Update root .env with backend's CORS values**

Root `.env` has:
```
FRONTEND_BASE_URL=http://127.0.0.1:5173
CORS_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
```

`backend/.env` has the more complete:
```
FRONTEND_BASE_URL=http://127.0.0.1:5174
CORS_ALLOWED_ORIGINS=http://127.0.0.1:5174,http://localhost:5174,http://localhost:5173
```

Merge into root: keep backend's CORS values (5174 is the desktop dev port). Also add `CELERY_BROKER_URL=redis://redis:6379/0` from root's version.

- [ ] **Step 2: Delete backend/.env**

```bash
rm backend/.env
```

- [ ] **Step 3: Update docker-compose.yml env_file references**

In `docker-compose.yml`, change all occurrences of:
```yaml
env_file: ./backend/.env
```
to:
```yaml
env_file: ./.env
```

Services: api, worker-ingest, worker-enrich, worker-reactive, worker-maintain, worker-embedding, beat.

- [ ] **Step 4: Update .env.example comment**

Change line 2 from "Copy to backend/.env and fill in real values." to "Copy to .env and fill in real values."

- [ ] **Step 5: Verify Docker Compose config is valid**

```bash
docker compose config --quiet
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: consolidate to single root .env"
```

---

### Task 8: Docker Compose hygiene

**Files:**
- Modify: `docker-compose.yml` (api command, pgbouncer auth)

- [ ] **Step 1: Remove inline pip install from api command**

In `docker-compose.yml`, api service `command` line, change:
```yaml
command: bash -c "pip install pywebpush && bash entrypoints/start-api.sh"
```
to:
```yaml
command: bash entrypoints/start-api.sh
```

`pywebpush` is already in `pyproject.toml` dependencies.

- [ ] **Step 2: Simplify pgbouncer auth type**

In `docker-compose.yml`, pgbouncer service, change:
```yaml
AUTH_TYPE: scram-sha-256
```
to:
```yaml
AUTH_TYPE: md5
```

- [ ] **Step 3: Verify**

```bash
docker compose config --quiet
```

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: remove inline pip install, simplify pgbouncer auth"
```

---

### Task 9: Reorganize test structure

**Files:**
- Create: `backend/tests/unit/`, `backend/tests/integration/` directories
- Move: all `test_*.py` files from `backend/tests/` into `backend/tests/unit/` subdirectories
- Modify: `backend/pyproject.toml` (testpaths)

- [ ] **Step 1: Create directory structure**

```bash
cd backend/tests
mkdir -p unit/api unit/services unit/lib unit/domain
mkdir -p integration
```

- [ ] **Step 2: Move test files to unit/**

Move files by matching test names to source structure:
```bash
# Services tests → unit/services/
mv test_auth_service.py unit/services/
mv test_admin_edit_service.py unit/services/
mv test_email_service.py unit/services/
mv test_follow_service.py unit/services/
mv test_friend_service.py unit/services/
mv test_karma_service.py unit/services/
mv test_list_service.py unit/services/
mv test_media_service.py unit/services/
mv test_notification_service.py unit/services/
mv test_people_service.py unit/services/
mv test_push_service.py unit/services/
mv test_review_service.py unit/services/
mv test_session_service.py unit/services/
mv test_workout_service.py unit/services/
mv test_collection_matcher.py unit/services/
mv test_game_matcher_quality.py unit/services/
mv test_match_confirmation.py unit/services/
mv test_match_stream.py unit/services/
mv test_google_auth_service.py unit/services/
mv test_plex_auth_service.py unit/services/
mv test_steam_auth_service.py unit/services/
mv test_tmdb_auth_service.py unit/services/

# Lib tests → unit/lib/
mv test_lib/* unit/lib/  # test_sse.py etc.
mv test_lib_helpers.py unit/lib/
mv test_levels.py unit/lib/
mv test_youtube_title_parser.py unit/lib/

# API tests → unit/api/
mv test_admin_edit_api.py unit/api/
mv test_discover.py unit/api/
mv test_google_auth_api.py unit/api/
mv test_search_api.py unit/api/
mv test_search_suggestions.py unit/api/
mv test_metrics_and_auth_rate_limit.py unit/api/

# Integration tests (require DB)
mv test_badge_claiming.py integration/
mv test_catalog_seed.py integration/
mv test_fanart.py integration/
mv test_igdb.py integration/
mv test_igdb_franchise.py integration/
mv test_mood_checkins.py integration/
mv test_musicbrainz_sync.py integration/
mv test_musicbrainz_transformer.py integration/
mv test_omdb.py integration/
mv test_people_hydration.py integration/
mv test_plex_sync_service.py integration/
mv test_saves_locations.py integration/
mv test_spotify_seed_album.py integration/
mv test_steam.py integration/
mv test_steamgrid_hydrator.py integration/
mv test_sync_pipeline.py integration/
mv test_sync_tasks.py integration/
mv test_tmdb_client.py integration/
mv test_tmdb_hydrator.py integration/
mv test_tmdb_seed.py integration/
mv test_tmdb_transformer.py integration/
mv run_seed_test.py integration/
mv test_search.py integration/  # already had test_search.py from Task 1
```

- [ ] **Step 3: Create unit and integration __init__.py and conftest**

```bash
touch tests/unit/__init__.py
touch tests/integration/__init__.py
# Copy existing conftest.py to both, adapt for integration (docker fixtures)
cp tests/conftest.py tests/unit/conftest.py
cp tests/conftest.py tests/integration/conftest.py
```

- [ ] **Step 4: Update pyproject.toml testpaths**

Change:
```toml
testpaths = ["tests"]
```
to:
```toml
testpaths = ["tests/unit", "tests/integration"]
```

- [ ] **Step 5: Verify tests still discoverable**

```bash
cd backend
python -m pytest --collect-only -q 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: reorganize tests into unit/ and integration/"
```

---

### Task 10: Add GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create workflows directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Write CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend

    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_DB: otix_test
          POSTGRES_USER: otix
          POSTGRES_PASSWORD: password
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U otix -d otix_test"
          --health-interval 2s
          --health-timeout 5s
          --health-retries 10

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 2s
          --health-timeout 5s
          --health-retries 10

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install dependencies
        run: pip install .[dev]

      - name: Format check (ruff)
        run: ruff format --check .

      - name: Lint (ruff)
        run: ruff check .

      - name: Type check (mypy)
        run: mypy otix/ --config-file pyproject.toml

      - name: Unit tests
        run: pytest tests/unit/ -v
        env:
          DATABASE_URL: postgresql+asyncpg://otix:password@localhost:5432/otix_test
          DATABASE_URL_SYNC: postgresql://otix:password@localhost:5432/otix_test
          REDIS_URL: redis://localhost:6379/1
          JWT_SECRET_KEY: ci-test-key-do-not-use-in-prod
          APP_ENV: test
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions backend workflow"
```

---

### Task 11: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run lint**

```bash
cd backend && ruff check otix/ && ruff format --check otix/
```

- [ ] **Step 2: Run unit tests**

```bash
cd backend && pytest tests/unit/ -v --ignore=tests/integration
```

- [ ] **Step 3: Verify app imports cleanly**

```bash
cd backend && python -c "from otix.api.router import api_router; from entrypoints.api.main import app; print(f'{len(api_router.routes)} routes, app={app.title}')"
```

- [ ] **Step 4: Verify graphify update**

```bash
graphify update backend/
```

- [ ] **Step 5: Final commit (if needed)**

```bash
git add -A
git status
```
