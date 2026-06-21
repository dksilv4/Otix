# Plugin Game Matching Framework

**Date:** 2026-06-21
**Status:** Design (pre-implementation)
**Drivers:** Otix plugin author experience, game matching accuracy, rescan persistence

---

## 1. Problem

Otix has two parallel game scanning paths that don't interact:

1. **Hardcoded launcher scanners** (`desktop/game/launchers.ts`) — Epic, GOG, Battle.net, Ubisoft, EA, Riot, Xbox, Itch — all in main-process code.
2. **Plugin system** (`desktop/plugins/`) — supports worker-isolated plugins with slots, API proxy, event bus. An Epic Games Scanner plugin exists (`extensions/otix-plugins/plugins/otix-epic/`) but uses ad hoc data methods (`match.batch`, `match.confirm`) and is not consumed by the host.

**Gaps:**
- No standardized scanner plugin interface. Every plugin author re-invents the match-calling pattern.
- Host has no orchestration layer to aggregate scan results across plugins, deduplicate, or run the matching backend in a single batch.
- Rescanning blows away confirmed matches (current `scanned_games` storage deletes stale rows).
- Per-game progress is invisible to the user during matching.

**Goal:** A reusable framework where plugin authors only write launcher-specific auth + API scanning. The host handles matching, persistence, and progress reporting.

---

## 2. Plugin Contract

### 2.1 Manifest

Plugins declare intent via the `matching:scan` slot in `manifest.json`:

```json
{
  "slots": [
    { "location": "matching:scan", "label": "Epic Games" }
  ]
}
```

No additional fields needed. The slot is the contract.

### 2.2 Plugin Exports

Plugins export data methods via `module.exports.data`:

| Method | Signature | Returns | Required |
|--------|-----------|---------|----------|
| `scan` | `(ctx) => ScannedGame[]` | Array of discovered games | Yes |
| `status` | `(ctx) => ScanStatus` | Connection state + last scan info | Yes |

**Optional auth methods** (OAuth-provider plugins may implement):

| Method | Purpose |
|--------|---------|
| `auth.getLoginUrl` | Return OAuth URL the user opens in browser |
| `auth.handleCallback` | Exchange authorization code for tokens |
| `auth.logout` | Clear stored credentials |

### 2.3 ScannedGame

Standardized output from every scanner plugin — no matching data, just raw game metadata.

```typescript
interface ScannedGame {
  /** Plugin-local unique ID, e.g. Epic's AppName */
  id: string
  /** Display title from the launcher's API */
  title: string
  /** Launcher slug — "epic", "gog", "battlenet", etc. */
  platform: string
  /** External IDs the backend GameMatcher can resolve (Phase 1) */
  externalIds: Array<{ source: string; id: string }>
  developer?: string
  publisher?: string
  releaseYear?: number
  /** Filesystem install path (Windows) */
  installPath?: string
  /** Full path to the launchable executable */
  exePath?: string
  /** Native launcher artwork URLs (fallback until match resolves) */
  posterUrl?: string
  logoUrl?: string
  /** Raw metadata blob — opaque, passed through for plugin UI features */
  rawMetadata?: Record<string, unknown>
}
```

### 2.4 ScanStatus

```typescript
interface ScanStatus {
  connected: boolean
  label?: string       // e.g. "Connected as PlayerOne"
  error?: string
  lastScanAt?: number  // epoch ms
  lastScanTotal?: number
}
```

---

## 3. Host Pipeline — GameScanOrchestrator

New service at `desktop/game/orchestrator.ts`. Orchestrates the full scan → match → store flow.

```
┌──────────────────────────────────────────────────────────────────┐
│                       GameScanOrchestrator                        │
│                                                                   │
│  scanAll()                                                        │
│    │                                                              │
│    ├─ 1. Collect matching:scan plugins from slot registry         │
│    │                                                              │
│    ├─ 2. For each plugin (parallel):                              │
│    │     a. Call plugin.scan(ctx)                                 │
│    │     b. Returns ScannedGame[]                                 │
│    │                                                              │
│    ├─ 3. For each ScannedGame:                                    │
│    │     ├─ Look up game_matches(source, source_game_id)          │
│    │     ├─ FOUND → restore cached match data. Skip matching.     │
│    │     └─ NOT FOUND → add to unmatched batch                    │
│    │                                                              │
│    ├─ 4. Send unmatched batch to backend SSE endpoint             │
│    │     POST /api/media/match/stream                             │
│    │     → Per-game SSE events → pipeline emits progress          │
│    │                                                              │
│    ├─ 5. Store results:                                           │
│    │     auto_match → upsert scanned_games + game_matches         │
│    │     candidates  → store as matchSuggestion in scanned_games  │
│    │                                                              │
│    └─ 6. Emit 'games:scan-complete' on event bus                  │
│         → IPC broadcasts to renderer → UI refreshes               │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 3.1 Core API

```typescript
class GameScanOrchestrator {
  /** Full scan across all enabled matching:scan plugins */
  async scanAll(): Promise<ScanSummary>

  /** Single-plugin scan (user clicks "Scan Epic Games") */
  async scanPlugin(pluginId: string): Promise<PluginScanResult>
}

interface ScanSummary {
  pluginsScanned: number
  totalGames: number
  matched: number
  unmatched: number
  failed: number
  startedAt: number
  completedAt: number
  pluginResults: PluginScanResult[]
}

interface PluginScanResult {
  pluginId: string
  pluginLabel: string
  totalGames: number
  matched: number
  unmatched: number
  errors?: string[]
}
```

### 3.2 GameMatchRequest Transformation

```typescript
function toMatchRequests(games: ScannedGame[]): GameMatchRequest[] {
  return games.map(g => ({
    query_id: `${g.platform}:${g.id}`,
    title: g.title,
    developer: g.developer,
    publisher: g.publisher,
    release_year: g.releaseYear,
    external_ids: g.externalIds,
    media_type: 'game',
  }))
}
```

This feeds backend GameMatcher Phase 1 (direct external-ID resolution), which is the highest-confidence path. If the external ID already maps to an Otix media item, instant 1.0 match.

---

## 4. Backend SSE Endpoint

New endpoint at `POST /api/media/match/stream` — returns per-game results as Server-Sent Events.

### Request

```json
POST /api/media/match/stream
Content-Type: application/json
Accept: text/event-stream

{
  "games": [
    {
      "query_id": "epic:Jaguar",
      "title": "Rocket League",
      "developer": "Psyonix",
      "external_ids": [{"source": "epic", "id": "Jaguar"}],
      "media_type": "game"
    }
  ]
}
```

### Response (SSE stream)

```
event: game-progress
data: {"query_id":"epic:Jaguar","status":"processing","progress":0}

event: game-progress
data: {"query_id":"epic:Jaguar","status":"matched","match":{"media_item_id":"otix_abc123","title":"Rocket League","confidence":1.0}}

event: game-progress
data: {"query_id":"epic:unknown-game","status":"candidates","candidates":[{"media_item_id":"otix_def456","title":"Unknown Game","confidence":0.75}]}

event: complete
data: {"total":50,"matched":40,"candidates":8,"failed":2}
```

### GameProgressEvent type

```typescript
interface GameProgressEvent {
  query_id: string
  status: 'processing' | 'matched' | 'candidates' | 'failed'
  match?: {
    media_item_id: string
    title: string
    confidence: number
    poster_url?: string
    backdrop_url?: string
  }
  candidates?: GameMatchCandidate[]
  error?: string
}
```

### Implementation

Add to `backend/otix/api/media/search.py`:

```python
@router.post("/match/stream")
async def match_games_stream(
    body: GameMatchBatchRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    matcher = GameMatcher(db, redis)
    return StreamingResponse(
        _match_event_stream(matcher, body.games),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
```

```python
async def _match_event_stream(matcher, games: list[GameMatchRequest]):
    total = len(games)
    for i, result in await matcher.match_batch_with_progress(games):
        event = _build_progress_event(result)
        yield f"event: game-progress\ndata: {json.dumps(event)}\n\n"
    yield f"event: complete\ndata: {json.dumps({'total': total})}\n\n"
```

---

## 5. Storage & Rescan Safety

### 5.1 Tables

**`game_matches`** — Canonical match records. Created on confirm. Never cleaned.

| Column | Type | Description |
|--------|------|-------------|
| `source` | TEXT | Launcher slug (`epic`, `gog`, etc.) |
| `source_game_id` | TEXT | Plugin-local game ID |
| `otix_media_id` | TEXT | Otix media item PK |
| `otix_title` | TEXT | Cached title for UI |
| `otix_poster_url` | TEXT | Cached poster |
| `otix_backdrop_url` | TEXT | Cached backdrop |
| `otix_icon_url` | TEXT | Cached icon |
| `otix_confidence` | REAL | Match confidence |
| `match_type` | TEXT | `auto` or `manual` |
| `matched_at` | DATETIME | When match was created |
| PRIMARY KEY | `(source, source_game_id)` | |

```sql
CREATE TABLE game_matches (
  source TEXT NOT NULL,
  source_game_id TEXT NOT NULL,
  otix_media_id TEXT NOT NULL,
  otix_title TEXT,
  otix_poster_url TEXT,
  otix_backdrop_url TEXT,
  otix_icon_url TEXT,
  otix_confidence REAL,
  match_type TEXT NOT NULL DEFAULT 'auto',
  matched_at DATETIME NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (source, source_game_id)
);
```

**`scanned_games`** — Ephemeral per-scan state. Full upsert each scan.

Current columns preserved. Add:

| Column | Type | Notes |
|--------|------|-------|
| `source` | TEXT | Launcher slug (newly required) |
| `source_game_id` | TEXT | Plugin-local game ID (new) |
| `last_seen_at` | DATETIME | Updated each scan |
| `status` | TEXT | `available` or `removed` |

`otix_media_id` and display columns exist already — they're restored from `game_matches` on rescan.

### 5.2 Rescan Algorithm

```
1. Plugin returns ScannedGame[]
2. BEGIN transaction
3. For each ScannedGame:
   a. Look up game_matches(source, source_game_id)
   b. If found:
      - Upsert scanned_games with cached Otix data
      - Set last_seen_at = now, status = 'available'
      - DO NOT send to match pipeline
   c. If not found:
      - Upsert scanned_games (no Otix data)
      - Add to unmatched batch
4. For scanned_games rows NOT in this scan:
   - Set status = 'removed', keep all data
   - Match data preserved via game_matches
5. If unmatched batch has items:
   - Send to backend SSE endpoint
   - Process results as normal
6. COMMIT
7. Emit 'games:scan-complete'
```

On reconfirm (game reappears after removal): `game_matches` still exists → step 2b restores match instantly.

### 5.3 Confirm Flow

Desktop → Backend bidirectional commit:

```
User clicks "Confirm" on a candidate match
  │
  ├─ Desktop: INSERT INTO game_matches (source, source_game_id, otix_media_id, match_type='manual')
  │
  └─ Desktop → Backend: POST /api/media/match/confirm
     {
       query_id: "epic:Jaguar",
       media_item_id: "otix_abc123",
       source: "epic",
       source_game_id: "Jaguar"
     }
     │
     └─ Backend: Upsert ExternalID(provider="epic", external_id="Jaguar", entity_id="otix_abc123")
                 → Increment confirmed_count
                 → Future scans for ALL users hit Phase 1 with boosted confidence
```

---

## 6. Backend ExternalID Credibility System

Add to `external_ids` table:

```sql
ALTER TABLE external_ids
  ADD COLUMN confirmed_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE external_ids
  ADD COLUMN confirmed_by TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE external_ids
  ADD COLUMN last_confirmed_at TIMESTAMPTZ;
```

### GameMatcher Phase 1 update

```python
async def _phase1_direct(self, ...):
    # existing lookup logic unchanged
    # Append confidence calculation using confirmed_count:

    confirmed = ext_row.confirmed_count or 0
    if confirmed >= 3:
        confidence = 1.0       # crowd-verified
    elif confirmed >= 1:
        confidence = 0.98      # user-verified
    else:
        confidence = 0.90      # system-created (import)
```

### Confirm endpoint update

```python
@router.post("/match/confirm")
async def confirm_match(...):
    # existing logic unchanged
    # Add:
    existing = await eid_svc.get_by_provider_ext_id("epic", source_game_id)
    if existing and existing.entity_id == media_item_id:
        # Increment confirmation count (with user dedup)
        user_id = get_current_user_id(request)
        if not existing.confirmed_by or user_id not in existing.confirmed_by:
            existing.confirmed_count = (existing.confirmed_count or 0) + 1
            existing.confirmed_by = (existing.confirmed_by or []) + [user_id]
            existing.last_confirmed_at = func.now()
```

---

## 7. Per-Game SSE in Desktop

`GameScanOrchestrator` consumes the SSE stream:

```typescript
private async streamMatches(requests: GameMatchRequest[], pluginId: string) {
  const response = await fetch(`${this.apiBaseUrl}/media/match/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.authToken}`,
    },
    body: JSON.stringify({ games: requests }),
  })

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() || ''  // keep incomplete event

    for (const raw of events) {
      const parsed = parseSSE(raw)
      if (!parsed) continue

      if (parsed.event === 'game-progress') {
        this.eventBus.emit('game:matching:progress', {
          pluginId,
          ...parsed.data,
        })
      } else if (parsed.event === 'complete') {
        this.eventBus.emit('game:matching:complete', {
          pluginId,
          ...parsed.data,
        })
      }
    }
  }
}
```

### IPC → Renderer

```typescript
// preload.ts
electron.on('game:matching:progress', (event, data) => {
  // data: { pluginId, queryId, status, match?, candidates? }
  setState(prev => ({
    matchingProgress: { ...prev.matchingProgress, [data.queryId]: data }
  }))
})
```

---

## 8. Epic Plugin Refactor

The existing `otix-epic` plugin drops `match.batch`, `match.confirm`, `match.unlink` data methods. Auth methods remain. New exports:

```typescript
// old - DELETE
match.batch, match.confirm, match.unlink

// new
data: {
  scan: async (ctx) => {
    // auth → Epic API → local manifests → enrich → return ScannedGame[]
    return games.map(g => ({
      id: g.appName,
      title: g.title,
      platform: 'epic',
      externalIds: [{ source: 'epic', id: g.appName }],
      developer: g.developer,
      publisher: g.publisher,
      releaseYear: ...,
      installPath: g.installPath,
      exePath: g.launchExe,
      posterUrl: ...,  // native Epic art
      logoUrl: ...,
    }))
  },

  status: async (ctx) => ({
    connected: !!refreshToken,
    label: displayName,
    lastScanAt: ...,
    lastScanTotal: ...,
  }),

  // auth methods preserved
  'auth.getLoginUrl', 'auth.handleCallback', 'auth.logout',
}
```

`slotRender` simplified — no action descriptors needed:

```typescript
slotRender: async (ctx, location) => ({
  type: 'scan',
  platform: 'epic',
  label: 'Epic Games',
  description: 'Scan and match your Epic Games library',
})
```

---

## 9. Frontend Slot Renderer Updates

The `SlotRenderer` component (or a new `GameScanPanel`) consumes `matching:scan` slot data and renders:

- Scan button per plugin
- Status indicator (connected/last scanned)
- Progress during active scan (per-game SSE events)
- Match results grouped by plugin

```
┌─────────────────────────────────────┐
│  Game Libraries                     │
│                                     │
│  ┌─ Epic Games ─────────────────┐   │
│  │ ○ Connected as PlayerOne     │   │
│  │ [ Scan Library ] Last: 2m ago │   │
│  │ 120 games, 96 matched        │   │
│  └──────────────────────────────┘   │
│                                     │
│  ┌─ GOG Galaxy ─────────────────┐   │
│  │ × Not connected              │   │
│  │ [ Connect ]                  │   │
│  └──────────────────────────────┘   │
│                                     │
│  ┌─ Battle.net ─────────────────┐   │
│  │ ● Connected as User#1234     │   │
│  │ [ Scan Library ]             │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

---

## 10. Not In Scope (Future)

- Auto-scan on plugin enable (config-driven, trivial to add)
- "Match all" bulk confirm action
- Rejected-suggestion tracking across rescans (game_rejected_suggestions table already exists)
- Per-game match resolution UI (modal with candidate list)

---

## 11. Migration Path

| Step | What | Files |
|------|------|-------|
| 1 | Create `game_matches` table + orchestrator | `desktop/game/orchestrator.ts`, `desktop/game/storage.ts` (add table) |
| 2 | Backend SSE endpoint | `backend/otix/api/media/search.py` (`/match/stream`) |
| 3 | Backend `confirmed_count` on external_ids | alembic migration + `game_matcher.py` Phase 1 update |
| 4 | Desktop SSE consumer in orchestrator | `desktop/game/orchestrator.ts` |
| 5 | Refactor Epic plugin | `extensions/otix-plugins/plugins/otix-epic/main.js` |
| 6 | Frontend scan panel | React component consuming `matching:scan` slot |
| 7 | Wire orchestrator into IPC + main process | `desktop/ipc/scanner.ts`, `desktop/main.ts` |

---

## 12. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Plugin calls `scan()` only | Auth + API scan are the hard part. Matching is generic. | Minimize plugin author burden. |
| SSE for per-game progress | Real-time feedback without polling. Backend uses same code as batch. | User sees per-game spinner/results. |
| `game_matches` as local authority | Never hits backend for already-matched games. Works offline. | Speed + rescan safety. |
| Backend `confirmed_count` | Crowd-sourced ranking signal across multi-tenant instances. | Self-hosted user gets 0 confirmed → 0.90 conf; multi-user instance gets 3+ confirms → 1.0 conf. |
| Slot-based plugin discovery | No new registry. Existing `matching:scan` slot reused. | Zero additional framework. |
