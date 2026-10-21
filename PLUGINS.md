# Plugins in Otix

The word "plugins" appears in multiple directories. This document maps each one.

---

## `backend/plugin_framework/`
**What:** Django app — the server-side plugin host, gateway, IPC server, and registry.
This is the *framework* that runs and manages plugins on the backend. It handles
plugin registration, permissions, access tokens, and the IPC socket that the desktop
plugin-runtime connects to.

**Not:** Plugin packages themselves.

---

## `backend/bundled_plugins/`
**What:** First-party server-side plugins that ship with the app (currently `plex/`).
These are discovered automatically by `plugin_framework` on startup.

---

## `desktop/plugin-runtime/`
**What:** Electron plugin runtime — the sandbox manager, worker thread, OAuth window,
IPC bridge, manifest validator, and permission enforcer that runs inside the Electron
main process. This is the *engine* that loads and isolates plugin JS packages.

**Not:** Plugin packages themselves.

---

## `extensions/plugins/`
**What:** The canonical desktop community and system plugin packages — fully built JavaScript modules
that the desktop plugin-runtime loads and executes.

| Plugin | Purpose | Status |
|---|---|---|
| `fps-capture` | Intel PresentMon FPS logging + playtime tracking on Windows | Active (System) |
| `local-files` | Local filesystem scanner for installed games, ROMs, repacks, and Steam ACF manifests | Active (System) |
| `jellyfin` | In-app video streaming, session reporting, and playback provider | Active |
| `shadps4` | PlayStation 4 emulator integration for `.pkg` ROM launching and saves | Active |

### Migrated / Retired Plugins
- **`radarr` / `sonarr`**: Migrated directly to Otix Node (`node/internal/arr/`) and backend services.
- **`sabnzbd`**: Migrated directly to Otix Node (`node/internal/usenet/`).
- **`prowlarr` / `nzbplanet`**: Migrated directly to Otix Node (`node/internal/indexer/`).
- **`downloads`**: Download management and installer orchestration absorbed natively into Otix Desktop (`desktop/downloads`, `desktop/installer`) and Otix Node (`node/internal/organize`).
- **`otix-epic`**: Epic Games authentication, library syncing, and store integration migrated natively to backend and Otix Node (`node/internal/epic`).
- **`deals` / `steam`**: Free game tracking migrated to Otix Node (`node/internal/plugins/deals.go`) and server-side deals sync.
- **`plex`**: Desktop plugin retired in favor of backend Plex integration (`backend/bundled_plugins/plex` & `backend/apps/library/`).
- **`game-matching-pipeline` & catalog sources (`steam-source`, `steamgriddb-source`, `igdb-source`)**: Replaced by full server-side catalog matching in the Otix Backend and Otix Node metadata services.

---

## `frontend/src/features/plugins/`
**What:** The frontend React UI for the plugins settings page — the page where users
install, configure, and manage plugins in the browser/desktop UI.

---

## Writing a new plugin
See `extensions/README.md` for the full authoring guide.
