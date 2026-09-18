# Unified Arr Instances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show one instance per real Radarr/Sonarr/SABnzbd/Prowlarr install across desktop plugins and every connected node, with SABnzbd/Prowlarr `instances[]`, alias collapse, origin-local saves, and desktop-first runtime.

**Architecture:** Node configs keep their own URLs. A shared frontend module (`arr-merge.ts`) fingerprints sources (API key, else Arr `appData`) into `MergedArrInstance` with origin-tagged endpoints. Settings, Request, Library, and downloads all consume that list. `pickEndpoint` prefers a reachable desktop URL, then an online node. Backend-as-node is a reserved origin type only.

**Tech Stack:** TypeScript/React (Vitest), Python 3.10+ / Pydantic / unittest (`otix-server`), existing Electron plugin IPC.

**Spec:** `docs/superpowers/specs/2026-09-18-unified-arr-instances-design.md`

## Global Constraints

- Reuse `ArrInstanceSwitcher` and existing integration modals; do not add a new modal framework.
- Never copy a LAN URL onto a node, or a node URL onto desktop, unless the user is editing that origin.
- Never treat redacted `"***"` as an API key fingerprint.
- Merge every connected game server, not `servers[0]`.
- Instance switcher is visible only when `merged.length > 1` for that app.
- Flat SAB/Prowlarr fields stay as `resolve()` projections so older clients keep working.
- Do not persist identities on Django. Do not implement backend-as-node.
- Do not add npm/pip dependencies.

---

## File Map

### New files

| File | Responsibility |
|------|----------------|
| `frontend/src/features/downloads/arr-merge.ts` | Types, fingerprint, same-origin URL collapse, merge, pickEndpoint, switcher helper, save-origin helper |
| `frontend/src/features/downloads/__tests__/arr-merge.test.ts` | Pure merge/pick/save-target tests |
| `frontend/src/features/downloads/use-merged-arr.ts` | Load desktop + all node sources, probe optional install identity, return merged lists |
| `frontend/src/features/downloads/__tests__/use-merged-arr.test.ts` | Source collection + N-node merge wiring tests (hook mocked) |
| `server/tests/test_usenet_instances.py` | SAB/Prowlarr instance migrate/serialize/resolve/`instance_id` |

### Modified files

| File | Responsibility |
|------|----------------|
| `server/otix_server/usenet_types.py` | `SabnzbdInstance`, `ProwlarrInstance`, `instances[]`, `resolve()`, legacy migrate |
| `server/otix_server/api.py` | Serialize instances, apply `instances` on save, `instance_id` on usenet search/queue/download |
| `server/otix_server/providers/manager.py` | Build clients from `resolve(instance_id)` |
| `server/tests/test_providers.py` | Still pass with migrated default instance |
| `frontend/src/features/downloads/usenet-types.ts` | `instances` on SAB/Prowlarr configs |
| `frontend/src/features/downloads/use-server-usenet.ts` | Pass `instance_id`; save `instances` |
| `frontend/src/features/downloads/molecules/server-sabnzbd-settings-modal.tsx` | Instance switcher + per-instance fields |
| `frontend/src/features/downloads/molecules/server-prowlarr-settings-modal.tsx` | Same |
| `frontend/src/features/downloads/molecules/server-arr-settings-modal.tsx` | Hide switcher when one instance; origin control when merged endpoints exist (task 8) |
| `frontend/src/features/downloads/molecules/arr-instance-switcher.tsx` | No logic change required if parent hides it |
| `frontend/src/features/media/hooks/use-request-media.ts` | Merged instances + `pickEndpoint` |
| `frontend/src/features/media/hooks/use-media-detail-plugin-actions.ts` | Do not show plugin request widgets when merge owns the app |
| `frontend/src/features/library/pages/library-page.tsx` | Libraries from all merged endpoints |
| `frontend/src/features/settings/pages/settings-integrations-page.tsx` | Connected = any merged endpoint `hasApiKey` |
| `frontend/src/features/plugins/components/PluginSettingsTabRoute.tsx` | Same merged list as Integrations |
| `extensions/plugins/sabnzbd/manifest.json` | `instances` config |
| `extensions/plugins/sabnzbd/main.js` | Resolve instance from `instances[]` with flat fallback |

---

### Task 1: Merge module

**Files:**
- Create: `frontend/src/features/downloads/arr-merge.ts`
- Test: `frontend/src/features/downloads/__tests__/arr-merge.test.ts`

**Interfaces:**
- Consumes: `parseServiceAddress` from `frontend/src/features/downloads/usenet-utils.ts`
- Produces:
  - `export type ArrApp = 'radarr' | 'sonarr' | 'sabnzbd' | 'prowlarr'`
  - `export type ArrOrigin = { type: 'desktop'; pluginId: string } | { type: 'node'; serverId: number } | { type: 'backend' }`
  - `export type ArrEndpoint` (origin, originInstanceId, host, port, useSsl, urlBase, hasApiKey, reachable?)
  - `export type MergedArrInstance` (id, app, name, fingerprint, enabled, endpoints)
  - `export type ArrSourceInstance` (app, origin, originInstanceId, name, enabled, host, port, useSsl, urlBase, apiKey?, installIdentity?, reachable?, nodeOnline?)
  - `export async function fingerprintId(app: ArrApp, fingerprint: string): Promise<string>`
  - `export function sourceFingerprint(source: ArrSourceInstance): string | null`
  - `export function canonicalEndpointKey(host: string, port: number, useSsl: boolean, urlBase: string): string`
  - `export function collapseSameOriginSources(sources: ArrSourceInstance[]): ArrSourceInstance[]`
  - `export async function mergeArrInstances(app: ArrApp, sources: ArrSourceInstance[]): Promise<MergedArrInstance[]>`
  - `export function pickEndpoint(instance: MergedArrInstance): ArrEndpoint | null`
  - `export function shouldShowInstanceSwitcher(instances: MergedArrInstance[]): boolean`
  - `export function saveTarget(endpoint: ArrEndpoint): ArrOrigin`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/downloads/__tests__/arr-merge.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  canonicalEndpointKey,
  collapseSameOriginSources,
  fingerprintId,
  mergeArrInstances,
  pickEndpoint,
  saveTarget,
  shouldShowInstanceSwitcher,
  sourceFingerprint,
  type ArrSourceInstance,
} from '../arr-merge'

function src(partial: Partial<ArrSourceInstance> & Pick<ArrSourceInstance, 'origin' | 'originInstanceId'>): ArrSourceInstance {
  return {
    app: 'radarr',
    name: 'Default',
    enabled: true,
    host: '127.0.0.1',
    port: 7878,
    useSsl: false,
    urlBase: '',
    ...partial,
  }
}

describe('sourceFingerprint', () => {
  it('uses the real API key and ignores redacted keys', () => {
    expect(sourceFingerprint(src({ origin: { type: 'desktop', pluginId: 'radarr' }, originInstanceId: 'a', apiKey: 'secret' }))).toBe('key:secret')
    expect(sourceFingerprint(src({ origin: { type: 'node', serverId: 1 }, originInstanceId: 'a', apiKey: '***' }))).toBeNull()
    expect(sourceFingerprint(src({ origin: { type: 'node', serverId: 1 }, originInstanceId: 'a', apiKey: '' }))).toBeNull()
  })

  it('falls back to install identity when the key is missing', () => {
    expect(
      sourceFingerprint(
        src({
          origin: { type: 'node', serverId: 1 },
          originInstanceId: 'a',
          installIdentity: 'Radarr|/config',
        }),
      ),
    ).toBe('install:Radarr|/config')
  })
})

describe('mergeArrInstances', () => {
  it('merges localhost and NAS URLs that share an API key into one instance with two endpoints', async () => {
    const merged = await mergeArrInstances('radarr', [
      src({ origin: { type: 'desktop', pluginId: 'radarr' }, originInstanceId: 'local', host: 'localhost', apiKey: 'same' }),
      src({ origin: { type: 'node', serverId: 3 }, originInstanceId: 'nas', host: 'nas.local', port: 7878, apiKey: 'same', name: 'NAS' }),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].endpoints).toHaveLength(2)
    expect(merged[0].id).toBe(await fingerprintId('radarr', 'key:same'))
  })

  it('keeps two instances when API keys differ even on the same host', async () => {
    const merged = await mergeArrInstances('radarr', [
      src({ origin: { type: 'node', serverId: 1 }, originInstanceId: 'a', host: '10.0.0.1', apiKey: 'one', name: '1080p' }),
      src({ origin: { type: 'node', serverId: 1 }, originInstanceId: 'b', host: '10.0.0.1', apiKey: 'two', name: '4K' }),
    ])
    expect(merged).toHaveLength(2)
    expect(shouldShowInstanceSwitcher(merged)).toBe(true)
  })

  it('does not merge loopback with a LAN host when keys are redacted and there is no install identity', async () => {
    const merged = await mergeArrInstances('sabnzbd', [
      src({ app: 'sabnzbd', origin: { type: 'desktop', pluginId: 'sabnzbd' }, originInstanceId: 'd', host: '127.0.0.1', port: 8080, apiKey: '***' }),
      src({ app: 'sabnzbd', origin: { type: 'node', serverId: 1 }, originInstanceId: 'n', host: '192.168.1.50', port: 8080, apiKey: '***' }),
    ])
    expect(merged).toHaveLength(2)
    expect(shouldShowInstanceSwitcher(merged)).toBe(true)
  })

  it('does not treat two redacted keys as the same fingerprint', async () => {
    const a = sourceFingerprint(src({ origin: { type: 'node', serverId: 1 }, originInstanceId: 'a', apiKey: '***' }))
    const b = sourceFingerprint(src({ origin: { type: 'node', serverId: 2 }, originInstanceId: 'b', apiKey: '***' }))
    expect(a).toBeNull()
    expect(b).toBeNull()
  })

  it('collapses duplicate URLs on the same origin after parse', () => {
    const collapsed = collapseSameOriginSources([
      src({ origin: { type: 'node', serverId: 1 }, originInstanceId: 'a', host: 'nas.local', port: 7878, urlBase: '/radarr' }),
      src({ origin: { type: 'node', serverId: 1 }, originInstanceId: 'b', host: 'http://nas.local:7878/radarr', port: 7878, urlBase: '' }),
    ])
    expect(collapsed).toHaveLength(1)
  })

  it('does not collapse the same URL across desktop and node without a fingerprint', () => {
    const collapsed = collapseSameOriginSources([
      src({ origin: { type: 'desktop', pluginId: 'radarr' }, originInstanceId: 'a', host: 'nas.local' }),
      src({ origin: { type: 'node', serverId: 1 }, originInstanceId: 'b', host: 'nas.local' }),
    ])
    expect(collapsed).toHaveLength(2)
  })

  it('hides the switcher for a single unique install even with two endpoints', async () => {
    const merged = await mergeArrInstances('radarr', [
      src({ origin: { type: 'desktop', pluginId: 'radarr' }, originInstanceId: 'local', apiKey: 'k' }),
      src({ origin: { type: 'node', serverId: 1 }, originInstanceId: 'nas', host: 'nas.local', apiKey: 'k' }),
    ])
    expect(shouldShowInstanceSwitcher(merged)).toBe(false)
  })

  it('merges two nodes plus desktop into two instances when one key is shared', async () => {
    const merged = await mergeArrInstances('radarr', [
      src({ origin: { type: 'desktop', pluginId: 'radarr' }, originInstanceId: 'd', apiKey: 'main' }),
      src({ origin: { type: 'node', serverId: 1 }, originInstanceId: 'n1', host: 'nas.local', apiKey: 'main' }),
      src({ origin: { type: 'node', serverId: 2 }, originInstanceId: 'n2', host: '4k.local', apiKey: 'uhd', name: '4K' }),
    ])
    expect(merged).toHaveLength(2)
    expect(shouldShowInstanceSwitcher(merged)).toBe(true)
  })
})

describe('pickEndpoint', () => {
  it('prefers a reachable desktop endpoint', async () => {
    const [instance] = await mergeArrInstances('radarr', [
      src({ origin: { type: 'node', serverId: 1 }, originInstanceId: 'n', host: 'nas.local', apiKey: 'k', nodeOnline: true }),
      src({ origin: { type: 'desktop', pluginId: 'radarr' }, originInstanceId: 'd', apiKey: 'k', reachable: true }),
    ])
    const picked = pickEndpoint(instance)
    expect(picked?.origin).toEqual({ type: 'desktop', pluginId: 'radarr' })
  })

  it('falls through to an online node when desktop is unreachable', async () => {
    const [instance] = await mergeArrInstances('radarr', [
      src({ origin: { type: 'desktop', pluginId: 'radarr' }, originInstanceId: 'd', apiKey: 'k', reachable: false }),
      src({ origin: { type: 'node', serverId: 9 }, originInstanceId: 'n', host: 'nas.local', apiKey: 'k', nodeOnline: true }),
    ])
    const picked = pickEndpoint(instance)
    expect(picked?.origin).toEqual({ type: 'node', serverId: 9 })
  })

  it('returns null when nothing is reachable', async () => {
    const [instance] = await mergeArrInstances('radarr', [
      src({ origin: { type: 'desktop', pluginId: 'radarr' }, originInstanceId: 'd', apiKey: 'k', reachable: false }),
      src({ origin: { type: 'node', serverId: 9 }, originInstanceId: 'n', apiKey: 'k', nodeOnline: false }),
    ])
    expect(pickEndpoint(instance)).toBeNull()
  })
})

describe('saveTarget', () => {
  it('returns the endpoint origin unchanged', async () => {
    const [instance] = await mergeArrInstances('radarr', [
      src({ origin: { type: 'desktop', pluginId: 'radarr' }, originInstanceId: 'd', apiKey: 'k' }),
      src({ origin: { type: 'node', serverId: 4 }, originInstanceId: 'n', host: 'nas.local', apiKey: 'k' }),
    ])
    const desktop = instance.endpoints.find((e) => e.origin.type === 'desktop')!
    const node = instance.endpoints.find((e) => e.origin.type === 'node')!
    expect(saveTarget(desktop)).toEqual({ type: 'desktop', pluginId: 'radarr' })
    expect(saveTarget(node)).toEqual({ type: 'node', serverId: 4 })
  })
})

describe('canonicalEndpointKey', () => {
  it('normalizes scheme, host, port, and url base', () => {
    expect(canonicalEndpointKey('nas.local', 7878, false, '/radarr')).toBe(
      canonicalEndpointKey('http://nas.local:7878/radarr', 7878, false, ''),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/downloads/__tests__/arr-merge.test.ts`

Expected: FAIL with `Cannot find module '../arr-merge'`

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/features/downloads/arr-merge.ts`:

```ts
import { parseServiceAddress } from './usenet-utils'

export type ArrApp = 'radarr' | 'sonarr' | 'sabnzbd' | 'prowlarr'

export type ArrOrigin =
  | { type: 'desktop'; pluginId: string }
  | { type: 'node'; serverId: number }
  | { type: 'backend' }

export type ArrEndpoint = {
  origin: ArrOrigin
  originInstanceId: string
  host: string
  port: number
  useSsl: boolean
  urlBase: string
  hasApiKey: boolean
  reachable?: boolean
  nodeOnline?: boolean
}

export type MergedArrInstance = {
  id: string
  app: ArrApp
  name: string
  fingerprint: string
  enabled: boolean
  endpoints: ArrEndpoint[]
}

export type ArrSourceInstance = {
  app: ArrApp
  origin: ArrOrigin
  originInstanceId: string
  name: string
  enabled: boolean
  host: string
  port: number
  useSsl: boolean
  urlBase: string
  apiKey?: string
  installIdentity?: string
  reachable?: boolean
  nodeOnline?: boolean
}

function originKey(origin: ArrOrigin): string {
  if (origin.type === 'desktop') return `desktop:${origin.pluginId}`
  if (origin.type === 'node') return `node:${origin.serverId}`
  return 'backend'
}

export async function fingerprintId(app: ArrApp, fingerprint: string): Promise<string> {
  const data = new TextEncoder().encode(`${app}\n${fingerprint}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)
}

export function sourceFingerprint(source: ArrSourceInstance): string | null {
  const key = (source.apiKey || '').trim()
  if (key && key !== '***') return `key:${key}`
  if (source.installIdentity) return `install:${source.installIdentity}`
  return null
}

export function canonicalEndpointKey(host: string, port: number, useSsl: boolean, urlBase: string): string {
  const parsed = parseServiceAddress(
    host.includes('://') ? host : `${useSsl ? 'https' : 'http'}://${host}:${port}${urlBase || ''}`,
    port,
  )
  const scheme = parsed.use_ssl ? 'https' : 'http'
  const h = (parsed.host || host).toLowerCase()
  const p = parsed.port || port
  const base = (parsed.url_base || urlBase || '').replace(/\/+$/, '')
  return `${scheme}|${h}|${p}|${base}`
}

export function collapseSameOriginSources(sources: ArrSourceInstance[]): ArrSourceInstance[] {
  const seen = new Map<string, ArrSourceInstance>()
  for (const source of sources) {
    const key = `${originKey(source.origin)}|${canonicalEndpointKey(source.host, source.port, source.useSsl, source.urlBase)}`
    if (!seen.has(key)) seen.set(key, source)
  }
  return [...seen.values()]
}

function toEndpoint(source: ArrSourceInstance): ArrEndpoint {
  return {
    origin: source.origin,
    originInstanceId: source.originInstanceId,
    host: source.host,
    port: source.port,
    useSsl: source.useSsl,
    urlBase: source.urlBase,
    hasApiKey: Boolean(source.apiKey && source.apiKey !== '***'),
    reachable: source.reachable,
    nodeOnline: source.nodeOnline,
  }
}

export async function mergeArrInstances(app: ArrApp, sources: ArrSourceInstance[]): Promise<MergedArrInstance[]> {
  const collapsed = collapseSameOriginSources(sources.filter((s) => s.app === app))
  const groups = new Map<string, ArrSourceInstance[]>()
  const singletons: ArrSourceInstance[] = []
  for (const source of collapsed) {
    const fp = sourceFingerprint(source)
    if (!fp) {
      singletons.push(source)
      continue
    }
    const list = groups.get(fp) || []
    list.push(source)
    groups.set(fp, list)
  }
  const merged: MergedArrInstance[] = []
  for (const [fingerprint, group] of groups) {
    merged.push({
      id: await fingerprintId(app, fingerprint),
      app,
      name: group.find((g) => g.name && g.name !== 'Default')?.name || group[0].name,
      fingerprint,
      enabled: group.some((g) => g.enabled),
      endpoints: group.map(toEndpoint),
    })
  }
  for (const source of singletons) {
    const token = `singleton:${originKey(source.origin)}:${source.originInstanceId}`
    merged.push({
      id: await fingerprintId(app, token),
      app,
      name: source.name,
      fingerprint: token,
      enabled: source.enabled,
      endpoints: [toEndpoint(source)],
    })
  }
  return merged
}

export function pickEndpoint(instance: MergedArrInstance): ArrEndpoint | null {
  const desktop = instance.endpoints.find(
    (e) => e.origin.type === 'desktop' && e.reachable !== false,
  )
  if (desktop) return desktop
  const node = instance.endpoints.find(
    (e) => e.origin.type === 'node' && e.reachable !== false && e.nodeOnline !== false,
  )
  if (node) return node
  return null
}

export function shouldShowInstanceSwitcher(instances: MergedArrInstance[]): boolean {
  return instances.length > 1
}

export function saveTarget(endpoint: ArrEndpoint): ArrOrigin {
  return endpoint.origin
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/downloads/__tests__/arr-merge.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/downloads/arr-merge.ts frontend/src/features/downloads/__tests__/arr-merge.test.ts
git commit -m "feat(downloads): merge Arr configs by install identity"
```

---

### Task 2: Node SABnzbd and Prowlarr instance models

**Files:**
- Modify: `server/otix_server/usenet_types.py`
- Test: `server/tests/test_usenet_instances.py`

**Interfaces:**
- Consumes: Radarr-style `instances` + `resolve()` pattern in `server/otix_server/arr_types.py`
- Produces:
  - `class SabnzbdInstance(BaseModel)` with `id, name, enabled, host, port, url_base, api_key, use_ssl, category, complete_dir, local_complete_dir, remote_path, host_path, path_mappings`
  - `class ProwlarrInstance(BaseModel)` with `id, name, enabled, host, port, url_base, api_key, use_ssl, categories`
  - `SabnzbdConfig.instances: List[SabnzbdInstance]`
  - `ProwlarrConfig.instances: List[ProwlarrInstance]`
  - `SabnzbdConfig.resolve(instance_id: Optional[str] = None) -> SabnzbdInstance`
  - `ProwlarrConfig.resolve(instance_id: Optional[str] = None) -> ProwlarrInstance`
  - `serialize_sabnzbd_config(config) -> dict` / `serialize_prowlarr_config(config) -> dict` (redact keys, include `instances`)

- [ ] **Step 1: Write the failing test**

Create `server/tests/test_usenet_instances.py`:

```python
import unittest
from otix_server.usenet_types import (
    ProwlarrConfig,
    SabnzbdConfig,
    serialize_prowlarr_config,
    serialize_sabnzbd_config,
)


class TestUsenetInstances(unittest.TestCase):
    def test_sabnzbd_legacy_flat_becomes_default_instance(self):
        cfg = SabnzbdConfig(host="192.168.1.10", port=8080, api_key="secret", url_base="/sabnzbd")
        self.assertEqual(len(cfg.instances), 1)
        self.assertEqual(cfg.instances[0].name, "Default")
        self.assertEqual(cfg.resolve().api_key, "secret")
        self.assertEqual(cfg.host, "192.168.1.10")

    def test_prowlarr_legacy_flat_becomes_default_instance(self):
        cfg = ProwlarrConfig(host="prowlarr.local", port=9696, api_key="pkey")
        self.assertEqual(len(cfg.instances), 1)
        self.assertEqual(cfg.resolve("missing").api_key, "pkey")

    def test_resolve_selects_named_instance(self):
        cfg = SabnzbdConfig(
            instances=[
                {"id": "a", "name": "Games", "api_key": "one", "host": "10.0.0.1"},
                {"id": "b", "name": "Movies", "api_key": "two", "host": "10.0.0.2", "enabled": False},
            ]
        )
        self.assertEqual(cfg.resolve("b").api_key, "two")
        self.assertEqual(cfg.resolve().name, "Games")

    def test_serialize_redacts_per_instance_keys(self):
        cfg = SabnzbdConfig(instances=[{"id": "a", "name": "Main", "api_key": "secret", "host": "127.0.0.1"}])
        payload = serialize_sabnzbd_config(cfg)
        self.assertEqual(payload["api_key"], "***")
        self.assertEqual(payload["instances"][0]["api_key"], "***")
        self.assertTrue(payload["instances"][0]["has_api_key"])
        prow = serialize_prowlarr_config(ProwlarrConfig(api_key="p"))
        self.assertEqual(prow["instances"][0]["api_key"], "***")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && python -m unittest tests.test_usenet_instances -v`

Expected: FAIL — `serialize_sabnzbd_config` not defined / `instances` missing

- [ ] **Step 3: Write minimal implementation**

In `server/otix_server/usenet_types.py`, add instance models and migrate/resolve mirroring `RadarrConfig` in `server/otix_server/arr_types.py` (`migrate_legacy_instances`, `sync_flat_fields`, `resolve`, `_redact_key`). Keep existing flat fields; after validate, copy `resolve()` onto them. Export `serialize_sabnzbd_config` and `serialize_prowlarr_config` with the same redaction shape as `serialize_radarr_config` (`api_key`, `apiKey`, `has_api_key`, `hasApiKey`, `instances`, `configured`).

`SabnzbdConfig.resolve` / `ProwlarrConfig.resolve`: if `instance_id` matches, return that row; else first enabled; else first; if `instances` empty, synthesize from flat fields.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && python -m unittest tests.test_usenet_instances tests.test_providers -v`

Expected: PASS (existing provider tests still construct `SabnzbdConfig(api_key=...)`)

- [ ] **Step 5: Commit**

```bash
git add server/otix_server/usenet_types.py server/tests/test_usenet_instances.py
git commit -m "feat(server): add SABnzbd and Prowlarr instance lists"
```

---

### Task 3: Node usenet API `instance_id`

**Files:**
- Modify: `server/otix_server/api.py` (usenet GET/POST config ~773–990, `get_provider_manager` ~660)
- Modify: `server/otix_server/providers/manager.py` only if manager must take a resolved config
- Test: `server/tests/test_usenet_instances.py` (add cases)

**Interfaces:**
- Consumes: `SabnzbdConfig.resolve`, `ProwlarrConfig.resolve`, serialize helpers from Task 2
- Produces:
  - GET `/api/v1/usenet/config` includes `sabnzbd.instances` and `prowlarr.instances`
  - POST `/api/v1/usenet/config` accepts `sabnzbd.instances` / `prowlarr.instances` (keep flat field writes as apply-to-resolved-instance)
  - `GET /api/v1/usenet/search?query=&instance_id=`
  - `POST /api/v1/usenet/download` body may include `instance_id` (SAB)
  - Queue/history/pause/resume accept optional `instance_id`
  - `"***"` on save preserves the existing instance key (same as Radarr `_apply_radarr_instances`)

- [ ] **Step 1: Write the failing test**

Append to `server/tests/test_usenet_instances.py`:

```python
from otix_server.usenet_types import DownloadReleaseRequest


class TestUsenetInstanceId(unittest.TestCase):
    def test_download_request_accepts_instance_id(self):
        req = DownloadReleaseRequest(
            title="Game",
            download_url="http://example/file.nzb",
            instance_id="movies",
        )
        self.assertEqual(req.instance_id, "movies")
```

If `DownloadReleaseRequest` has no `instance_id`, this fails. Add a second test that instantiates two SAB instances and asserts `cfg.resolve("movies").host == "10.0.0.2"` already covered; for API apply, add:

```python
from otix_server.api import _apply_sabnzbd_instances, _apply_prowlarr_instances
from otix_server.usenet_types import SabnzbdConfig, ProwlarrConfig

    def test_apply_instances_keeps_redacted_keys(self):
        cfg = SabnzbdConfig(instances=[{"id": "a", "name": "Main", "api_key": "keep-me", "host": "127.0.0.1"}])
        _apply_sabnzbd_instances(cfg, [{"id": "a", "name": "Main", "api_key": "***", "host": "127.0.0.1"}])
        self.assertEqual(cfg.resolve("a").api_key, "keep-me")
```

Extract `_apply_sabnzbd_instances` / `_apply_prowlarr_instances` next to `_apply_radarr_instances` in `api.py`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && python -m unittest tests.test_usenet_instances.TestUsenetInstanceId -v`

Expected: FAIL — `instance_id` / `_apply_sabnzbd_instances` missing

- [ ] **Step 3: Write minimal implementation**

1. Add `instance_id: Optional[str] = None` to `DownloadReleaseRequest` in `usenet_types.py`.
2. Copy `_apply_radarr_instances` pattern for SAB/Prowlarr in `api.py`.
3. `get_usenet_config` returns `serialize_sabnzbd_config` / `serialize_prowlarr_config` (keep `provider_library_status` merged onto the resolved SAB instance).
4. `update_usenet_config`: if `req.sabnzbd` contains `instances`, call `_apply_sabnzbd_instances`; else write flat fields onto `cfg.usenet.sabnzbd` then `apply_flat_to_instance` if you add that helper (Radarr has it). Same for Prowlarr.
5. `get_provider_manager(sab_instance_id=None, prow_instance_id=None)`: `SabnzbdDownloader(cfg.usenet.sabnzbd.resolve(sab_instance_id))` and `ProwlarrSearchProvider(cfg.usenet.prowlarr.resolve(prow_instance_id))`.
6. Search/download/queue/history/pause/resume pass Query/body `instance_id` into that manager.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && python -m unittest tests.test_usenet_instances tests.test_providers tests.test_arr -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/otix_server/api.py server/otix_server/usenet_types.py server/otix_server/providers/manager.py server/tests/test_usenet_instances.py
git commit -m "feat(server): select SABnzbd and Prowlarr by instance id"
```

---

### Task 4: Frontend SAB/Prowlarr instance forms

**Files:**
- Modify: `frontend/src/features/downloads/usenet-types.ts`
- Modify: `frontend/src/features/downloads/molecules/server-sabnzbd-settings-modal.tsx`
- Modify: `frontend/src/features/downloads/molecules/server-prowlarr-settings-modal.tsx`
- Modify: `frontend/src/features/downloads/use-server-usenet.ts`
- Modify: `frontend/src/features/downloads/molecules/__tests__/server-integration-modals.test.tsx`
- Modify: `frontend/src/features/downloads/arr-instances.ts` if SAB needs extra fields on `ArrServiceInstance` (`category`, path mappings). Prefer extending `ArrServiceInstance` with optional `category?: string` and keeping path mappings in the SAB modal only.

**Interfaces:**
- Consumes: `createArrInstance`, `normalizeArrInstances`, `ArrInstanceSwitcher`, Task 2 serialized `instances`
- Produces: SAB/Prowlarr modals save `{ instances: ArrServiceInstance[] }` plus flat projection of the selected instance; switcher rendered only when `instances.length > 1`

- [ ] **Step 1: Write the failing test**

In `frontend/src/features/downloads/molecules/__tests__/server-integration-modals.test.tsx`, add:

```ts
  it('hides the SAB instance switcher for a single instance and shows it for two', async () => {
    mockGameServers = [{ id: 1, name: 'NAS' }]
    mockUsenetConfig = {
      enabled: true,
      sabnzbd: {
        host: '127.0.0.1',
        port: 8080,
        api_key: '***',
        configured: true,
        instances: [
          { id: 'a', name: 'Games', enabled: true, host: '10.0.0.1', port: 8080, api_key: '***' },
          { id: 'b', name: 'Movies', enabled: true, host: '10.0.0.2', port: 8080, api_key: '***' },
        ],
      },
      prowlarr: { host: '127.0.0.1', port: 9696, api_key: '', categories: [] },
    }
    render(<ServerSabnzbdSettingsModal serverId={1} serverName="NAS" onClose={() => {}} />)
    expect(await screen.findByText('Games')).toBeInTheDocument()
    expect(screen.getByText('Movies')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add instance/i })).toBeInTheDocument()
  })
```

Add a second test with one instance (or flat config only) asserting `queryByRole('button', { name: /add instance/i })` is in the document (add is always allowed) but there is no second tab named besides Default — and `queryByText('Games')` is null. For a single Default instance, `ArrInstanceSwitcher` must not render (parent: `shouldShowInstanceSwitcher` analogue on raw length: `instances.length > 1`).

Also assert save payload includes `instances` when clicking Save after adding a second instance.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/downloads/molecules/__tests__/server-integration-modals.test.tsx`

Expected: FAIL — no Games/Movies tabs

- [ ] **Step 3: Write minimal implementation**

1. Add `instances?: ArrServiceInstance[]` to `ServerSabnzbdConfig` and `ServerProwlarrConfig`.
2. In both modals, `const instances = normalizeArrInstances(config.sabnzbd|prowlarr, defaultPort)` (8080 / 9696). Store in state like `server-arr-settings-modal.tsx`.
3. Render `{instances.length > 1 && <ArrInstanceSwitcher ... />}` plus always-visible Add if you still want add from one instance — **Add instance** must remain available when length === 1 (spec: switcher hidden, not add). Put Add on the switcher only when visible; when length === 1, show a text button “Add instance” under the form that calls the same `onAdd`.
4. Save: `saveMutation.mutateAsync({ ...selectedFlat, instances })`.
5. `useSaveServerSabnzbdConfig` already posts a partial SAB object; sending `instances` is enough if the node API from Task 3 reads it.

Copy the instance state pattern from `frontend/src/features/downloads/molecules/server-arr-settings-modal.tsx` lines 72–110 (`normalizeArrInstances`, `updateSelected`, add/delete).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/downloads/molecules/__tests__/server-integration-modals.test.tsx src/features/downloads/__tests__/arr-instances.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/downloads/usenet-types.ts frontend/src/features/downloads/use-server-usenet.ts frontend/src/features/downloads/arr-instances.ts frontend/src/features/downloads/molecules/server-sabnzbd-settings-modal.tsx frontend/src/features/downloads/molecules/server-prowlarr-settings-modal.tsx frontend/src/features/downloads/molecules/__tests__/server-integration-modals.test.tsx
git commit -m "feat(downloads): edit multiple SABnzbd and Prowlarr instances"
```

---

### Task 5: Collect sources from desktop and every node

**Files:**
- Create: `frontend/src/features/downloads/use-merged-arr.ts`
- Test: `frontend/src/features/downloads/__tests__/use-merged-arr.test.ts` — test the pure collector `collectArrSources(...)` exported from `use-merged-arr.ts` (keep the hook thin)

**Interfaces:**
- Consumes: `mergeArrInstances`, `ArrSourceInstance` from Task 1; `normalizeArrInstances`; node configs; `window.desktopAPI.plugin.getConfig`; `downloadsGetConfig`
- Produces:
  - `export function collectArrSources(input: { app: ArrApp; nodes: Array<{ serverId: number; online: boolean; config: unknown }>; desktopInstances?: ArrSourceInstance[]; probes?: Record<string, string> }): Promise<MergedArrInstance[]>`
  - `export function useMergedArr(app: ArrApp): { instances: MergedArrInstance[]; isLoading: boolean }`
  - Desktop plugin ids: `radarr`, `sonarr`, `sabnzbd`; downloads sqlite SAB uses `pluginId: 'downloads'`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { collectArrSources } from '../use-merged-arr'

describe('collectArrSources', () => {
  it('merges every node, not only the first', async () => {
    const merged = await collectArrSources({
      app: 'radarr',
      nodes: [
        { serverId: 1, online: true, config: { enabled: true, host: 'a.local', port: 7878, api_key: 'main', instances: [{ id: 'a', name: 'A', enabled: true, host: 'a.local', port: 7878, api_key: 'main' }] } },
        { serverId: 2, online: true, config: { enabled: true, host: 'b.local', port: 7878, api_key: 'uhd', instances: [{ id: 'b', name: '4K', enabled: true, host: 'b.local', port: 7878, api_key: 'uhd' }] } },
      ],
      desktopInstances: [
        { app: 'radarr', origin: { type: 'desktop', pluginId: 'radarr' }, originInstanceId: 'd', name: 'PC', enabled: true, host: 'localhost', port: 7878, useSsl: false, urlBase: '', apiKey: 'main' },
      ],
    })
    expect(merged).toHaveLength(2)
    const main = merged.find((m) => m.endpoints.some((e) => e.origin.type === 'desktop'))
    expect(main?.endpoints.map((e) => e.origin)).toEqual(
      expect.arrayContaining([
        { type: 'desktop', pluginId: 'radarr' },
        { type: 'node', serverId: 1 },
      ]),
    )
  })

  it('marks node endpoints offline when the game server is down', async () => {
    const merged = await collectArrSources({
      app: 'sonarr',
      nodes: [
        { serverId: 5, online: false, config: { host: 'tv.local', port: 8989, api_key: 's', instances: [{ id: 't', name: 'TV', enabled: true, host: 'tv.local', port: 8989, api_key: 's' }] } },
      ],
    })
    expect(merged[0].endpoints[0].nodeOnline).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/downloads/__tests__/use-merged-arr.test.ts`

Expected: FAIL — module missing

- [ ] **Step 3: Write minimal implementation**

`collectArrSources` maps each node config through `normalizeArrInstances(config, defaultPort)` (`7878/8989/8080/9696` by app), sets `origin: { type: 'node', serverId }`, `nodeOnline: online`, `apiKey` from instance (may be `***`). Concat desktopInstances. Pass to `mergeArrInstances`.

`useMergedArr(app)`:
- `useGameServers()` — **all** servers
- For each server id, existing `useServerRadarrConfig` / `useServerSonarrConfig` / `useServerUsenetConfig` (usenet for sab/prowlarr)
- If `window.desktopAPI?.plugin?.getConfig`, load `radarr`/`sonarr`/`sabnzbd` plugin config instances
- If `window.desktopAPI?.downloadsGetConfig`, add SAB source `pluginId: 'downloads'` from `sabnzbdHost` / `sabnzbdPort` / `sabnzbdApiKey`
- Optional: plugin `callData(pluginId, 'test-connection')` or node test endpoints to set `installIdentity` as `` `${appName}|${appData}` ``; skip if it fails (do not mark other endpoints unreachable)

Do not probe in unit tests; probes are empty.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/downloads/__tests__/use-merged-arr.test.ts src/features/downloads/__tests__/arr-merge.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/downloads/use-merged-arr.ts frontend/src/features/downloads/__tests__/use-merged-arr.test.ts
git commit -m "feat(downloads): collect Arr instances from desktop and all nodes"
```

---

### Task 6: Request, library, and plugin widgets use the merge

**Files:**
- Modify: `frontend/src/features/media/hooks/use-request-media.ts`
- Modify: `frontend/src/features/media/hooks/use-media-detail-plugin-actions.ts`
- Modify: `frontend/src/features/media/pages/media-detail-page.tsx` (library widgets already prefer `requestMedia` when not hidden)
- Modify: `frontend/src/features/library/pages/library-page.tsx`
- Modify: `frontend/src/features/media/hooks/arr-detail-status.ts` (`makeServerArrInstanceId` currently `serverId:arrId` — extend so desktop origins parse too)
- Test: `frontend/src/features/media/hooks/__tests__/arr-detail-status.test.ts`
- Test: add `frontend/src/features/media/hooks/__tests__/use-request-media-merge.test.ts` for id encoding + pick (pure helpers extracted if the hook is hard to mount)

**Interfaces:**
- Consumes: `useMergedArr`, `pickEndpoint`, `shouldShowInstanceSwitcher`
- Produces:
  - `export function encodeMergedInstanceId(instance: MergedArrInstance, endpoint: ArrEndpoint): string`
  - `export function decodeMergedInstanceId(id: string): { mergedId: string; origin: ArrOrigin; originInstanceId: string }`
  - Request widgets from merged instances; `handleRequest` uses `pickEndpoint` then existing node mutate **or** `desktopAPI.plugin.callData('radarr'|'sonarr', ...)`
  - `useRequestMedia().hidden` is true only when merged length is 0 (after load)
  - Plugin request widgets suppressed when `useMergedArr` has any instance for that media type
  - Library Arr tab loads every endpoint (plugin `getAllLibraries` **and** each node), concatenated, not first-wins

- [ ] **Step 1: Write the failing test**

Extend `arr-detail-status.test.ts`:

```ts
import { decodeMergedInstanceId, encodeMergedInstanceId } from '../arr-detail-status'

it('round-trips a desktop endpoint id', () => {
  const id = encodeMergedInstanceId(
    { id: 'abc', app: 'radarr', name: 'Main', fingerprint: 'key:x', enabled: true, endpoints: [] },
    { origin: { type: 'desktop', pluginId: 'radarr' }, originInstanceId: 'local', host: '127.0.0.1', port: 7878, useSsl: false, urlBase: '', hasApiKey: true },
  )
  expect(decodeMergedInstanceId(id)).toEqual({
    mergedId: 'abc',
    origin: { type: 'desktop', pluginId: 'radarr' },
    originInstanceId: 'local',
  })
})

it('round-trips a node endpoint id', () => {
  const id = encodeMergedInstanceId(
    { id: 'abc', app: 'sonarr', name: 'TV', fingerprint: 'key:y', enabled: true, endpoints: [] },
    { origin: { type: 'node', serverId: 3 }, originInstanceId: '4k', host: 'nas', port: 8989, useSsl: false, urlBase: '', hasApiKey: true },
  )
  expect(decodeMergedInstanceId(id).origin).toEqual({ type: 'node', serverId: 3 })
  expect(decodeMergedInstanceId(id).originInstanceId).toBe('4k')
})
```

Keep `makeServerArrInstanceId` working for old `3:4k` node-only ids (`parseServerArrInstanceId`).

Library: if there is no existing library-page test, add `frontend/src/features/library/pages/__tests__/arr-tab-sources.test.ts` testing a extracted function:

```ts
export function arrLibrarySources(pluginLibraries: ArrLibrary[], nodeLibraries: ArrLibrary[]): ArrLibrary[] {
  return [...pluginLibraries, ...nodeLibraries]
}
```

Test that plugin + node arrays both appear.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/media/hooks/__tests__/arr-detail-status.test.ts`

Expected: FAIL — encode helpers missing

- [ ] **Step 3: Write minimal implementation**

Id format: `mergedId|desktop:pluginId|originInstanceId` or `mergedId|node:serverId|originInstanceId`. Split on `|` (merged sha hex has no pipes).

`use-request-media.ts`:
- Replace `useGameServers()[0]` + `useServerRadarrConfig(active)` with `useMergedArr(isMovie ? 'radarr' : 'sonarr')`.
- `hidden: !enabled || (!loading && instances.length === 0)`
- Status lookup: for each merged instance, `const endpoint = pickEndpoint(instance)`; if node, existing `lookupOnInstance(serverId, kind, term, originInstanceId)`; if desktop, `desktopAPI.plugin.callData(pluginId, lookupMethod, { tmdbId, instanceId: originInstanceId })` — if that method does not exist, skip desktop status and still allow request via plugin `request`/`add` used today in `use-media-detail-plugin-actions.ts`.
- `handleRequest`: `pickEndpoint`; node → existing `addMovie`/`addSeries` with `instance_id`; desktop → existing `plugin.callData` path from `handleRequest` in `use-media-detail-plugin-actions.ts`. Never call both.

`use-media-detail-plugin-actions.ts`: if desktop plugin API exists **and** `useMergedArr` returned instances, still load play widgets from slots, but **do not** push request-button widgets (merge owns request). If merge is empty, keep today’s plugin fallback and node fallback.

`library-page.tsx` `ArrTab.loadLibraries`: remove the `if (api?.callData) { ... return }`. Fetch plugin libraries when API exists; also fetch every online node’s movies/series; concatenate.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/media/hooks/__tests__/arr-detail-status.test.ts src/features/downloads/__tests__/arr-merge.test.ts`

If you added the library source test, include it.

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/media/hooks/use-request-media.ts frontend/src/features/media/hooks/use-media-detail-plugin-actions.ts frontend/src/features/media/hooks/arr-detail-status.ts frontend/src/features/media/hooks/__tests__/arr-detail-status.test.ts frontend/src/features/library/pages/library-page.tsx frontend/src/features/library/pages/__tests__/arr-tab-sources.test.ts
git commit -m "feat(media): request and library use merged Arr instances"
```

---

### Task 7: Desktop SABnzbd plugin instances

**Files:**
- Modify: `extensions/plugins/sabnzbd/manifest.json`
- Modify: `extensions/plugins/sabnzbd/main.js`
- Test: `desktop/tests/plugins/sabnzbd-instances.test.ts` (pure helper; extract `resolveSabnzbdInstance` to `extensions/plugins/sabnzbd/instances.js` if the desktop test runner cannot import `main.js` side effects — prefer a tiny `instances.js` required by `main.js`)

**Interfaces:**
- Consumes: current flat `host`, `port`, `apiKey`, `useSsl`, `urlBase`, `category`
- Produces: `config.instances[]`; `resolveSabnzbdInstance(config, instanceId)` returns flat fields; handlers use resolved instance (`args.instanceId` optional)

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/plugins/sabnzbd-instances.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveSabnzbdInstance } from '../../../extensions/plugins/sabnzbd/instances.js'

describe('resolveSabnzbdInstance', () => {
  it('migrates flat config to a default instance', () => {
    const inst = resolveSabnzbdInstance({ host: '127.0.0.1', port: 8080, apiKey: 'k', category: 'games' })
    expect(inst.host).toBe('127.0.0.1')
    expect(inst.apiKey).toBe('k')
  })

  it('selects a named instance', () => {
    const inst = resolveSabnzbdInstance(
      {
        instances: [
          { id: 'a', name: 'Games', host: '10.0.0.1', port: 8080, apiKey: 'one' },
          { id: 'b', name: 'Movies', host: '10.0.0.2', port: 8080, apiKey: 'two' },
        ],
      },
      'b',
    )
    expect(inst.apiKey).toBe('two')
  })
})
```

Confirm desktop vitest includes `desktop/tests`. If tests run only under `desktop/` with a vitest config, put the helper under `desktop/` instead and duplicate — **do not**. Keep helper in `extensions/plugins/sabnzbd/instances.js`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd desktop && npx vitest run tests/plugins/sabnzbd-instances.test.ts`  
If that config does not exist, run from repo root however other `desktop/tests/plugins/*.test.ts` files run (check `desktop/package.json` / root `package.json` workspaces). Use the same command those tests already use.

Expected: FAIL — module missing

- [ ] **Step 3: Write minimal implementation**

`instances.js`:

```js
function resolveSabnzbdInstance(config, instanceId) {
  const instances = config && Array.isArray(config.instances) ? config.instances : null
  if (instances && instances.length) {
    if (instanceId) {
      const found = instances.find((i) => i.id === instanceId)
      if (found) return found
    }
    return instances.find((i) => i.enabled !== false) || instances[0]
  }
  return {
    id: 'default',
    name: 'Default',
    host: (config && config.host) || 'localhost',
    port: (config && config.port) || 8080,
    apiKey: (config && (config.apiKey || config.api_key)) || '',
    useSsl: Boolean(config && (config.useSsl || config.use_ssl)),
    urlBase: (config && (config.urlBase || config.url_base)) || '',
    category: (config && config.category) || 'games',
  }
}
module.exports = { resolveSabnzbdInstance }
```

`main.js`: `const { resolveSabnzbdInstance } = require('./instances')`; each handler uses `resolveSabnzbdInstance(ctx.config.getAll(), args && args.instanceId)`.

`manifest.json`: add `instances` field of type `instances` copying the Radarr plugin shape (`name`, `url`/`host`+`port`, `apiKey`, `enabled`) plus `category`. Keep legacy flat keys so old configs load; resolver handles both.

- [ ] **Step 4: Run test to verify it passes**

Run the same vitest command from Step 2.

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extensions/plugins/sabnzbd/manifest.json extensions/plugins/sabnzbd/main.js extensions/plugins/sabnzbd/instances.js desktop/tests/plugins/sabnzbd-instances.test.ts
git commit -m "feat(plugins): support multiple SABnzbd instances"
```

---

### Task 8: Origin picker on merged instances + settings badges

**Files:**
- Modify: `frontend/src/features/downloads/molecules/server-arr-settings-modal.tsx`
- Modify: `frontend/src/features/downloads/molecules/server-sabnzbd-settings-modal.tsx`
- Modify: `frontend/src/features/downloads/molecules/server-prowlarr-settings-modal.tsx`
- Modify: `frontend/src/features/settings/pages/settings-integrations-page.tsx`
- Modify: `frontend/src/features/plugins/components/PluginSettingsTabRoute.tsx`
- Modify: `frontend/src/features/downloads/molecules/arr-instance-switcher.tsx` only if you add an origin row there — prefer a small `ArrEndpointOriginBar` in `frontend/src/features/downloads/molecules/arr-endpoint-origin-bar.tsx`
- Test: `frontend/src/features/downloads/molecules/__tests__/arr-endpoint-origin-bar.test.tsx`
- Test: `frontend/src/features/settings/__tests__/settings-integrations-modals.test.tsx` if badges are asserted

**Interfaces:**
- Consumes: `MergedArrInstance.endpoints`, `saveTarget`, `pickEndpoint`
- Produces:
  - `ArrEndpointOriginBar` shown when `endpoints.length > 1`
  - Labels: desktop → `This PC`; node → server name from `useGameServers`
  - Changing origin switches which connection fields are edited; Save calls only that origin’s API (`plugin.setConfig` / node POST)
  - Integrations `isRadarrConfigured` etc. true if **any** merged instance has an endpoint with `hasApiKey`
  - Plugin settings tabs for radarr/sonarr/sabnzbd/prowlarr render the same modals fed by merge, not a second desktop-only form

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArrEndpointOriginBar } from '../arr-endpoint-origin-bar'
import type { ArrEndpoint } from '../../arr-merge'

const endpoints: ArrEndpoint[] = [
  { origin: { type: 'desktop', pluginId: 'radarr' }, originInstanceId: 'd', host: 'localhost', port: 7878, useSsl: false, urlBase: '', hasApiKey: true },
  { origin: { type: 'node', serverId: 1 }, originInstanceId: 'n', host: 'nas.local', port: 7878, useSsl: false, urlBase: '', hasApiKey: true },
]

it('is hidden for a single endpoint', () => {
  const { container } = render(
    <ArrEndpointOriginBar endpoints={[endpoints[0]]} selected={endpoints[0]} serverNames={{ 1: 'NAS' }} onSelect={() => {}} />,
  )
  expect(container).toBeEmptyDOMElement()
})

it('lets the user edit the node path of a merged instance', async () => {
  const onSelect = vi.fn()
  render(
    <ArrEndpointOriginBar endpoints={endpoints} selected={endpoints[0]} serverNames={{ 1: 'NAS' }} onSelect={onSelect} />,
  )
  expect(screen.getByText('This PC')).toBeInTheDocument()
  await userEvent.click(screen.getByText('NAS'))
  expect(onSelect).toHaveBeenCalledWith(endpoints[1])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/downloads/molecules/__tests__/arr-endpoint-origin-bar.test.tsx`

Expected: FAIL — component missing

- [ ] **Step 3: Write minimal implementation**

`ArrEndpointOriginBar`: if `endpoints.length < 2` return null. Render two compact buttons (reuse switcher tab classes from `arr-instance-switcher.tsx`). `onSelect(endpoint)`.

Wire into Radarr/Sonarr/SAB/Prowlarr settings: when the modal is opened from Integrations for a node, default selected endpoint is that node; when opened from desktop plugin tab, default desktop. If merge later wraps these modals, pass `merged.endpoints`. Until then, node modals stay node-only (Task 4) and this bar appears once Task 5’s merge is passed in.

Update Integrations connected flags:

```ts
const radarrMerged = useMergedArr('radarr')
const isRadarrConfigured = radarrMerged.instances.some((i) => i.endpoints.some((e) => e.hasApiKey))
```

Same for sonarr/sabnzbd/prowlarr. Drop `servers[0]`-only checks.

`PluginSettingsTabRoute`: if `tabId` is radarr/sonarr/sabnzbd/prowlarr, render the existing server modals **and** desktop fields via merge (open the same modal components). Do not keep the “legacy desktop plugins” dead-end as the only UI when a plugin tab is missing — when a plugin tab **exists**, `PluginSettingsPage` can remain for extra plugin sections (sync history), but connection instances come from merge.

Save handler: `const origin = saveTarget(selectedEndpoint)`; if `origin.type === 'node'` POST server config for `origin.serverId` updating only that `originInstanceId`; if `desktop`, `desktopAPI.plugin.setConfig` / `downloadsSaveConfig` for `downloads`. Do not write the other origin.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/downloads/molecules/__tests__/arr-endpoint-origin-bar.test.tsx src/features/downloads/molecules/__tests__/server-integration-modals.test.tsx src/features/downloads/__tests__/arr-merge.test.ts src/features/settings/__tests__/settings-integrations-modals.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/downloads/molecules/arr-endpoint-origin-bar.tsx frontend/src/features/downloads/molecules/__tests__/arr-endpoint-origin-bar.test.tsx frontend/src/features/downloads/molecules/server-arr-settings-modal.tsx frontend/src/features/downloads/molecules/server-sabnzbd-settings-modal.tsx frontend/src/features/downloads/molecules/server-prowlarr-settings-modal.tsx frontend/src/features/settings/pages/settings-integrations-page.tsx frontend/src/features/plugins/components/PluginSettingsTabRoute.tsx
git commit -m "feat(settings): edit each Arr origin without duplicating instances"
```

---

## Self-review (spec coverage)

| Spec section | Task |
|--------------|------|
| Logical app + endpoints shape | 1 |
| Stores stay split / save to origin | 1 `saveTarget`, 8 |
| Runtime prefers desktop | 1 `pickEndpoint`, 6 |
| No identity database | (none created) |
| N nodes, not `servers[0]` | 5, 6 |
| Fingerprint: API key, not `***` | 1 |
| Fingerprint: Arr `appData` | 1 `installIdentity`, 5 optional probe |
| SAB no UUID without key | 1 sabnzbd redacted loopback vs LAN |
| Same-origin URL collapse only | 1 `collapseSameOriginSources` |
| `fingerprintId` sha256 slice 16 | 1 |
| SAB/Prowlarr `instances[]` + legacy migrate | 2, 3, 4, 7 |
| Switcher only if `merged.length > 1` | 1 helper, 4, 8 |
| Request once / hide plugin request widgets | 6 |
| Library concat plugin + nodes | 6 |
| Origin bar for 2+ endpoints | 8 |
| Backend origin reserved unused | 1 type only |
| Tests listed in spec §9 | 1, 2, 3, 4, 5, 6, 8 |

After all tasks: `cd frontend && npx vitest run src/features/downloads src/features/media/hooks src/features/settings/__tests__` and `cd server && python -m unittest tests.test_usenet_instances tests.test_providers tests.test_arr -v`. Then `graphify update .` from `backend/` per repo rules.
