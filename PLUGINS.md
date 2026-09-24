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
**What:** First-party server-side plugins that ship with the app (currently only `plex/`).
These are discovered automatically by `plugin_framework` on startup.

---

## `desktop/plugin-runtime/`
**What:** Electron plugin runtime — the sandbox manager, worker thread, OAuth window,
IPC bridge, manifest validator, and permission enforcer that runs inside the Electron
main process. This is the *engine* that loads and isolates plugin JS packages.

**Not:** Plugin packages themselves.

---

## `extensions/plugins/`
**What:** The canonical community plugin packages — fully built JavaScript modules
that the desktop plugin-runtime loads and executes. This is where all feature logic
for integrations lives.

| Plugin | Purpose |
|---|---|
| `downloads` | Orchestrates the full download lifecycle |
| `radarr` | Radarr movie import and watchlist |
| `sonarr` | Sonarr TV show import and watchlist |
| `sabnzbd` | SABnzbd Usenet download client |
| `prowlarr` | Indexer aggregator / search provider |
| `nzbplanet` | NZBPlanet Usenet search |
| `otix-epic` | Epic Games OAuth, library sync, free games |
| `steam` | Steam library scan + free promotions |
| `steam-source` | Resolves Steam AppIDs to titles + artwork |
| `igdb-source` | Matches games to IGDB canonical entries |
| `steamgriddb-source` | Fetches game art from SteamGridDB |
| `game-matching-pipeline` | Auto-resolves scanned games to known titles |
| `fps-capture` | Intel PresentMon FPS logging + playtime |
| `plex` | Plex library sync and remote playback |
| `otix-syncplay` | Spotify → YouTube Music sync |
| `deals` | CheapShark 100%-off game deal detection |
| `shared` | Internal utility lib (not a plugin — no manifest) |

**Not:** The plugin framework or runtime engine.

---

## `frontend/src/features/plugins/`
**What:** The frontend React UI for the plugins settings page — the page where users
install, configure, and manage plugins in the browser/desktop UI.

---

## Writing a new plugin
See `extensions/README.md` for the full authoring guide.
