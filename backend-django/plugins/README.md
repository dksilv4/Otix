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
                     permissions, config/instances
- `services.py`    — register/scan/enable/disable/uninstall; enable gates on
                     grants (declared ⊆ granted)
- `admin.py`       — operator edits state only; manifest fields are read-only
- `management/commands/plugins_*` — `occ app:*` analogs: scan / enable /
                     disable / uninstall / list (DB-only, never load code)

## Writing a plugin

```
my-plugin/           # folder name MUST equal manifest `name` (Nextcloud rule)
  manifest.yaml      # name, version, permissions, entry: {main: plugin.py}
  plugin.py          # from plugins.base import Plugin  →  class …(Plugin): …
  __init__.py        # makes the folder a package (required by discovery)
```

## Status

- **Increment 1 (done):** API-owned registry state. `plugins_scan --root …`
  registers folders as disabled rows; `plugins_enable` activates one after grant
  gating (declared ⊆ granted); admin edits operator fields only. State layer has
  its own suite (`plugins/tests_state.py`); core (manifest → discovery → load →
  dispatch) covered in `plugins/tests.py`.
- **Increments 2–6 (next):** host process skeleton + control API, PluginAPI DRF
  proxy + host client + capabilities, grant-gated framework services, reference
  Plex plugin end-to-end, supervision/docs + Redis events.
