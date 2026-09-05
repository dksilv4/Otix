# Otix Django backend — Architecture & Conventions

This document is the **contract** for every agent and developer working in
`backend-django/`. If a decision is not recorded here, keep the change small
and conventional and update this file. Do not invent a parallel structure.

## 1. Repo context

- This directory (`backend-django/`) is a greenfield **Django + DRF** rewrite
  of the Otix platform backend.
- Since increment 31 the **local dev compose runs this Django backend**, not the
  FastAPI tree at `../backend` (which is retired from dev but **not touched/
  not deleted** — it stays for reference and a future data migration).
  ``../backend`` should not be edited from this work. The **production compose
  is NOT yet cut over**: `docker-compose.prod.yml` still builds `../backend`
  because its 4-worker/15-queue/embeddings topology maps to deferred task-#6
  machinery (cut that over with the production wave).
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
- **OAuth link — google + google-drive (increment 7, 2026-09-05)** —
  `apps/accounts/services/oauth.py` ports the link-only family (drive has no
  login). Authed `POST /auth/oauth/{google,google-drive}` return
  `{auth_url, state}` (PKCE S256; google = youtube-identity scopes, drive =
  `drive.file`); unauthed `POST …/callback` consumes single-use state → resolves
  the owning user → code-for-token exchange → (google) OIDC userinfo → writes
  the `google_*`/`drive_*` user columns; `DELETE …/disconnect` nulls them;
  `GET /auth/oauth/google/token` lazily refreshes, quietly unlinking + writing
  an `integration_disconnected` notification (social.Notification) on an
  external `invalid_grant`. Single-use state is DB-backed (`oauth_state`,
  migration 0004) not Redis — it is ephemeral + API-local, and a DB row needs no
  broker. Parity 208→215 (auth 27→20).
- **Plex OAuth link + login family (increment 8, 2026-09-05)** — same
  `oauth.py` service + DB-backed state (migration 0005 adds `plex_id`,
  `plex_username`, `plex_email`, `plex_thumb`, `plex_auth_token`,
  `plex_watch_history_enabled` user columns). Plex auth is public PIN auth (no
  client secret): the API `POST`s a PIN at `plex.tv/api/v2/pins?strong=true`,
  returns `{auth_url, state, pin_id}` where `auth_url` =
  `app.plex.tv/auth#?…` carrying `clientID`/`code`/`forwardUrl`/`context[device]`,
  and the *frontend* drives the one-shot PIN poll (no server retry loop). Authed
  `POST /auth/oauth/plex` → 400 when `plex_id` already set; unauthed
  `POST …/callback` consumes state (pin cross-check), resolves the owning user
  from state, polls the PIN for `authToken`, fetches `plex.tv/api/v2/user`,
  links; `DELETE …/disconnect` nulls the `plex_*` columns. Login family
  (`POST /auth/plex/initiate` + `/auth/plex/callback`, both unauthed) finds or
  creates the Otix account by `plex_id` (unique-ified username
  `re.sub(r"[^A-Za-z0-9_-]","",…)`, email `plex_<id>@user.otix` fallback,
  `is_verified=True`, avatar = plex thumb) and boots a real session
  (`begin_session` → `{access_token, token_type: bearer}` + `otix_refresh`
  cookie). Parity 215→220 (auth 20→15).
- **Google login family (increment 9, 2026-09-05)** — same PKCE machinery as
  the google link flow but unauthed: `POST /auth/google/initiate` returns
  ``{auth_url, state}`` (redirect_uri `…/auth/callback/google-login`, no
  ``user_id`` in the state); `POST /auth/google/callback` exchanges the code
  (that distinct redirect_uri), fetches the OIDC profile, and
  find-or-creates by ``google_id`` — username = stripped display name
  (`re.sub(r"[^A-Za-z0-9_-]","", name-or-part-before-@)` → `google_<id[:8]>`
  fallback), email `google_<id>@user.otix` fallback, `is_verified=True`,
  google_*/drive tokens written — then boots a real session. Errors byte-for-
  byte: 503 unconfigured, 400 expired state / bad exchange, 502
  invalid-response / profile / network, 403 deactivated, 500 catch-all.
  Parity 220→222 (auth 15→13). **Remaining OAuth:** tmdb link + login family,
  `GET /auth/oauth`, `GET /auth/me/integrations`.
- **Steam OpenID link + login families (increment 10, 2026-09-05)** — Steam's
  OpenID 2.0 `checkid_setup`/`check_authentication` dance, no client secret.
  `_request` gained a raw-body `data` param so the OpenID replay preserves the
  redirect's original key casing/order byte-for-byte (`raw_query` replayed with
  `openid.mode` forced to `check_authentication` and our `state` dropped). Link
  family (authed initiate `POST /auth/oauth/steam` → `{auth_url, state}`,
  `source` forwarded into `openid.return_to`; AllowAny `…/callback` resolves
  the owning user authed-first then from state, 401 when neither; `DELETE
  …/disconnect`). Login family (unauthed `POST /auth/steam/initiate` + `…/
  callback`) find-or-creates by `steam_id`: username = sanitized persona →
  `steam_user_<id>`/`steam_<id[:8]>` fallback, email `steam_<id>@user.otix`,
  `is_verified=True`, avatar = `avatarfull`; GetPlayerSummaries only fires when
  `STEAM_API_KEY` is set (unkeyed → fallback identity). Errors byte-for-byte:
  400 expired/wrong-flow state, 400 invalid mode / Steam-rejected / invalid
  claimed_id, 401 auth-required, 409 both directions of already-linked, 502
  unable-to-verify network, 403 deactivated. Steam views carry NO broad 500
  catch-all — legacy steam callbacks `raise` on everything else. Reuses the
  existing `steam_id` column (0001) — no migration. Parity 222→227 (auth 13→8).
- **TMDb connect + login families + the oauth aggregates (increment 11,
  2026-09-05)** — closes the /auth surface. TMDb is a request_token →
  session_id dance (not OAuth2): initiate GETs `token/new`, hands the user to
  TMDb `authenticate/{token}?redirect_to=…`, callback/session post swaps the
  approved token for a session. Flow state stored under BOTH the `state` key
  and a `tmdb_rt:{request_token}` key (TMDb mangles `state`) in the single-use
  `OAuthState` table — `_consume_tmdb_request_token` falls back by request
  token. Link family = authed `POST /auth/oauth/tmdb` initiate (redirect_url =
  the API's own `/auth/oauth/tmdb/redirect`), a **server-side 303 hop**
  `GET …/tmdb/redirect?approved&state&request_token` that links the state
  owner then bounces the browser to the frontend `?tmdb_link=success|error`
  (`HttpResponseRedirect(status=303)`), AllowAny `POST …/callback`
  (authed-first else state user), authed `DELETE …/disconnect`. Login family =
  unauthed `POST /auth/tmdb/initiate` (redirect_to = frontend
  `/auth/callback/tmdb-login`) + `POST /auth/tmdb/callback` (bare dict body,
  find-or-creates by `tmdb_account_id`). Errors byte-for-byte: 400 expired /
  invalid-session / token-mismatch / already-linked / no-account / 403
  deactivated / 409 both already-linked directions / 502 family. **Migration
  0006** replaces the placeholder `User.tmdb_id` CharField with the legacy set
  `tmdb_session_id`(unique)+`tmdb_account_id`(BigInt unique)+`tmdb_username`
  +`tmdb_avatar_hash`+`tmdb_rating_sync_direction` (default "disabled");
  admin fieldset updated. Aggregates: `GET /auth/oauth` returns the ordered
  five-provider list (steam/plex/tmdb/google/google_drive) with the FULL field
  set serialized on every row (nulls where unset) + tmdb avatar backfill +
  best-effort `tmdb_stats`/steam_profile (None when unkeyed); `GET
  /auth/me/integrations` returns the linked-identity columns. Parity 227→235
  (auth 8→0). **Remaining 28 = discover 4, integrations 18, notifications 1,
  saves 4, upload 1.**
- **Integrations read/library-state surface (increment 12, 2026-09-05)** —
  first slice of the integrations app (`apps/integrations/`), mounting the
  previously DB-only routes that need no sync machinery: `GET
  /integrations/plex/libraries` (the user's `UserPlexLibrary` rows joined to
  their server for the display name, each annotated with `item_count` = the
  scanned `UserPlexItem` count via `Count` subquery coalesced to 0 and
  `last_synced_at` = the newest item `updated_at` via a `[:1]` subquery,
  ordered `server__name, title`), `GET
  /integrations/plex/connect-info/{media_item_id}` (finds the user's
  `UserPlexItem` matched to the catalog media item → `{base_url, base_urls,
  token, rating_key, album_thumb_url}`, where `base_urls` = stored
  `server.base_url` plus best-effort alternative URLs fetched from
  `plex.tv/api/v2/resources` — token as a URL query param + client
  `X-Plex-Client-Identifier` headers, legacy `_get_json` behaviour; any failure
  → `[]` so the stored URL is the fallback; 404 detail strings
  byte-for-byte "Media item not found in your Plex library" / "Plex server not
  found") and `GET /integrations/steam/owned-appids` (the user's
  `UserSteamGame.steam_app_id` set, for the Steam plugin's free-to-keep
  cross-reference). Layout follows the small-app exemplar: `services/plex.py`
  holds the read logic + a local urllib `_request` leaf; `views/{plex,steam}.py`
  are thin; `urls.py` mounted at `/api/v1/integrations/`; path converter
  `<int:media_item_id>` (parity tool normalizes). No new infra — sync, live
  sessions, webhook and SSE routes still await the platform wave. Parity
  235→238. **Remaining 25 = discover 4, integrations 15, notifications 1, saves
  4, upload 1.**
- **Plex album-tracks (increment 13, 2026-09-05)** — `GET
  /integrations/plex/album-tracks/{media_item_id}` closes the first live
  (outbound-to-server) playback route: same DB lookup as connect-info (404
  details byte-for-byte), then fetches the user's album track list from the
  Plex server via the new `_plex_server_get` helper (tries the stored
  `server.base_url` then the plex.tv-discovered alt URLs, 8s timeout, first
  200 wins) on `/library/metadata/{rating_key}/children`; every connection
  failing → 502 "Could not fetch Plex album tracks". Children parsed with
  `_container_items` (`MediaContainer.Metadata`/`Directory` fallback) into
  `{tracks: [{rating_key, title, artist = grandparentTitle||originalTitle,
  track_number = index, disc_number = parentIndex, duration_ms = duration}],
  base_url, token, rating_key, album_thumb_url}` (thumb only when a working
  base URL + token + rating key). Also extracted a shared `_with_token(url,
  token)` helper (X-Plex-Token query-param embedding used by both plex.tv
  discovery and direct server GETs). Parity 238→239. **Remaining 24 = discover
  4, integrations 14, notifications 1, saves 4, upload 1.**
- **Plex live sessions (increment 14, 2026-09-05)** — `GET
  /integrations/plex/sessions` returns active playback across the user's
  selected `UserPlexServer` rows: 400 "No Plex account linked" without
  `plex_auth_token`, else per server with a stored `base_url` +
  `access_token` GET `{base_url}/status/sessions` (token as X-Plex-Token query,
  30s timeout); non-200/exceptions skip the server. `MediaContainer.Metadata`
  filtered to `movie`/`episode`/`track`, mapped to the full 30-field session
  shape (`session_id` from `Session.id`, state from `Player`, relative thumb
  URLs absolutized against the serving server + token, int fields coerced via
  `_to_int`, `throttled` = `TranscodeSession.throttled == "1"`,
  `video/audio_decision` default "direct play"); non-listed media types (e.g.
  photo) are dropped. Response `{sessions: [...]}`. Legacy router's
  401-unlink/410/502 branches are effectively dead (per-server errors are
  swallowed inside the service), so no unlink logic is ported. Parity 239→240.
  **Remaining 23 = discover 4, integrations 13, notifications 1, saves 4,
  upload 1.**
- **Plex webhook (increment 15, 2026-09-05)** — `POST /integrations/plex/webhook`
  is the inbound, unauthenticated (AllowAny) Plex outbound-notification
  endpoint; authenticity is entirely the HMAC-SHA256 `X-Plex-Signature` header
  over the RAW request body signed with `PLEX_WEBHOOK_SECRET` (new setting,
  env `PLEX_WEBHOOK_SECRET`, empty → endpoint rejects). Guards byte-for-byte:
  403 "Webhook not configured" when secret unset, 401 "Missing signature",
  401 "Invalid signature" (`hmac.compare_digest` of `sha256=<hex>`). Reads
  `request.body` raw first (so form/JSON parsing can follow), then parses the
  payload by content-type: `multipart/form-data` → the `payload` form field
  (JSON string) or `application/json` → the raw JSON body; parse failures →
  `None`. Answers `{"status": "accepted", "event": payload.get("event") if
  dict else None}`. Legacy's fire-and-forget celery rescan dispatch
  (`maintenance.sync_plex_accounts`) is deliberately NOT called yet — the sync
  machinery is the platform wave; the handler is the seam it will hang off.
  Parity 240→241. **Remaining 22 = discover 4, integrations 12, notifications
  1, saves 4, upload 1.**
- **Plex servers discovery (increment 16, 2026-09-05)** — `GET
  /integrations/plex/servers` live-disovers the user's Plex servers + libraries
  from plex.tv and persists them (`UserPlexServer`/`UserPlexLibrary` upsert by
  `machine_identifier`/`section_key`). Service layer `discover_plex_servers`
  requires `plex_auth_token` (else 400 "User has no linked Plex account");
  GETs `plex.tv/api/v2/resources?includeHttps=1&includeRelay=1` (token as URL
  query + client headers), keeps resources whose `provides` contains `server`,
  picks `_best_connection` (local https → https → any), merges DB-only servers
  still carrying a `base_url`, then `discover_plex_libraries` GETs each
  server's `/library/sections` for movie/show/artist sections. Typed error
  taxonomy (legacy router byte-for-byte): plex.tv 401 → quietly unlink the
  user's Plex link (`_PLEX_DISCONNECT_COLUMNS`, legacy `unlink_plex_quietly`;
  notifications dispatch deferred) + **410** "Plex account was disconnected
  because access was revoked externally...", other plex.tv HTTP → **502**,
  timeout → **504**, connect failure → **502**; a failing `/library/sections`
  call only marks that server `unreachable_servers:[names]` (never 500s the
  whole response). Response `{servers, libraries, unreachable_servers}` with
  the full `PlexServerResponse`/`PlexLibraryResponse` field set (id,
  machine_identifier, name, product/platform/base_url/owned/selected; server_id,
  section_key, title, library_type, selected); `unreachable_servers` null when
  empty. Outbound leaf `_plex_discovery_get` maps urllib `TimeoutError` /
  `URLError(reason TimeoutError)` → 504 and other `URLError`/`OSError` → 502
  over the token-embedded URL (as legacy echoed `request.url`). Tests patch the
  `_request` leaf (11 new). Parity 241→242. **Remaining 21 = discover 4,
  integrations 11, notifications 1, saves 4, upload 1.**
- **Plex stream URL (increment 17, 2026-09-05)** — `GET
  /integrations/plex/stream/{rating_key}` 302-redirects to a signed
  browser-streamable Plex media URL (the player's direct-stream link). Optional
  `?base_url=` fast path (first stored server `access_token`, else the user's
  `plex_auth_token`) mirrors legacy `_resolve_stream_url_for_server_with_base`
  — single explicit-base GET, any failure → fall through. Main path
  `get_plex_stream_url` prefers the server behind the user's synced
  `UserPlexItem` for the rating key, then every stored server, via the existing
  `_plex_server_get` base-url/alt fallback. Shared `_signed_stream_url` helper
  pulls the first `Media.Part.key` and appends `?X-Plex-Token=<token>`.
  Unresolvable → 404 `{"detail": "Stream URL not available"}` (byte-for-byte).
  Tests patch the `_request`/`_plex_server_get` seams (6 new). Parity 242→243.
  **Remaining 20 = discover 4, integrations 10, notifications 1, saves 4,
  upload 1.**
- **Google-Drive cloud-save proxy (increment 18, 2026-09-05)** — the four
  `/saves` cloud routes, completing the legacy `saves.py` router
  (DB-backed locations were already ported to `apps/track`):
  `GET /saves/{game_id}/files`, `POST /saves/{game_id}/upload`,
  `GET /saves/{game_id}/download/{file_id}`,
  `DELETE /saves/{game_id}/delete/{file_id}`. `apps/track/services/
  google_drive.py` mirrors legacy `google_drive_service.py` as a urllib client
  (Drive v3 + upload APIs) whose module `_request` leaf maps upstream
  HTTP ≥ 400 to a typed `DriveRequestError` (401 → "Google authorization
  expired. Please reconnect your account.", else 502 with the body truncated to
  200 chars like `resp.text[:200]`); network transport errors propagate to the
  per-route legacy 500 detail. `apps/track/services/cloud_saves.py` orchestrates
  per route: token via the not-linked 401 when a usable Drive token is missing,
  walk/create the `Otix Game Saves → game_id → profile_id` folder chain, then
  delegate. Drive token refresh + external-revocation quiet-unlink added to
  `apps/accounts/services/oauth.py` (`get_user_google_drive_access_token`,
  reusing `_DRIVE_TOKEN_COLUMNS` + the google_drive `_quietly_unlink`
  notification). Views mount in `apps/track/saves_urls.py` after the literal
  `locations/...` routes; upload reads the `file` part + `filename/profile_id/
  file_id` query params (filename may carry `/` subfolder segments →
  `ensure_folder_path`), download streams octet-stream with
  `Content-Disposition`, delete → `{"status": "success"}`. Tests mock the
  `google_drive._request` + accounts oauth `_request` seams (15 new; track app
  suite 23). Parity 243→247. **Remaining 16 = discover 4, integrations 10,
  notifications 1, upload 1.** (saves bucket now complete.)
- **Plex watchlist sync — the media-seeding engine (increment 19, 2026-09-05)** —
  `POST /integrations/plex/watchlist/sync` ports legacy `sync_plex_watchlist`
  and is the first provider→catalog seeding route (the seam the steam/tmdb sync
  routes will reuse). `apps/integrations/services/plex_watchlist.py` fetches
  `discover.provider.plex.tv/.../watchlist/all?includeGuids=1` through the Plex
  module `_request`/`_with_token`/`_plex_headers` leaves, keeps movie/show
  items, then per item matches or seeds a stub `MediaItem` +
  `Movie`/`Show` subtype + `ExternalID` rows and upserts the user's
  `watchlisted` interaction (`apps.media.services.interaction.set_interaction`,
  which recalcs `watchlist_count`). Matching mirrors legacy `_find_or_seed_media`:
  the recorded plex guid first, then third-party tmdb/imdb/tvdb/musicbrainz
  guids (parsed from the item's `Guid` list; plex rows store `media_type=None`,
  third-party rows the concrete movie/show type so shared tmdb movie/show
  numeric ids never cross-point); seeds carry title/slug/overview/
  `release_date`(originallyAvailableAt)/`completeness_score=0.15`/
  `next_sync_at`. `addedAt` → interaction `added_at`; any fetch failure → zeros
  (never raises). View `PlexWatchlistSyncView` guards 400 when no `plex_id`,
  500 on unexpected error. Tests patch the `plex._request` seam (14 new).
  Parity 247→248. **Remaining 15 = discover 4, integrations 9, notifications 1,
  upload 1.** (first media-seeding engine live; remaining integrations syncs
  are steam/tmdb/youtube + plex/sync SSE, all needing the same engine or the
  platform wave.)
- **Steam library + wishlist scans (increment 20, 2026-09-05)** —
  `POST /integrations/steam/scan` + `POST /integrations/steam/wishlist/scan`
  port the legacy ``steam_library_service`` scan core. `apps/integrations/
  services/steam.py` fetches owned games (Steam Web API `IPlayerService/
  GetOwnedGames/v1/` with `STEAM_API_KEY`/steamid/include_appinfo/
  include_played_free_games) or the wishlist (undocumented `store.steampowered
  .com/wishlist/profiles/{id}/wishlistdata/?p=0`, which needs no key and answers
  HTML/redirect for private profiles → `private: True`) through a module
  `_request` urllib leaf; matches appids to catalog games via existing ``steam``
  ``ExternalID`` rows (stage-1), then upserts `UserSteamGame`/`UserSteamWishlist`
  (preload-existing + `bulk_create` for new rows). The legacy scan tail delegates
  unmatched games to the IGDB `GameMatcher` resolver (4-stage pipeline) which is
  NOT ported — deferred platform slice; the 5-field scan shape is kept truthful:
  `resolved`/`synced`=0 and `failed`= the count left unmatched. New `STEAM_API_KEY`
  setting (env; default ""). Views guard 400 "No Steam account linked", 503
  "Steam API key not configured", 500 per-route. Tests patch the `_request` seam
  (20 new). Parity 248→250. **Remaining 13 = discover 4, integrations 7,
  notifications 1, upload 1.**
- **Image upload (increment 21, 2026-09-05)** — `POST /api/v1/upload` (legacy
  FastAPI ``/upload``), the whole upload bucket. `apps/accounts/views/upload.py`
  `UploadFileView` mirrors the legacy route exactly: accepts a multipart ``file``
  field, validates declared content-type + filename extension against the allowed
  image set (png/jpeg/webp/gif), sniffs magic bytes, enforces the size cap
  (`UPLOAD_MAX_SIZE_MB`, default 5), then writes the blob under `UPLOAD_DIR`
  (env; default `<repo>/uploads`) as `uuid4().hex + ext` and returns 201
  `{"url": "<proto>://<host>/uploads/<name>"}` (honours `X-Forwarded-Proto`).
  Guards: 401 (global auth), 400 unsupported content-type/extension or
  non-image magic bytes, 413 too large (`UploadTooLarge` — DRF lacks a 413
  shortcut). Legacy per-IP auth rate limiter deferred like the rest of the
  rate-limit layer. No model/DB surface → no migration. Tests redirect
  `UPLOAD_DIR` to a temp dir (12 new). Parity 250→251. **Remaining 12 = discover
  4, integrations 7, notifications 1.**
- **TMDb rating-sync + watchlist-import (increment 22, 2026-09-05)** — `POST
  /integrations/tmdb/rating-sync` + `/tmdb/watchlist-import` (legacy
  ``tmdb_rating_service``; both run synchronously in-request, no Celery).
  `apps/integrations/services/tmdb.py` adds a urllib ``_request`` leaf and
  walks TMDb v3 ``/account/{id}/rated|watchlist/{movies,tv}`` pages; a
  non-200/non-JSON/network page raises so the view answers a stable 500;
  per-item failures are counted ``skipped`` and never raise. Stage-1 matching
  only: a TMDB id resolves via an existing ``tmdb`` ``ExternalID`` row filtered
  by ``media_type`` (movie vs show, increment-19 convention); unmatched items
  are ``skipped`` — the legacy full TMDB catalog sync is DEFERRED. rating-sync
  ``{direction}`` ∈ disabled/import/export/bidirectional persists
  ``user.tmdb_rating_sync_direction`` only on success (transactional; mirrors
  the legacy commit-after-sync); imported ratings go through
  ``apps.media.services.rating.upsert_rating`` (keeps ``avg_rating``/
  ``rating_count`` in sync), export writes ``/movie|/tv/{id}/rating``. Watchlist
  import adds the ``owned`` interaction (Django proxy for legacy
  ``is_in_library``), idempotent. Views: 400 no session (``TMDb account not
  linked``) / invalid direction, 500 per-route. ``TMDB_API_KEY`` added to
  base.py (env, default ""). Legacy auto-unlink-on-revoked deferred. Tests
  patch ``tmdb._request`` (18 new). Parity 251→253. **Remaining 10 = discover 4,
  integrations 5, notifications 1.**
- **Discover hero + list_type (increment 23, 2026-09-05)** — `GET
  /discover/hero` + `GET /discover/{media_type}/{list_type}` (2 of the remaining
  10 routes). New read-only `apps/discover` domain (no models → no migration):
  `apps/discover/services/discover.py` holds the legacy list-type vocabulary
  (`_LIST_CONFIG`, `_date_filter` windows: trending_window/recent/future) and
  both feed builders. `apps/media/services/catalog.list_media` gained optional
  ``has_artwork``/``has_logo``/``date_from``/``date_to`` filters (has_artwork
  mirrors the legacy textless-poster rule: movie/show need a ``textless_poster``
  asset, game/music fall back to ``poster``; has_logo = ``logo`` asset exists).
  Both views are public (``AllowAny``, optional user): hero pulls a shuffled
  pool of ``min(limit*4, 50)`` artwork-backed rows and returns
  ``{items, has_more, next_cursor}``; list_type reuses the page-paginated
  browse machinery (``DefaultPagination`` + ``enrich_summaries`` +
  ``MediaItemSummarySerializer``) with media/list-type validation → 400. Legacy
  personalization seeding is DEFERRED: collaborative/semantic/integration_steam/
  integration_plex fall through to the generic popularity listing (exactly
  legacy's no-seeds branch) and ``new_season_for_you`` returns an empty feed
  (nothing to seed it from); /sections + /free-games/match stay deferred. Adult
  policy + language (en-US→en prefix) + is_anime narrowing mirrored. Redis
  result-caching deferred across the port. Tests (17 new). Parity 253→255.
  **Remaining 8 = discover 2 (sections, free-games/match), integrations 5,
  notifications 1.**
- **Discover sections (increment 24, 2026-09-05)** — `GET /discover/sections`.
  The legacy route serves `PersonalizationService.default_sections()` for
  anonymous callers (four static `PersonalizedSection` descriptors —
  trending_movies/trending_shows/popular_games/new_music — each naming a
  list_type feed already ported in increment 23). Per-user
  `compute_profile`/`generate_sections` preference-signal personalization is
  DEFERRED, so authed callers receive the same canonical defaults (the legacy
  generate path is engine-bound); Redis caching deferred. New
  `DiscoverSectionsView` + `default_sections()` service returning the full
  section field set (nulls included, mirroring the pydantic schema), mounted at
  `discover/sections` ahead of the list_type pair. Tests (2 new). Parity
  255→256. **Remaining 7 = discover 1 (free-games/match — IGDB GameMatcher
  bound), integrations 5, notifications 1.**
- **SSE/Redis realtime layer (increment 25, 2026-09-05)** — sync-enqueue POSTs
  + the terminal/per-user SSE stream GETs (5 of the remaining 7 routes). New
  `core/redis.py` `get_client()` (lazy `redis.Redis.from_url(REDIS_URL)`, new
  base.py setting defaulting to the Celery Redis) and `core/sse.py`, a DRF SSE
  transport mirroring legacy `otix.lib.sse`: `sse_response()` wraps a sync
  generator over Redis pub/sub (`sse_event_stream`) that opens Redis only when
  the client starts reading (tests patch `core.sse.get_client`), replays a
  stored result/progress key first, emits compact `data: {json}` frames +
  `:keepalive` heartbeats, self-terminates on a `sync_complete`/`error` frame,
  and unsubscribe/closes in `finally`. `POST /integrations/plex/sync` +
  `/youtube/sync` persist a `SyncJob` via
  `integrations.services.sync.enqueue_sync_job` (pk doubles as the SSE task_id
  — no uuid column) and answer 202 `{task_id}` (youtube 400 when no google_id).
  The two `GET .../sync/{task_id}/stream` views stream
  `{provider}:sync:{task_id}:events` (plex: result replay; youtube: result +
  progress replay). `GET /notifications/stream` is a persistent (no-terminal)
  feed on `user:{id}:notifications` — wired into `apps.social.notifications_urls`
  (docstring no longer says it 404s). asgi stays sync-safe; the actual
  sync-worker publishers that drive these channels were DEFERRED platform work at
  the time (the streams idle/timeout until a worker publishes) — now real, see
  the increment-27 bullet. Tests (15 new).
  Parity 256→261. **Remaining 2 = discover free-games/match + steam
  resolve-unmatched, both IGDB GameMatcher bound.**
- **IGDB GameMatcher + final 2 routes (increment 26, 2026-09-05)** — closes the
  last 2 contract routes → **263/263 ported, 0 method-gaps, 0 remaining**. New
  `apps/media/services/game_matcher.py`: a sync port of the legacy 4-phase
  matcher (`match_batch` runs phases in-request). Phase 1 = direct external-id
  match over existing ``ExternalID`` rows (DIRECT, confidence by confirmed_by).
  Phase 2 = otix catalog exact-title (`_comparison_key`) then OR'd ILIKE
  substring passes over ``media_type="game"`` (trigram pass DEFERRED). Phase 3 =
  IGDB, gated on ``configured()``: 3a cross-references steam app ids / epic ids
  through IGDB ``external_games`` (category 1/26) and reuses-or-seeds the mapped
  IGDB game; 3b title-searches for stragglers (``":"``-short-query retry +
  ``search_games_by_name`` fallback), exact-key hits seed while fuzzy hits only
  linger at ≥0.70. Phase 4 = dedupe/rank/auto-match (DIRECT always; needs_import
  only when ≥0.90 exact igdb_search; else ≥0.95; else ≥0.85 single candidate or
  ≥0.10 gap). ``_seed_game_from_igdb`` slug-dedups across providers, else creates
  MediaItem (``completeness_score=0.15``, ``next_sync_at``) + ``Game`` + igdb and
  request ``ExternalID`` rows + poster ``MediaAsset``; ``hydrate_free_game``
  (exact-only) seeds free-game refs. Provider = ``apps/media/services/igdb.py``
  (urllib ``_request`` leaf — the test seam; Twitch client-credentials token,
  in-process 60-day cache, 401-refetch-once). SteamGrid artwork, trigram,
  Celery hydration, and full ``GAME_FIELDS`` fetches stay DEFERRED (matcher
  sends the lean ``SEARCH_FIELDS`` shape; the token-bucket ``core/ratelimit``
  they'd throttle through is ported as of increment 32, but the async provider
  clients that instantiate it are not). **Route A:**
  `POST /integrations/steam/resolve-unmatched`
  (`apps/integrations/services/steam_igdb.py` ``resolve_unmatched_steam_games``
  + ``repair_bare_steam_links`` — relinks overview/game-bare stubs to canonical
  matches; returns legacy ``{resolved,synced,failed,total}``, ``synced`` = item
  seeded this run, i.e. absent from the pre-match catalog snapshot). View guards
  byte-for-byte 400 no-steam-id / 503 IGDB-unconfigured / 500. This supersedes
  the increment-20 note that the scan tail's resolver was unported: users now hit
  this route instead (the legacy scan itself still reports stage-1-only counts).
  **Route B:** `POST /discover/free-games/match` (PUBLIC AllowAny — the desktop
  aggregator sends no token) `apps/discover/services/free_games.py` +
  `views/free_games.py`: exact ``ExternalID`` lookup → Epic bare-offerId
  fallback (aggregator sends ``namespace:offerId``) → ``hydrate_free_game`` for
  unmatched Epic refs carrying a title → per-ref ``FreeGameResult`` key order
  (``media_item`` = `MediaItemDetailSerializer` detail or ``null``, matched,
  store, store_label, original_price, free_end_date, claim_url, poster_url,
  title, external_id) in ``{items:[...]}``. Literal ``free-games/match`` route is
  registered BEFORE the ``<str:media_type>/<str:list_type>`` pair in
  ``apps/discover/urls.py``. Tests patch the ``igdb._request`` seam (8 steam
  resolve + 8 free-games match). Parity 261→263. **Remaining 0.**
- **Platform machinery: Celery wiring + sync-job lifecycle (increment 27,
  2026-09-05)** — makes the increment-25 SSE channels real end to end (a write
  half now exists to drive them). Celery: `config/celery.py` autodiscovers
  per-app `tasks` modules (`apps/integrations/tasks` registers
  `integrations.run_sync_job`); base.py gains a `CELERY_BEAT_SCHEDULE = {}` hook
  + `REDIS_PROGRESS_TTL` (default 86400); test settings opt into
  `CELERY_TASK_ALWAYS_EAGER` + `EAGER_PROPAGATES` so job lifecycles run inline
  (no broker in the suite). Write half: new `core/progress.py`
  `RedisProgress(namespace)` mirrors legacy ``otix.lib.redis_progress`` and writes
  exactly the keys `core/sse` reads — pub/sub `{namespace}:{task_id}:events`
  carries `{"type":…, **data}` frames, `…:result` stores the *bare* result dict
  (read-side ``normalize_stored_result`` synthesizes the terminal `type` on
  replay), `…:progress` stores the latest frame; writes are TTL'd and fail-open
  (a Redis blip never aborts a sync). Lifecycle service
  (`apps/integrations/services/sync.py`): engine registry
  (`register_sync_engine(provider)` / `get_sync_engine`), `claim_job` (atomic
  pending→running via `UPDATE … WHERE status='pending'` so exactly one worker
  wins), `complete_job`/`fail_job`, and the orchestrator `execute_sync_job(pk)`:
  claim → publish `sync_started` → run engine → store result + publish
  `sync_complete` → completed; error paths store + publish an `error` terminal
  state and mark failed (engine exceptions logged — job `error_message` keeps the
  detail while the SSE frame stays generic "Sync failed unexpectedly"; no-engine
  → failed naming the provider; re-running a finished job → `skipped`). Live
  frames carry the provider context but omit `task_id` (the client holds it from
  the channel); the stored result adds `task_id` so replays are self-describing.
  `integrations.run_sync_job` fetches the row then delegates to the orchestrator.
  Real provider engines (plex-user, youtube-liked) register under their provider
  in later increments and call `.delay()` from the existing enqueue POSTs. Tests
  (11 new) patch `core.progress.get_client` + `core.sse.get_client` to one shared
  in-memory fake: write-half key shapes + fail-open, eager `run_sync_job.delay()`
  lifecycle (pending→running→completed with started_at/completed_at), no-engine /
  engine-exception → failed, stored-result replay roundtrip, and a live pub/sub
  stream consuming the recorded frames. Suite 711→722. Parity unchanged 263/263.
- **YouTube liked-music sync engine (increment 28, 2026-09-05): parity 263/263
  unchanged, full suite 740 (18 new).** First REAL provider engine ported +
  dispatched end to end. `apps/integrations/services/youtube_title_parser.py` =
  faithful `parse_music_title` (normalize unicode dashes → extract artist/song
  split + bracket markers + feat/remix/live detection → confidence; Topic
  channels get artist from the channel title). `youtube.py` = sync urllib
  `YouTubeClient` with a module `_request` leaf: non-2xx that names
  "insufficient authentication scopes" → `YouTubeScopeError` (re-link message),
  other errors → `YouTubeError`; network failures propagate (engine → generic
  abort). `youtube_sync.py` registers `@register_sync_engine("youtube")`:
  resolve user from `job.external_id`, `get_user_google_access_token` (accounts
  oauth), no-token → returns `{"error": "No valid Google token. …"}`
  (NEW orchestrator contract: `execute_sync_job` treats an error-returning
  summary as a handled failure → `_abort` error frame + failed job, not a false
  `sync_complete`); pages `videos.list myRating=like` (nextPageToken),
  filters `categoryId == "10"`, parses titles, `_match_album` 3 strategies
  (title iexact + artist credit → title icontains re-checked per album against
  the artist credit → featuring-artist credits), `set_interaction(…, "listened",
  extra={source, video_id, video_title, channel_title, published_at})`,
  `_link_channel_to_person` = `ExternalID(content_type=Person,
  provider="youtube_channel")` (already-linked guard + skip persons already
  owning a youtube_channel id; sets `Person.youtube_channel_title`), and upserts
  every music video into `UserYoutubeLikedVideo` (`update_or_create` on
  user+video_id, clearing `matched_media_item` on re-sync when unmatched). Body
  wrapped in `transaction.atomic` (all-or-nothing, mirrors legacy
  commit-at-end). Intermediate frames publish + `store_progress` on the youtube
  namespace; orchestrator still owns `sync_started`/`sync_complete` + stored
  result. Wiring: `apps/integrations/tasks/__init__` now imports the engine
  module (side-effect registration at worker start / task import);
  `YoutubeSyncView.post` calls `run_sync_job.delay(job.pk)` after enqueuing
  (plex stays enqueue-only until its engine ports). No migration (model + raw
  table existed). Tests: 12 parser units + 6 engine roundtrip (patch the
  oauth-token fn, `youtube._request` canned pages, `core.progress.get_client`;
  album/Person/MediaCredit fixture; match→interaction+channel-link+raw-upsert;
  no-token → error terminal; resync idempotent); endpoint dispatch test now
  patches `run_sync_job` so eager mode doesn't run the engine inline.
- **Plex library user-sync engine (increment 29, 2026-09-05): parity 263/263
  unchanged, full suite 746 (6 new).** Second REAL provider engine ported +
  dispatched, closing out the provider-engine surface (both youtube + plex now
  register and run off their enqueue POSTs). `apps/integrations/services/
  plex_sync.py` registers `@register_sync_engine("plex")` with two entry modes
  off the `SyncJob`: full-user (`entity_type="user"`) discovers the user's
  servers + selected libraries (reusing the ported `plex.py` discovery) and
  scans each; single-library (`entity_type="library"`, `external_id` =
  `UserPlexLibrary` pk) scans just that stored library row (server off
  `select_related`, token = stored `server.access_token or user.plex_auth_token`).
  Each library is fetched paged (`X-Plex-Container-Start/Size=200`,
  `includeGuids=1`, artist sections get `type=9`) and filtered to
  movie/show/music (episodes never come back from a section `/all` walk — they
  belong to watch-history scans). Per item: `_match_or_seed` resolves an
  existing catalog `MediaItem` via the recorded plex guid (ExternalID
  media_type=None) then third-party guids (movie/show/music media_type), else
  seeds a completeness-0.15 stub + Movie/Show/Album subtype + ExternalID rows
  (Album gets `track_count=child_count`); `_upsert_item` stores the full raw
  `UserPlexItem` row on `(server, rating_key)`; `_apply_interactions` writes
  movie `watched` (viewCount>0), music `listened` (viewCount>0 or lastViewedAt,
  carrying artist/last-played/added metadata), and any `started` (viewOffset) —
  all `source="plex"`. One library runs inside its own `transaction.atomic`;
  library fetch/sync exceptions are caught per-library so a bad library never
  fails the job (failures just don't add to the summary), mirroring the legacy
  isolation. Deliberately deferred enrichment (documented in the module docstring
  for later backfill): album-metadata hydration, person/genre/label creation,
  plex `userRating` → ratings, Track backfill, and the episode-driven show
  `watched` recompute. Frames: engine emits `syncing_library` /
  `library_progress` (every 5 items) / `library_complete`; orchestrator owns
  `sync_started`/`sync_complete` + stored result, and an error-returning engine
  (no user / no token / unreachable discovery / library gone) → `_abort` error
  terminal (increment-28 contract). Wiring: `tasks/__init__` imports both
  `plex_sync` + `youtube_sync`; `PlexSyncView.post` now calls
  `run_sync_job.delay(job.pk)` (library_id → single-library job, else full-user)
  and its stream view gained the plex `progress_replay`. No migration. Tests:
  6 engine roundtrips (patch `plex._request` canned page, discovery fns, and
  `core.progress.get_client`; full-user seeds movie + writes watched interaction
  + terminal frame order; existing plex-guid matches without duplicating; resync
  idempotent — second run matched-not-seeded; single-library uses stored server
  row; library-not-found + no-token → error terminal states); the two plex
  enqueue endpoint tests now mock `run_sync_job` like the youtube one.
- **ASGI SSE transport (increment 30, 2026-09-05): parity 263/263 unchanged,
  full suite 747 (1 new).** The SSE read half now serves an *async generator*:
  `core.sse.sse_event_generator` (replacing the sync `sse_event_stream`) polls an
  async Redis pubsub (`core.redis.get_async_client`, `redis.asyncio`) and feeds a
  Django ``StreamingHttpResponse`` whose content Django's ASGI handler consumes
  via ``__aiter__`` on the event loop — so an idle/long-lived ``text/event-stream``
  (notifications, sync progress) never pins a worker thread, and a client
  disconnect cancels the stream task → the ``finally`` unsubscribes + ``aclose``s
  (client disconnect also caught as ``CancelledError``/``RuntimeError``). Replay
  callables stay the sync `read_json_key` lambdas (single fast key reads) — both
  sync and async replay callables are supported. Views are unchanged: the three
  sync ``APIView``s still return ``sse_lib.sse_response(...)``; only the content
  is async now, so production SSE serving should run behind an ASGI server
  (uvicorn/daphne) — a WSGI client that sync-iterates the response buffers it.
  Tests: the lifecycle + stream suites drive the async generator to completion
  with ``asgiref.sync.async_to_sync`` helpers over a shared in-memory fake
  (``apps/integrations/tests/_sse_fakes.py``) whose ``pubsub()`` returns an async
  ``FakePubSub`` while keeping the sync ``set/get/publish`` write half; a new
  assertion checks the response's ``streaming_content`` is an async iterator.
- **Dev-compose cutover to Django (increment 31, 2026-09-05): parity 263/263
  unchanged, full suite 747 (no new).** The local dev ``docker-compose.yml`` no
  longer builds/launches the legacy FastAPI ``backend/`` — its ``api``/``worker``/
  ``beat`` services now run the Django app from ``./backend-django``, so the
  running dev environment *is* this codebase. Packaging added in
  ``backend-django/``: a ``Dockerfile`` (python:3.12-slim + ``uv sync
  --frozen --no-dev --no-install-project`` with ``UV_PROJECT_ENVIRONMENT=/usr/local``
  so deps land in the global site-packages and the dev bind-mount of
  ``./backend-django:/app`` still resolves imports), a ``.dockerignore``, and
  ``entrypoints/start-api.sh`` (``manage.py migrate --noinput`` then
  ``uvicorn config.asgi:application``, ``--reload`` when ``ENABLE_RELOAD=1``).
  ``uvicorn`` is now a runtime dependency (the ASGI entrypoint is the real
  server). ``docker-compose.yml``: api = the above ASGI server (health
  ``/api/v1/health``); worker = ``celery -A config worker -Q celery`` (autodiscovers
  ``run_sync_job``; the old 15-queue command is gone — grow ``-Q`` as the deferred
  ingest/enrich/embedding tasks land); beat = ``celery -A config beat`` (empty
  schedule idles). Each service overrides ``.env``'s FastAPI asyncpg
  ``DATABASE_URL`` with a plain ``postgresql://`` URL (Django's parser rejects
  the ``+asyncpg`` scheme) and exports ``DJANGO_SETTINGS_MODULE=config.settings.dev``.
  DB cutover: ``db`` now mounts a NEW named volume ``pgdata_django``; the legacy
  ``otix_pgdata`` volume is left orphaned (not mounted) so the FastAPI/alembic
  schema + data stay intact until a real data migration. Verified live: stack
  booted (db/redis/api/worker/beat healthy), migrations applied to a fresh
  Postgres, worker pings + autodiscovers the task, and a register→login→``/auth/me``
  roundtrip wrote/read a user through uvicorn. The legacy FastAPI tree
  ``backend/`` is retired from dev compose but not deleted; ``docker-compose.prod.yml``
  still targets it and is NOT cut over (its 4-worker/15-queue/embeddings topology
  maps to deferred task-#6 machinery — do that with the production wave).
- **Redis token-bucket rate limiter (increment 32, 2026-09-05): parity 263/263
  unchanged, full suite 758 (11 new).** First of the task-#6 async provider-
  client prerequisites: `core/ratelimit.py` `RateLimiter` ports the legacy
  ``otix.lib.rate_limiter`` verbatim for the async clients that throttle through
  it. Each bucket is an independent Redis key (`{key_prefix}:{bucket}`); refill
  + consume run in ONE atomic Lua script (`TOKEN_BUCKET_SCRIPT`), so concurrent
  workers can't oversubscribe a shared quota. `acquire(bucket, tokens=1,
  rate=None, burst=None) -> (allowed, wait_seconds)` mirrors legacy semantics
  (`rate`/`burst` per-call override the instance defaults), idle keys
  auto-expire at `max(ceil(burst/rate) + 300, 300)`, plus `wait_and_acquire`
  (block-until-refill loop with timeout) and `reset` (delete that bucket). The
  async Redis client comes from the `core.redis.get_async_client` seam (a
  caller holding a client may pass it explicitly) — same seam convention as
  `core.sse`/`core.progress`, so tests never touch a broker: an in-memory
  double transcribes the Lua math over a dict store and asserts the observable
  allow/deny-up-to-burst, refill-over-elapsed-time, per-bucket isolation,
  key-prefix namespacing, reset, wait-until-available, and timeout contract
  (11 tests, `core/tests/test_ratelimit.py`). No model/DB surface → no
  migration. The async provider-client framework (TMDB/IGDB/Steam/
  MusicBrainz ingest clients + SteamGrid artwork + full ``GAME_FIELDS``
  hydration) that instantiates ``RateLimiter(..., key_prefix=f"ratelimit:
  {name}")`` — its BaseProvider HTTP machinery landed next in increment 33.
- **Async provider-client HTTP machinery (increment 33, 2026-09-05): parity
  263/263 unchanged, full suite 777 (19 new).** Ports the HTTP layer the
  concrete provider clients are built on, as a new ``core/providers/`` package:
  ``circuit_breaker.py`` (failure-counting CLOSED/OPEN/HALF_OPEN with a timed
  recovery probe), ``api_cache.py`` (filesystem JSON response cache keyed
  provider/date/url-hash, dev/test only), ``metrics.py`` (pure-Python registry
  + the full pre-declared ``otix_*`` counters/histograms/gauges incl.
  ``CIRCUIT_BREAKER_STATE`` + ``track_api_call`` — ported whole so the deferred
  hydration engines reuse the same ``SYNC_*``/``HYDRATION_*`` series), and
  ``base.py``: ``BaseProvider`` + ``ProviderError``/``RateLimitError``
  (``retry_after``)/``CircuitOpenError``. ``BaseProvider._get/_post`` funnel
  through one ``_request`` pipeline: breaker allow → GET cache hit (HALF_OPEN
  probes resolve via a cached 200 so they don't strand the breaker) →
  ``RateLimiter.wait_and_acquire`` (the increment-32 bucket; the same async
  Redis client is exposed via a new ``RateLimiter.redis`` accessor) → httpx
  call under ``track_api_call`` → cache successful GETs → 429 sets a cooldown
  key + drains the bucket then raises ``RateLimitError``, 5xx records a
  failure + raises, 4xx passes through for the caller. ``httpx`` is now a
  runtime dep; ApiCache gating reads a new ``APP_ENV`` setting (base default
  "local"; prod overrides to "production"). Subclasses pass a name + an
  ``httpx.AsyncClient`` (plus an optional async Redis; the ``core.redis`` seam
  is the default). Tests (``core/tests/test_providers.py``, 19) drive a real
  ``BaseProvider`` over an ``httpx.MockTransport`` with the in-memory async
  Redis double (the test_ratelimit convention) — no broker/sockets/keys, and
  they assert breaker open/recover, cache-hit-serves-without-network,
  429-cooldown-and-drain, client-error pass-through, and network-failure
  accounting. No model/DB surface → no migration. The concrete keyed clients
  (TMDB/IGDB/SteamGrid/MusicBrainz) that subclass ``BaseProvider`` are the next
  deferred piece.
- **Concrete TMDB async client (increment 34, 2026-09-05): parity 263/263
  unchanged, full suite 792 (15 new).** The first keyed client on the
  increment-33 machinery: ``core/providers/tmdb.py`` ports
  ``otix.providers.tmdb.client``. A module-level ``get_http_client()`` returns a
  process-shared ``httpx.AsyncClient`` bound to ``TMDBProvider.BASE_URL``
  (``https://api.themoviedb.org/3``) with Bearer ``TMDB_RAT`` auth + the
  ``TMDB_REQUEST_TIMEOUT_SECONDS`` timeout, discarding an inherited client when
  the event loop changes (Celery prefork child). ``TMDBProvider(BaseProvider)``
  names itself "tmdb" and throttles at ``rate == burst ==
  TMDB_GLOBAL_RPS_LIMIT`` (default 40/s). Read methods pass **relative** paths
  that httpx resolves against the ``…/3`` base_url (so requests actually land on
  ``/3/<path>``); session-auth account endpoints additionally send the v3
  ``api_key`` param. Coverage spans movies/shows/seasons/people/trending/
  collections/companies/networks/watch-providers/keywords/search/
  ``find``/configuration/discover/genres and the account rated/watchlist/
  favorites families. **Write endpoints** (``rate_movie``/``rate_tv``/
  ``delete_*_rating``/``add_to_watchlist``) are routed through the throttled
  ``_post``/``_request`` path + ``raise_for_status()`` — fixing a **latent
  legacy bug**: the old client referenced a ``self._client`` attribute
  ``BaseProvider`` never set, so writes bypassed the breaker/limiter and died on
  an AttributeError instead of failing loudly. New ``core/providers/types.py``
  supplies the ``JSONValue`` alias; ``config/settings/base.py`` declares
  ``TMDB_RAT``/``TMDB_API_KEY``/``TMDB_REQUEST_TIMEOUT_SECONDS``/
  ``TMDB_GLOBAL_RPS_LIMIT``. Tests (``core/tests/test_tmdb_provider.py``, 15)
  reuse the in-memory Redis double + ``httpx.MockTransport`` (client built with
  ``base_url=TMDBProvider.BASE_URL``) and assert the issued request
  method/path/params/body per endpoint — language+``append_to_response``,
  pagination, ``search_multi`` query, ``find`` external_source, discover
  param/language merge, account ``api_key``+``session_id``, images sending **no**
  language param, POST/DELETE writes landing on the throttled path, a 4xx write
  raising ``httpx.HTTPStatusError``, and the client factory's base_url/bearer/
  timeout. No model/DB surface → no migration. **Next deferred piece:** the
  remaining concrete keyed clients (IGDB/SteamGrid/MusicBrainz), then the TMDB
  transformer/hydrator + catalog-seed pipeline those clients feed.
- **MusicBrainz ws/2 async client (increment 35, 2026-09-05): parity 263/263
  unchanged, full suite 804 (12 new).** ``core/providers/musicbrainz.py`` ports
  ``otix.providers.musicbrainz.client`` — a **keyless** provider (auth is a
  descriptive ``User-Agent``), so it exercises the client shape without a token
  setting. Key divergence exercised: MusicBrainz rate-limits with HTTP 503, not
  429, so ``MusicBrainzProvider._rate_limit_statuses = (429, 503)`` — the
  increment-33 ``BaseProvider`` checks those statuses *before* its 5xx failure
  branch, so a 503 drains the token bucket and raises ``RateLimitError`` instead
  of opening the circuit. Module ``get_http_client()`` binds a process-shared
  ``httpx.AsyncClient`` to ``BASE_URL`` (``https://musicbrainz.org/ws/2``) with
  the ``User-Agent`` + ``Accept`` headers, ``follow_redirects=True``, and the
  ``MUSICBRAINZ_REQUEST_TIMEOUT_SECONDS`` timeout (same loop-change discard as
  TMDB). ``MusicBrainzProvider`` names itself "musicbrainz", throttles at
  ``rate == burst == MUSICBRAINZ_GLOBAL_RPS_LIMIT`` (default 1/s — MBZ
  etiquette), and adds a thin ``_get(path, params)`` that auto-merges
  ``fmt=json`` before calling the throttled ``_request``. Endpoints: releases
  (``get_release``/``browse_releases_by_artist``/``search_release``), artists
  (``get_artist``/``search_artist``), recordings
  (``get_recording``/``browse_recordings_by_release``), and ``get_cover_art``
  which fetches the **absolute** coverartarchive.org URL and returns ``None``
  on any non-2xx/transport error ("no art" ≠ error). One port adjustment: the
  legacy ``search_artist`` manually ``quote()``d the query, double-encoding it
  once httpx also encodes params — dropped here so it is encoded exactly once.
  ``config/settings/base.py`` declares ``MUSICBRAINZ_REQUEST_TIMEOUT_SECONDS``
  (15s) + ``MUSICBRAINZ_GLOBAL_RPS_LIMIT`` (1/s). Tests
  (``core/tests/test_musicbrainz_provider.py``, 12) reuse the in-memory Redis
  double + MockTransport and assert the issued request per endpoint (path
  merged onto ``…/ws/2``, ``fmt=json``, inc, list contracts), **the headline
  503-rate-limit case** (RateLimitError with retry_after=5, breaker stays
  CLOSED, cooldown TTL set), a real-429 path, cover-art absolute URL + 404→None,
  and the client factory base_url/User-Agent/redirects/timeout. No model/DB
  surface → no migration. **Next deferred piece:** the remaining concrete keyed
  clients (IGDB/SteamGridDB), then the TMDB/MusicBrainz transformer/hydrator +
  catalog-seed pipelines those clients feed.
- **SteamGridDB async client (increment 36, 2026-09-05): parity 263/263
  unchanged, full suite 819 (15 new).** ``core/providers/steamgrid.py`` ports
  ``otix.providers.steamgrid.client`` — game artwork (grids/heroes/logos/icons),
  the concrete client the deferred artwork hydration will consume. Distinctive
  auth shape: the API key is **injected per request** (``_request`` override
  adds ``Authorization: Bearer settings.STEAMGRID_API_KEY``) rather than set on
  the shared client, so a key rotation needs only a settings refresh. Shared
  ``get_http_client()`` binds a process-shared ``httpx.AsyncClient`` to
  ``BASE_URL`` (``https://www.steamgriddb.com/api/v2``) + the
  ``STEAMGRID_REQUEST_TIMEOUT_SECONDS`` timeout (loop-change aclose, TMDB
  pattern). ``SteamGridDBProvider`` names itself "steamgrid", throttles at
  ``rate == burst == STEAMGRID_GLOBAL_RPS_LIMIT`` (default 2/s — free tier is
  ~100 req / 5 min), and adds its own ``SteamGridDBError`` +
  ``_resolve_success`` (non-200 / ``success:false`` body → raise). Lookups
  normalize misses to ``None``/``[]`` instead of raising:
  ``get_game_by_platform_id`` (returns the ``data`` dict, or ``data[0]`` when a
  list), ``get_game_by_steam_app_id`` (platform "steam"),
  ``get_game_by_id``, ``search_games`` (autocomplete → list of
  ``{id,name,types}``), and the asset endpoints ``get_grids`` (styles +
  dimensions) / ``get_heroes`` / ``get_logos`` (``[]`` on
  ``SteamGridDBError``/``ProviderError``) / ``get_icons`` (``[]`` on
  ``SteamGridDBError`` only — a legacy narrower catch preserved). Divergence
  note: the modern ``BaseProvider`` raises ``HTTPStatusError`` on ≥500 before
  ``_resolve_success`` runs, so the error-parse path fires on 4xx bodies (the
  realistic not-found case); a genuine upstream 5xx surfaces loudly rather than
  degrading to ``[]``. ``config/settings/base.py`` declares
  ``STEAMGRID_API_KEY`` (accepting the legacy ``STEAM_GRID_API_KEY`` env alias),
  ``STEAMGRID_REQUEST_TIMEOUT_SECONDS`` (15s),
  ``STEAMGRID_GLOBAL_RPS_LIMIT`` (2/s). Tests
  (``core/tests/test_steamgrid_provider.py``, 15) reuse the in-memory Redis
  double + MockTransport and assert: per-request Bearer injection (override the
  key setting), path merged onto ``…/api/v2``, dict/list data normalization,
  404 → ``None``, ``success:false`` → ``None``/``[]``, grid styles+dimensions
  params, autocomplete list, and the ``_resolve_success`` parser raising on
  non-200/error bodies, plus the factory base_url/timeout with **no**
  client-level Authorization header. No model/DB surface → no migration. **Next
  deferred piece:** the IGDB concrete client, then the TMDB/MusicBrainz
  transformer/hydrator + catalog-seed pipelines those clients feed.
- **IGDB async client (increment 37, 2026-09-05): parity 263/263 unchanged,
  full suite 836 (17 new).** ``core/providers/igdb.py`` ports
  ``otix.providers.igdb.client`` — game metadata (v4), the last of the four
  deferred concrete keyed clients and the one the game-matcher/hydration path
  consumes. Distinctive auth shape: a **Twitch OAuth2 client-credentials grant**
  (``IGDB_CLIENT_ID``/``IGDB_CLIENT_SECRET`` POSTed to ``id.twitch.tv``) whose
  access token is cached in Redis (``igdb:access_token``,
  ``IGDB_TOKEN_TTL_SECONDS`` default 50 days); every API request carries both a
  ``Client-ID`` header and ``Authorization: Bearer``, and a single 401
  invalidates + refetches the token once before returning. All reads are
  **POSTs with an Apicalypse query-DSL body** (custom syntax, not GET), so the
  increment-33 GET response cache never applies; repeat search results are
  instead cached in Redis (``igdb:search:*``, ``IGDB_SEARCH_CACHE_TTL_SECONDS``
  default 7 days) because raw IGDB metadata changes slowly and shouldn't burn
  the quota. Shared ``get_http_client()`` binds ``httpx.AsyncClient`` to
  ``https://api.igdb.com/v4`` + timeout (loop-change aclose, TMDB pattern).
  ``IGDBProvider`` names itself "igdb", throttles at
  ``rate == burst == IGDB_GLOBAL_RPS_LIMIT`` (default 4/s), and — unlike the
  per-request-key peers — carries its own Redis for token/search caches, defaulted
  to the rate limiter's cached client (``self.rate_limiter.redis``) so a shared
  Redis connection is reused. Reads: ``get_games``/``get_game`` (``id`` set),
  ``get_popular_games`` (aggregated_rating sort), ``get_recently_released_games``
  (90-day window), ``get_upcoming_games`` (hypes>5), ``get_games_offset``
  (main-games-only + release-window filter), ``get_franchise``,
  ``get_changed_game_ids``, ``search_games`` (relevance) /
  ``search_games_by_name`` (substring where-filter — exact-title games the
  relevance search down-weights, e.g. "For The King"), plus the resolvers
  ``get_cover``/``get_screenshots``/``get_artworks``/``get_videos``/
  ``get_companies``/``get_involved_companies``/``get_age_ratings`` and the
  external-id mappers ``lookup_external_game_ids`` (+ Steam/Epic/GOG wrappers).
  Errors: non-200 → ``IGDBError`` (``IGDBAuthError`` for the OAuth grant);
  429 hits the base token-bucket rate-limit path. ``config/settings/base.py``
  declares the four IGDB settings next to the credentials:
  ``IGDB_REQUEST_TIMEOUT_SECONDS`` (20s), ``IGDB_GLOBAL_RPS_LIMIT`` (4/s),
  ``IGDB_TOKEN_TTL_SECONDS`` (50 d), ``IGDB_SEARCH_CACHE_TTL_SECONDS`` (7 d).
  Tests (``core/tests/test_igdb_provider.py``, 17) add a ``setex`` method to the
  in-memory Redis double and route the MockTransport on the request **host**
  (``id.twitch.tv`` answers token requests, ``api.igdb.com`` the Apicalypse
  API), asserting: provider identity + shared redis, Client-ID/Bearer headers,
  token fetched-once-from-Twitch-then-cached, 401 invalidate+refetch-once (2
  igdb + 2 twitch calls), Apicalypse POST bodies, Redis search caching (2nd
  identical call → 1 transport hit), name-substring escaping, external
  uid→game mapping + int-key Steam coercion, IGDBError on 4xx, RateLimitError
  on 429, and the factory base_url/timeout with no client-level auth headers.
  No model/DB surface → no migration. **Next deferred piece:** the
  TMDB/MusicBrainz/IGDB transformer/hydrator + catalog-seed pipelines (the
  first real consumers of the four ported clients — maps legacy SQLAlchemy
  domain onto Django models, DB-touching/larger), then SteamGrid artwork
  hydration.
- **TMDB media ingest service (increment 38, 2026-09-05): parity 263/263
  unchanged, FULL suite 842 (6 new).** The FIRST real consumer of a ported
  async provider client, and the pivot from porting machinery to wiring the
  hydration path: ``apps/media/services/tmdb_ingest.py`` seeds a movie
  MediaItem+Movie row from TMDB movie detail. Deliberate **architectural
  divergence — NOT a faithful SQLAlchemy-transformer port.** The legacy
  transformer/hydrator split returned unsaved SQLAlchemy domain instances whose
  object graph was the persistence graph; that does not survive Django's
  catalog shapes (MTI subtype PK = media_items.id, generic-FK ``ExternalID``,
  explicit ``MediaGenre``/``MediaGenreType`` links, ``MediaAsset`` images), and
  the ORM drift means a throwaway object-builder layer would be churn. So this
  follows the increment-26 ``_seed_game_from_igdb`` idiom instead: a TMDB detail
  dict maps straight onto the Django graph and persists it. ``seed_movie_from_tmdb
  (raw) -> media_id``: dedup by tmdb ``ExternalID`` (provider "tmdb",
  media_type "movie"), else same-slug ``movie`` hub (cross-provider), then
  create MediaItem(title/overview/slug/release_date/popularity/original_language/
  is_adult) + Movie subtype (runtime/budget/revenue/tagline/is_anime from the
  legacy anime heuristic over keywords+genres+ja language), link canonical
  ``Genre`` rows (dedup by name; names read directly from detail genres — no
  legacy id→name map) tagged ``MediaGenreType`` movie + ``MediaGenre`` links,
  upsert tmdb/imdb ``ExternalID`` rows and poster (w500)/backdrop (w780)
  ``MediaAsset`` rows, and mark ``completeness_score`` 0.15 + ``next_sync_at``
  so a later full-hydration pass completes the row (increment-26 posture).
  Re-seed tops up a missing overview and re-links genres/assets idempotently.
  ``fetch_and_seed_movie(tmdb_id, *, provider=None)`` fetches detail through
  ``core/providers.tmdb.TMDBProvider`` then seeds — the DB write goes through
  ``asgiref.sync.sync_to_async`` because Django forbids sync ORM inside an async
  context (a real async service must hand DB work to a worker thread). Tests
  (``apps/media/tests/test_tmdb_ingest.py``, 6) use ``django.test.TestCase``
  over the in-memory sqlite: full-row assertions (hub+subtype+ext ids+genres+
  assets+completeness), tmdb-id idempotency, same-slug reuse+overview top-up,
  ja+Animation → is_anime, missing-id ValueError. **Test gotcha recorded:** the
  async fetch test stubs ``seed_movie_from_tmdb`` and asserts the raw passes
  through — it must NOT write the DB, because ``sync_to_async`` runs on a
  worker-thread connection that escapes ``TestCase``'s per-test transaction and
  would leak committed rows into the rest of the suite. No model fields added →
  no migration. **Next deferred piece:** register a real TMDB sync engine on the
  increment-27 ``apps/integrations/services/sync.py`` registry + wire it to a
  seed driver (fetch popular/backlog), then extend to show/season/episode +
  credits (the TMDB hydrator tail) and the MusicBrainz album ingest.
- **Known divergence** — `/auth/register` returns the minimal identity
  (no auto-login tokens/cookie) and `GET/PATCH /auth/me` covers the slimmed
  `User` field set (no bio/background/preferences JSON yet); both land with the
  profile-column wave.


## 6b. Plugins framework (DONE — increments 1–6)

**Plugin framework** under `plugins/` (2026-09-05, task #5) — **architecture
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
  additive (not in the frozen 263) so parity is unchanged. **Increment 4 DONE
  (grant-gated framework services):** a running plugin gets a typed surface from
  the host instead of raw DB/network. `plugins/framework.py` defines
  `HttpService` (outbound http(s), `network:external`/`network:any`,
  5 MB body cap), `StoreService` (per-plugin JSON key/value backed by a new
  `PluginStore` model, `storage:local`, migration 0002) and `PluginServices`
  (config/instances + the two services). `build_services(row)` builds fresh
  services from the row's current grants/config, injected in the host before
  `enable()` and before every `call` dispatch, so config/grant edits apply
  without a reload. Every service action is checked against the row's
  `permissions_granted` via `missing_grants` and an ungranted call raises
  `PluginPermissionDenied` — a plugin that *declares* `network:external` still
  cannot write its store until the operator *grants* `storage:local`. The
  `plugins/base.py` `Plugin` carries `self.services = None` so plugin code
  imports cleanly outside the host. **Increment 5 DONE (reference Plex plugin
  end-to-end):** first-party plugins ship checked in under a new
  `BUNDLED_PLUGINS_ROOT` (`bundled_plugins/`, default = repo dir) — the
  Nextcloud shipped-apps analog — seeded by `plugins/services.py: scan_bundled()`
  as **system** rows (auto-enabled, never disabled/uninstalled; an operator
  plugin of the same name shadows the bundled copy). `manage.py plugins_scan`
  seeds bundled + scans the operator root by default; the host's `plugin_folder`
  resolves across both roots (operator wins). Ships the reference
  `bundled_plugins/plex/` (manifest + `plugin.py`): a real Plex data source that
  reads `serverUrl`/`token` config and calls the Plex HTTP API (`/identity`,
  `/library/sections`, `/library/sections/{key}/all`) through the gated
  `HttpService`, returning JSON-safe payloads / clear `PluginError` envelopes.
  `plugins/tests_plex.py` loads the actual shipped plugin and round-trips a data
  method against a fake Plex server in-process; a live cross-process smoke
  (sqlite migrate → `plugins_scan` → `plugin_host` on a port → `hostclient`
  `describe`/`call` from a separate process) verified the full horizontal slice.
  **Increment 6 DONE (supervision + Redis events):** `deploy/plugin-host.service`
  (systemd) + `deploy/plugin-host.supervisor.conf` supervise **only the host**
  process — plugin code lives there, so the worst a bad plugin does is take the
  host down and the supervisor restarts it; the host is stateless (re-reads
  enabled rows on boot), so restart-only-the-host is safe. `plugin_host` maps
  SIGTERM to a clean stop. `plugins/events.py` `publish_lifecycle` emits
  `plugin.loaded` / `plugin.unloaded` / `plugin.error` (JSON: type/id/version/
  error/at) onto `PLUGIN_EVENTS_CHANNEL` (default `otix.plugins.lifecycle`) of
  `PLUGIN_EVENTS_URL` as the host reconciles — fail-open, disabled unless the
  URL is set (tests never touch Redis); host calls are wired in `_load_row` /
  `_unload` / `_fail`. A browser/SSE consumer later subscribes for live status.
  **Increments 1–6 tests: 87 plugins-green** (suite 407).
  Settings: `PLUGINS_ROOT` env (default `<repo>/plugin-root`, gitignored) +
  `BUNDLED_PLUGINS_ROOT` (default `<repo>/bundled_plugins`) +
  `PLUGIN_HOST_BIND/PORT/SECRET` + `PLUGIN_EVENTS_URL/CHANNEL`. Conventions +
  status in `plugins/README.md`. The remaining framework surface —
  `table:*`-scoped data ops + a downloads registry — returns later.

## 7. Known future work (do not get surprised)

- **OAuth auth** completing real auth: the password/2FA/session core shipped
  (§6a). Remaining are the provider login/link families
  (google/plex/steam/tmdb initiate+callback, `/auth/oauth/*`), each needing a
  live IdP, single-use Redis state, and per-provider token/profile columns,
  plus `/auth/me/preferences` + `/auth/me/integrations` reads.
- **SSE / realtime serving** — the streaming transport is ASGI-native
  (increment 30: async-generator content, no worker thread pinned) and the dev
  compose ``api`` now serves ``config.asgi`` through uvicorn (increment 31), so
  realtime behaves in the dev environment. A production ASGI server in front of
  ``config.asgi`` is still outstanding (a WSGI deployment buffers streams and
  can't serve them long-lived; desktop match streams depend on this).
- **Celery workers + beat** — autodiscovery is wired (increment 27:
  `config.celery` autodiscovers per-app `tasks` modules, e.g.
  `integrations.run_sync_job`; Redis broker configured) and the dev compose now
  launches ``worker``/``beat`` against that broker (increment 31) — the running
  dev stack consumes ``run_sync_job`` end to end. Deferred: a real production
  worker/beat deployment, growing the worker's ``-Q`` queue set past the
  default ``celery`` as the ingest/enrich/embedding tasks land, and populating
  ``CELERY_BEAT_SCHEDULE`` once periodic maintenance (catalog hydration etc.)
  opts in. Both real provider engines register + dispatch — youtube-liked
  (increment 28) and plex-user ingest (increment 29); no further engine work is
  deferred.
- **pgvector embeddings** (`pgvector.django`): media_items/people/companies/user
  `Vector(384)` + HNSW cosine indexes; plus `search_vector` trigram machinery.

- **Plugin framework (next surface):** the core shipped as increments 1–6 — see §6b.
  Remaining: `table:*`-scoped data ops, a downloads registry, and a browser/SSE
  consumer of the Redis lifecycle channel.

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
