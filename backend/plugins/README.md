# plugins/

Server-side plugin framework (host) + the Django app that hosts it.

A server plugin is a **drop-in folder**: `manifest.yaml` (schema mirrors
`desktop/plugins/types.ts`) + `plugin.py` (defines a `Plugin` subclass exposing
data methods). The brain discovers plugins from a root directory, validates
their manifests, and runs them natively — no Node service. See the package
docstring + ARCHITECTURE.md "Plugins framework" for the conventions.

Modules (plain-Python core, importable by plugin code without Django):
- `manifest.py`    — YAML schema + validation (name/version/permissions/entry/…)
- `permissions.py` — capability-token vocabulary + grant math (`table:*` / `network:*`)
- `base.py`        — `Plugin` base, data-method dispatch, JSON-safe output
- `discovery.py`   — scan a plugins root; one broken plugin never blocks the rest
- `registry.py`    — load entry modules and hold live `Plugin` instances

Django-only state layer (API owns rows; the separate host process runs code):
- `models.py`      — `Plugin` registry row: manifest snapshot, enabled, granted
                     permissions, config/instances; `PluginStore` (per-plugin
                     JSON key/value backing the `storage:local` service)
- `services.py`    — register/scan/enable/disable/uninstall; enable gates on
                     grants (declared ⊆ granted)
- `admin.py`       — operator edits state only; manifest fields are read-only
- `management/commands/plugins_*` — `occ app:*` analogs: scan / enable /
                     disable / uninstall / list (DB-only, never load code)

Host process (separate from the API; runs plugin *code*):
- `host.py`        — `PluginHost`: reads DB rows, loads enabled entry modules
                     into a registry, runs lifecycle hooks, writes errors back,
                     reconciles registry↔DB on `sync()`
- `events.py`      — publishes `plugin.loaded` / `plugin.unloaded` /
                     `plugin.error` to a Redis channel as the host reconciles
                     (best-effort, fail-open: unset/down Redis never blocks the
                     host — DB rows stay the source of truth)
- `framework.py`   — grant-gated services the host injects onto a plugin fresh
                     on every dispatch: `HttpService` (outbound http/https,
                     `network:external`/`network:any`) and `StoreService`
                     (per-plugin JSON key/value, `storage:local`). An action the
                     operator did not grant raises `PluginPermissionDenied`, so
                     plugin code never gets a raw DB/network handle.
- `hostserver.py`  — internal control API on 127.0.0.1 + shared secret:
                     `/health`, `/plugins`, `/plugins/<id>/reload`,
                     `/plugins/reload-all`, `/plugins/<id>/call`
- `management/commands/plugin_host` — run the host service (`--port`,
                     `--sync-interval`; enable/disable converge without restart;
                     SIGTERM → clean stop for supervisors)

## Writing a plugin

```
my-plugin/           # folder name MUST equal manifest `name` (Nextcloud rule)
  manifest.yaml      # name, version, permissions, entry: {main: plugin.py}
  plugin.py          # from plugins.base import Plugin  →  class …(Plugin): …
  __init__.py        # makes the folder a package (required by discovery)
```

Data methods read operator config / make gated calls through `self.services`
(only what the manifest declares and the operator granted is usable):
`self.services.config`, `.instances`, `.http.get_json(url)`, `.store.set(k, v)`.
Declaring a permission does **not** grant it — the operator approves it on
enable, and the framework re-checks the grant before every service action.

## Bundled (first-party) plugins

Plugins Otix ships live in `../bundled_plugins/` (checked in, next to the repo
root) rather than the operator's gitignored `PLUGINS_ROOT`. `plugins_scan`
seeds them via `scan_bundled()` as **system** rows — auto-enabled, never
disabled/uninstalled (the Nextcloud shipped-apps analog). The host resolves a
plugin's folder across both roots, operator copy first, so an operator install
of the same name shadows the bundled one. `bundled_plugins/plex/` is the
reference plugin: a real Plex data source (manifest + `plugin.py`) that reads
`serverUrl`/`token` config and calls the Plex HTTP API through the gated
`HttpService`. End-to-end suite in `plugins/tests_plex.py`.

## Status

- **Increment 1 (done):** API-owned registry state. `plugins_scan --root …`
  registers folders as disabled rows; `plugins_enable` activates one after grant
  gating (declared ⊆ granted); admin edits operator fields only. State layer has
  its own suite (`plugins/tests_state.py`); core (manifest → discovery → load →
  dispatch) covered in `plugins/tests.py`.
- **Increment 2 (done):** host process. `manage.py plugin_host` boots
  `PluginHost`, loads enabled plugins, serves the internal control API. Host
  suite in `plugins/tests_host.py`.
- **Increment 3 (done):** API proxy. DRF routes under `api/v1/plugins/`
  (`hostclient.py` reaches the host; lifecycle/config are DB-only and work with
  the host down; `call`/`describe` proxy to it; `capabilities` announces the
  vocabulary). API suite in `plugins/tests_plugins_api.py`.
- **Increment 4 (done):** grant-gated framework services. The host hands a
  running plugin a typed surface instead of raw DB/network: `PluginServices`
  (`config`/`instances` refreshed each dispatch + `http`/`store` capability
  services) built by `build_services(row)`, injected before `enable()` and every
  data-method call. `HttpService` allowlists http(s) and caps response bodies;
  `StoreService` persists per-plugin JSON blobs (`PluginStore`). Every action is
  checked against the row's grants and a missing one raises
  `PluginPermissionDenied` server-side — a plugin that declares only
  `network:external` still cannot touch its store. Server-enforced today:
  `network:external` → `HttpService`, `storage:local` → `StoreService`
  (`table:*`/downloads grow this surface later). Framework suite in
  `plugins/tests_framework.py` (grant math on the services + enforcement through
  a real loaded plugin in the host).
- **Increment 5 (done):** reference Plex plugin end-to-end. `bundled_plugins/`
  root (checked in) + `scan_bundled()` seed first-party plugins as system rows;
  `plugins_scan` runs it by default. The host resolves folders across operator
  `PLUGINS_ROOT` and `BUNDLED_PLUGINS_ROOT` (operator copy wins). Ships
  `bundled_plugins/plex/` — a real Plex data source exercising config, the gated
  `HttpService`, JSON payloads and clear error envelopes. E2E suite
  (`plugins/tests_plex.py`) loads the actual shipped plugin and round-trips a
  data method against a fake Plex server; a live cross-process smoke
  (migrate → `plugins_scan` → `plugin_host` → `hostclient`) verified describe +
  call over the control API.
- **Increment 6 (done):** supervision + lifecycle events. `deploy/plugin-host.service`
  (systemd) + `deploy/plugin-host.supervisor.conf` run **only the host** —
  because plugin code lives in the host process, a bad plugin takes at most the
  host down and the supervisor restarts it (the host is stateless: it re-reads
  enabled rows from the DB on every boot). `plugin_host` routes SIGTERM to a
  clean stop. `plugins/events.py` publishes `plugin.loaded`/`unloaded`/`error`
  to Redis (`PLUGIN_EVENTS_URL`, channel `PLUGIN_EVENTS_CHANNEL`, default
  `otix.plugins.lifecycle`) as the host reconciles; emission is fail-open and
  disabled unless a URL is set. Events suite in `plugins/tests_events.py`.
  Plugin framework done — plugin work returns in a later increment
  (`table:*`-scoped data ops + a downloads registry).
