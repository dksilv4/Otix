# Factorio Blueprint Plugin — Design Spec

**Date:** 2026-06-25
**Status:** Draft
**Author:** Otix

## Overview

A Factorio blueprint sharing feature as a self-contained Otix plugin. Personal vault
(local SQLite) + community marketplace (Otix backend API). Plugin-only — no web UI,
no core feature bloat.

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Desktop (Electron)                       │
│  ┌────────────┐    ┌──────────────┐    ┌─────────────────────┐  │
│  │ React      │◄──►│ Main Process │◄──►│ Worker Thread       │  │
│  │ Frontend   │IPC │ (manager.ts) │RPC │ factorio-blueprints │  │
│  │            │    │ PAGE_SLOT_MAP│    │  main.js            │  │
│  │ Tab UI     │    │ SlotRegistry │    │  ├─ decode blueprint │  │
│  │ Blueprint  │    │ ServiceReg.  │    │  ├─ SQLite vault     │  │
│  │ Components │    │              │    │  ├─ ctx.api → backend│  │
│  └────────────┘    └──────┬───────┘    │  └─ slotRender       │  │
│                           │            └─────────────────────┘  │
│                           │ ctx.api                              │
│                           ▼                                      │
│                    ┌──────────────┐                              │
│                    │ Otix Backend │                              │
│                    │ (Django API) │                              │
│                    │ /api/blueprints/*                           │
│                    └──────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

**Key constraint:** Plugin worker has no direct DOM access. All rendering is React
components in the frontend. Plugin provides data; frontend owns UI.

---

## 2. Plugin Manifest

File: `extensions/otix-plugins/plugins/factorio-blueprints/manifest.json`

```json
{
  "name": "Factorio Blueprints",
  "version": "1.0.0",
  "description": "Personal vault + community blueprint sharing for Factorio",
  "author": "Otix",
  "repository": "builtin",
  "min_app_version": "0.5.0",
  "permissions": [
    "storage:local",
    "api:proxy",
    "network:external"
  ],
  "config": {
    "community_enabled": {
      "type": "boolean",
      "label": "Enable Community Sharing",
      "default": true
    },
    "factorio_data_path": {
      "type": "string",
      "label": "Factorio User Data Path",
      "description": "Path to Factorio user data directory for blueprint export (optional)",
      "default": ""
    }
  },
  "entry": {
    "main": "main.js"
  },
  "slots": [
    {
      "location": "media/game/detail/tabs",
      "label": "Blueprints"
    }
  ],
  "services": [
    { "type": "game-feature", "protocol": "blueprint" }
  ]
}
```

---

## 3. Blueprint Parsing Engine

### Decode pipeline (in plugin worker):

```
Input string         → "0eNqdk21vg..."
  │ base64 decode    → Buffer (raw bytes)
  │ zlib inflate     → Buffer (decompressed JSON bytes)
  │ UTF-8 decode     → JSON string
  │ JSON.parse       → Object
  ▼
{
  blueprint: {
    item: "blueprint",
    label: "4-Lane Balancer",
    description: "Compact 4-to-4 balancer",
    icons: [{ signal: { name: "transport-belt" }, index: 1 }],
    entities: [
      { entity_number: 1, name: "transport-belt", position: { x: 0, y: 0 }, ... },
      { entity_number: 2, name: "splitter", position: { x: 2, y: 0 }, ... }
    ],
    tiles: [{ name: "concrete", position: { x: 0, y: 0 } }],
    schedules: []
  }
}
```

### Extracted card data:

```typescript
interface ParsedBlueprint {
  type: 'blueprint' | 'blueprint-book'
  label: string
  description: string
  icons: string[]          // entity names for up to 4 icons
  entities: Record<string, number>  // { "transport-belt": 24, "splitter": 4 }
  entityCount: number
  tiles: Record<string, number>
  tileCount: number
  dimensions: { width: number; height: number }
  version: string
  raw: string              // original blueprint string for export
}
```

### Blueprint books:

- Container of N blueprints
- Parsed recursively — each child blueprint has same structure
- Frontend renders as expandable accordion

### Implementation notes:

- Use Node `Buffer` for base64 decode (available in worker context)
- Use Node `zlib` for inflate (available in worker context, no npm dep)
- No external Factorio version dependencies — pure format parsing
- Version field extracted but not used for decode (format is backward-compatible)

---

## 4. Core Slot System Changes

### New slot location

Add to `PAGE_SLOT_MAP` in `desktop/plugins/manager.ts`:

```typescript
const PAGE_SLOT_MAP: Record<string, string[]> = {
  // ... existing entries
  'media/detail': [
    'media/movie/detail/actions',
    'media/show/detail/actions',
    'media/game/detail/actions',
    'media/game/detail/tabs',          // NEW
  ],
}
```

### Plugin slotRender contract

When the game detail page loads, it queries `media/game/detail/tabs`. Each plugin
returns widgets:

```typescript
slotRender(ctx, location) {
  // location = 'media/game/detail/tabs'
  // ctx contains current game's externalIds
  return {
    widgets: [{
      type: 'game-tab',
      key: 'factorio-blueprints',
      props: {
        tabId: 'blueprints',
        label: 'Blueprints',
        gameIds: ['427520'],   // Factorio Steam AppID
      }
    }]
  }
}
```

### Game detail page changes

In `frontend/src/features/media/components/organisms/media-detail.tsx`:

1. After GameSection, check for plugins registered to `media/game/detail/tabs`
2. Query slot data when game is active
3. Filter plugins to those whose `gameIds` match the current game
4. Render tab bar with "Info" + matching plugin tab labels
5. Active tab renders either GameSection (Info) or plugin data

### Slot data query with game context

The slot query needs to pass the current game's externalIds so plugins can filter.
New IPC flow:

```
Frontend → pluginApi.getSlotData('media/game/detail/tabs', { externalIds })
  → ipcMain handler passes context → PluginManager → plugin runtime → slotRender(ctx, location)
  → ctx now includes route params / game context
```

---

## 5. Frontend Components

```
frontend/src/features/media/game/
├── components/
│   ├── atoms/
│   │   └── media-game-blueprint-icon.tsx       ← Renders 1-4 Factorio signal icons
│   ├── molecules/
│   │   ├── media-game-blueprint-card.tsx       ← Card for vault/community list
│   │   └── media-game-tab-bar.tsx              ← Reads slot data, renders tab buttons
│   └── organisms/
│       ├── media-game-blueprint-vault.tsx       ← Personal vault grid + search
│       ├── media-game-blueprint-community.tsx   ← Community browse grid
│       └── media-game-blueprint-detail.tsx      ← Detail modal/bottom sheet
```

### media-game-blueprint-icon.tsx

- Receives array of entity names (e.g. `["transport-belt", "splitter"]`)
- Renders up to 4 icons in a 2×2 grid
- Uses simple colored boxes with entity name initial (no Factorio assets needed)
- Future: could render SVG icons from a Factorio icon spritesheet

### media-game-blueprint-card.tsx

```
┌─────────────────────────────────┐
│  ┌────┐  Green Circuit x4       │
│  │ 🟩 │  24 entities · 8×6      │
│  │ 🟩 │  12 assemblers · 48 belts│
│  └────┘  [Copy] [Edit] [Delete]  │
└─────────────────────────────────┘
```

- Props: `blueprint: ParsedBlueprint, onCopy, onEdit, onDelete`
- Shows icons, name, entity count, dimensions
- Action buttons for vault context
- Loading skeleton variant
- Empty state variant

### media-game-blueprint-vault.tsx

- Search bar + sort dropdown (Name, Date Added, Entity Count)
- Grid of blueprint cards
- Import FAB/button → opens import modal
- Import modal: text area for blueprint string → parse → preview → name → save
- States: loading, empty ("No blueprints saved yet"), error, populated
- Paginated grid (infinite scroll or page buttons)

### media-game-blueprint-community.tsx

- Top tabs: Trending / Recent / Most Downloaded
- Search bar with entity type autocomplete
- Upload button → opens upload modal (paste string → parse → metadata form → publish)
- Grid of cards showing: icons, name, author, downloads, likes
- Click card → opens community blueprint detail
- States: loading, empty ("No community blueprints yet"), error, populated

### media-game-blueprint-detail.tsx

- Modal or side sheet
- Full icon display
- Blueprint name + description + author + date
- Entity list grouped by type:
  ```
  Assemblers (12)
    · assembling-machine-3: 8
    · assembling-machine-2: 4
  Logistics (52)
    · transport-belt: 48
    · splitter: 4
  ```
- Item cost tally (sum of all entity ingredients)
- Copy blueprint string button (copies raw string to clipboard)
- For vault: Edit metadata, Delete
- For community: Like, Share, Download, Report

### media-game-tab-bar.tsx

- Rendered inline in media-detail.tsx
- Reads slot data for `media/game/detail/tabs`
- Filters to matching game
- Renders tab buttons: `[Info] [Blueprints]`
- Default active tab: Info (existing content)
- Switching tabs swaps visible section

---

## 6. Plugin Main.js Structure

```javascript
// extensions/otix-plugins/plugins/factorio-blueprints/main.js

const zlib = require('zlib')

module.exports = {
  plugin: function(ctx) {
    ctx.logger.info('Factorio Blueprints loaded')

    // ── Registry handlers ──
    ctx.handle('getBlueprints', async (args) => { /* list vault */ })
    ctx.handle('importBlueprint', async (args) => { /* decode + save */ })
    ctx.handle('exportBlueprint', async (args) => { /* get raw string */ })
    ctx.handle('deleteBlueprint', async (args) => { /* remove from vault */ })
    ctx.handle('updateBlueprint', async (args) => { /* edit metadata */ })
    ctx.handle('community.list', async (args) => { /* proxy to backend */ })
    ctx.handle('community.upload', async (args) => { /* parse + POST */ })
    ctx.handle('community.detail', async (args) => { /* proxy to backend */ })
  },

  slotRender: async function(ctx, location) {
    // Return tab metadata
    return {
      widgets: [{
        type: 'game-tab',
        props: {
          tabId: 'blueprints',
          label: 'Blueprints',
          gameIds: ['427520'],
        }
      }]
    }
  },

  status: async function(ctx) {
    const count = await ctx.db.get('SELECT COUNT(*) as count FROM blueprints')
    return { vaultCount: count?.count || 0 }
  },

  test: async function(ctx, configDraft) {
    return { success: true, message: 'Blueprints plugin ready' }
  }
}
```

---

## 7. Local SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS blueprints (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT DEFAULT '',
  raw_string  TEXT NOT NULL,
  parsed_data TEXT NOT NULL,       -- JSON blob of ParsedBlueprint
  tags        TEXT DEFAULT '[]',   -- JSON array of tag strings
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_blueprints_label ON blueprints(label);
CREATE INDEX idx_blueprints_created ON blueprints(created_at);
```

---

## 8. Backend API Endpoints

All under existing Otix API prefix. Auth via standard JWT. Plugin uses `ctx.api`.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/blueprints` | Upload community blueprint |
| GET | `/api/blueprints` | List/search community blueprints |
| GET | `/api/blueprints/:id` | Get detail + increment view |
| PATCH | `/api/blueprints/:id` | Update (own only) |
| DELETE | `/api/blueprints/:id` | Delete (own only) |
| POST | `/api/blueprints/:id/like` | Toggle like |
| POST | `/api/blueprints/:id/download` | Increment download counter |

### List query params

- `q` — search term (title, description, entity names, tags)
- `sort` — `trending` | `recent` | `popular` (downloads)
- `page` — page number (default 1)
- `page_size` — items per page (default 24)

### Upload body

```json
{
  "title": "4-Lane Balancer",
  "description": "Compact 4-to-4 lane balancer",
  "blueprint_string": "0eNqdk21vg...",
  "parsed_data": { /* ParsedBlueprint */ },
  "tags": ["balancer", "logistics"]
}
```

### Blueprint DB model

```python
class Blueprint(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    blueprint_string = models.TextField()
    parsed_data = models.JSONField()
    tags = ArrayField(models.CharField(max_length=50), default=list)
    downloads = models.IntegerField(default=0)
    likes = models.ManyToManyField(User, related_name="liked_blueprints")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

---

## 9. Data Flows

### Import blueprint (vault)
```
User pastes string in import modal
  → Frontend: callData('factorio-blueprints', 'importBlueprint', { rawString })
  → Plugin: base64 decode → zlib inflate → JSON parse → extract metadata
  → Plugin: INSERT into local SQLite
  → Plugin: return ParsedBlueprint to frontend
  → Frontend: show success toast + card in vault
```

### Browse community
```
User opens Community tab
  → Frontend: callData('factorio-blueprints', 'community.list', { sort: 'trending' })
  → Plugin: ctx.api.get('/api/blueprints?sort=trending')
  → Backend: return paginated results
  → Plugin: forward to frontend
  → Frontend: render card grid
```

### Upload to community
```
User clicks Share on a vault blueprint
  → Frontend: callData('factorio-blueprints', 'community.upload', { blueprintId })
  → Plugin: SELECT from local SQLite
  → Plugin: ctx.api.post('/api/blueprints', { title, description, blueprint_string, parsed_data })
  → Backend: validate → store → return { id, url }
  → Plugin: forward to frontend
  → Frontend: show "Published!" toast with link
```

---

## 10. Error Handling

| Scenario | Handling |
|----------|----------|
| Invalid blueprint string | Plugin returns parse error with message. Frontend shows inline error in import modal. |
| Backend unreachable | Community features show offline state. Vault works independently. |
| Duplicate import | Plugin checks raw_string hash before insert. Shows "already in vault" toast. |
| Backend auth expired | Plugin's ctx.api will 401. Frontend shows "Sign in to share" prompt. |
| Rate limiting | Backend returns 429. Plugin retries with backoff. Frontend shows rate limit message. |
| Blueprint too large | Plugin rejects strings > 1MB before parsing. Frontend shows size error. |
| Delete confirmation | Frontend shows confirmation dialog. Optimistic removal with undo toast. |

---

## 11. Implementation Order

| Step | Component | Dependencies | Effort |
|------|-----------|--------------|--------|
| 1 | Plugin scaffold (manifest, main.js skeleton, slotRender) | None | Small |
| 2 | Blueprint parser (decode + extract) | Step 1 | Small |
| 3 | Local vault CRUD (SQLite schema + handlers) | Step 2 | Small |
| 4 | Core slot changes (PAGE_SLOT_MAP, tab slot type) | None | Small |
| 5 | Game detail tab UI (media-game-tab-bar, media-detail changes) | Step 4 | Medium |
| 6 | Blueprint vault frontend (card, vault, import modal) | Steps 3, 5 | Medium |
| 7 | Blueprint detail modal (entity breakdown, cost tally) | Step 6 | Medium |
| 8 | Backend blueprint API (Django models + endpoints) | None | Medium |
| 9 | Community frontend (browse, search, upload) | Steps 7, 8 | Medium |
| 10 | Polish (empty states, loading skeletons, error handling, Factorio icon rendering) | Steps 6, 7, 9 | Small |

Steps 1-7 = **local vault** (no backend needed). Steps 8-9 = **community features**.

---

## 12. Future Considerations (Not in Scope)

- **Satisfactory / Dyson Sphere / other factory games** — schema already supports
  game-specific parsing via plugin, just different externalIds
- **Blueprint rendering** — render blueprint as SVG/Canvas preview from entity positions
- **Factorio mod portal integration** — pull blueprints from mod portal
- **In-game export** — detect Factorio running, watch blueprint export folder
- **Blueprint diff** — compare two blueprints

---

## 13. Design Decisions (Resolved)

- **Tab bar styling:** Same glass-card pattern as existing media detail sections.
  Consistent with current design language.
- **Community auth:** Requires authentication. Backend reuses existing JWT. Anonymous
  browse adds complexity with no clear benefit.
- **Blueprint icons:** Colored squares with entity name initials for MVP. Simple,
  no asset dependency. Factorio icon spritesheet can be added later.
