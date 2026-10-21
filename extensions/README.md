# Otix Plugin Marketplace

Community plugins for the [Otix](https://github.com/dksilv4/Otix) desktop app. Browse and install plugins directly from Otix Settings → Plugins → Browse Marketplace.

## Available Plugins

| Plugin | Description | Category |
|---|---|---|
| [shadPS4 Emulator](plugins/shadps4/) | PlayStation 4 emulator integration for .pkg ROMs | emulator |
| [Jellyfin](plugins/jellyfin/) | In-app video streaming and library integration | media |

## Plugin Structure

Each plugin lives under `plugins/<id>/` and requires:

```
plugins/my-plugin/
  manifest.json    # Plugin metadata, permissions, config schema
  main.js          # Plugin entry point (CommonJS)
```

See [shadPS4 Emulator](plugins/shadps4/) for a complete example.

## Adding Your Plugin

1. Fork this repo
2. Create a directory under `plugins/<your-plugin-id>/`
3. Add `manifest.json` and `main.js`
4. Add your plugin entry to `registry.json`
5. Open a PR

### manifest.json

```json
{
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "What it does",
  "author": "Your Name",
  "repository": "https://github.com/dksilv4/otix-plugins",
  "min_app_version": "0.3.0",
  "permissions": ["events:subscribe", "storage:local", "ui:settings"],
  "config": { "my_option": { "type": "string", "label": "My Option" } },
  "entry": { "main": "main.js" }
}
```

#### Config schema (`manifest.config`)

Declare every user-facing setting here — the settings UI auto-generates a
form from this schema (Settings → Plugins → plugin → Configure, and any
`config: true` settings tab). Supported field types:

| `type` | Meaning | Notes |
|---|---|---|
| `string` | Text | `pattern`, `min`, `max`, `placeholder` |
| `secret` | Masked text (password) | Reveal toggle in UI |
| `number` | Number input | `min`, `max`, `step` |
| `boolean` | Toggle switch | |
| `enum` | Choice of plain string values | `values: ["a", "b"]` |
| `select` | Choice with labels | `values: [{ value, label }]` |
| `list` | Repeating rows | `items: { <field>: <PluginConfigField> }` |
| `path-list` | List of folders with native folder picker | |
| `object` | Nested group of fields | `items` = sub-schema |
| `uuid` | Auto-generated id | |
| `instances` | Managed server-instance list | `connection`, `items` (see below) |
| `serverUrl` | Single URL input (instances item) | `parts` = payload keys it maps to |

All fields accept: `label` (required), `description`, `default`, `required`,
`advanced` (collapses under an "Advanced" toggle), `placeholder`, `section`
(groups fields under a named heading), `order` (stable sort within a
section), `sensitive` (mask in UI), and `if: { field, equals | not | truthy }`
(conditionally show the field based on another field's value).

##### Instances (server-instance lists)

A plugin that talks to one-or-more external servers (Radarr, downloaders,
…) can declare an `instances` config field to get a full CRUD editor for
free: the UI shows a connect form with just what the plugin declares is
needed, probes the server, and offers any "fetchable" selectors as
dropdowns. The plugin declares everything — nothing is hardcoded per plugin:

```json
"config": {
  "instances": {
    "type": "instances",
    "label": "Radarr Instances",
    "connection": { "method": "probe", "fields": ["url", "apiKey"] },
    "items": {
      "name": { "type": "string", "label": "Name" },
      "url": {
        "type": "serverUrl",
        "label": "Server URL",
        "parts": ["host", "port", "useSsl", "baseUrl"]
      },
      "apiKey": { "type": "secret", "label": "API Key" },
      "qualityProfile": { "type": "string", "label": "Quality Profile", "fetchable": true },
      "rootFolder": { "type": "string", "label": "Root Folder", "fetchable": true },
      "autoRequestWatchlist": { "type": "boolean", "label": "Auto-request watchlisted movies" }
    }
  }
}
```

- `connection.fields` — item keys shown in the connect step (e.g. the URL +
  API key). `connection.method` (default `probe`) is called with those
  fields' values to verify the server and fetch selector options.
- `serverUrl` items render as a single URL input; `parts` lists the payload
  keys it expands to (canonical set: `host`, `port`, `useSsl`, `baseUrl`).
- `fetchable: true` items become dropdowns once connected, fed from the
  connection method's `options` keyed by item name.

Data methods the plugin must implement (fixed contract):

| Method | Args | Returns |
|---|---|---|
| `get-instances` | — | `Instance[]` |
| `add-instance` | `config` (payload) | `{ success, error? }` |
| `update-instance` | `{ id, config }` | `{ success, error? }` |
| `remove-instance` | `{ id }` | `{ success, error? }` |
| `test-instance` | `{ id }` | `{ ok, message? }` |
| `probe` | connection fields | `{ ok, version?, error?, options?: { <item>: [{ value, label }] } }` |

Example with grouping and a path list:

```json
"config": {
  "installDir": {
    "type": "path-list",
    "label": "Install Directories",
    "description": "Folders to scan",
    "section": "Scan Sources",
    "order": 0
  },
  "notify": {
    "type": "boolean",
    "label": "Notify on completion",
    "section": "General",
    "order": 1
  },
  "authToken": {
    "type": "secret",
    "label": "Auth Token",
    "section": "Session",
    "order": 0,
    "advanced": true
  }
}
```

Config values are validated against this schema before they are written
(`validateConfig` in the desktop host); invalid values are rejected with
per-field errors surfaced inline in the form.

#### Settings tabs (`manifest.settings.tabs`)

Plugins can add their own page under Settings via `settings.tabs`. Each tab
has `sections`; a section either renders a dynamic slot or the plugin's
config schema as an auto-generated form:

```json
"settings": {
  "tabs": [{
    "id": "my-tab",
    "label": "My Tab",
    "icon": "star",
    "path": "/settings/my-tab",
    "sections": [
      { "id": "config", "label": "Settings", "slot": "", "config": true },
      { "id": "status", "label": "Status", "slot": "settings/my-tab/status" }
    ]
  }]
}
```

Use `"config": true` to bind a section directly to `manifest.config`
(auto-generated form). Use a `slot` section with `slotRender` to render
dynamic content (widgets).

### main.js

```javascript
// Plugins MUST export a default function (the entry point) AND a
// "test" function. Without a passing test, the plugin cannot be enabled.

const entry = function(ctx) {
  // Plugin context: ctx.config, ctx.events, ctx.db, ctx.api, ctx.fetch,
  //                 ctx.notifications, ctx.logger, ctx.handle, ctx.call,
  //                 ctx.host.emit, ctx.onDestroy

  ctx.logger.info('Plugin started');

  ctx.onDestroy(() => {
    ctx.logger.info('Plugin stopped');
  });
};

// ── Mandatory test export ─────────────────────────────────────────
// ALL plugins must export a "test" function. It runs before the plugin
// is enabled. Return { passed: boolean, failures?: string[] }.
//
// If passed is false, the plugin stays disabled and the failure reasons
// are shown to the user. If the test export is missing entirely, the
// plugin is rejected with a descriptive error.
entry.test = async function(ctx) {
  const failures = [];

  // Test core logic (pure functions, config validation, etc.)
  if (1 + 1 !== 2) failures.push('Math is broken');

  // Test external connectivity if needed (with timeout)
  // try { await ctx.fetch('https://example.com'); } catch { failures.push('Network unreachable'); }

  return { passed: failures.length === 0, failures };
};

module.exports = entry;
```

#### Test Requirements

Every plugin **must** export a `test` function. This is enforced at enable time:

| Rule | |
|---|---|
| **Signature** | `test(ctx) => Promise<{ passed: boolean, failures?: string[] }>` |
| **Runs** | Every time the plugin is enabled (startup + manual enable) |
| **Passing** | Return `{ passed: true }` (failures array empty or omitted) |
| **Failing** | Return `{ passed: false, failures: ['reason 1', 'reason 2'] }` |
| **Missing** | Plugin is rejected — "must export a test function" |
| **Timeout** | 60s (same as any RPC call). Keep tests fast. |

Good tests check: config schema assumptions, pure function correctness, required binaries exist (don't crash), edge cases (empty input, null values). Avoid: long network calls, spawning real processes that may hang.

#### Optional: config connection test

For plugins that want a user-initiated connection test (e.g., "Test Connection" button in settings), the same `test` function can handle it — the settings UI calls it with a config draft:

```javascript
entry.test = async function(ctx, configDraft) {
  // Called with a config draft ("Test Connection" button in settings).
  // This variant MUST return { success, message } — the app reads those
  // keys directly (not passed/failures).
  if (configDraft) {
    try {
      const res = await ctx.fetch(configDraft.url + '/api/status');
      if (res.status !== 200) return { success: false, message: 'HTTP ' + res.status };
      return { success: true, message: 'Connected' };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }
  // Called without args (enable-time) — return { passed, failures }
  return { passed: true };
};
```

**Note:** enable-time (`test(ctx)` with no draft) returns `{ passed, failures }`; the connection-test variant (`test(ctx, configDraft)`) returns `{ success, message }`.

### registry.json Entry

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "What it does",
  "author": "Your Name",
  "repository": "https://github.com/dksilv4/otix-plugins",
  "path": "plugins/my-plugin",
  "category": "media",
  "tags": ["example"],
  "permissions": ["events:subscribe", "storage:local"]
}
```

## Plugin Author Notes (framework gotchas)

These are behaviors of the Otix desktop plugin host that are easy to get wrong. Read before building a plugin.

### `ctx.fetch` is not a real `fetch` Response

`ctx.fetch(url, init)` resolves to a plain object — `{ status, statusText, headers, body }` where `body` is a **string**. There is no `.ok`, no `.json()`, no `.text()`. Always check `res.status` and parse the body yourself:

```javascript
const res = await ctx.fetch('https://api.example.com/v1/thing');
if (res.status !== 200) throw new Error('HTTP ' + res.status);
const data = res.body ? JSON.parse(res.body) : null;
```

All `ctx.config.get/set`, `ctx.db.*`, and `ctx.fetch` calls are RPC round-trips and return Promises — `await` them even though the type definitions look synchronous.

### OAuth / "Sign In" button

The settings panel only shows the Sign In button when the plugin declares at least one slot: `"slots": [{ "location": "settings", "label": "..." }]`. The login flow is:

1. Frontend calls `data['auth.getLoginUrl']` (no args) → return `{ url, redirectPattern, tokenExtraction }`.
2. Frontend opens an Electron `openOAuthWindow(url, redirectPattern, tokenExtraction)` which captures a `code`/`authorizationCode` from the redirect URL.
3. Frontend calls `data['auth.handleCallback']` with that code → exchange it for tokens, store via `ctx.config.set`.

For OAuth providers that redirect to a local callback (Spotify, Google), use a loopback redirect such as `http://127.0.0.1:8765/callback`, set `redirectPattern` to `127.0.0.1:8765` (the `url-param` extractor reads the `code` from the URL before the page loads), and register that exact URI in your provider's app config. Because `getLoginUrl` receives no arguments, multi-provider plugins should use a state machine (e.g. return the URL for whichever provider is not yet authenticated). Tokens stored via `ctx.config.set` are plaintext in SQLite — treat them as secrets, not as encrypted storage.

### `scan` / `scan.status`

Exposing `data['scan']` and `data['scan.status']` gives the plugin a Scan button (with live progress bar) in the settings panel once `status().connected`/`authenticated` is true. Return `{ phase, current, total }` from `scan.status` for progress. Also return `connected: true` from `status()` even if auth is the only thing configured, so the Scan button appears.

### `status()`, `test()`, `slotRender()` signatures

- `status(ctx)` → object; `connected: true` or `authenticated: true` marks the plugin connected in the UI.
- `test(ctx)` (enable-time, no args) → `{ passed, failures }`. A failing test here is **warn-only** in the current host, but a missing `test` export is logged as an error.
- `test(ctx, configDraft)` (Test Connection button) → `{ success, message }`.
- `slotRender(ctx, location, context)` → `{ widgets: [] }` (return empty if you only declared slots to enable the auth section).

### `ctx.onDestroy` is a stub

`ctx.onDestroy(cb)` does nothing in the current host — the callback is never invoked. Don't rely on it for cleanup. Interval timers die when the worker is terminated on plugin disable, so `setInterval`-based background work is safe as-is; just don't expect a shutdown hook.

## Permissions

| Permission | Description |
|---|---|
| `api:proxy` | Read/write Otix data via authenticated API |
| `network:external` | Connect to external services (Radarr, Sonarr, etc.) |
| `events:subscribe` | Listen for Otix events (ratings, watched, list changes) |
| `storage:local` | Store data in local SQLite database |
| `ui:settings` | Register a settings page |
| `notifications` | Send desktop notifications |
| `worker:compute` | Contribute compute as a worker |

## Registry URL

```
https://raw.githubusercontent.com/dksilv4/otix-plugins/main/registry.json
```
