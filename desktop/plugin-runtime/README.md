# desktop/plugin-runtime

**Electron plugin runtime — sandbox manager, worker, IPC bridge, OAuth window.**

This is the *engine* that loads, isolates, and runs plugin JS packages inside
Electron. It is not the plugin packages themselves (those live in
`extensions/plugins/`).

---

## What it does

- **`manager.ts`** — lifecycle manager: install, enable, disable, uninstall, reload; owns the worker pool
- **`worker.ts` / `worker-bridge.ts`** — Node.js worker thread sandbox that executes plugin JS in isolation; SQL table scoping
- **`ipc.ts`** — IPC handlers that expose plugin capabilities to the renderer process
- **`oauth-window.ts`** — Electron `BrowserWindow` OAuth flow for plugins that need user auth
- **`permissions.ts`** — enforces declared permission grants at runtime
- **`manifest-validation.ts`** — validates `manifest.json` against the JSON schema
- **`marketplace.ts`** — fetches the remote plugin registry for the marketplace UI
- **`event-bus.ts`** — internal event bus for plugin lifecycle events
- **`types.ts`** — shared TypeScript types for the plugin system

## See also
- `PLUGINS.md` at the repo root — full map of all plugin-related directories
- `extensions/README.md` — plugin authoring guide
