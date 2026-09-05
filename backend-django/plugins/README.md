# plugins/

Server-side plugin framework (host) + the Django app that hosts it.

A server plugin is a **drop-in folder**: `manifest.yaml` (schema mirrors
`desktop/plugins/types.ts`) + `plugin.py` (defines a `Plugin` subclass exposing
data methods). The brain discovers plugins from a root directory, validates
their manifests, and runs them natively — no Node service. See the package
docstring + ARCHITECTURE.md "Plugins framework" for the conventions.

Modules:
- `manifest.py`    — YAML schema + validation (name/version/permissions/entry/…)
- `permissions.py` — capability-token vocabulary + grant math (`table:*` / `network:*`)
- `base.py`        — `Plugin` base, data-method dispatch, JSON-safe output
- `discovery.py`   — scan a plugins root; one broken plugin never blocks the rest
- `registry.py`    — load entry modules and hold live `Plugin` instances

## Writing a plugin

```
my-plugin/
  manifest.yaml      # name, version, permissions, entry: {main: plugin.py}
  plugin.py          # from plugins.base import Plugin  →  class …(Plugin): …
  __init__.py        # makes the folder a package (required by discovery)
```

## Status

Foundation (manifest → discovery → load → dispatch) is in place and tested.
The §4 "plugin becomes a Django app" step (its own models/migrations/admin,
boot-time app registration) and the host admin/config API are later increments.
