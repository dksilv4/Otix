# Epic Games Library Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in Otix user link Epic through the launcher OAuth hack, keep the refresh token only on their Otix Server node, and show the scanned library in the web app.

**Architecture:** The node (`server/otix_server/epic.py`) exchanges the authorization code with Epic and writes `storage/epic.json`. Django proxies connect/scan to the user's online `UserGameServer` and upserts `UserEpicGame` rows. The browser never stores the refresh token. `/library/epic` reads Django only.

**Tech Stack:** Python 3.10+ / FastAPI (otix-server, unittest + httpx mocks), Django 5 / DRF (`manage.py test`), React + Vitest, existing `DkDialog` / `IntegrationCard`.

**Spec:** `docs/superpowers/specs/2026-09-18-epic-library-provider-design.md`

## Global Constraints

- Refresh token lives only in `{storage_dir}/epic.json` on the node. Never on `User`, never in `localStorage`, never in Django logs or node HTTP error bodies.
- Node responses to Django omit `refresh_token`.
- Copy when no online node: `Connect an Otix Server to link Epic.`
- Reuse `DkDialog` / `useModal` and `IntegrationCard`. No new modal framework.
- `GET /auth/oauth` stays five providers. Do not add `User.epic_*` columns.
- Skip `UE_`, `QuixelBridge_`, `MetaHumanSample_`, `Lyra_`, `FabPlugin_` prefixes. Dedup by `app_name`.
- Match catalog via `ExternalID` `provider="epic"` on catalog_item_id, then offer_id, then app_name. No IGDB on scan.
- Disconnect deletes the node secrets file and does not delete `UserEpicGame` rows.
- Filter `pluginId === "otix-epic"` out of `library:scan`. Do not edit the plugin.
- Do not add npm/pip dependencies.
- No live Epic HTTP in tests.

---

## File Map

### New files

| File | Responsibility |
|------|----------------|
| `server/otix_server/epic.py` | Parse code, secrets file, Epic token + library HTTP, skip/dedup |
| `server/tests/test_epic.py` | Node unit tests |
| `backend/apps/integrations/models/epic.py` | `UserEpicGame` |
| `backend/apps/integrations/migrations/0006_userepicgame.py` | Table `user_epic_games` (use the next unused number if 0006 exists) |
| `backend/apps/integrations/services/epic.py` | Pick node, proxy, upsert + ExternalID match |
| `backend/apps/integrations/views/epic.py` | Status + scan views |
| `backend/apps/library/services/epic.py` | Library / unmatched / status reads |
| `backend/apps/accounts/tests/test_oauth_epic.py` | Initiate / callback / disconnect |
| `backend/apps/integrations/tests/test_epic_scans.py` | Scan upsert + match |
| `backend/apps/library/tests/test_epic_library.py` | `/library/epic` reads |
| `frontend/src/features/settings/components/organisms/epic-code-modal.tsx` | Paste `authorizationCode` modal |

### Modified files

| File | Responsibility |
|------|----------------|
| `server/otix_server/api.py` | GET/POST/DELETE `/api/v1/epic/*` |
| `backend/apps/integrations/models/__init__.py` | Export `UserEpicGame` |
| `backend/apps/library/services/game_server.py` | `pick_online_game_server`, `epic_*` proxy wrappers |
| `backend/apps/accounts/services/oauth.py` | `build_epic_link_url`, consume `epic-link` state |
| `backend/apps/accounts/views/oauth.py` | Epic initiate/callback/disconnect |
| `backend/apps/accounts/views/__init__.py` | Re-export views |
| `backend/apps/accounts/urls.py` | `/oauth/epic*` |
| `backend/apps/integrations/views/__init__.py` | Re-export epic views |
| `backend/apps/integrations/urls.py` | `/epic/status`, `/epic/scan` |
| `backend/apps/integrations/services/__init__.py` | Export `scan_epic_library` |
| `backend/apps/library/services/__init__.py` | Export epic reads |
| `backend/apps/library/views/library.py` | Epic views |
| `backend/apps/library/views/__init__.py` | Re-export |
| `backend/apps/library/urls.py` | `/epic` before `<tab>` |
| `backend/apps/library/serializers/library.py` | `EpicUnmatchedGameSerializer` |
| `frontend/src/features/settings/pages/settings-integrations-page.tsx` | Epic card |
| `frontend/src/features/plugins/components/organisms/plugin-slot.tsx` | `EpicScanSlotCard` + filter plugin |
| `frontend/src/features/settings/pages/settings-library-page.tsx` | Fetch `/library/epic` |
| `frontend/src/features/settings/__tests__/settings-integrations-modals.test.tsx` | Connect disabled without node |
| `frontend/src/features/settings/__tests__/settings-library-page.test.tsx` | Fetches epic endpoints |

---

### Task 1: Node Epic helpers

**Files:**
- Create: `server/otix_server/epic.py`
- Test: `server/tests/test_epic.py`

**Interfaces:**
- Consumes: `httpx`, `pathlib.Path`
- Produces:
  - `EPIC_CLIENT_ID = "34a02cf8f4414e29b15921876da36f9a"`
  - `EPIC_CLIENT_SECRET = "daafbccc737745039dffe53d94fc76cf"`
  - `EPIC_OAUTH_HOST = "account-public-service-prod03.ol.epicgames.com"`
  - `EPIC_LIBRARY_HOST = "library-service.live.use1a.on.epicgames.com"`
  - `EPIC_UA = "UELauncher/11.0.1-14907503+++Portal+Release-Live Windows/10.0.19041.1.256.64bit"`
  - `SKIP_PREFIXES = ("UE_", "QuixelBridge_", "MetaHumanSample_", "Lyra_", "FabPlugin_")`
  - `class EpicAuthError(Exception)` with `.status_code: int` and `.detail: str`
  - `def parse_authorization_code(raw: str) -> str`
  - `def secrets_path(storage_dir: Path) -> Path` → `storage_dir / "epic.json"`
  - `def read_secrets(storage_dir: Path) -> dict | None`
  - `def write_secrets(storage_dir: Path, *, account_id: str, display_name: str, refresh_token: str) -> None`
  - `def delete_secrets(storage_dir: Path) -> None`
  - `def status_payload(storage_dir: Path) -> dict` → `{connected, account_id, display_name}` never includes `refresh_token`
  - `def exchange_code(code: str, *, request=None) -> dict` → `{account_id, display_name, refresh_token}`
  - `def refresh_access(refresh_token: str, *, request=None) -> dict` → `{access_token, refresh_token}`
  - `def fetch_library_items(access_token: str, *, request=None) -> list[dict]`
  - `def normalize_games(records: list[dict]) -> list[dict]` → `{app_name, namespace, catalog_item_id, offer_id, title}`

- [ ] **Step 1: Write the failing test**

```python
# server/tests/test_epic.py
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

from otix_server.epic import (
    EpicAuthError,
    delete_secrets,
    normalize_games,
    parse_authorization_code,
    read_secrets,
    status_payload,
    write_secrets,
)


class ParseCodeTests(unittest.TestCase):
    def test_raw_code(self):
        self.assertEqual(parse_authorization_code("  abc123  "), "abc123")

    def test_json_body(self):
        raw = json.dumps({"authorizationCode": "xyz", "sid": None})
        self.assertEqual(parse_authorization_code(raw), "xyz")

    def test_empty_raises(self):
        with self.assertRaises(EpicAuthError) as ctx:
            parse_authorization_code("   ")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "No authorization code provided")


class SecretsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_status_hides_token(self):
        write_secrets(self.dir, account_id="acc", display_name="Diogo", refresh_token="secret-rt")
        payload = status_payload(self.dir)
        self.assertEqual(payload, {"connected": True, "account_id": "acc", "display_name": "Diogo"})
        self.assertNotIn("refresh_token", payload)
        self.assertEqual(read_secrets(self.dir)["refresh_token"], "secret-rt")

    def test_delete_disconnects(self):
        write_secrets(self.dir, account_id="acc", display_name="Diogo", refresh_token="secret-rt")
        delete_secrets(self.dir)
        self.assertEqual(status_payload(self.dir)["connected"], False)


class NormalizeTests(unittest.TestCase):
    def test_skips_unreal_and_dedups(self):
        records = [
            {"appName": "UE_Foo", "namespace": "ue"},
            {"appName": "Jaguar", "namespace": "fn", "sandboxName": "Rocket League", "catalogItemId": "c1", "offerId": "o1"},
            {"appName": "Jaguar", "namespace": "fn", "sandboxName": "Rocket League dupe"},
        ]
        games = normalize_games(records)
        self.assertEqual(len(games), 1)
        self.assertEqual(games[0]["app_name"], "Jaguar")
        self.assertEqual(games[0]["title"], "Rocket League")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && python -m unittest tests.test_epic -v`

Expected: FAIL (`ModuleNotFoundError: otix_server.epic`)

- [ ] **Step 3: Write minimal implementation**

Implement `server/otix_server/epic.py`:

- `parse_authorization_code`: strip; if starts with `{` then `json.loads` and take `authorizationCode`; else return stripped string; raise `EpicAuthError(400, "No authorization code provided")` when empty/invalid.
- Secrets: write JSON with `encoding="utf-8"`; `chmod 0o600` inside `try/except OSError`. `read_secrets` returns `None` if missing/invalid. `connected` is True only when `refresh_token` is a non-empty string.
- `exchange_code` / `refresh_access`: POST form to `https://{EPIC_OAUTH_HOST}/account/api/oauth/token` with Basic auth (`base64(client_id:client_secret)`), UA header, `token_type=eg1`. Use `httpx.Client` unless `request` is injected (signature `request(method, url, **kwargs) -> (status: int, body: dict)` for tests). Non-200 or missing fields → `EpicAuthError(400, "Code expired or invalid. Sign in again.")` on exchange; refresh `invalid_grant`/`invalid_refresh_token` in body → `EpicAuthError(400, "Reconnect Epic")`.
- `fetch_library_items`: GET `https://{EPIC_LIBRARY_HOST}/library/api/public/items?includeMetadata=true` with `Authorization: bearer {access}` and UA; follow `responseMetadata.nextCursor` as `cursor` query param until absent. Non-200 → `EpicAuthError(500, "Failed to scan Epic library. Please try again.")`.
- `normalize_games`: `app_name` = `appName` or `sandboxId` or `id`; skip prefix; first seen wins; title = `sandboxName` or `appTitle` or `title` or `app_name`.

Do not log `code`, `refresh_token`, or raw Epic bodies.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && python -m unittest tests.test_epic -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/otix_server/epic.py server/tests/test_epic.py
git commit -m "feat(server): add local Epic token vault and library normalizer"
```

---

### Task 2: Node HTTP routes

**Files:**
- Modify: `server/otix_server/api.py` (add four routes near other `/api/v1/` blocks; import helpers from `otix_server.epic`)
- Test: `server/tests/test_epic.py` (add route tests)

**Interfaces:**
- Consumes: Task 1 helpers; `get_app_config()`, `verify_token`, `cfg.saves.storage_path` parent as `storage_dir`
- Produces:
  - `GET /api/v1/epic/status` → status_payload
  - `POST /api/v1/epic/auth` body `{code}` → exchange, write_secrets, return status
  - `DELETE /api/v1/epic/auth` → delete_secrets, `{connected: false, account_id: null, display_name: null}`
  - `POST /api/v1/epic/scan` → refresh, fetch, normalize, persist rotated refresh_token, return `{games: [...]}`. If not connected → 400 `"Reconnect Epic"` is wrong; use 400 `"No Epic account linked"`. If refresh raises Reconnect Epic, delete_secrets then 400.

`storage_dir = Path(get_app_config().saves.storage_path).resolve().parent`

- [ ] **Step 1: Write the failing route test**

Use FastAPI `TestClient` if already used in this package; otherwise call the route functions with a patched `get_app_config` and patched `exchange_code`. Prefer testing helpers already covered in Task 1 plus one scan orchestration test:

```python
class ScanFlowTests(unittest.TestCase):
    def test_invalid_grant_deletes_secrets(self):
        from otix_server.epic import EpicAuthError, write_secrets, status_payload, delete_secrets
        # after writing secrets, a refresh EpicAuthError(400, "Reconnect Epic")
        # must leave connected=False. Implement this as `complete_scan(storage_dir, request=...)`
```

Add `complete_scan(storage_dir, *, request=None) -> list[dict]` in `epic.py` so routes stay thin:

```python
def complete_scan(storage_dir: Path, *, request=None) -> list[dict]:
    secrets = read_secrets(storage_dir)
    if not secrets or not secrets.get("refresh_token"):
        raise EpicAuthError(400, "No Epic account linked")
    try:
        tokens = refresh_access(secrets["refresh_token"], request=request)
    except EpicAuthError as exc:
        if exc.detail == "Reconnect Epic":
            delete_secrets(storage_dir)
        raise
    if tokens["refresh_token"] != secrets["refresh_token"]:
        write_secrets(
            storage_dir,
            account_id=secrets["account_id"],
            display_name=secrets["display_name"],
            refresh_token=tokens["refresh_token"],
        )
    records = fetch_library_items(tokens["access_token"], request=request)
    return normalize_games(records)
```

Wire routes:

```python
@app.get("/api/v1/epic/status")
async def epic_status(_: None = Depends(verify_token)):
    return status_payload(_epic_storage_dir())

@app.post("/api/v1/epic/auth")
async def epic_auth(payload: dict, _: None = Depends(verify_token)):
    ...

@app.delete("/api/v1/epic/auth")
async def epic_disconnect(_: None = Depends(verify_token)):
    ...

@app.post("/api/v1/epic/scan")
async def epic_scan(_: None = Depends(verify_token)):
    ...
```

Map `EpicAuthError` → `HTTPException(status_code=exc.status_code, detail=exc.detail)`.

- [ ] **Step 2: Run tests**

Run: `cd server && python -m unittest tests.test_epic -v`

Expected: FAIL until routes/`complete_scan` exist, then PASS

- [ ] **Step 3: Implement routes + `complete_scan`**

- [ ] **Step 4: Re-run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add server/otix_server/epic.py server/otix_server/api.py server/tests/test_epic.py
git commit -m "feat(server): expose Epic auth and scan proxy endpoints"
```

---

### Task 3: `UserEpicGame` model

**Files:**
- Create: `backend/apps/integrations/models/epic.py`
- Modify: `backend/apps/integrations/models/__init__.py`
- Create: next integrations migration (copy numbering from `backend/apps/integrations/migrations/`)

**Interfaces:**
- Produces: `class UserEpicGame(TimestampedModel)` with `user`, `media_item` (SET_NULL, null), `app_name` (CharField 128), `namespace` (nullable), `catalog_item_id` (nullable), `offer_id` (nullable), `title` (CharField 500), unique `(user, app_name)` named `uq_user_epic_game`, `db_table = "user_epic_games"`

Mirror `backend/apps/integrations/models/steam.py` field style (FK to `settings.AUTH_USER_MODEL`, `related_name="epic_games"`).

- [ ] **Step 1: Write a model roundtrip test in `backend/apps/integrations/tests/test_epic_scans.py`** (file created here, more tests in Task 6)

```python
from django.contrib.auth import get_user_model
from django.test import TestCase
from apps.integrations.models import UserEpicGame

class UserEpicGameModelTests(TestCase):
    def test_unique_per_user_app_name(self):
        user = get_user_model().objects.create_user(username="a", password="pw")
        UserEpicGame.objects.create(user=user, app_name="Jaguar", title="Rocket League")
        with self.assertRaises(Exception):
            UserEpicGame.objects.create(user=user, app_name="Jaguar", title="dupe")
```

- [ ] **Step 2: Run**

Run: `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test python manage.py test apps.integrations.tests.test_epic_scans -v 2`

Expected: FAIL (model missing)

- [ ] **Step 3: Implement model + `makemigrations integrations --name userepicgame`** (or write the migration by hand matching 0001 style)

Export from `models/__init__.py`.

- [ ] **Step 4: Re-run test — PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/apps/integrations/models/epic.py backend/apps/integrations/models/__init__.py backend/apps/integrations/migrations backend/apps/integrations/tests/test_epic_scans.py
git commit -m "feat: add UserEpicGame library rows"
```

---

### Task 4: Pick online node + Django OAuth

**Files:**
- Modify: `backend/apps/library/services/game_server.py` (add pick + epic proxies at the bottom)
- Modify: `backend/apps/accounts/services/oauth.py` (add epic initiate/consume; login URL constants only)
- Modify: `backend/apps/accounts/views/oauth.py`, `views/__init__.py`, `urls.py`
- Test: `backend/apps/accounts/tests/test_oauth_epic.py`

**Interfaces:**
- Consumes: `UserGameServer`, `OAuthState`, `OAuthCallbackSerializer`, `server_proxy_request`
- Produces:
  - `NO_EPIC_NODE = "Connect an Otix Server to link Epic."`
  - `def pick_online_game_server(user) -> UserGameServer | None` — `is_active=True`, `is_online=True`, order_by `-last_seen_at`, `-id`
  - `def proxy_epic_auth(server, code: str) -> tuple[int, dict]` → `server_proxy_request(server, "POST", "/api/v1/epic/auth", json={"code": code}, timeout=20.0)`
  - `def proxy_epic_status(server) -> tuple[int, dict]`
  - `def proxy_epic_scan(server) -> tuple[int, dict]` timeout 60
  - `def proxy_epic_disconnect(server) -> tuple[int, dict]`
  - `def build_epic_link_url(*, user_id: int) -> tuple[str, str]`
  - `def consume_epic_link_state(state: str, *, user_id: int) -> dict | None` — payload `flow == "epic-link"` and `user_id` matches
  - Views: `EpicLinkInitiateView`, `EpicLinkCallbackView` (`serializer_class = OAuthCallbackSerializer`, `IsAuthenticated`), `EpicDisconnectView`

Initiate: if `pick_online_game_server` is None → 400 `NO_EPIC_NODE`. Else store state, return `{auth_url, state}`.

`auth_url`:

```python
EPIC_CLIENT_ID = "34a02cf8f4414e29b15921876da36f9a"
redirect = f"https://www.epicgames.com/id/api/redirect?clientId={EPIC_CLIENT_ID}&responseType=code"
auth_url = "https://www.epicgames.com/id/login?redirectUrl=" + urllib.parse.quote(redirect, safe="")
```

Callback: consume state (400 if missing); pick node (400 if none); `status, data = proxy_epic_auth(server, code)`; return `Response(data, status=status)` — do not read `refresh_token` even if the node misbehaves; if present, strip before returning:

```python
if isinstance(data, dict):
    data.pop("refresh_token", None)
```

Disconnect: pick node; if none 400; proxy DELETE; 200 `{"message": "Epic account unlinked successfully"}`. Do not touch `UserEpicGame`.

Do not log `request.data`.

- [ ] **Step 1: Write `test_oauth_epic.py`**

Pattern from `test_oauth_steam.py`: create user, Token auth, `APIClient`.

```python
def _node(user, **kwargs):
    from django.utils import timezone
    from apps.library.models import UserGameServer
    defaults = dict(name="nas", local_url="http://127.0.0.1:8090", is_online=True, is_active=True, last_seen_at=timezone.now())
    defaults.update(kwargs)
    return UserGameServer.objects.create(user=user, **defaults)

class EpicInitiateTests(TestCase):
    def test_400_without_node(self): ...
    def test_200_with_online_node_stores_state(self):
        # assert OAuthState.payload["flow"] == "epic-link"
        # assert "epicgames.com/id/login" in response.data["auth_url"]

class EpicCallbackTests(TestCase):
    @patch("apps.library.services.game_server.server_proxy_request", return_value=(200, {"connected": True, "account_id": "acc", "display_name": "D", "refresh_token": "leak"}))
    def test_strips_token_and_does_not_write_user(self, _proxy):
        # user has no epic_* attrs; response has no refresh_token
        self.assertFalse(hasattr(self.user, "epic_refresh_token") and getattr(self.user, "epic_refresh_token", None))

class EpicOauthListTests(TestCase):
    def test_auth_oauth_still_five_providers(self):
        response = self._authed().get("/api/v1/auth/oauth")
        self.assertEqual([p["name"] for p in response.data["providers"]], ["steam", "plex", "tmdb", "google", "google_drive"])
```

- [ ] **Step 2: Run — FAIL**

Run: `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test python manage.py test apps.accounts.tests.test_oauth_epic -v 2`

- [ ] **Step 3: Implement pick/proxy, oauth helpers, views, urls** (`path("oauth/epic", ...)`, `oauth/epic/callback`, `oauth/epic/disconnect`)

Export views from `accounts/views/__init__.py`.

- [ ] **Step 4: Re-run — PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/apps/library/services/game_server.py backend/apps/accounts backend/apps/accounts/tests/test_oauth_epic.py
git commit -m "feat: proxy Epic OAuth through the user's Otix Server"
```

---

### Task 5: Scan upsert

**Files:**
- Create: `backend/apps/integrations/services/epic.py`
- Create: `backend/apps/integrations/views/epic.py`
- Modify: `backend/apps/integrations/views/__init__.py`, `urls.py`, `services/__init__.py`
- Test: `backend/apps/integrations/tests/test_epic_scans.py`

**Interfaces:**
- Consumes: `pick_online_game_server`, `proxy_epic_scan`, `proxy_epic_status`, `UserEpicGame`, `ExternalID`
- Produces:
  - `def scan_epic_library(user) -> dict` → `{total_in_epic, matched_in_otix, failed}`
  - `EpicStatusView` GET `/integrations/epic/status`
  - `EpicLibraryScanView` POST `/integrations/epic/scan`

Match helper (same file):

```python
def _epic_external_id_map(ids: list[str]) -> dict[str, int]:
    rows = ExternalID.objects.filter(
        content_type=_media_content_type(),
        provider="epic",
        external_id__in=[i for i in ids if i],
    ).values_list("external_id", "object_id")
    return {ext: media_id for ext, media_id in rows}
```

For each game, media_id = map.get(catalog_item_id) or map.get(offer_id) or map.get(app_name).

Scan: no node → raise `ValueError(NO_EPIC_NODE)` view 400; proxy non-200 → if 400 return that detail, else 500 `"Failed to scan Epic library. Please try again."`; `games = data.get("games") or []`; upsert.

Status view: no node → 400 `NO_EPIC_NODE`; else proxy GET status, strip `refresh_token`, return.

- [ ] **Step 1: Tests** (extend `test_epic_scans.py`)

```python
@patch("apps.integrations.services.epic.proxy_epic_scan")
class EpicScanTests(TestCase):
    def test_matches_catalog_item_id(self, proxy):
        proxy.return_value = (200, {"games": [{"app_name": "Jaguar", "catalog_item_id": "c1", "offer_id": "o1", "namespace": "fn", "title": "Rocket League"}]})
        # create MediaItem + ExternalID provider=epic id=c1
        # POST /api/v1/integrations/epic/scan
        # assert matched_in_otix == 1; UserEpicGame.media_item_id set

    def test_500_keeps_rows(self, proxy):
        # existing UserEpicGame; proxy returns (500, {"detail": "boom"}); count unchanged

    def test_400_without_node(self):
        # no UserGameServer; 400 detail == NO_EPIC_NODE
```

Need an online node in scan tests so pick succeeds; mock only `proxy_epic_scan`.

- [ ] **Step 2: Run — FAIL**

Run: `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test python manage.py test apps.integrations.tests.test_epic_scans -v 2`

- [ ] **Step 3: Implement service + views + urls** (`path("epic/status", ...)`, `path("epic/scan", ...)`)

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/apps/integrations
git commit -m "feat: scan Epic library via Otix Server and match catalog IDs"
```

---

### Task 6: Library read API

**Files:**
- Create: `backend/apps/library/services/epic.py`
- Modify: `backend/apps/library/services/__init__.py`, `views/library.py`, `views/__init__.py`, `urls.py`, `serializers/library.py`
- Test: `backend/apps/library/tests/test_epic_library.py`

**Interfaces:**
- Produces:
  - `get_epic_library(user, *, cursor, limit) -> tuple[list[MediaItem], bool, str | None]`
  - `get_unmatched_epic_games(...)` → `list[UserEpicGame]`
  - `get_epic_status(user) -> dict` `{game_count, last_scanned_at}` ISO or null
  - Cursor: integer `UserEpicGame.id`. Filter `id__gt=int(cursor)` after `order_by("title", "id")` for matched (only rows with `media_item`). Unmatched: `media_item__isnull=True`, same order. Invalid cursor ignored.
  - Serializer unmatched: `id`, `app_name`, `epic_name` (title), `namespace`, `catalog_item_id`, `offer_id`
  - Matched uses `MediaItemSummarySerializer` + `_media_list_payload` like Steam (no steam overlays)
  - Routes **before** `<tab>`: `epic`, `epic/status`, `epic/unmatched`
  - Unlike Steam, do **not** 404 when unlinked — empty list / zero count (token is on the node)

- [ ] **Step 1: Write `test_epic_library.py`**

Create two matched games and one unmatched; first page limit=1 returns `has_more` and next_cursor = first row id; second page uses that cursor.

- [ ] **Step 2: Run — FAIL**

Run: `cd backend && DJANGO_SETTINGS_MODULE=config.settings.test python manage.py test apps.library.tests.test_epic_library -v 2`

- [ ] **Step 3: Implement**

Use `enrich_media_items` like Steam library.

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/apps/library
git commit -m "feat: add /library/epic read surfaces"
```

---

### Task 7: Integrations UI + paste modal

**Files:**
- Create: `frontend/src/features/settings/components/organisms/epic-code-modal.tsx`
- Modify: `frontend/src/features/settings/pages/settings-integrations-page.tsx`
- Test: `frontend/src/features/settings/__tests__/settings-integrations-modals.test.tsx`

**Interfaces:**
- Consumes: `useModal`, `DkDialog`, `DkButton`, `openExternal`, `isDesktop`, `apiClient`, `useGameServers`, Epic SVG at `@/assets/provider-logos/epic.svg?react`
- Produces: Epic `integrationDefs` entry `id: 'epic'`

`EpicCodeModal` props: `{ authUrl: string, state: string, onClose: () => void, onLinked: () => void }`

Submit: POST `/auth/oauth/epic/callback` `{ code: paste, state }`. Button "Open Epic login" calls `openExternal(authUrl)` again.

Connect handler:

```ts
const hasOnlineNode = gameServers.some((s) => s.isOnline)
if (!hasOnlineNode) { setEpicError('Connect an Otix Server to link Epic.'); return }
const { data } = await apiClient.post('/auth/oauth/epic')
const authUrl = data.authUrl || data.auth_url
const state = data.state
if (isDesktop() && window.desktopAPI?.plugin?.openOAuthWindow) {
  const win = await window.desktopAPI.plugin.openOAuthWindow(authUrl, 'id/api/redirect')
  if (!win?.success || !win.code) { setEpicError(win?.error || 'Login cancelled'); return }
  await apiClient.post('/auth/oauth/epic/callback', { code: win.code, state })
  await fetchEpicStatus()
  return
}
openExternal(authUrl)
openModal(<EpicCodeModal ... />)
```

On mount (when authenticated): GET `/integrations/epic/status` for `connected` / `displayName` / `accountId`. 400 without node → connected false, keep hint.

Scan: POST `/integrations/epic/scan` (no body). Disconnect: DELETE `/auth/oauth/epic/disconnect`.

Brand: `#2a2a2a` / `bg-white/10`. Card sits after Steam in `integrationDefs`.

Connect button `disabled={!hasOnlineNode}` when disconnected.

- [ ] **Step 1: Test**

In `settings-integrations-modals.test.tsx` (or a new `settings-epic-connect.test.tsx` if that file is Arr-specific): render integrations with `mockGameServers = []`, expect Epic Connect disabled or the hint text. With an online server, Connect is enabled.

Mock GET `/integrations/epic/status` → `{ connected: false }`.

- [ ] **Step 2: `cd frontend && npm test -- src/features/settings/__tests__/settings-integrations-modals.test.tsx`** — FAIL until card exists

- [ ] **Step 3: Implement modal + card**

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/settings
git commit -m "feat: add Epic Integrations card with local-node OAuth"
```

---

### Task 8: Library Providers card + library page

**Files:**
- Modify: `frontend/src/features/plugins/components/organisms/plugin-slot.tsx`
- Modify: `frontend/src/features/settings/pages/settings-library-page.tsx`
- Test: `frontend/src/features/settings/__tests__/settings-library-page.test.tsx`

**Interfaces:**
- `EpicScanSlotCard` next to `SteamScanSlotCard` when `location === "library:scan"` (same connect/scan/disconnect as Integrations, can extract a tiny `useEpicLibrary()` hook in `plugin-slot.tsx` or duplicate the fetch — prefer a hook file `frontend/src/features/settings/hooks/use-epic-library.ts` used by both Task 7 and 8 if Task 7 did not already add it; if Task 7 inlined, extract now).
- Filter: `slotData.filter((entry) => entry.pluginId !== 'otix-epic')`
- Library page `fetchGames`: also `fetchAllLibraryPages('/library/epic')` and `/library/epic/unmatched`. Map like Steam with `platform: 'epic'`, `providerName: 'epic'`. Unmatched uses `epic_name` as title.

- [ ] **Step 1: Extend `settings-library-page.test.tsx`** so the mocked client records `/library/epic` and `/library/epic/unmatched` URLs (add empty list responses). Assert those URLs were requested.

- [ ] **Step 2: Run frontend test — FAIL** (URLs not requested)

- [ ] **Step 3: Implement fetch + maps + EpicScanSlotCard + plugin filter**

- [ ] **Step 4: PASS `cd frontend && npm test -- src/features/settings/__tests__/settings-library-page.test.tsx`**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/plugins/components/organisms/plugin-slot.tsx frontend/src/features/settings
git commit -m "feat: show Epic in Library Providers and the library grid"
```

---

## Spec coverage

| Spec section | Task |
|---|---|
| Node secrets file + parse/exchange/scan | 1–2 |
| Node routes | 2 |
| No User columns / five-provider oauth list | 4 |
| Django proxy OAuth | 4 |
| UserEpicGame + scan match | 3, 5 |
| `/library/epic*` | 6 |
| Integrations paste + desktop intercept | 7 |
| Library Providers card + filter plugin + library page | 8 |
| Errors: no node, bad code, dead refresh, 500 keeps rows | 2, 4, 5 |

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-09-18-epic-library-provider.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
