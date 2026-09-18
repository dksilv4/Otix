# Epic Games library provider (web)

- **Date:** 2026-09-18
- **Status:** Approved
- **Scope:** First-class Epic library link + scan + read, using the unofficial launcher OAuth hack. Works in the web app. **Refresh tokens live only on the user’s Otix Server node** (the standalone `server/` daemon). The Django API and the browser never persist them.

## 1. Decisions

1. **Otix Server is the vault and the Epic HTTP client.** Same shape as Radarr/SABnzbd: secrets sit on the node’s disk; Django `server_proxy_request`s to it; the web UI never holds the refresh token.
2. **A connected node is required.** Connect and scan fail closed if the Otix user has no online `UserGameServer`. Copy: “Connect an Otix Server to link Epic.” Desktop intercept still posts the code through Django to that node.
3. **One Epic session per node in v1.** The secrets file is not keyed by Otix user. Household node = one Epic account. Two Otix users sharing one node share that session.
4. **Django never stores Epic credentials.** No `User.epic_*` columns. The authorization code transits Django once (callback → node). Node responses to Django omit `refresh_token`. Django must not log `code` or Epic bodies.
5. **Library rows may live in Django.** `UserEpicGame` is owned-game metadata. The node returns the game list; Django upserts and serves `/library/epic`.
6. **Launcher client hack stays.** Same public `launcherAppClient2` credentials as `extensions/plugins/otix-epic/main.js`. Those constants live **on the node**, which is what talks to Epic.
7. **Web pastes the code; desktop intercepts it.** Both POST the same authed Django callback. Django forwards `{ code }` to the node.
8. **Link-only.** Epic is not an Otix login provider. `GET /auth/oauth` stays five providers.
9. **Match what we already have.** Scan matches via `ExternalID` `provider="epic"` (IGDB category 26). No IGDB hydrate-on-scan in v1.
10. **Out of scope:** login-with-Epic, free games, local Epic manifests / install paths, DLC/beta classification, catalog poster enrichment, encrypting the node secrets file, multi-Epic-account-per-node, profile integration-visibility, 409 uniqueness across Otix users.

## 2. Why this split

Epic’s authorize URL lands on `epicgames.com/id/api/redirect` (JSON `{ authorizationCode }`). A web tab cannot read that page, and Epic’s token/library hosts have no CORS for Otix. The node can call Epic (server-side HTTP) and keep the refresh token on the user’s machine — not in cloud Postgres, not in `localStorage` (XSS). Django already proxies to nodes for Arr/Usenet; Epic is another proxied integration.

## 3. Data flow

```
Connect
  web:     POST /auth/oauth/epic → openExternal(auth_url) + paste modal
  desktop: POST /auth/oauth/epic → openOAuthWindow(auth_url, "id/api/redirect")
           → POST /auth/oauth/epic/callback { code, state }
           → Django verifies state, picks the user's online node
           → POST {code} to node /api/v1/epic/auth  (timeout 20s)
           → node exchanges with Epic, writes storage/epic.json
           → node returns { account_id, display_name, connected: true }  (no token)
           → Django returns that to the UI

Scan      POST /integrations/epic/scan
           → Django → node POST /api/v1/epic/scan
           → node refreshes, pulls library-service, returns games[]
           → Django upserts UserEpicGame, returns { total_in_epic, matched_in_otix, failed }

Read      GET /library/epic  (Django only; no node, no token)
```

## 4. Node secrets file

Path: `{config_dir}/storage/epic.json` (next to downloads/saves, **not** `config.yaml` so routine config dumps do not include it).

```json
{
  "account_id": "…",
  "display_name": "…",
  "refresh_token": "…"
}
```

- Mode `0600` when the OS allows.
- On refresh rotation, overwrite `refresh_token` in place.
- Disconnect deletes the file (or writes `{}` and unlinks).
- **Connected** = file exists and `refresh_token` is non-empty.

## 5. Otix Server API

New routes on the FastAPI node, same `auth_token` as every other `/api/v1/*` route. Launcher client id/secret/UA hardcoded in `server/otix_server/epic.py`.

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/v1/epic/status` | `{ connected, account_id, display_name }` from the secrets file. Never `refresh_token`. |
| POST | `/api/v1/epic/auth` | Body `{ code }`. Parse raw code or JSON with `authorizationCode`. Exchange with Epic. Write secrets file. Return status shape. |
| DELETE | `/api/v1/epic/auth` | Delete secrets file. 200 `{ connected: false }`. |
| POST | `/api/v1/epic/scan` | Refresh + paginate library-service. Return `{ games: [{ app_name, namespace, catalog_item_id, offer_id, title }] }`. Skip `UE_`, `QuixelBridge_`, `MetaHumanSample_`, `Lyra_`, `FabPlugin_` prefixes; dedup `app_name`. 400 if not connected; 400 `"Reconnect Epic"` if refresh `invalid_grant` (and delete the file). |

Do not attach the token to logs or HTTP error bodies.

## 6. Django API

### 6.1 Node pick

Reuse `UserGameServer` + `server_proxy_request` / `contact_urls`. Pick the user’s **online** node (same heartbeat window as the rest of library/server). If several are online, the most recently seen. If none: 400 `"Connect an Otix Server to link Epic."`

### 6.2 Auth routes

Under `/api/v1/auth/`. Authed. No User columns. No login family.

| Method | Path | Behavior |
|---|---|---|
| POST | `/auth/oauth/epic` | Store `OAuthState` (`flow="epic-link"`). Return `{ auth_url, state }`. `auth_url` is the launcher login URL (can be built in Django; no Epic HTTP). 400 if no online node. |
| POST | `/auth/oauth/epic/callback` | `{ code, state }` via `OAuthCallbackSerializer`. Consume state. Proxy `code` to node `/api/v1/epic/auth`. Return node status JSON. Map node 400/502 through. |
| DELETE | `/auth/oauth/epic/disconnect` | Proxy DELETE node `/api/v1/epic/auth`. Do **not** delete `UserEpicGame` rows. |

Login URL constants may live in Django **only** to build `auth_url`. Token exchange constants live on the node.

`GET /auth/oauth` unchanged (five providers). Integrations UI asks `GET /integrations/epic/status` (proxied node status) instead.

### 6.3 Scan and library

| Method | Path | Behavior |
|---|---|---|
| GET | `/integrations/epic/status` | Proxy node status. `{ connected, account_id, display_name }`. |
| POST | `/integrations/epic/scan` | Proxy node scan. Upsert `UserEpicGame` for `request.user`. Match `ExternalID` `provider="epic"` on `catalog_item_id`, then `offer_id`, then `app_name`. Return `{ total_in_epic, matched_in_otix, failed }`. |
| GET | `/library/epic` | Matched summaries, order `title` then `id`, cursor = integer row `id`. |
| GET | `/library/epic/unmatched` | Null `media_item`. Same cursor. |
| GET | `/library/epic/status` | `{ game_count, last_scanned_at }` from Django rows (independent of node token). |

Wire `/library/epic` before `<tab>`.

`UserEpicGame`: `user`, `media_item` (nullable), `app_name` (unique per user), `namespace`, `catalog_item_id`, `offer_id`, `title`. Table `user_epic_games`.

Library API failure on the node → Django 500, existing rows kept. No prune in v1.

## 7. UI

Reuse `DkDialog` / `useModal` and `IntegrationCard`. No new modal framework.

**Integrations card** (next to Steam, Epic SVG, brand `#2a2a2a`): `isConnected` from `GET /integrations/epic/status`. If no online game server, Connect is disabled with the Otix Server hint.

**Web connect:** initiate → `openExternal(authUrl)` → paste modal (`authorizationCode` or whole JSON) → callback.

**Desktop connect:** initiate → `openOAuthWindow(authUrl, "id/api/redirect")` → callback with captured code. No paste modal.

**Scan:** `POST /integrations/epic/scan` (no token in the body). Result line like Steam (`N matched / M total`).

**Disconnect:** `DELETE /auth/oauth/epic/disconnect`.

**Library Providers:** first-class `EpicScanSlotCard` beside Steam. Filter `pluginId === "otix-epic"` out of `library:scan`. Plugin files unchanged.

**Settings library page:** also fetch `/library/epic` and `/library/epic/unmatched`; map `platform: "epic"` into `deduplicateGames`.

## 8. Error table

| Case | HTTP / UI |
|---|---|
| No online Otix Server | 400 `"Connect an Otix Server to link Epic."` |
| Missing/unparseable code | 400 `"No authorization code provided"` |
| Epic rejects code | 400 `"Code expired or invalid. Sign in again."` |
| Node unreachable | 502 |
| Dead refresh on scan | Node deletes secrets; 400 `"Reconnect Epic"` |
| Library API failure | 500, rows kept |
| Unauthed | 401 |

## 9. Testing

No live Epic HTTP.

**Node (`server/tests/test_epic.py`):** auth writes `storage/epic.json` and status hides the token; scan skips `UE_` prefixes and returns games; invalid_grant deletes the file; status never includes `refresh_token`.

**Django oauth (`test_oauth_epic.py`):** initiate 400 without a node; initiate 200 with an online node; callback proxies code and does not write User columns; `GET /auth/oauth` still five providers.

**Django scan (`test_epic_scans.py`):** mock `server_proxy_request`; upsert + ExternalID match; cursor pagination; node 500 does not delete rows.

**Frontend:** paste raw code and JSON; desktop intercept posts code; Connect disabled without a game server; library page hits `/library/epic`.

## 10. Files

| Area | Touch |
|---|---|
| Node | `server/otix_server/epic.py`, routes in `api.py`, `server/tests/test_epic.py` |
| Django oauth | `apps/accounts/views/oauth.py`, `urls.py` (initiate builds login URL only) |
| Django proxy/scan | `apps/integrations/services/epic.py`, `views/epic.py`, `urls.py`; `library/services/game_server.py` thin wrappers |
| Models | `apps/integrations/models/epic.py` + migration |
| Library reads | `apps/library/services/epic.py`, `views/library.py`, `serializers/library.py`, `urls.py` |
| UI | `settings-integrations-page.tsx`, `plugin-slot.tsx`, `settings-library-page.tsx` |

No accounts User migration. No `localStorage` token helper.
