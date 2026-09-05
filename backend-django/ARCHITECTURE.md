# Otix Django backend — Architecture & Conventions

This document is the **contract** for every agent and developer working in
`backend-django/`. If a decision is not recorded here, keep the change small
and conventional and update this file. Do not invent a parallel structure.

## 1. Repo context

- This directory (`backend-django/`) is a greenfield **Django + DRF** rewrite
  of the Otix platform backend.
- The **FastAPI backend at `../backend` is LIVE** (hosted product + desktop
  companion depend on it). It must **not be touched** from this work. It stays
  running until a full cutover.
- All new Django work lives **only** under `backend-django/` until absorption;
  never edit `../backend` or add Django code elsewhere in the repo.
- Decision/design background: `../docs/superpowers/specs/2026-09-04-django-brain-rewrite-design.md`.

## 2. Canonical layout (and why)

```
backend-django/
  manage.py
  pyproject.toml            # uv project "otix"; ruff (line-length 100, py312)
  README.md
  ARCHITECTURE.md           # this file
  .env.example
  .gitignore
  config/                   # Django "project" package (machine config, not domain logic)
    __init__.py             # imports the Celery app so it loads on Django start
    settings/
      __init__.py           # defaults DJANGO_SETTINGS_MODULE to dev; never hardcodes prod
      base.py               # everything shared; env-driven knobs
      dev.py  test.py  prod.py
    urls.py                 # mounts /api/v1/<domain>/ + /api/v1/health
    asgi.py  wsgi.py  celery.py
  apps/
    __init__.py
    accounts/               # golden reference app — copy its shape for every new app
      models/  serializers/  views/  urls.py  apps.py  admin.py
      services/             # reserved: domain logic lives here
      tests/
      migrations/
  core/                     # plain Python package, NOT an installed app — shared code
    __init__.py  models.py  exceptions.py  pagination.py
  plugins/                  # server-side plugin framework (Django app + host core)
```

**Why each layer:**

- **`config/` is the project package.** It owns how Django is booted
  (settings, URL root, ASGI/WSGI, Celery) and nothing domain-specific. The
  Django admin is mounted here only because it is infrastructure, not a domain.
- **Settings are layered** (`base` + one module per environment) so every knob
  is declared once in `base.py` and environments only override intent
  (`DEBUG`, hosts, CORS, sqlite-for-tests). See §5.
- **`apps/<domain>/` is one Django app per business domain.** Django's app
  boundary (models + migrations + admin + app config) is the unit of reuse and
  isolation; this matches how plugins become apps later. The package prefix
  `apps.` makes grouping obvious and keeps bare `config`/`core` imports clean.
- **`core/` is deliberately *not* an app.** Cross-cutting helpers shared by
  every app (model mixins, pagination, exceptions) must not be installed apps —
  no migrations, no accidental registration. Import them as plain modules.
- **`plugins/` is the server-side plugin framework** that motivates this
  rewrite. It is registered as a Django app (``plugins.apps.PluginsConfig``)
  so host models/migrations/admin and its tests live with it, but the framework
  core stays plain Python (manifest/discovery/registry/dispatch) so plugins can
  import it without model baggage. Third-party plugin *folders* are discovered
  from a plugins root, not listed here.

### The app template (mirror this exactly for every app)

```
apps/<domain>/
  __init__.py
  apps.py                # AppConfig; name="apps.<domain>", label=<domain>
  admin.py               # register models for the Django admin
  urls.py                # app_name=<domain>; routes WITHOUT trailing slashes
  models/
    __init__.py          # re-export all models for "from apps.<domain>.models import X"
    <aggregate>.py       # one module per aggregate/concern
  serializers/
    __init__.py          # re-export
    <resource>.py
  views/
    __init__.py          # re-export
    <area>.py
  services/__init__.py   # domain/transactional logic (start empty; grow deliberately)
  tests/
    __init__.py
    test_<area>.py       # at least one smoke test per app
  migrations/
    __init__.py
```

## 3. Domain → app map (migration target)

The legacy FastAPI API is the source of truth for the eventual surface:
**~263 routes** under `/api/v1` and **~86 model tables**. A full inventory and
the reconciliation strategy live in
`../docs/superpowers/specs/2026-09-04-django-brain-rewrite-design.md`. Planned
apps (one per domain), not all implemented yet — do **not** create empty
installed apps; scaffold an app when its first real model/endpoint lands:

| App (package) | Domains it will absorb |
|---|---|
| `accounts` | users + auth (+ OAuth providers + TOTP 2FA + sessions). Already scaffolded. |
| `media` | catalog: media_items + subtypes, genres, franchises, watch_providers |
| `people` | people (cast/crew) + person follows |
| `company` | production companies + company follows |
| `lists` | user lists/collections |
| `social` | user graph: friends, follows, reviews/votes, notifications, badges, streaks, mood, karma |
| `library` | per-user library/installed state |
| `discover` | discovery surface |
| `search` | search (incl. pgvector/trigram) |
| `proposals` | match proposals / admin editing |
| `integrations` | plex/steam/tmdb/youtube sync + webhooks |
| `workout` | workouts + user_ratings |
| `track` | tracks / saved games uploads |
| `blueprint` | blueprints |
| `push` | push subscriptions |
| `upload` | file uploads |

Cross-cutting infrastructure (uploads static mount, SSE streaming, Celery
workers/beat, embeddings) is *machinery*, added as dedicated tasks — not as
"misc" apps.

## 4. Rules every app must follow

1. **One domain per app.** If it doesn't map to a row in §3, it doesn't get an
   app; ask before inventing one.
2. **Canonical sub-structure** from §2 — models/, serializers/, views/, urls.py,
   apps.py, admin.py, services/, tests/, migrations/. Package modules, with
   `__init__.py` re-exporting public names.
3. **URLs mounted under `/api/v1/<domain>/`** by adding one include to
   `config/urls.py`. Routes have **no trailing slash** (FastAPI parity;
   `APPEND_SLASH = False`). Use `path(...)`, not `re_path`, unless necessary.
4. **Inherit from `core` primitives**: models extend
   `core.models.TimestampedModel` (or `BaseModel`) to get
   `created_at`/`updated_at` for free; lists paginate via the default DRF
   pagination in `core.pagination`.
5. **Reference the user by string**, never by import:
   `settings.AUTH_USER_MODEL` for FK/serializer `to_representation`, or
   `django.contrib.auth.get_user_model()` when you need the class.
6. **Default privacy.** The global DRF default is `IsAuthenticated`. Opt *out*
   deliberately per view (`AllowAny`) for public endpoints (register, login,
   health, some read paths later).
7. **Thin views.** Business/transactional logic moves to `services/` the moment
   it exceeds a serializer.save(). Services are plain callables over the
   models layer; keep them HTTP-agnostic.
8. **One smoke test per app** proving its public endpoints resolve against a
   real test database (see `apps/accounts/tests/test_auth_flow.py`).
9. **Type hints everywhere**; code must be **ruff-clean**
   (`ruff check .`, line-length 100, py312).
10. **Absolute imports only** (`from apps.media.models import ...`).
11. **No emojis**; no AI/boilerplate disclaimers; comments only where
    non-obvious.

## 5. Settings strategy

- `base.py` holds everything shared and reads knobs from the environment via
  `os.environ` plus a root `.env` loaded by `python-dotenv`. Environment
  variables take precedence (dotenv does not override existing vars).
- Key env knobs: `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS` (comma-separated),
  `DATABASE_URL`, `CORS_ALLOW_ALL_ORIGINS`, `CORS_ALLOWED_ORIGINS`,
  `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`.
- **Database.** The committed default and `.env.example` are Postgres
  (`psycopg[binary]`, engine `django.db.backends.postgresql`) — the platform
  runs Postgres + pgvector. `DATABASE_URL` may be overridden to sqlite for
  throwaway local runs (the validation steps do exactly this).
- **pgvector.** Vector support arrives via the `pgvector` PyPI package, whose
  `pgvector.django` module exposes `VectorField`, `HnswIndex`, etc. (There is
  **no** separate `django-pgvector` package on PyPI.) Media/search apps import
  `from pgvector.django import VectorField` when embeddings land.
- `dev.py`/`test.py`/`prod.py` import `*` from base and override intent.
  `test.py` forces in-memory sqlite so the suite runs anywhere.
- `manage.py` and `config/settings/__init__.py` default
  `DJANGO_SETTINGS_MODULE` to `config.settings.dev` when unset. `asgi.py`,
  `wsgi.py`, and `celery.py` default to `config.settings.prod` for deployment
  entry points.
- `SECRET_KEY`: dev falls back to an insecure placeholder; **prod refuses to
  boot** without an explicit `SECRET_KEY`.

### Running dev / tests

```bash
# dev (Postgres by default)
cp .env.example .env
.venv/bin/python manage.py migrate
.venv/bin/python manage.py runserver

# throwaway local db, no Postgres needed
DATABASE_URL=sqlite:///./dev.db .venv/bin/python manage.py migrate

# tests (in-memory sqlite, any environment)
DJANGO_SETTINGS_MODULE=config.settings.test .venv/bin/python manage.py test

# lint
ruff check .
```

## 6. Current state

**Live API surface** (the only thing exposing HTTP today):
- `POST /api/v1/auth/register` → 201 `{id, username, email}` (public).
- `GET /api/v1/auth/me` → current user profile (token auth required).
- `GET /api/v1/health` → `{"status": "ok"}` (public, no DB).
- DRF `TokenAuthentication` + the `authtoken` model as the **placeholder**
  auth layer. Tokens are issued by the future login/auth flow (DRF 3.18 no
  longer auto-creates tokens on user signup).

**Full model layer (schema) is ported and green across 14 apps.** Every app in
the §3 map now has real models, a `0001` migration, admin registrations, and a
round-trip smoke test — EXCEPT `discover` (endpoint-only, intentionally no
tables yet) and the later auth-machinery tables. Validated on sqlite:
`manage.py migrate` (fresh DB) applies cleanly, `manage.py check` reports 0
issues, the full suite runs **38 tests OK**, `ruff check .` is clean, and
`makemigrations --check` reports no drift. Vectors/embeddings remain deferred
(see §9). Key modeling decisions are logged in §10.

- `accounts.User` (see below).
- Hub: `media.MediaItem` + OneToOne-PK subtypes Movie/Show/Game/Album +
  Season/Episode + Track/TrackRating; assets/videos/releases; genres/keywords;
  franchises; platforms/game_modes; watch_providers; generic `media.ExternalID`.
- `people` (Person, PersonAsset, MediaCredit, follows, ratings),
  `company` (Company, InvolvedCompany, follows, ratings).
- `lists` (Collection + items, UserList + items/collaborators/likes/rank history),
  `social` (friend/follow requests + follows, Review + votes, media/episode
  interactions, MediaItemRating, Notification, badges/streaks/karma/mood),
  `proposals` (single-table Proposal + votes, MatchProposal, MediaEditProposal +
  image overrides, MatchSkip, TMDBDeletedID),
  `integrations` (SyncJob, ProviderState, plex servers/libraries/items, steam
  games/wishlist, youtube liked videos),
  `push` (PushSubscription),
  `library` (UserLocalGame), `track` (game save path suggestions/official
  paths), `search` (SearchLog), `workout` (Exercise/Workout/links + UserRating),
  `blueprint` (Blueprint + likes).

`User` profile columns: username login, optional unique email, display name,
avatar, staff/active/superuser flags, nullable unique external ids
(`google_id`, `plex_id`, `steam_id`, `tmdb_id`), `two_factor_enabled`,
timestamps.

## 6a. Real auth (2026-09-05)

Password/2FA/session auth is live under `/api/v1/auth/`; OAuth + preferences
reads remain (task #6). Shape mirrors the frozen FastAPI contract.

- **Auth chain** — `apps.accounts.authentication.JWTAuthentication` (Bearer
  15-min HS256 access JWT) is the default; DRF `TokenAuthentication` stays as a
  fallback for admin/older clients until the FastAPI cutover.
- **Tokens** (`services/tokens.py`) — PyJWT HS256 over `JWT_SECRET_KEY`
  (defaults to `SECRET_KEY`; env-overridable). Access `type="access"` 15 min;
  refresh `type="refresh"` + `jti`/`session_key` claims 7 d, delivered **only**
  as the httpOnly cookie `otix_refresh` (path `/api/v1/auth/`, samesite=lax);
  `type="2fa_challenge"` 5 min, stateless.
- **Session model** — `user_sessions`, `refresh_tokens`, `auth_action_tokens`
  tables (`models/security.py`, legacy db_table names). One session + refresh
  row per successful login. `services/sessions.py`:
  `refresh_session` rotates (revokes the used row, new jti + same session_key);
  presenting an already-revoked jti revokes *all* tokens (reuse detection);
  `logout` stamps `users.global_logout_marker` (no row revocation) so every
  earlier refresh fails — a global logout; `DELETE /sessions*` revokes
  `user_sessions` rows only, mirroring legacy's cosmetic session UI.
- **2FA** — `services/totp.py` pyotp base32 secret + ±1-step verify; setup
  stores the secret pre-enable, enable verifies a code, disable re-checks the
  password and clears. QR is inline SVG via the pure-Python `qrcode` package.
- **Recovery** — emailed single-use tokens store only a sha-256 hash
  (`services/action_tokens.py`, 24 h); new token of a purpose invalidates prior
  unused ones. Mail defaults to console in dev, locmem in tests.
- **Known divergence** — `/auth/register` returns the minimal identity
  (no auto-login tokens/cookie) and `GET/PATCH /auth/me` covers the slimmed
  `User` field set (no bio/background/preferences JSON yet); both land with the
  profile-column wave.

## 7. Known future work (do not get surprised)

- **OAuth auth** completing real auth: the password/2FA/session core shipped
  (§6a). Remaining are the provider login/link families
  (google/plex/steam/tmdb initiate+callback, `/auth/oauth/*`), each needing a
  live IdP, single-use Redis state, and per-provider token/profile columns,
  plus `/auth/me/preferences` + `/auth/me/integrations` reads.
- **SSE / realtime** over ASGI (`config.asgi` exists; streaming handlers land
  later). Desktop match streams depend on this.
- **Celery workers + beat** (`config.celery` is declarative only; tasks are
  per-app). Redis broker already configured.
- **pgvector embeddings** (`pgvector.django`): media_items/people/companies/user
  `Vector(384)` + HNSW cosine indexes; plus `search_vector` trigram machinery.
- **Plugin framework** under `plugins/` (2026-09-05, task #5) — **architecture
  (design doc §4 vs Nextcloud AppAPI):** the Django API and the plugin host are
  **separate processes**. The API *never imports plugin code*; it owns plugin
  *state* rows (`plugins.Plugin`: manifest snapshot, enabled, granted
  permissions, config/instances) + admin + `manage.py plugins_*` commands
  (`occ app:*` analogs: scan/enable/disable/uninstall/list). The **host** (a
  later increment) reads those rows and runs the code. `plugins/` keeps a
  plain-Python core that plugin code imports without Django baggage:
  `manifest.py` (YAML schema mirroring `desktop/plugins/types.ts`),
  `permissions.py` (capability tokens → grant math; `table:any`/`network:any`
  cover `table:*`/`network:*` scopes), `discovery.py` (root scan, per-folder
  error isolation, **manifest name must equal folder name** — Nextcloud's
  rule), `base.py` (`Plugin` base + `.`-namespaced data-method dispatch +
  JSON-safe output), `registry.py` (load-by-path entry modules, re-scan
  replaces). **Increment 1 DONE:** registry model (`plugins/models.py`,
  migration 0001) + registry service (`services.py`: register/enable/disable/
  unregister/scan — grant gating on enable: declared ⊆ granted) + admin +
  `management/commands/plugins_{scan,enable,disable,uninstall,list}` (DB-only
  lifecycle). **Increment 2 DONE (host):** `plugins/host.py` `PluginHost` — the
  separate process reads DB rows, loads each enabled plugin's entry module into
  a `PluginRegistry` (running enable/disable hooks), writes load failures back
  to the row's `error`, and `sync()` reconciles registry↔DB (unloads disabled,
  reloads version bumps) — plus `plugins/hostserver.py` `HostControlServer`
  (internal control API on 127.0.0.1 + `PLUGIN_HOST_SECRET` Bearer: `GET
  /health`, `GET /plugins`, `POST /plugins/{id}/reload`, `/plugins/reload-all`,
  `/plugins/{id}/call`) and `manage.py plugin_host` with a DB re-sync loop so
  enable/disable converge without restart. `PluginRegistry.unregister` added.
  Live-smoke verified (scan → enable → boot → control calls). **Increment 3
  DONE (API proxy):** `plugins/hostclient.py` (thin urllib client for the host
  control API; `HostUnreachableError` degrades gracefully) + DRF additive routes
  under `api/v1/plugins/` (`plugins/urls.py` + `views.py` + `serializers.py`,
  mounted in `config/urls.py`) mirroring the frontend PluginAPI contract:
  `GET/POST /plugins` (list + discover/scan), `GET/DELETE /plugins/<id>`,
  `POST /plugins/<id>/{enable|disable|reload}`, `GET/PUT /plugins/<id>/config`
  (flat config + instances), `POST /plugins/<id>/call` (data-method proxy to the
  host; 503 when the host is down), `GET /plugins/capabilities` (Nextcloud-style
  announcement: permission vocabulary + grantable wildcards + config field
  types + stages + host status), and `GET /plugins/<id>/describe` merged from
  the host. Auth = DRF default (JWT/Token, IsAuthenticated); these routes are
  additive (not in the frozen 263) so parity is unchanged. **Increments 1–3
  tests: 60 plugins-green** (suite 380). Settings: `PLUGINS_ROOT` env (default
  `<repo>/plugin-root`, gitignored) + `PLUGIN_HOST_BIND/PORT/SECRET`. **Next
  increments:** grant-gated framework services (table/network scope
  enforcement), reference Plex plugin, supervision/docs + Redis events.
  Conventions + status in `plugins/README.md`.
- **Parity harness** to diff DRF output against the frozen FastAPI OpenAPI
  contract (~263 routes) while porting feature-area by feature-area.

## 8. Running this foundation (verification)

All commands below pass on a fresh clone (uv sync already resolves deps):

```bash
uv sync
DATABASE_URL=sqlite:///./validate.db DJANGO_SETTINGS_MODULE=config.settings.dev .venv/bin/python manage.py migrate
DATABASE_URL=sqlite:///./validate.db DJANGO_SETTINGS_MODULE=config.settings.dev .venv/bin/python manage.py check
DJANGO_SETTINGS_MODULE=config.settings.test .venv/bin/python manage.py test
.venv/bin/ruff check .
```

## 9. Data-model notes (media/people/company hub)

The `media` / `people` / `company` apps are the catalog hub: every later domain
(library, lists, social, ...) FK's back to `media.MediaItem`. Built coherently
in one pass; models only (no urls/views/serializers yet — those arrive with the
endpoint-port wave).

- **Subtype pattern = OneToOne-PK, not multi-table inheritance.** `media_items`
  holds every shared column; `movies`/`shows`/`games`/`albums` hold only
  subtype columns and each carries
  `media_item = OneToOneField(MediaItem, primary_key=True, related_name=...)`,
  so the child PK *is* the media item id and `media_item.movie`/`.show` are
  native reverse accessors. `seasons`/`episodes` are standalone rows keyed to
  the `Show`/`Season` subtype.
- **ExternalID uses a GenericForeignKey, no descriptors.** One `external_ids`
  table serves every hub entity: `content_type` + `object_id` + `target` (GFK)
  replaces legacy string `entity_type`/`entity_id` polymorphism. No convenience
  descriptor columns (e.g. `steam_app_id`); targets attach rows via the GFK.
  Uniqueness is `(content_type, provider, external_id, media_type)` so TMDB
  movie/TV ids coexist.
- **Vectors deferred.** No `embedding`/`search_vector` columns, pgvector, HNSW,
  or trigram machinery anywhere in this wave. Legacy Postgres `JSONB`/`ARRAY`
  columns are `JSONField(default=list)`; the DB is sqlite-safe today. The
  matching/hash-confirmation columns on `external_ids`
  (`content_hash`, `hash_match_count`, `confirmed_count`, `last_confirmed_at`)
  are deferred to the matching/search wave. (`MatchSkip`/`TMDBDeletedID` were
  ported — see §10 proposals.)
- **db_table mapping = exact legacy snake_case.** Tables keep the legacy names
  (`media_items`, `movies`, `shows`, `seasons`, `episodes`, `games`, `albums`,
  `tracks`, `track_ratings`, `media_assets`, `media_videos`, `media_releases`,
  `external_ratings`, `genres`, `genre_media_types`, `keywords`,
  `media_genres`, `media_keywords`, `franchises`, `franchise_items`,
  `platforms`, `media_platforms`, `game_modes`, `media_game_modes`,
  `watch_providers`, `media_watch_providers`, `people`, `person_assets`,
  `media_credits`, `user_person_follows`, `person_ratings`, `companies`,
  `involved_companies`, `user_company_follows`, `company_ratings`). Legacy
  composite-PK join/follow/rating tables get a greenfield surrogate `id` plus a
  `UniqueConstraint` over the same key columns (Django has no natural composite
  PKs); legacy-named `CheckConstraint`/`UniqueConstraint` names are preserved.

## 10. Satellite model-layer decisions (lists/social/proposals/…)

Consolidated porting decisions from the parallel model-layer wave, so endpoint
agents can trust the schema without re-reading the legacy FastAPI domain code.

- **One row per §3 map app is now real** except `discover` (no tables). The
  satellite scaffolds were pre-created and registered in INSTALLED_APPS before
  models were filled, so no app depends on another satellite's migration
  ordering; each satellite FKs **only** `media` + `accounts.User`.
- **Composite-PK tables → surrogate auto `id` + `UniqueConstraint`.** Django has
  no natural composite PKs. Legacy composite-key rows (join/link tables and
  ratings/follows) get an integer `id` PK plus a named `UniqueConstraint` over
  the same natural-key columns. Legacy `name=` constraint names preserved
  verbatim where present; otherwise `uq_<table>_<cols>`.
- **`Follow`/`FollowRequest` are user→user only** (both FKs `users.id`). Person
  and company follow edges live in the already-ported `people.UserPersonFollow`
  / `company.UserCompanyFollow` — not duplicated in `social`.
- **`Proposal` is one concrete table** with a `proposal_type` discriminator
  (`match`/`edit`) + JSON `payload`, NOT multi-table inheritance: legacy shares
  one column set across all proposal types. Votes are `ProposalVote`.
  `MatchSkip`/`TMDBDeletedID` (matching bookkeeping) live here in
  `models/bookkeeping.py`.
- **OneToOne-PK where legacy PK == a FK**: `UserStreak` keys on
  `user_id` (`OneToOneField(primary_key=True)`, `user.streak`). Same idiom as
  media subtypes (§9).
- **Timestamps**: `TimestampedModel` only where legacy was a `TimestampMixin`
  (created+updated). Tables with only `created_at` (notifications, sync_jobs,
  likes, blueprint_likes) extend `BaseModel` and declare `created_at` manually.
- **sqlite index-name cap**: Django's `models.E034` limits index names to 30
  chars for sqlite. Constraints keep legacy names; *index* names were shortened
  to ≤30 where needed. Only affects local sqlite runs (Postgres is fine).
- **`migrate` takes one app label**; run `manage.py migrate` (no label) for the
  whole schema, or repeat per app. `manage.py test` (no labels) runs all apps.
- Real auth (JWT+cookie+2FA+OAuth), SSE/ASGI, Celery workers, pgvector
  embeddings, plugin framework, and the parity harness remain future work (§7).

## 11. API parity (wave #4) — status

- **Contract frozen at `contracts/frozen-routes.json`**: the 263 method+path
  routes introspected from the live FastAPI router graph (GET 119 / POST 95 /
  DELETE 33 / PUT 11 / PATCH 5). `contracts/README.md` documents regeneration
  and notes that full OpenAPI *schema* generation is currently broken upstream
  (pydantic `ForwardRef('User | None')` on `current_user` →
  `class-not-fully-defined`), so response-shape parity is read per area from
  `backend/otix/api/<area>/**` + `backend/otix/schemas/**` until that is fixed.
- **Coverage tool**: `scripts/parity_report.py` diffs the Django URLconf
  against the frozen contract at **METHOD+path granularity** (a template whose
  view lacks the frozen HTTP method is a *method-gap*, not silently counted).
  Current (2026-09-05, wave #4 COMPLETE): **208/263 ported, 0 method-gaps**,
  full suite **320 tests green**, `ruff check .` + `manage.py check` clean.
  Real-auth core shipped (2026-09-05): JWT access (15 min, Bearer) + rotating
  httpOnly refresh cookie (7 d, path-scoped to `/api/v1/auth/`), session +
  refresh-token + action-token tables, global logout, session list/revoke,
  TOTP 2FA (setup/enable/disable/challenge-login) and forgot/reset/verify-email
  (see §6a). Profile/preference columns + enriched `/auth/me` +
  `GET /auth/me/preferences` shipped (migration 0003; writable set = legacy
  `_UPDATABLE_FIELDS` allow-list, `date_of_birth`/`total_xp`/`is_bot` stay
  read-only). Remaining 55 are deliberately deferred to the platform /
  integrations wave (task #6): auth remainder(27 — OAuth provider link/login
  families + `/auth/me/integrations`, all
  IdP/Redis/state bound), integrations(18 incl Google-Drive
  cloud-save proxy), Google-Drive saves proxy(4), upload(1),
  discover(4 — Redis+personalization+IGDB bound, no tables),
  `/notifications/stream` SSE(1). Run
  `scripts/parity_report.py` for live numbers (it adds the repo root to
  `sys.path`, so it runs from any CWD).
- **Porting order guidance**: media hub reads first (highest traffic), then
  people/company, social, lists, proposals, integrations/push, search, workout,
  library/track/blueprint, admin. Each area agent mirrors the accounts golden
  app (serializers/views/urls), keeps DRF `IsAuthenticated` default unless the
  legacy route is public, and adds an endpoint smoke test.

## 12. Endpoint-port exemplar (wave #4) — READ THIS BEFORE PORTING AN AREA

Two legacy areas are already ported and are the **copy-this template** for every
remaining area:
- **`apps/company`** — `GET /company/{id}` (public, optional-user state) +
  `POST/DELETE …/follow` + `PUT/DELETE …/rating`. Follow/rating writes are
  **204 no-body**, idempotent; detail 404 body `{"detail":"Company not found"}`.
- **`apps/people`** (mounted at `/person/`) — `GET /person`, `/person/search`,
  `/person/{id}` + follow + rating. Person follow returns **200 + body** and
  rating writes are 204 — i.e. **status codes differ per area; read the legacy
  router for YOUR area and copy it**, don't assume company == person.

Conventions a porting agent must follow (mirror `apps/company`/`apps/people` +
`apps/accounts`):
- Add `serializers/`, `views/`, `services/`, `urls.py` inside your own app only;
  `config/urls.py` already mounts each domain under its legacy prefix (add the
  include if missing). Views are thin `APIView`/`GenericAPIView` subclasses;
  logic in `services/` as plain callables; serializers field-listed (never
  `__all__`). `path()` with no trailing slash; literal routes (e.g. `search`)
  must precede `<int:pk>` routes.
- Permissions: authed routes rely on the global `IsAuthenticated` default.
  Public routes set `(permissions.AllowAny,)`; legacy `get_optional_user` maps
  to AllowAny + `request.user.is_authenticated` → id or `None`, feeding
  `is_followed`/`user_rating` state keys.
- External ids: legacy `tmdb_id`/`igdb_id`/… descriptors have no model column;
  query `media.ExternalID` by content_type/object_id + provider (helper in the
  service). Follow/rating existence checks 404 with the legacy `detail` string.
- List/search: use the project `core.pagination.DefaultPagination` (DRF
  `{count,next,previous,results}` envelope). Legacy list envelopes that differ
  (cursor shapes) are NOT reproduced byte-for-byte yet — note the divergence.
  Search is `field__icontains` until pgvector lands.
- Score ranges are read from the legacy request schema (often 1–5) and may be
  stricter than the model CheckConstraint (1–10); keep the legacy API range.
- Ported areas may target different apps than legacy prefixes imply
  (`/person` → `people` app, `/list` → `lists` app). Area→app map — **wave #4 +
  real-auth core + profile/preferences COMPLETE (2026-09-05): parity 208/263,
  0 method-gaps, 320 tests green**:
  person(7)+company(5) done; auth(3: register/me/health) done; real-auth
  slice(14: login/refresh/logout/sessions/2fa/forgot/reset/verify) done;
  profile/preferences slice(1: GET /auth/me/preferences + enriched /auth/me)
  done — the remaining 27 auth routes (OAuth families + me/integrations)
  defer to the §7 integrations wave; list(18)→`lists`; push(3)→`push`;
  blueprints(7)→`blueprint`; search(8)→`search`; library GET(10)→`library`;
  workout(9)+exercises(2)→`workout`; proposals(8)+admin(6)→`proposals`;
  media(50)→`media`; social surface 19/20 (friends8+notifications4+reviews3+
  mood3+metric1; `/notifications/stream` SSE deliberately 404)→`social`;
  tracks(2)→`media` (music TrackRating); calendar(1)→`media`;
  saves(2 DB-backed locations/suggest)→`track`; users(32)→`accounts`+`social`
  (identity→accounts, engagement→social; single `/users` URL module imports
  both). **Deferred to platform wave (task #6):** auth remainder(27 — OAuth
  link/login families + `/auth/me/integrations`),
  integrations(18), Google-Drive saves proxy(4), upload(1),
  discover(4 — Redis+personalization+IGDB/embedding bound; no tables),
  `/notifications/stream`(1).
  Dispatch agents in PARALLEL only for areas in DIFFERENT apps (one agent owns
  one app dir) to avoid write collisions; each self-validates then `manage.py
  test` + `ruff check .` + the full suite are run by the coordinator.
