# Unified Arr instances

- **Date:** 2026-09-18
- **Status:** Draft (awaiting review)
- **Scope:** One instance list per Arr app across desktop plugins, every connected Otix Server node, and a reserved backend-as-node origin. SABnzbd and Prowlarr get real `instances[]` like Radarr/Sonarr. Aliases to the same install collapse; distinct installs stay separate.

## 1. Decisions

1. **Logical app + endpoints.** A Radarr/Sonarr/SABnzbd/Prowlarr *instance* is one install. Each way Otix can reach it is an *endpoint* tagged with an origin (`desktop`, `node:<id>`, later `backend`).
2. **Stores stay split.** Desktop plugin config and each node’s config remain the source of truth for their own URLs. Saves write back to the origin being edited. A LAN-only URL is never copied onto a node that cannot reach it.
3. **Runtime prefers desktop.** If this client can talk to a desktop endpoint, use it. Otherwise use a reachable node endpoint. Do not prompt per request.
4. **No identity database yet.** Merge in a shared client module from origin configs. Persist merged identities on the user account only when backend-as-node lands.
5. **N nodes now.** Merge every connected game server, not `servers[0]`. Backend-as-node is the same shape with `origin.type = 'backend'`, unused until that work exists.

## 2. Why not keep today’s split

Today the desktop plugin and the node each have their own Radarr/Sonarr/SAB config. Request/library status prefer the node when it has a ready instance; Library Arr tabs prefer the desktop plugin if the plugin API exists; watchlist auto-request still fires on the desktop plugin. The same Radarr at `localhost:7878` and `nas.local:7878` can look like two apps, or the UI can hide one path and keep using the other.

SABnzbd and Prowlarr are single-config on the node (`UsenetConfig.sabnzbd` / `.prowlarr`). Desktop SAB also lives in the SAB plugin plus the downloads SQLite row.

That does not survive multiple nodes or backend-as-node.

## 3. Shape

```ts
type ArrApp = 'radarr' | 'sonarr' | 'sabnzbd' | 'prowlarr'

type ArrOrigin =
  | { type: 'desktop'; pluginId: string } // radarr, sonarr, sabnzbd; downloads sqlite uses pluginId 'downloads'
  | { type: 'node'; serverId: number }
  | { type: 'backend' } // reserved

type ArrEndpoint = {
  origin: ArrOrigin
  originInstanceId: string
  host: string
  port: number
  useSsl: boolean
  urlBase: string
  hasApiKey: boolean
  reachable?: boolean
}

type MergedArrInstance = {
  id: string          // stable UI id from fingerprint
  app: ArrApp
  name: string
  fingerprint: string
  enabled: boolean
  endpoints: ArrEndpoint[]
}
```

Node Radarr/Sonarr already have `instances[]`. Add the same list to node SABnzbd and Prowlarr. Keep the current flat fields as a projection of `resolve()` (first enabled instance) so older clients keep working.

Desktop Radarr/Sonarr plugins already have `instances`. Add `instances[]` to the SABnzbd plugin. The desktop downloads SQLite SAB row is a second desktop endpoint (`pluginId: 'downloads'`), merged if it is the same install.

Prowlarr has no desktop plugin today. Node `instances[]` is enough until a desktop or backend origin exists.

## 4. Fingerprint (same install vs alias)

Merge two endpoints only when they are the same running install. Different URLs are not enough, and not a reason to keep them separate.

**Primary:** exact API key, when both sides actually have the key (desktop plugin storage, node disk, save payload). Never treat redacted `"***"` as a key.

**Secondary:** live install identity after a successful test:

- Radarr / Sonarr / Prowlarr: `GET /api/v3/system/status` → `appName` + `appData` (startup data directory). Same appData means same install even if one URL is loopback and the other is the LAN hostname.
- SABnzbd: no stable install UUID. API key is the fingerprint. If the key is redacted, do not merge desktop loopback with a node LAN host.

**Same-origin URL collapse only:** on *one* origin, canonicalize host/port/url_base/scheme (reuse `parseServiceAddress` / `build_arr_base_url`) and drop duplicate rows that are the same link written two ways (`nas:7878` vs `http://nas:7878/radarr` after parse). That is duplicate config hygiene, not cross-origin identity.

**Do not merge** loopback (`localhost`, `127.0.0.1`) on desktop with a node hostname unless primary or secondary matched. Those are often different networks.

Failed or timed-out probes do not merge and do not mark the other endpoint unreachable.

`MergedArrInstance.id` = `sha256(app + "\n" + fingerprint).slice(0, 16)` so the same install keeps the same UI id across reloads when the fingerprint is known. If an endpoint has no fingerprint yet (empty key, no probe), it stays a singleton until it can match.

## 5. Data flow

```
desktop plugin configs + downloads sqlite     node 1 config     node N config
                \                                  |                  /
                 \                                 |                 /
                  ---- shared mergeArrInstances(app, sources) ----
                                      |
                         unique MergedArrInstance[]
                                      |
         settings UI          request/search/queue          library tabs
```

One module owns merge, pick, and save routing: `frontend/src/features/downloads/arr-merge.ts`. Settings, Request, Library Arr tabs, game search, and download queue all consume it. No more `servers[0]` or `if (desktopAPI) return` short-circuits that drop the other origin.

### Pick endpoint (runtime)

1. Desktop endpoint for this instance, if present and `reachable !== false` (probe on first use if unknown).
2. Else any node endpoint whose game server is online and `reachable !== false`.
3. Else error: not reachable from this client.

Call the origin’s existing transport: plugin `callData` / desktop IPC for desktop; `/library/servers/:id/...` for a node. Do not invent a new proxy.

### Save

Editing an endpoint writes only to that origin’s store (existing save APIs). Changing the desktop URL does not update the node copy. Changing the API key on one endpoint does not automatically rewrite the other origin — the user may be fixing one side; the next merge will collapse them again if keys then match.

Adding an instance: if both desktop and at least one node exist, the add action is origin-aware (default: the origin of the settings surface the user is in; Integrations node modal → that node; desktop plugin tab → desktop). If only one origin exists, add there.

Deleting an endpoint deletes that origin’s row. If other endpoints remain, the merged instance stays. Deleting the last endpoint removes the instance from the UI.

### Request / auto-request once

Watchlist auto-request and the Request button must not send the same title to the same fingerprint twice (desktop plugin *and* node). One `pickEndpoint` call per merged instance. Auto-request only runs where an origin can execute it (desktop plugin events today; node-side jobs are out of scope).

## 6. UI

Reuse `ArrInstanceSwitcher` and the existing integration modals. Do not add a new modal framework.

- Show the instance switcher **only when** `merged.length > 1` for that app.
- One card per app (Radarr, Sonarr, SABnzbd, Prowlarr) lists unique installs.
- A merged instance with several endpoints still looks like one instance. Connection fields edit the **preferred** endpoint (same order as pick: desktop, else node). If there are two or more endpoints, a compact origin control lets the user edit the other path without creating a second instance.
- Connected badge is true when any endpoint is configured (`hasApiKey`).
- Plugin settings tabs (`/settings/radarr`, etc.) render the same merged list, not a second desktop-only form that diverges from Integrations.

## 7. Node SABnzbd / Prowlarr instances

Mirror `RadarrConfig`:

- `SabnzbdInstance` / `ProwlarrInstance` with `id`, `name`, `enabled`, connection fields, plus SAB path/category fields and Prowlarr `categories`.
- `UsenetConfig.sabnzbd` / `.prowlarr` gain `instances: []` and a `resolve(instance_id=)` like Radarr.
- Validator: if `instances` is empty and legacy flat fields are set, migrate to one `default` instance.
- After sync, flatten `resolve()` back onto the top-level fields.
- GET config redacts keys per instance (`***`, `has_api_key`).
- Search / queue / download accept optional `instance_id` (default: first enabled), same pattern as Radarr lookup.

Desktop SAB plugin: `instances` in manifest config, same migration from flat `host`/`port`/`apiKey`.

## 8. Error handling

- Missing API key: instance is listed but not ready; Request/search ignore it (`readyArrInstances` already does this).
- Probe failure: that endpoint `reachable: false`; other endpoints of the same instance still usable.
- Node offline: drop that origin from pick, keep desktop and other nodes.
- Save conflict: origin APIs stay last-write-wins as today; merge is read-time.

## 9. Testing

Pure merge tests (no network):

- Same API key, `localhost` vs `nas.local` → one instance, two endpoints.
- Different API keys, same host:port → two instances.
- Loopback vs LAN, keys redacted, no probe identity → two instances.
- `"***"` does not match `"***"`.
- Same-origin duplicate URLs after parse → one endpoint.
- Two nodes + desktop, one shared key and one unique 4K Radarr → two merged instances; switcher visible.
- One unique install → switcher hidden.
- `pickEndpoint`: desktop reachable wins; desktop unreachable falls through to online node.
- Save stub: patch targets the edited origin only.

Server tests:

- SAB/Prowlarr legacy flat config migrates to `instances[0]`.
- Serialize redacts per-instance keys.
- `instance_id` on search/queue/download selects the right client.

UI tests:

- Integrations/settings use merged length for the switcher.
- Library Arr tabs include node libraries when the desktop plugin is present but empty / other origin only.
- Request widgets come from merged instances, not “node if present else plugin”.

## 10. Out of scope

- Persisting fingerprints on Django / user account.
- Implementing backend-as-node (the origin type is reserved only).
- Lidarr.
- Copying configs between networks.
- Changing Arr/SAB themselves.

## 11. Later (backend-as-node)

Django stores the same endpoint list on the user (or a “local node” record for the brain). Merge gains a `backend` source. No new UI model: it is another origin on `MergedArrInstance.endpoints`.
