# Factorio Blueprint Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Factorio blueprint sharing plugin (personal vault + community marketplace) integrated into the game detail page tab system.

**Architecture:** Single plugin `factorio-blueprints` under `extensions/otix-plugins/plugins/`. Plugin worker handles blueprint decode (base64→zlib→JSON) and local SQLite vault. New `media/game/detail/tabs` slot lets it contribute a tab to Factorio's detail page. Frontend renders all UI via React components, fetching data from plugin via existing `callData` IPC.

**Tech Stack:** Node.js (plugin worker), React + TanStack Query (frontend), Django + DRF (backend API), SQLite (plugin-local vault)

## Global Constraints

- Plugin must follow existing scanner plugin patterns (object-based export with `plugin`, `slotRender`, `status`, `test`)
- All blueprint parsing happens in plugin worker — no native deps, use Node built-in `zlib` + `Buffer`
- Frontend owns all React rendering — plugin provides data only
- Blueprint icons use colored entity initials (no Factorio asset dependency)
- Community features require auth (reuse existing JWT via `ctx.api`)
- All new React components go under `frontend/src/features/media/game/components/`
- Tab bar styling follows existing glass-card pattern

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `extensions/otix-plugins/plugins/factorio-blueprints/manifest.json` | Plugin declaration, permissions, config fields, slots |
| `extensions/otix-plugins/plugins/factorio-blueprints/main.js` | Plugin logic: decode, vault CRUD, community proxy, slotRender |
| `frontend/src/features/media/game/components/atoms/media-game-blueprint-icon.tsx` | Renders 1-4 Factorio signal icons as colored initials |
| `frontend/src/features/media/game/components/molecules/media-game-blueprint-card.tsx` | Card showing blueprint summary (icons, name, entities, dimensions) |
| `frontend/src/features/media/game/components/molecules/media-game-tab-bar.tsx` | Tab bar that reads slot data, renders tab buttons, manages active tab |
| `frontend/src/features/media/game/components/organisms/media-game-blueprint-vault.tsx` | Personal vault grid with search, sort, import flow |
| `frontend/src/features/media/game/components/organisms/media-game-blueprint-community.tsx` | Community browse grid with trending/recent/search/upload |
| `frontend/src/features/media/game/components/organisms/media-game-blueprint-detail.tsx` | Detail modal with entity breakdown and cost tally |
| (backend app) `backend/blueprints/models.py` | Blueprint, Like models |
| (backend app) `backend/blueprints/serializers.py` | DRF serializers |
| (backend app) `backend/blueprints/views.py` | ViewSet with search/filter/sort |
| (backend app) `backend/blueprints/urls.py` | URL routing |

### Modified files
| File | Change |
|------|--------|
| `desktop/plugins/manager.ts` | Add `media/game/detail/tabs` to `PAGE_SLOT_MAP`, pass `context` to `getSlotData` |
| `desktop/ipc/plugins.ts` | Accept optional context in `plugin:get-slot-data` IPC handler |
| `desktop/preload.ts` | Accept optional context in `getSlotData` bridge method |
| `frontend/src/features/media/components/organisms/media-detail.tsx` | Integrate tab bar for game detail |
| (backend) `backend/config/urls.py` | Include blueprints router |

---

### Task 1: Plugin Scaffold

**Files:**
- Create: `extensions/otix-plugins/plugins/factorio-blueprints/manifest.json`
- Create: `extensions/otix-plugins/plugins/factorio-blueprints/main.js`
- Create: `extensions/otix-plugins/plugins/factorio-blueprints/README.md`

**Interfaces:**
- Produces: Valid plugin that loads in Otix, exposes `slotRender`, `status`, `test`

- [ ] **Step 1: Create manifest.json**

```json
{
  "name": "Factorio Blueprints",
  "version": "1.0.0",
  "description": "Personal vault + community blueprint sharing for Factorio",
  "author": "Otix",
  "repository": "builtin",
  "min_app_version": "0.5.0",
  "permissions": ["storage:local", "api:proxy", "network:external"],
  "config": {
    "community_enabled": {
      "type": "boolean",
      "label": "Enable Community Sharing",
      "default": true
    }
  },
  "entry": { "main": "main.js" },
  "slots": [{ "location": "media/game/detail/tabs", "label": "Blueprints" }],
  "services": [{ "type": "game-feature", "protocol": "blueprint" }]
}
```

- [ ] **Step 2: Create main.js skeleton**

```javascript
// extensions/otix-plugins/plugins/factorio-blueprints/main.js

module.exports = {
  plugin: function(ctx) {
    ctx.logger.info('Factorio Blueprints loaded')

    // Handlers registered in Task 3+

    ctx.onDestroy(() => {
      ctx.logger.info('Factorio Blueprints unloaded')
    })
  },

  slotRender: async function(ctx, location) {
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
    return { loaded: true }
  },

  test: async function(ctx, configDraft) {
    return { success: true, message: 'Plugin ready' }
  }
}
```

- [ ] **Step 3: Create plugin README**

Standard plugin README with install instructions, config fields, and usage notes.

- [ ] **Step 4: Verify plugin loads**

Run app, check plugin shows in Settings > Plugins. Enable. No errors in console.

- [ ] **Step 5: Commit**

```bash
git add extensions/otix-plugins/plugins/factorio-blueprints/
git commit -m "feat(factorio-blueprints): scaffold plugin manifest and main.js skeleton"
```

---

### Task 2: Blueprint Decode Utility

**Files:**
- Modify: `extensions/otix-plugins/plugins/factorio-blueprints/main.js`

**Interfaces:**
- Consumes: Step 1 plugin scaffold
- Produces: `decodeBlueprint(rawString)` function, `ParsedBlueprint` type

- [ ] **Step 1: Add decode function to main.js**

```javascript
// Inside main.js, before module.exports
const zlib = require('zlib')

/**
 * Decode a Factorio blueprint string.
 * Format chain: base64 → zlib inflate → UTF-8 JSON
 *
 * @param {string} raw - The blueprint string (starts with '0' for blueprint, '1' for book)
 * @returns {ParsedBlueprint}
 */
function decodeBlueprint(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Invalid blueprint string: must be a non-empty string')
  }

  const versionByte = raw[0]
  if (versionByte !== '0' && versionByte !== '1') {
    throw new Error('Invalid blueprint string: must start with 0 or 1')
  }

  // Strip version byte and decode base64
  const encoded = raw.slice(1)
  let buffer
  try {
    buffer = Buffer.from(encoded, 'base64')
  } catch {
    throw new Error('Invalid blueprint string: base64 decode failed')
  }

  // Zlib inflate
  let jsonStr
  try {
    jsonStr = zlib.inflateSync(buffer).toString('utf8')
  } catch {
    throw new Error('Invalid blueprint string: zlib decompression failed')
  }

  // Parse JSON
  let data
  try {
    data = JSON.parse(jsonStr)
  } catch {
    throw new Error('Invalid blueprint string: JSON parse failed')
  }

  const bp = data.blueprint || data.blueprint_book
  if (!bp) {
    throw new Error('Invalid blueprint string: missing blueprint or blueprint_book key')
  }

  const entities = bp.entities || []
  const tiles = bp.tiles || []

  // Group entities by type and count
  const entityCounts = {}
  for (const entity of entities) {
    entityCounts[entity.name] = (entityCounts[entity.name] || 0) + 1
  }

  // Group tiles by type and count
  const tileCounts = {}
  for (const tile of tiles) {
    tileCounts[tile.name] = (tileCounts[tile.name] || 0) + 1
  }

  // Calculate dimensions
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const entity of entities) {
    const x = entity.position?.x
    const y = entity.position?.y
    if (x != null) { minX = Math.min(minX, x); maxX = Math.max(maxX, x) }
    if (y != null) { minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  }
  for (const tile of tiles) {
    const x = tile.position?.x
    const y = tile.position?.y
    if (x != null) { minX = Math.min(minX, x); maxX = Math.max(maxX, x) }
    if (y != null) { minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  }
  const dimensions = (minX === Infinity)
    ? { width: 0, height: 0 }
    : { width: maxX - minX + 1, height: maxY - minY + 1 }

  // Extract icons
  const icons = (bp.icons || []).map(icon => icon.signal?.name).filter(Boolean)

  return {
    type: data.blueprint_book ? 'blueprint-book' : 'blueprint',
    label: bp.label || 'Unnamed Blueprint',
    description: bp.description || '',
    icons,
    entities: entityCounts,
    entityCount: entities.length,
    tiles: tileCounts,
    tileCount: tiles.length,
    dimensions,
    version: bp.version ? String(bp.version) : 'unknown',
    raw,
    // For blueprint books, decode child blueprints too
    children: data.blueprint_book
      ? (bp.blueprints || []).map(child => decodeBlueprint(child.blueprint?.label || ''))
      : undefined,
  }
}
```

- [ ] **Step 2: Test decode manually with a known Factorio blueprint string**

Parse a known working string in Node. Verify label, icons, entities, dimensions are correct. Log parsed output.

- [ ] **Step 3: Register importBlueprint handler**

```javascript
// Inside plugin: function(ctx)
ctx.handle('importBlueprint', async (args) => {
  const { rawString } = args
  if (!rawString) {
    return { success: false, error: 'rawString required' }
  }
  try {
    const parsed = decodeBlueprint(rawString)
    return { success: true, blueprint: parsed }
  } catch (err) {
    return { success: false, error: err.message }
  }
})
```

- [ ] **Step 4: Verify decode via plugin IPC**

Call `callData('factorio-blueprints', 'importBlueprint', { rawString })` from frontend console. Check returned `ParsedBlueprint` structure.

- [ ] **Step 5: Commit**

```bash
git add extensions/otix-plugins/plugins/factorio-blueprints/main.js
git commit -m "feat(factorio-blueprints): add blueprint decode utility with error handling"
```

---

### Task 3: Local Vault SQLite + CRUD

**Files:**
- Modify: `extensions/otix-plugins/plugins/factorio-blueprints/main.js`

**Interfaces:**
- Consumes: `decodeBlueprint(rawString)` from Task 2
- Produces: `ctx.handle('getBlueprints')`, `ctx.handle('importBlueprint')`, `ctx.handle('deleteBlueprint')`, `ctx.handle('updateBlueprint')`, `ctx.handle('exportBlueprint')`

- [ ] **Step 1: Create SQLite schema on plugin init**

```javascript
// Inside plugin: function(ctx), after logger.info
ctx.db.run(`
  CREATE TABLE IF NOT EXISTS blueprints (
    id          TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    description TEXT DEFAULT '',
    raw_string  TEXT NOT NULL,
    parsed_data TEXT NOT NULL,
    tags        TEXT DEFAULT '[]',
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  )
`)
```

- [ ] **Step 2: Update importBlueprint handler to persist**

```javascript
ctx.handle('importBlueprint', async (args) => {
  const { rawString, label, description, tags } = args
  if (!rawString) {
    return { success: false, error: 'rawString required' }
  }
  try {
    const parsed = decodeBlueprint(rawString)

    // Check for duplicate (compare hash of raw string)
    const existing = ctx.db.get(
      'SELECT id FROM blueprints WHERE raw_string = ?',
      [rawString]
    )
    if (existing) {
      return { success: false, error: 'duplicate', blueprintId: existing.id }
    }

    const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)
    const tagsJson = JSON.stringify(tags || [])
    const parsedJson = JSON.stringify(parsed)

    ctx.db.run(
      `INSERT INTO blueprints (id, label, description, raw_string, parsed_data, tags) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, label || parsed.label, description || parsed.description, rawString, parsedJson, tagsJson]
    )

    return { success: true, blueprint: { ...parsed, id, tags: tags || [] } }
  } catch (err) {
    return { success: false, error: err.message }
  }
})
```

- [ ] **Step 3: Add getBlueprints (list with search + sort)**

```javascript
ctx.handle('getBlueprints', async (args) => {
  const { search, sort_by, page = 1, page_size = 50 } = args || {}

  let where = ''
  let params = []
  if (search) {
    where = 'WHERE label LIKE ? OR description LIKE ?'
    params = [`%${search}%`, `%${search}%`]
  }

  let orderBy = 'created_at DESC'
  if (sort_by === 'name') orderBy = 'label ASC'
  if (sort_by === 'entity_count') orderBy = "json_extract(parsed_data, '$.entityCount') DESC"

  const offset = (page - 1) * page_size

  const rows = ctx.db.all(
    `SELECT id, label, description, parsed_data, tags, created_at FROM blueprints ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, page_size, offset]
  )

  const total = ctx.db.get(
    `SELECT COUNT(*) as count FROM blueprints ${where}`, params
  )

  return {
    success: true,
    blueprints: rows.map(r => ({
      ...r,
      parsed_data: JSON.parse(r.parsed_data),
      tags: JSON.parse(r.tags),
    })),
    total: total?.count || 0,
    page,
    page_size,
  }
})
```

- [ ] **Step 4: Add deleteBlueprint and updateBlueprint handlers**

```javascript
ctx.handle('deleteBlueprint', async (args) => {
  const { id } = args
  if (!id) return { success: false, error: 'id required' }

  ctx.db.run('DELETE FROM blueprints WHERE id = ?', [id])
  return { success: true }
})

ctx.handle('updateBlueprint', async (args) => {
  const { id, label, description, tags } = args
  if (!id) return { success: false, error: 'id required' }

  const sets = []
  const params = []
  if (label !== undefined) { sets.push('label = ?'); params.push(label) }
  if (description !== undefined) { sets.push('description = ?'); params.push(description) }
  if (tags !== undefined) { sets.push('tags = ?'); params.push(JSON.stringify(tags)) }

  if (sets.length === 0) return { success: false, error: 'no fields to update' }

  sets.push("updated_at = datetime('now')")
  params.push(id)

  ctx.db.run(`UPDATE blueprints SET ${sets.join(', ')} WHERE id = ?`, params)
  return { success: true }
})

ctx.handle('exportBlueprint', async (args) => {
  const { id } = args
  if (!id) return { success: false, error: 'id required' }

  const row = ctx.db.get('SELECT raw_string FROM blueprints WHERE id = ?', [id])
  if (!row) return { success: false, error: 'not found' }

  return { success: true, rawString: row.raw_string }
})
```

- [ ] **Step 5: Verify CRUD operations end-to-end**

Test via frontend console:
1. Call `importBlueprint` with a string → returns parsed + saved
2. Call `getBlueprints` → returns list with the saved item
3. Call `updateBlueprint` → field updates
4. Call `deleteBlueprint` → item removed

- [ ] **Step 6: Commit**

```bash
git add extensions/otix-plugins/plugins/factorio-blueprints/main.js
git commit -m "feat(factorio-blueprints): add local SQLite vault with CRUD handlers"
```

---

### Task 4: Core Slot Changes

**Files:**
- Modify: `desktop/plugins/manager.ts` (add slot to PAGE_SLOT_MAP + pass context to getSlotData)
- Modify: `desktop/ipc/plugins.ts` (accept context param in IPC handler)
- Modify: `desktop/preload.ts` (accept context param in bridge)

**Interfaces:**
- Consumes: Plugin's `slotRender(ctx, location)` from Task 1
- Produces: Frontend can query `media/game/detail/tabs` with game context

- [ ] **Step 1: Add slot location to PAGE_SLOT_MAP**

In `desktop/plugins/manager.ts`:

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

- [ ] **Step 2: Extend getSlotData to accept optional context**

```typescript
// In PluginManager class
async getSlotData(location: string, context?: Record<string, unknown>): Promise<SlotContribution[]> {
    const plugins = this.slotRegistry.getPluginsForSlot(location)
    const results: SlotContribution[] = []

    for (const { pluginId, label } of plugins) {
      const runtime = this.runtimes.get(pluginId)
      if (!runtime) continue

      try {
        const data = await Promise.race([
          runtime.callMethod('slotRender', location, context),   // pass context
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Slot render timeout')), 5000)
          ),
        ])
        this.slotRegistry.resetFailures(pluginId, location)
        results.push({
          pluginId,
          label,
          data: (data as any) || { widgets: [] },
        })
      } catch (err: any) {
        this.slotRegistry.recordFailure(pluginId, location)
        console.error(`[PluginManager] Slot render failed for ${pluginId} at ${location}:`, err.message)
      }
    }

    return results
  }
```

- [ ] **Step 3: Update IPC handler to accept context**

In `desktop/ipc/plugins.ts`:

```typescript
ipcMain.handle('plugin:get-slot-data', async (_event, location: string, context?: Record<string, unknown>) => {
    return await pluginManager.getSlotData(location, context)
})
```

- [ ] **Step 4: Update preload bridge**

In `desktop/preload.ts`:

```typescript
getSlotData: (location: string, context?: Record<string, unknown>) =>
  ipcRenderer.invoke('plugin:get-slot-data', location, context),
```

- [ ] **Step 5: Commit**

```bash
git add desktop/plugins/manager.ts desktop/ipc/plugins.ts desktop/preload.ts
git commit -m "feat(core): add media/game/detail/tabs slot with game context support"
```

---

### Task 5: Game Detail Tab UI

**Files:**
- Create: `frontend/src/features/media/game/components/molecules/media-game-tab-bar.tsx`
- Modify: `frontend/src/features/media/components/organisms/media-detail.tsx`

**Interfaces:**
- Consumes: Slot data from `plugin:get-slot-data` with game externalIds
- Produces: Tab bar switching between Info and plugin-provided tabs

- [ ] **Step 1: Create media-game-tab-bar component**

```tsx
// frontend/src/features/media/game/components/molecules/media-game-tab-bar.tsx

import { useState, useEffect } from 'react'
import { useDesktopPlatform } from '@/lib/desktop/platform'

interface GameTab {
  tabId: string
  label: string
  pluginId: string
}

interface Props {
  gameExternalId: string
  activeTab: string
  onTabChange: (tabId: string) => void
}

export function GameTabBar({ gameExternalId, activeTab, onTabChange }: Props) {
  const [pluginTabs, setPluginTabs] = useState<GameTab[]>([])
  const [loading, setLoading] = useState(true)
  const desktopAPI = (window as any).desktopAPI

  useEffect(() => {
    let cancelled = false
    async function loadTabs() {
      if (!desktopAPI?.plugin?.getSlotData) {
        setLoading(false)
        return
      }
      try {
        const slotData = await desktopAPI.plugin.getSlotData('media/game/detail/tabs', {
          externalIds: [gameExternalId],
        })
        if (!cancelled && slotData?.length) {
          const tabs: GameTab[] = []
          for (const entry of slotData) {
            for (const widget of entry.data?.widgets || []) {
              if (widget.type === 'game-tab' && widget.props?.gameIds?.includes(gameExternalId)) {
                tabs.push({
                  tabId: widget.props.tabId,
                  label: widget.props.label,
                  pluginId: entry.pluginId,
                })
              }
            }
          }
          setPluginTabs(tabs)
        }
      } catch {
        // No plugins for this slot
      }
      if (!cancelled) setLoading(false)
    }
    loadTabs()
    return () => { cancelled = true }
  }, [gameExternalId, desktopAPI])

  if (loading || pluginTabs.length === 0) return null

  return (
    <div className="flex items-center gap-1 border-b border-white/10 pb-1 mb-6">
      <button
        onClick={() => onTabChange('info')}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
          activeTab === 'info'
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:text-white hover:bg-white/5'
        }`}
      >
        Info
      </button>
      {pluginTabs.map((tab) => (
        <button
          key={tab.tabId}
          onClick={() => onTabChange(tab.tabId)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
            activeTab === tab.tabId
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-white hover:bg-white/5'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Integrate tab bar into MediaDetail**

In `frontend/src/features/media/components/organisms/media-detail.tsx`:

Import the tab bar:
```typescript
import { GameTabBar } from '@media/game/components/molecules/media-game-tab-bar'
```

Add state and tab logic near the top of `MediaDetail`:
```typescript
const [activeGameTab, setActiveGameTab] = useState('info')
const gameExternalId = isGame(detail) ? String(detail.externalId || detail.id) : null
```

Wrap GameSection in a container that shows/hides based on active tab:
```tsx
{isGame(detail) && (
  <div className="space-y-6">
    <GameTabBar
      gameExternalId={gameExternalId || ''}
      activeTab={activeGameTab}
      onTabChange={setActiveGameTab}
    />
    {activeGameTab === 'info' && <GameSection/>}
    {/* Plugin tabs render their content here — populated in Task 6+ */}
    {activeGameTab !== 'info' && (
      <div className="text-sm text-muted-foreground py-8 text-center">
        Plugin content for tab: {activeGameTab}
      </div>
    )}
  </div>
)}
```

Also need to hide the existing standalone `{isGame(detail) && <GameSection/>}` at line 182.

- [ ] **Step 3: Verify tab rendering on game detail page**

Navigate to a game detail page. Tab bar shows "Info" as active. Clicking tabs doesn't break layout. Non-game media types unaffected. Only shows on Factorio detail page if plugin enabled.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/media/game/components/molecules/media-game-tab-bar.tsx
git add frontend/src/features/media/components/organisms/media-detail.tsx
git commit -m "feat(ui): add game detail tab bar with plugin tab slots"
```

---

### Task 6: Blueprint Icon + Card Components

**Files:**
- Create: `frontend/src/features/media/game/components/atoms/media-game-blueprint-icon.tsx`
- Create: `frontend/src/features/media/game/components/molecules/media-game-blueprint-card.tsx`

**Interfaces:**
- Produces: Reusable `<BlueprintCard blueprint={ParsedBlueprint} onCopy onEdit onDelete />`

- [ ] **Step 1: Create BlueprintIcon atom**

```tsx
// frontend/src/features/media/game/components/atoms/media-game-blueprint-icon.tsx

import { Box, Package, Wrench } from 'lucide-react'

interface Props {
  icons: string[]
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_MAP = { sm: 6, md: 8, lg: 12 }
const FONT_MAP = { sm: 'text-[8px]', md: 'text-[10px]', lg: 'text-xs' }

// Simple deterministic color from entity name
function colorFromName(name: string): string {
  const colors = [
    'bg-blue-500/20 text-blue-400',
    'bg-green-500/20 text-green-400',
    'bg-yellow-500/20 text-yellow-400',
    'bg-red-500/20 text-red-400',
    'bg-purple-500/20 text-purple-400',
    'bg-pink-500/20 text-pink-400',
    'bg-indigo-500/20 text-indigo-400',
    'bg-teal-500/20 text-teal-400',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i)
  }
  return colors[Math.abs(hash) % colors.length]
}

function iconInitial(name: string): string {
  return name.split(/[-\s]/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export function BlueprintIcon({ icons, size = 'md' }: Props) {
  const dim = SIZE_MAP[size]
  const font = FONT_MAP[size]

  if (!icons?.length) {
    return (
      <div className={`flex items-center justify-center w-${dim} h-${dim} rounded-lg bg-white/5 text-muted-foreground`}>
        <Package className={`h-${dim/2} w-${dim/2}`} />
      </div>
    )
  }

  // Show up to 4 icons in a 2x2 grid
  const display = icons.slice(0, 4)

  return (
    <div className="grid grid-cols-2 gap-0.5">
      {display.map((name, i) => (
        <div
          key={i}
          className={`flex items-center justify-center w-${dim/2} h-${dim/2} rounded ${colorFromName(name)} ${font} font-bold`}
          title={name}
        >
          {iconInitial(name)}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create BlueprintCard molecule**

```tsx
// frontend/src/features/media/game/components/molecules/media-game-blueprint-card.tsx

import { Copy, Edit3, Trash2, Grid3X3, Layers } from 'lucide-react'
import { BlueprintIcon } from '../atoms/media-game-blueprint-icon'

interface ParsedBlueprint {
  type: string
  label: string
  description: string
  icons: string[]
  entities: Record<string, number>
  entityCount: number
  tiles: Record<string, number>
  tileCount: number
  dimensions: { width: number; height: number }
  version: string
  raw: string
  id?: string
  tags?: string[]
  created_at?: string
}

interface Props {
  blueprint: ParsedBlueprint
  showActions?: boolean
  onCopy?: (rawString: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  onClick?: () => void
}

export function BlueprintCard({ blueprint, showActions, onCopy, onEdit, onDelete, onClick }: Props) {
  const entityEntries = Object.entries(blueprint.entities).slice(0, 3)
  const extraCount = Math.max(0, Object.keys(blueprint.entities).length - 3)

  return (
    <div
      onClick={onClick}
      className="glass-inset rounded-xl p-3.5 space-y-3 transition-all duration-200 hover:bg-white/[0.04] cursor-pointer group"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <BlueprintIcon icons={blueprint.icons || []} size="md" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {blueprint.label}
          </p>
          {blueprint.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {blueprint.description}
            </p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Grid3X3 className="h-3 w-3" />
          {blueprint.dimensions.width}×{blueprint.dimensions.height}
        </span>
        <span className="flex items-center gap-1">
          <Layers className="h-3 w-3" />
          {blueprint.entityCount} entities
        </span>
        {blueprint.tileCount > 0 && (
          <span>{blueprint.tileCount} tiles</span>
        )}
      </div>

      {/* Entity breakdown */}
      {entityEntries.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entityEntries.map(([name, count]) => (
            <span key={name} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">
              {name}: {count}
            </span>
          ))}
          {extraCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">
              +{extraCount} more
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      {showActions && (
        <div className="flex items-center gap-1 pt-1 border-t border-white/[0.04] opacity-0 group-hover:opacity-100 transition-opacity">
          {onCopy && (
            <button
              onClick={(e) => { e.stopPropagation(); onCopy(blueprint.raw) }}
              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md hover:bg-white/10 text-muted-foreground hover:text-white transition-all"
              title="Copy blueprint string"
            >
              <Copy className="h-3 w-3" /> Copy
            </button>
          )}
          {onEdit && blueprint.id && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(blueprint.id!) }}
              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md hover:bg-white/10 text-muted-foreground hover:text-white transition-all"
              title="Edit metadata"
            >
              <Edit3 className="h-3 w-3" /> Edit
            </button>
          )}
          {onDelete && blueprint.id && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(blueprint.id!) }}
              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-all ml-auto"
              title="Delete blueprint"
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify components render correctly**

Import and render both components in a test page or storybook. Verify icon grid, card layout, entity breakdown, action buttons.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/media/game/components/atoms/media-game-blueprint-icon.tsx
git add frontend/src/features/media/game/components/molecules/media-game-blueprint-card.tsx
git commit -m "feat(ui): add BlueprintIcon and BlueprintCard components"
```

---

### Task 7: Blueprint Vault View

**Files:**
- Create: `frontend/src/features/media/game/components/organisms/media-game-blueprint-vault.tsx`
- Modify: `frontend/src/features/media/components/organisms/media-detail.tsx` (wire vault to tab)

**Interfaces:**
- Consumes: `BlueprintCard` from Task 6, plugin handlers from Task 3
- Produces: Full vault view with import modal

- [ ] **Step 1: Create vault component**

```tsx
// frontend/src/features/media/game/components/organisms/media-game-blueprint-vault.tsx

import { useState, useEffect, useCallback } from 'react'
import { Search, Plus, Upload, Loader2, AlertCircle } from 'lucide-react'
import { BlueprintCard } from '../../molecules/media-game-blueprint-card'

interface ParsedBlueprint {
  type: string
  label: string
  description: string
  icons: string[]
  entities: Record<string, number>
  entityCount: number
  tiles: Record<string, number>
  tileCount: number
  dimensions: { width: number; height: number }
  version: string
  raw: string
  id?: string
  tags?: string[]
  created_at?: string
}

interface Props {
  pluginId: string
  onViewDetail: (blueprint: ParsedBlueprint) => void
}

export function BlueprintVault({ pluginId, onViewDetail }: Props) {
  const [blueprints, setBlueprints] = useState<ParsedBlueprint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<string>('date')
  const [showImport, setShowImport] = useState(false)
  const [importString, setImportString] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<ParsedBlueprint | null>(null)

  const desktopAPI = (window as any).desktopAPI

  const loadBlueprints = useCallback(async () => {
    if (!desktopAPI?.plugin?.callData) return
    setLoading(true)
    setError(null)
    try {
      const res = await desktopAPI.plugin.callData(pluginId, 'getBlueprints', {
        search: search || undefined,
        sort_by: sortBy,
      })
      if (res?.success) {
        setBlueprints(res.blueprints || [])
      } else {
        setError(res?.error || 'Failed to load blueprints')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load blueprints')
    } finally {
      setLoading(false)
    }
  }, [pluginId, search, sortBy, desktopAPI])

  useEffect(() => { loadBlueprints() }, [loadBlueprints])

  const handleImport = async () => {
    if (!importString.trim()) return
    setImporting(true)
    setImportError(null)
    try {
      const res = await desktopAPI.plugin.callData(pluginId, 'importBlueprint', {
        rawString: importString.trim(),
      })
      if (res?.success) {
        setShowImport(false)
        setImportString('')
        setImportPreview(null)
        loadBlueprints()
      } else if (res?.error === 'duplicate') {
        setImportError('This blueprint is already in your vault')
      } else {
        setImportError(res?.error || 'Failed to import blueprint')
      }
    } catch (err: any) {
      setImportError(err.message || 'Failed to import blueprint')
    } finally {
      setImporting(false)
    }
  }

  const handlePreview = () => {
    if (!importString.trim()) return
    // Quick preview — parse for display only (plugin does full parse on save)
    setImportError(null)
    try {
      // Just test if it looks like a blueprint string
      const s = importString.trim()
      if (s[0] !== '0' && s[0] !== '1') {
        setImportError('String must start with 0 (blueprint) or 1 (blueprint book)')
        return
      }
      // Show the raw input; plugin parses on actual import
      setImportPreview({
        type: s[0] === '1' ? 'blueprint-book' : 'blueprint',
        label: '(preview)',
        description: '',
        icons: [],
        entities: {},
        entityCount: 0,
        tiles: {},
        tileCount: 0,
        dimensions: { width: 0, height: 0 },
        version: 'unknown',
        raw: s,
      })
    } catch {
      setImportError('Invalid blueprint string')
    }
  }

  const handleDelete = async (id: string) => {
    if (!desktopAPI?.plugin?.callData) return
    try {
      const res = await desktopAPI.plugin.callData(pluginId, 'deleteBlueprint', { id })
      if (res?.success) loadBlueprints()
    } catch { /* ignore */ }
  }

  const handleCopy = (rawString: string) => {
    navigator.clipboard.writeText(rawString)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search blueprints..."
            className="w-full h-8 pl-8 pr-3 text-xs rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="h-8 px-2 text-xs rounded-lg bg-white/5 border border-white/10 text-muted-foreground focus:outline-none focus:border-primary/50"
        >
          <option value="date">Date</option>
          <option value="name">Name</option>
          <option value="entity_count">Entities</option>
        </select>
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-all"
        >
          <Plus className="h-3.5 w-3.5" /> Import
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && blueprints.length === 0 && (
        <div className="text-center py-12">
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No blueprints yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Import a blueprint string to get started
          </p>
          <button
            onClick={() => setShowImport(true)}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-all"
          >
            <Plus className="h-3.5 w-3.5" /> Import Blueprint
          </button>
        </div>
      )}

      {/* Blueprint grid */}
      {!loading && blueprints.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {blueprints.map((bp) => (
            <BlueprintCard
              key={bp.id}
              blueprint={bp}
              showActions
              onCopy={handleCopy}
              onEdit={(id) => { /* inline edit modal — future */ }}
              onDelete={handleDelete}
              onClick={() => onViewDetail(bp)}
            />
          ))}
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowImport(false)}>
          <div className="glass-card rounded-xl p-6 max-w-lg w-full mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-white">Import Blueprint</h3>
            <p className="text-xs text-muted-foreground">
              Paste a Factorio blueprint string below. Starts with 0 or 1.
            </p>
            <textarea
              value={importString}
              onChange={(e) => { setImportString(e.target.value); setImportPreview(null); setImportError(null) }}
              placeholder="0eNqdk21vg..."
              rows={4}
              className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 font-mono resize-none"
            />
            {importError && (
              <p className="text-xs text-red-400">{importError}</p>
            )}
            {importPreview && (
              <div className="p-3 rounded-lg bg-white/5">
                <p className="text-xs text-muted-foreground">Preview ready — will parse on import</p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowImport(false); setImportString(''); setImportError(null); setImportPreview(null) }}
                className="px-4 py-2 text-xs rounded-lg hover:bg-white/10 text-muted-foreground transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing || !importString.trim()}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : null}
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire vault to game detail tab**

In `frontend/src/features/media/components/organisms/media-detail.tsx`:

```typescript
import { BlueprintVault } from '@media/game/components/organisms/media-game-blueprint-vault'
```

Replace the placeholder plugin tab content:
```tsx
{activeGameTab !== 'info' && (
  <BlueprintVault
    pluginId={pluginIdForTab(activeGameTab)}
    onViewDetail={(bp) => setDetailBlueprint(bp)}
  />
)}
```

Where `pluginIdForTab` maps tab ID to plugin ID from the slot data (stored when tabs load).

- [ ] **Step 3: Verify vault works end-to-end**

1. Open Factorio game detail page
2. See "Blueprints" tab
3. Switch to it → empty state
4. Click Import → paste a blueprint string → import
5. Card appears in grid
6. Search, sort, delete all work

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/media/game/components/organisms/media-game-blueprint-vault.tsx
git add frontend/src/features/media/components/organisms/media-detail.tsx
git commit -m "feat(ui): add blueprint vault with import modal and search"
```

---

### Task 8: Blueprint Detail Modal

**Files:**
- Create: `frontend/src/features/media/game/components/organisms/media-game-blueprint-detail.tsx`

- [ ] **Step 1: Create detail modal component**

```tsx
// frontend/src/features/media/game/components/organisms/media-game-blueprint-detail.tsx

import { useState } from 'react'
import { Copy, X, Check, Layers, Grid3X3, Hammer } from 'lucide-react'
import { BlueprintIcon } from '../../atoms/media-game-blueprint-icon'

interface ParsedBlueprint {
  type: string
  label: string
  description: string
  icons: string[]
  entities: Record<string, number>
  entityCount: number
  tiles: Record<string, number>
  tileCount: number
  dimensions: { width: number; height: number }
  version: string
  raw: string
  id?: string
}

interface Props {
  blueprint: ParsedBlueprint
  onClose: () => void
  onCopy: (raw: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
}

// Group entities by category based on name patterns
function categorizeEntity(name: string): string {
  if (name.includes('assembling') || name.includes('furnace') || name.includes('chemical') || name.includes('refinery'))
    return 'Production'
  if (name.includes('belt') || name.includes('splitter') || name.includes('underground') || name.includes('loader'))
    return 'Logistics (Belts)'
  if (name.includes('inserter'))
    return 'Logistics (Inserters)'
  if (name.includes('train') || name.includes('rail') || name.includes('signal') || name.includes('station'))
    return 'Rail'
  if (name.includes('pole') || name.includes('substation') || name.includes('accumulator') || name.includes('solar') || name.includes('reactor'))
    return 'Power'
  if (name.includes('pipe') || name.includes('pump') || name.includes('tank') || name.includes('offshore'))
    return 'Fluids'
  if (name.includes('chest') || name.includes('logistic') || name.includes('requester') || name.includes('provider') || name.includes('storage'))
    return 'Logistics (Chests)'
  if (name.includes('drill') || name.includes('mining'))
    return 'Mining'
  if (name.includes('module') || name.includes('beacon'))
    return 'Modules'
  if (name.includes('wall') || name.includes('gun') || name.includes('laser') || name.includes('ammo') || name.includes('radar'))
    return 'Military'
  return 'Other'
}

export function BlueprintDetail({ blueprint, onClose, onCopy, onEdit, onDelete }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    onCopy(blueprint.raw)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Group entities by category
  const groupedEntities: Record<string, [string, number][]> = {}
  for (const [name, count] of Object.entries(blueprint.entities)) {
    const cat = categorizeEntity(name)
    if (!groupedEntities[cat]) groupedEntities[cat] = []
    groupedEntities[cat].push([name, count])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="glass-card rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <BlueprintIcon icons={blueprint.icons || []} size="lg" />
            <div>
              <h2 className="text-lg font-semibold text-white">{blueprint.label}</h2>
              {blueprint.description && (
                <p className="text-sm text-muted-foreground mt-1">{blueprint.description}</p>
              )}
              <p className="text-xs text-muted-foreground/60 mt-1">
                {blueprint.type === 'blueprint-book' ? 'Blueprint Book' : 'Blueprint'} · v{blueprint.version}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-muted-foreground transition-all">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Grid3X3 className="h-3.5 w-3.5" />
            {blueprint.dimensions.width} × {blueprint.dimensions.height} tiles
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Layers className="h-3.5 w-3.5" />
            {blueprint.entityCount} entities
          </span>
          {blueprint.tileCount > 0 && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Hammer className="h-3.5 w-3.5" />
              {blueprint.tileCount} tiles
            </span>
          )}
        </div>

        {/* Entity breakdown grouped by category */}
        {Object.entries(groupedEntities).length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Entities</h3>
            {Object.entries(groupedEntities).map(([category, entities]) => (
              <div key={category}>
                <p className="text-[10px] font-medium text-muted-foreground/60 uppercase mb-1.5">
                  {category} ({entities.reduce((sum, [, count]) => sum + count, 0)})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {entities.map(([name, count]) => (
                    <span
                      key={name}
                      className="text-[11px] px-2 py-1 rounded-md bg-white/5 text-muted-foreground"
                    >
                      {name}: <span className="text-white font-medium">{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tiles */}
        {blueprint.tileCount > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tiles</h3>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(blueprint.tiles).map(([name, count]) => (
                <span key={name} className="text-[11px] px-2 py-1 rounded-md bg-white/5 text-muted-foreground">
                  {name}: <span className="text-white font-medium">{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-3 border-t border-white/[0.04]">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-all"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied!' : 'Copy Blueprint String'}
          </button>
          {onEdit && blueprint.id && (
            <button
              onClick={() => onEdit(blueprint.id!)}
              className="px-3 py-2 text-xs rounded-lg hover:bg-white/10 text-muted-foreground transition-all"
            >
              Edit
            </button>
          )}
          {onDelete && blueprint.id && (
            <button
              onClick={() => { onDelete(blueprint.id!); onClose() }}
              className="px-3 py-2 text-xs rounded-lg hover:bg-red-500/10 text-red-400 transition-all ml-auto"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire detail modal into vault flow**

In `media-detail.tsx` (or vault parent), add state and render:

```tsx
import { BlueprintDetail } from '@media/game/components/organisms/media-game-blueprint-detail'

const [detailBlueprint, setDetailBlueprint] = useState<ParsedBlueprint | null>(null)

{detailBlueprint && (
  <BlueprintDetail
    blueprint={detailBlueprint}
    onClose={() => setDetailBlueprint(null)}
    onCopy={(raw) => navigator.clipboard.writeText(raw)}
    onDelete={(id) => { handleDelete(id); setDetailBlueprint(null) }}
  />
)}
```

- [ ] **Step 3: Verify detail modal**

Click a blueprint card → modal opens with entity groupings, stats, copy button. Copy works. Close works. Delete works.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/media/game/components/organisms/media-game-blueprint-detail.tsx
git commit -m "feat(ui): add blueprint detail modal with categorized entity breakdown"
```

---

### Task 9: Backend Blueprint API

**Files:**
- Create: `backend/blueprints/models.py`
- Create: `backend/blueprints/serializers.py`
- Create: `backend/blueprints/views.py`
- Create: `backend/blueprints/urls.py`
- Create: `backend/blueprints/admin.py`
- Create: `backend/blueprints/apps.py`
- Modify: `backend/config/urls.py` (include blueprints router)
- Modify: `backend/config/settings.py` (add blueprints to INSTALLED_APPS)

**Interfaces:**
- Produces: REST API at `/api/blueprints/`

- [ ] **Step 1: Create Django app**

```bash
cd backend && python manage.py startapp blueprints
```

- [ ] **Step 2: Define models**

```python
# backend/blueprints/models.py
import uuid
from django.conf import settings
from django.db import models


class Blueprint(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='blueprints')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    blueprint_string = models.TextField()
    parsed_data = models.JSONField(default=dict)
    tags = models.JSONField(default=list, blank=True)
    downloads = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class BlueprintLike(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='blueprint_likes')
    blueprint = models.ForeignKey(Blueprint, on_delete=models.CASCADE, related_name='likes')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'blueprint')

    def __str__(self):
        return f'{self.user} likes {self.blueprint.title}'
```

- [ ] **Step 3: Define serializers**

```python
# backend/blueprints/serializers.py
from rest_framework import serializers
from .models import Blueprint, BlueprintLike


class BlueprintListSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='user.display_name', read_only=True, default='')
    likes_count = serializers.SerializerMethodField()
    user_has_liked = serializers.SerializerMethodField()

    class Meta:
        model = Blueprint
        fields = [
            'id', 'author_name', 'title', 'description',
            'parsed_data', 'tags', 'downloads', 'likes_count',
            'user_has_liked', 'created_at',
        ]

    def get_likes_count(self, obj):
        return obj.likes.count()

    def get_user_has_liked(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.likes.filter(user=request.user).exists()
        return False


class BlueprintDetailSerializer(BlueprintListSerializer):
    class Meta(BlueprintListSerializer.Meta):
        fields = BlueprintListSerializer.Meta.fields + ['blueprint_string', 'updated_at']


class BlueprintCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Blueprint
        fields = ['title', 'description', 'blueprint_string', 'parsed_data', 'tags']

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)
```

- [ ] **Step 4: Define viewset**

```python
# backend/blueprints/views.py
from django.db.models import Count
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from .models import Blueprint, BlueprintLike
from .serializers import (
    BlueprintListSerializer,
    BlueprintDetailSerializer,
    BlueprintCreateSerializer,
)


class BlueprintViewSet(viewsets.ModelViewSet):
    queryset = Blueprint.objects.annotate(
        likes_count=Count('likes')
    )
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_serializer_class(self):
        if self.action == 'create':
            return BlueprintCreateSerializer
        if self.action in ('retrieve', 'update', 'partial_update'):
            return BlueprintDetailSerializer
        return BlueprintListSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def get_queryset(self):
        qs = super().get_queryset()
        # Filter by own blueprints or public
        user = self.request.user
        if self.action == 'list':
            qs = qs.filter(user__is_active=True)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        # Only owner can update
        instance = self.get_object()
        if instance.user != self.request.user:
            self.permission_denied(self.request)
        serializer.save()

    def perform_destroy(self, instance):
        # Only owner can delete
        if instance.user != self.request.user:
            self.permission_denied(self.request)
        instance.delete()

    @action(detail=True, methods=['post'])
    def like(self, request, pk=None):
        blueprint = self.get_object()
        like, created = BlueprintLike.objects.get_or_create(
            user=request.user,
            blueprint=blueprint,
        )
        if not created:
            like.delete()
            return Response({'liked': False})
        return Response({'liked': True})

    @action(detail=True, methods=['post'])
    def download(self, request, pk=None):
        blueprint = self.get_object()
        Blueprint.objects.filter(pk=blueprint.pk).update(downloads=models.F('downloads') + 1)
        blueprint.refresh_from_db()
        return Response({'downloads': blueprint.downloads})
```

- [ ] **Step 5: Define URLs**

```python
# backend/blueprints/urls.py
from rest_framework.routers import DefaultRouter
from .views import BlueprintViewSet

router = DefaultRouter()
router.register(r'blueprints', BlueprintViewSet, basename='blueprint')

urlpatterns = router.urls
```

- [ ] **Step 6: Register app and URLs**

In `backend/config/settings.py`:
```python
INSTALLED_APPS = [
    # ... existing apps
    'blueprints',
]
```

In `backend/config/urls.py`:
```python
from django.urls import include, path

urlpatterns = [
    # ... existing paths
    path('api/', include('blueprints.urls')),
]
```

- [ ] **Step 7: Run migrations**

```bash
cd backend && python manage.py makemigrations blueprints && python manage.py migrate blueprints
```

- [ ] **Step 8: Create admin registration**

```python
# backend/blueprints/admin.py
from django.contrib import admin
from .models import Blueprint

@admin.register(Blueprint)
class BlueprintAdmin(admin.ModelAdmin):
    list_display = ['title', 'user', 'downloads', 'created_at']
    search_fields = ['title', 'user__email']
```

- [ ] **Step 9: Test API**

```bash
# Create a blueprint
curl -X POST http://localhost:8000/api/blueprints/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test BP","blueprint_string":"0eNqk","parsed_data":{},"tags":["test"]}'

# List blueprints
curl http://localhost:8000/api/blueprints/

# Like a blueprint
curl -X POST http://localhost:8000/api/blueprints/$ID/like/ \
  -H "Authorization: Bearer $TOKEN"
```

- [ ] **Step 10: Commit**

```bash
git add backend/blueprints/ backend/config/settings.py backend/config/urls.py
git commit -m "feat(api): add blueprint community API with CRUD, likes, search"
```

---

### Task 10: Community Frontend

**Files:**
- Create: `frontend/src/features/media/game/components/organisms/media-game-blueprint-community.tsx`
- Modify: `extensions/otix-plugins/plugins/factorio-blueprints/main.js` (community handlers)
- Modify: `frontend/src/features/media/components/organisms/media-detail.tsx` (wire community tab)

- [ ] **Step 1: Add community handlers to plugin main.js**

```javascript
// Plugin: community handlers
ctx.handle('community.list', async (args) => {
  const { q, sort = 'recent', page = 1, page_size = 24 } = args || {}
  try {
    const params = new URLSearchParams({ sort, page: String(page), page_size: String(page_size) })
    if (q) params.set('q', q)
    const res = await ctx.api.get(`/api/blueprints/?${params.toString()}`)
    return { success: true, ...res }
  } catch (err) {
    ctx.logger.error('community.list failed:', err)
    return { success: false, error: 'Community unavailable' }
  }
})

ctx.handle('community.upload', async (args) => {
  const { blueprintId, title, description, tags } = args
  if (!blueprintId) return { success: false, error: 'blueprintId required' }

  const row = ctx.db.get('SELECT raw_string, parsed_data FROM blueprints WHERE id = ?', [blueprintId])
  if (!row) return { success: false, error: 'Blueprint not found in vault' }

  try {
    const parsed = JSON.parse(row.parsed_data)
    const res = await ctx.api.post('/api/blueprints/', {
      title: title || parsed.label,
      description: description || parsed.description,
      blueprint_string: row.raw_string,
      parsed_data: parsed,
      tags: tags || [],
    })
    return { success: true, communityBlueprint: res }
  } catch (err) {
    ctx.logger.error('community.upload failed:', err)
    return { success: false, error: 'Upload failed' }
  }
})

ctx.handle('community.detail', async (args) => {
  const { id } = args
  if (!id) return { success: false, error: 'id required' }
  try {
    const res = await ctx.api.get(`/api/blueprints/${id}/`)
    return { success: true, blueprint: res }
  } catch (err) {
    return { success: false, error: 'Failed to load community blueprint' }
  }
})

ctx.handle('community.like', async (args) => {
  const { id } = args
  if (!id) return { success: false, error: 'id required' }
  try {
    const res = await ctx.api.post(`/api/blueprints/${id}/like/`)
    return { success: true, liked: res.liked }
  } catch {
    return { success: false, error: 'Failed to toggle like' }
  }
})
```

- [ ] **Step 2: Create community browse component**

```tsx
// frontend/src/features/media/game/components/organisms/media-game-blueprint-community.tsx

import { useState, useEffect, useCallback } from 'react'
import { Search, Upload, Loader2, AlertCircle, Heart, Download } from 'lucide-react'
import { BlueprintCard } from '../../molecules/media-game-blueprint-card'

interface CommunityBlueprint {
  id: string
  author_name: string
  title: string
  description: string
  parsed_data: any
  tags: string[]
  downloads: number
  likes_count: number
  user_has_liked: boolean
  created_at: string
}

interface Props {
  pluginId: string
  onViewDetail: (blueprint: any) => void
}

export function BlueprintCommunity({ pluginId, onViewDetail }: Props) {
  const [blueprints, setBlueprints] = useState<CommunityBlueprint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('recent')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [showUpload, setShowUpload] = useState(false)
  const [vaultBlueprints, setVaultBlueprints] = useState<any[]>([])

  const desktopAPI = (window as any).desktopAPI

  const loadCommunity = useCallback(async () => {
    if (!desktopAPI?.plugin?.callData) return
    setLoading(true)
    setError(null)
    try {
      const res = await desktopAPI.plugin.callData(pluginId, 'community.list', {
        q: search || undefined,
        sort,
        page,
      })
      if (res?.success) {
        setBlueprints(res.results || [])
        setTotal(res.count || 0)
      } else {
        setError(res?.error || 'Community unavailable')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load community blueprints')
    } finally {
      setLoading(false)
    }
  }, [pluginId, search, sort, page, desktopAPI])

  useEffect(() => { loadCommunity() }, [loadCommunity])

  const loadVaultForUpload = async () => {
    if (!desktopAPI?.plugin?.callData) return
    try {
      const res = await desktopAPI.plugin.callData(pluginId, 'getBlueprints', {})
      if (res?.success) setVaultBlueprints(res.blueprints || [])
    } catch { /* ignore */ }
  }

  const handleUpload = async (blueprintId: string, title: string, description: string, tags: string[]) => {
    if (!desktopAPI?.plugin?.callData) return
    try {
      const res = await desktopAPI.plugin.callData(pluginId, 'community.upload', {
        blueprintId, title, description, tags,
      })
      if (res?.success) {
        setShowUpload(false)
        loadCommunity()
      }
    } catch { /* ignore */ }
  }

  const handleLike = async (blueprintId: string) => {
    if (!desktopAPI?.plugin?.callData) return
    try {
      const res = await desktopAPI.plugin.callData(pluginId, 'community.like', { id: blueprintId })
      if (res?.success) {
        setBlueprints(prev => prev.map(bp =>
          bp.id === blueprintId
            ? { ...bp, user_has_liked: res.liked, likes_count: res.liked ? bp.likes_count + 1 : bp.likes_count - 1 }
            : bp
        ))
      }
    } catch { /* ignore */ }
  }

  const sortOptions = [
    { value: 'recent', label: 'Recent' },
    { value: 'popular', label: 'Most Downloaded' },
    { value: 'trending', label: 'Trending' },
  ]

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search community blueprints..."
            className="w-full h-8 pl-8 pr-3 text-xs rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
        <div className="flex gap-1">
          {sortOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setSort(opt.value); setPage(1) }}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-lg transition-all ${
                sort === opt.value
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-white hover:bg-white/5'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setShowUpload(true); loadVaultForUpload() }}
          className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-all"
        >
          <Upload className="h-3.5 w-3.5" /> Share
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!loading && !error && blueprints.length === 0 && (
        <div className="text-center py-12">
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No community blueprints yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Be the first to share a blueprint!
          </p>
        </div>
      )}

      {/* Grid */}
      {!loading && blueprints.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {blueprints.map((bp) => {
              const cardBp = {
                ...bp.parsed_data,
                id: bp.id,
                label: bp.title,
                description: bp.description,
                tags: bp.tags,
                created_at: bp.created_at,
              }
              return (
                <div key={bp.id} className="relative">
                  <BlueprintCard
                    blueprint={cardBp}
                    onClick={() => onViewDetail({ ...cardBp, _community: bp })}
                  />
                  {/* Community metadata overlay */}
                  <div className="flex items-center gap-3 px-3.5 py-2 text-[10px] text-muted-foreground">
                    <span>{bp.author_name}</span>
                    <span className="flex items-center gap-1">
                      <Download className="h-3 w-3" /> {bp.downloads}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleLike(bp.id) }}
                      className={`flex items-center gap-1 transition-all ${
                        bp.user_has_liked ? 'text-red-400' : 'hover:text-white'
                      }`}
                    >
                      <Heart className={`h-3 w-3 ${bp.user_has_liked ? 'fill-current' : ''}`} />
                      {bp.likes_count}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {total > 24 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs rounded-lg hover:bg-white/10 text-muted-foreground disabled:opacity-30"
              >
                Previous
              </button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {Math.ceil(total / 24)}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= Math.ceil(total / 24)}
                className="px-3 py-1.5 text-xs rounded-lg hover:bg-white/10 text-muted-foreground disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowUpload(false)}>
          <div className="glass-card rounded-xl p-6 max-w-lg w-full mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-white">Share to Community</h3>
            <p className="text-xs text-muted-foreground">Select a blueprint from your vault to publish.</p>
            {vaultBlueprints.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No blueprints in vault. Import one first.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-2">
                {vaultBlueprints.map((bp: any) => (
                  <button
                    key={bp.id}
                    onClick={() => handleUpload(bp.id, bp.parsed_data?.label || bp.label, '', [])}
                    className="w-full text-left p-2.5 rounded-lg hover:bg-white/5 text-xs text-muted-foreground hover:text-white transition-all"
                  >
                    {bp.parsed_data?.label || bp.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={() => setShowUpload(false)}
                className="px-4 py-2 text-xs rounded-lg hover:bg-white/10 text-muted-foreground transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Wire community to game detail tab**

In `media-detail.tsx`, add a second plugin tab or make the Blueprints tab switchable between Vault and Community sub-tabs (inline tabs within the Blueprints container).

- [ ] **Step 4: Verify community flow end-to-end**

1. Blueprints tab shows vault
2. "Share" opens upload modal → select vault blueprint → publishes
3. Community sub-tab shows published blueprint
4. Like toggle works
5. Search filters results
6. Sort changes ordering
7. Pagination works

- [ ] **Step 5: Configure plugin's community.enabled toggle**

Add config check to community handlers:
```javascript
if (!ctx.config.get('community_enabled')) {
  return { success: false, error: 'Community sharing disabled' }
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/media/game/components/organisms/media-game-blueprint-community.tsx
git add extensions/otix-plugins/plugins/factorio-blueprints/main.js
git commit -m "feat(ui): add community blueprint browse, upload, and search"
```

---
