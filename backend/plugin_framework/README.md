# backend/plugin_framework

**Server-side plugin host, gateway, IPC server, and registry.**

This is the Django app that manages the plugin lifecycle on the backend. It is
the *framework* — not the plugin packages themselves (those live in
`extensions/plugins/`).

---

## What it does

- **Registry** (`registry.py`, `models.py`) — tracks installed plugins, versions, permissions, and config in the database
- **Host** (`host.py`, `hostserver.py`) — spawns and manages the plugin host subprocess; exposes a Unix/TCP IPC socket
- **Gateway** (`gateway.py`, `gateway_views.py`) — proxies authenticated plugin API calls from the frontend through Django
- **Manifest** (`manifest.py`) — parses and validates `manifest.json` files
- **Services** (`services.py`) — `scan_root`, `scan_bundled`, `scan_extensions` — discover and register plugins from disk
- **Permissions** (`permissions.py`) — codename-based permission grant/revoke
- **Events** (`events.py`) — Redis pub/sub for plugin lifecycle events

## Management commands

```bash
python manage.py plugin_host          # Start the plugin host process
python manage.py plugins_scan         # Scan and register plugins from disk
python manage.py plugins_list         # List registered plugins
python manage.py plugins_enable <id>  # Enable a plugin
python manage.py plugins_disable <id> # Disable a plugin
python manage.py plugins_token_create # Issue an access token
```

## Plugin locations scanned

| Directory | Contents |
|---|---|
| `backend/bundled_plugins/` | First-party plugins bundled with the app |
| `extensions/plugins/` | Community plugin packages |

## See also
- `PLUGINS.md` at the repo root — full map of all plugin-related directories
- `extensions/README.md` — plugin authoring guide
