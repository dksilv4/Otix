# Plugins Page Redesign

## Context

The plugins settings page (`settings-plugin-settings.tsx`) is a 1276-line god component with weak visual hierarchy. Installed plugins are grouped by status (Errors/Active/Inactive) instead of by what they DO. Search conflates marketplace and installed plugins simultaneously. Plugin categories are derived from permissions (fragile) instead of services/slots. Marketplace discover and plugin management are mixed in one scroll.

The user wants: **redesign the page to be more intuitive, show plugin types in different sections (e.g., plugins that provide data)**.

## Architecture

```
SettingsPluginsPage (owns tab state)
 ├─ [Tab bar: My Plugins | Discover]
 └─ PluginSettings (orchestrator — owns all state/IPC)
     ├─ MyPlugins (groups installed by functional category)
     │   └─ PluginCard (per plugin, configure always visible)
     ├─ Marketplace (independent search, category chips, grid)
     │   └─ MarketplaceDetailPanel (SlidePanel)
     ├─ PluginConfigPanel (config SlidePanel, uses shared PluginAuthCard)
     └─ PluginAuthCard (shared auth/scan/logout — extracted from 2 dupes)
```

## Steps

### Step 1: Consolidate types → `types/plugins.ts`
Add `PluginAPI`, `RegistryEntry`, `PluginFunctionalCategory`, `PluginCategoryInfo` to canonical types file.
- `PluginAPI` — full interface (16 methods currently scattered across 3 files)
- `RegistryEntry` — marketplace entry shape
- `PluginFunctionalCategory` — union type: `'data-provider-auth' | 'data-provider-local' | 'service-downloader' | 'service-search' | 'service-arr' | 'hybrid' | 'ui-extension' | 'unknown'`
- `PluginCategoryInfo` — `{ category, label, description, icon, color, bgColor }`

### Step 2: Create `utils/plugin-categories.ts`
`categorizePlugin(manifest: PluginManifest): PluginCategoryInfo`
Derives category from `services[].type` + `slots[].location` (NOT from permissions):
- `data-provider-auth`: has `library:scan` slot AND `network:external` or `api:proxy` perm
- `data-provider-local`: has `library:scan` slot AND `worker:filesystem` perm (no network)
- `service-downloader`: service type `"downloader"`
- `service-search`: service type `"search-provider"`
- `service-arr`: service type `"arr"`
- `hybrid`: has both services AND slots
- `ui-extension`: only `ui:*` permissions, no services/slots
- `unknown`: fallback

Also move `PERMISSION_LABELS`, `getPermissionLabel`, `PLUGIN_ICONS` here or to a constants file.

### Step 3: Create `hooks/use-plugin-api.ts`
Move `getPluginAPI()` out of the god component. Preserve re-export from `components/PluginSettings.tsx` so `settings-library.tsx` import chain doesn't break.

### Step 4: Create shared `PluginAuthCard` → `settings-plugin-auth-card.tsx`
Consolidate auth/scan/logout logic duplicated in:
- `PluginAuthSection` (in `settings-plugin-config-panel.tsx` lines 198-381)
- `ScanSlotCard` (in `settings-plugin-slot.tsx` lines 61-306)

Props: `{ pluginId, pluginName, api, showScanButton?, showLogoutButton? }`
Fixes hardcoded "Epic Games" → uses `pluginName` prop.

### Step 5: Extract `PluginCard` → `settings-plugin-card.tsx`
Extract lines 159-309 from god component. Key change: **Configure button always visible** (not just when enabled).

### Step 6: Extract `Marketplace` → `settings-plugin-marketplace.tsx`
Extract marketplace grid, repo manager, category chips, detail panel. Has its own independent search bar (separate from MyPlugins search).

### Step 7: Create `MyPlugins` → `settings-plugin-my-plugins.tsx`
Groups installed plugins by `PluginFunctionalCategory`. Each category is a distinct visual section:
1. **Data Providers** (Authenticated — GOG, Epic) — connection status, scan button
2. **Data Providers** (Local — EA, Xbox, etc.) — simpler cards
3. **Services** (Downloaders, Search, Arr) — service type badge
4. **Hybrid** (Downloads)
5. **UI Extensions** — simple cards
6. **Unknown**

Each category section: `rounded-2xl p-5 bg-white/5` with colored left border accent, header with icon+name+count, 2-column card grid.

Has its own search bar (filters installed only).

### Step 8: Refactor orchestrator → slim `settings-plugin-settings.tsx`
Strip from 1276 → ~200 lines. Keep: all IPC handlers, modal triggers, loading/error/browser states. Remove extracted components.

### Step 9: Update page wrapper → `settings-plugins-page.tsx`
Add tab state (`'my-plugins' | 'discover'`), render tab bar (following `settings-library.tsx` sub-tab pattern), pass `activeTab` to orchestrator.

### Step 10: Clean `settings-plugin-config-panel.tsx`
- Delete local type defs (lines 7-51), import from `@/features/settings/types/plugins`
- Replace `PluginAuthSection` with `<PluginAuthCard pluginId={plugin.id} pluginName={plugin.name} api={api} />`
- Add disabled-plugin warning banner when config opened for disabled plugin

### Step 11: Fix `settings-plugin-slot.tsx` import
Change `import type { PluginAPI } from './PluginSettings'` → `import type { PluginAPI } from '@/features/settings/types/plugins'`
Add TODO comment above `ScanSlotCard` noting it should eventually use shared `PluginAuthCard`.

## Files Touched

| File | Action |
|------|--------|
| `types/plugins.ts` | Add PluginAPI, RegistryEntry, category types |
| `utils/plugin-categories.ts` | **New** — categorizePlugin() + constants |
| `hooks/use-plugin-api.ts` | **New** — getPluginAPI() |
| `components/organisms/settings-plugin-auth-card.tsx` | **New** — shared auth/scan card |
| `components/organisms/settings-plugin-card.tsx` | **New** — single plugin card |
| `components/organisms/settings-plugin-marketplace.tsx` | **New** — marketplace tab |
| `components/organisms/settings-plugin-my-plugins.tsx` | **New** — installed plugins tab |
| `components/organisms/settings-plugin-settings.tsx` | Gut to ~200 lines |
| `components/organisms/settings-plugin-config-panel.tsx` | Fix types, use PluginAuthCard |
| `components/organisms/settings-plugin-slot.tsx` | Fix import, add TODO |
| `pages/settings-plugins-page.tsx` | Add tab state + header |
| `components/PluginSettings.tsx` | Update re-exports |

## Verification

1. `rtk tsc` — no TypeScript errors
2. Open `/settings/plugins` — page renders with two tabs
3. "My Plugins" tab: plugins grouped by category, search only filters installed
4. "Discover" tab: marketplace grid with own search, category chips
5. Configure a disabled plugin → config panel opens with warning banner
6. Config panel auth section shows plugin name (not "Epic Games")
7. Library settings page (`/settings/library`) still shows scan cards via PluginSlot
8. Browser mode shows "Plugins only available in desktop app"
