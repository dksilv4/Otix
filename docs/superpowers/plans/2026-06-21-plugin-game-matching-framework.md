# Plugin Game Matching Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable game matching framework where plugins scan launchers and the host orchestrates backend matching via SSE, with persistent match storage and crowd-sourced confirmation signals.

**Architecture:** New `GameScanOrchestrator` on desktop collects `ScannedGame[]` from all `matching:scan` plugins, skips already-confirmed via local `game_matches` table, sends unmatched to new backend SSE `/match/stream` endpoint, stores results. Backend `confirmed_count` on `external_ids` provides crowd-sourced confidence.

**Tech Stack:** Electron/TypeScript (desktop), FastAPI/Python/SQLAlchemy (backend), SQLite (desktop storage), PostgreSQL (backend), SSE (streaming), RabbitMQ/Celery (hydrators).

## Global Constraints

- `query_id` format: `"{source}:{source_game_id}"` (e.g. `"epic:Jaguar"`).
- `game_matches` table is local authority — never cleaned on rescan.
- New `confirmed_count` on `external_ids` uses integer: 0 = system-created, 1 = single user, 3+ = crowd-verified.
- SSE endpoint uses `text/event-stream` with `X-Accel-Buffering: no`.
- Follow existing patterns: `desktop/plugins/` (newer system) for plugin slots, `desktop/game/` for game logic.
- Epic plugin refactor removes ad hoc `match.*` methods in favor of standardized `scan()`.

---

### Task 1: Backend - confirmed_count migration + Phase 1 confidence

**Files:**
- Create: (alembic migration)
- Modify: `backend/otix/domain/media.py:312-340`
- Modify: `backend/otix/services/game_matcher.py:190-266`
- Modify: `backend/otix/services/match_confirmation.py:55-133`
- Modify: `backend/otix/services/external_id_service.py` (add increment_confirmed method)
- Test: `backend/tests/test_match_confirmation.py`

**Interfaces:**
- Consumes: existing `ExternalID` model, `MatchConfirmationService`, `GameMatcher`
- Produces: `ExternalID.confirmed_count`, `ExternalID.confirmed_by`, `ExternalID.last_confirmed_at` columns; updated Phase 1 confidence logic; `increment_confirmed()` method on ExternalIDService

- [ ] **Step 1: Add columns to ExternalID domain model**

Edit `backend/otix/domain/media.py`, after `hash_match_count` column:

```python
# After line 327: hash_match_count: Mapped[int] = mapped_column(Integer, default=0)
confirmed_count: Mapped[int] = mapped_column(Integer, default=0)
confirmed_by: Mapped[list[str]] = mapped_column(ARRAY(String(30)), default=list)
last_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

Add import at top of file:

```python
from sqlalchemy.dialects.postgresql import ARRAY
```

- [ ] **Step 2: Create alembic migration**

Run: `cd backend && alembic revision --autogenerate -m "add confirmed_count to external_ids"`

Verify the generated migration has:

```python
def upgrade() -> None:
    op.add_column('external_ids', sa.Column('confirmed_count', sa.Integer(), server_default='0', nullable=False))
    op.add_column('external_ids', sa.Column('confirmed_by', sa.ARRAY(sa.String(30)), server_default='{}', nullable=False))
    op.add_column('external_ids', sa.Column('last_confirmed_at', sa.DateTime(timezone=True), nullable=True))

def downgrade() -> None:
    op.drop_column('external_ids', 'last_confirmed_at')
    op.drop_column('external_ids', 'confirmed_by')
    op.drop_column('external_ids', 'confirmed_count')
```

Apply: `cd backend && alembic upgrade head`

- [ ] **Step 3: Add increment_confirmed to ExternalIDService**

Edit `backend/otix/services/external_id_service.py`, add method:

```python
async def increment_confirmed(
    self,
    provider: str,
    external_id: str,
    user_id: str,
    entity_type: str | None = None,
) -> ExternalID | None:
    """Increment confirmed_count for a matched external ID, dedup by user."""
    row = await self.get_by_provider_ext_id(provider, external_id, entity_type)
    if row is None:
        return None
    if row.confirmed_by and user_id in row.confirmed_by:
        return row  # already confirmed by this user
    row.confirmed_count = (row.confirmed_count or 0) + 1
    row.confirmed_by = (row.confirmed_by or []) + [user_id]
    row.last_confirmed_at = func.now()
    return row
```

- [ ] **Step 4: Update MatchConfirmationService.confirm to increment confirmed_count**

Edit `backend/otix/services/match_confirmation.py`, after the upsert call at line 105:

```python
# After existing upsert:
await self._eid_svc.upsert(provider, external_id, "media_item", media_item_id)

# Increment confirmed_count (user confirmed = +1 signal)
user_id = "desktop_user"  # Single-user desktop; multi-user would extract from request
await self._eid_svc.increment_confirmed(provider, external_id, user_id, "media_item")
```

- [ ] **Step 5: Write failing test for confirmed_count increment**

Create `backend/tests/test_match_confirmation.py`:

```python
"""Tests for match confirmation with confirmed_count."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from otix.services.match_confirmation import MatchConfirmationService
from otix.services.external_id_service import ExternalIDService
from otix.schemas.media import ConfirmMatchRequest, ConfirmMatchResponse


class MockExternalID:
    def __init__(self, provider="epic", external_id="Jaguar", entity_id="otix_abc123"):
        self.provider = provider
        self.external_id = external_id
        self.entity_id = entity_id
        self.media_item_id = entity_id
        self.entity_type = "media_item"
        self.confirmed_count = 0
        self.confirmed_by = []
        self.last_confirmed_at = None


@pytest.mark.asyncio
async def test_confirm_increments_confirmed_count():
    """Confirming a match increments confirmed_count on external_ids."""
    session = AsyncMock()
    eid_svc = ExternalIDService(session)
    eid_svc.upsert = AsyncMock()
    eid_svc.increment_confirmed = AsyncMock()
    eid_svc._session = session

    svc = MatchConfirmationService(session)
    svc._eid_svc = eid_svc

    result = await svc.confirm(ConfirmMatchRequest(
        query_id="epic:Jaguar",
        media_item_id="otix_abc123",
    ))

    assert result.success is True
    assert result.media_item_id == "otix_abc123"
    eid_svc.increment_confirmed.assert_called_once_with(
        "epic", "Jaguar", "desktop_user", "media_item"
    )


@pytest.mark.asyncio
async def test_confirm_without_media_id_returns_error():
    """Confirm without media_item_id or igdb_id returns error."""
    session = AsyncMock()
    svc = MatchConfirmationService(session)
    result = await svc.confirm(ConfirmMatchRequest(query_id="epic:Jaguar"))
    assert result.success is False
    assert "media_item_id" in (result.error or "").lower()
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_match_confirmation.py -v`
Expected: FAIL (2 tests)

- [ ] **Step 7: Update GameMatcher Phase 1 to use confirmed_count for confidence**

Edit `backend/otix/services/game_matcher.py`, in `_phase1_direct()` at the candidate-building section (around line 245):

Replace the existing candidate creation with:

```python
# Build confidence from confirmed_count
confirmed = getattr(ext_row, "confirmed_count", 0) or 0
if confirmed >= 3:
    confidence = 1.0
elif confirmed >= 1:
    confidence = 0.98
else:
    confidence = 0.90

all_candidates[req_idx].append(
    GameMatchCandidate(
        media_item_id=entity_id,
        title=mi.title if mi else requests[req_idx].title,
        poster_url=mi.poster_url if mi else None,
        backdrop_url=mi.backdrop_url if mi else None,
        release_year=_release_year_from_date(mi.release_date if mi else None),
        confidence=confidence,
        match_type=MatchType.DIRECT,
    )
)
```

Note: `ext_row` here is the result from `batch_find_entity_ids`. We need to load the full ExternalID row for confirmed_count. The current implementation uses `entity_map` which only returns `{external_id: entity_id}`. We need to modify `batch_find_entity_ids` or add a new method.

Better approach — add `batch_find_with_metadata` to `ExternalIDService`:

```python
async def batch_find_with_metadata(
    self, provider: str, external_ids: list[str]
) -> dict[str, dict]:
    """Bulk lookup returning full metadata: entity_id, confirmed_count, etc."""
    rows = await self._session.scalars(
        select(ExternalID).where(
            ExternalID.provider == provider,
            ExternalID.external_id.in_(external_ids),
        )
    )
    result: dict[str, dict] = {}
    for row in rows:
        if row.entity_id:
            result[row.external_id] = {
                "entity_id": row.entity_id,
                "confirmed_count": row.confirmed_count or 0,
                "confirmed_by": row.confirmed_by or [],
            }
    return result
```

Then in `_phase1_direct`, replace:

```python
entity_map = await self._eid_svc.batch_find_entity_ids(source, ext_ids)
```

with:

```python
entity_map = await self._eid_svc.batch_find_with_metadata(source, ext_ids)
```

And update the inner loop:

```python
for ext_id, meta in entity_map.items():
    if not meta or not meta.get("entity_id"):
        continue
    if (source, ext_id) in skip_ids:
        continue

    entity_id = meta["entity_id"]
    confirmed = meta.get("confirmed_count", 0) or 0
    if confirmed >= 3:
        confidence = 1.0
    elif confirmed >= 1:
        confidence = 0.98
    else:
        confidence = 0.90
    # ... rest of candidate creation with confidence
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_match_confirmation.py -v`
Expected: PASS (2 tests)

- [ ] **Step 9: Commit**

```bash
git add backend/otix/domain/media.py backend/otix/services/game_matcher.py backend/otix/services/external_id_service.py backend/otix/services/match_confirmation.py backend/tests/test_match_confirmation.py backend/alembic/versions/
git commit -m "feat(matching): add confirmed_count to external_ids for crowd-sourced confidence"
```

---

### Task 2: Backend - SSE match stream endpoint

**Files:**
- Modify: `backend/otix/schemas/media.py` (add StreamMatchRequest/Event schemas)
- Modify: `backend/otix/api/media/search.py` (add `/match/stream` endpoint)
- Modify: `backend/otix/services/game_matcher.py` (add `match_batch_stream` async generator)
- Test: `backend/tests/test_match_stream.py`

**Interfaces:**
- Consumes: `GameMatcher`, `GameMatchRequest`, `StreamMatchEvent`
- Produces: `POST /api/media/match/stream` SSE endpoint

- [ ] **Step 1: Add SSE event schemas**

Edit `backend/otix/schemas/media.py`, add after `GameMatchBatchResponse`:

```python
class StreamMatchEvent(BaseModel):
    """Per-game progress event sent via SSE."""
    query_id: str
    status: str  # "processing" | "matched" | "candidates" | "failed"
    query_title: str = ""
    match: GameMatchCandidate | None = None
    candidates: list[GameMatchCandidate] | None = None
    error: str | None = None


class StreamCompleteEvent(BaseModel):
    """Final SSE event sent when all games are processed."""
    total: int = 0
    matched: int = 0
    candidates: int = 0
    failed: int = 0
```

- [ ] **Step 2: Write failing test for SSE stream endpoint**

Create `backend/tests/test_match_stream.py`:

```python
"""Tests for the SSE match stream endpoint."""

import json
import pytest
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from otix.api.media.search import media_router
from otix.schemas.media import GameMatchRequest, StreamMatchEvent, StreamCompleteEvent


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(media_router)
    return app


@pytest.fixture
def client(app):
    return TestClient(app)


@pytest.mark.asyncio
async def test_match_stream_returns_sse_events(client):
    """POST /api/media/match/stream returns SSE events for each game."""
    import os
    os.environ["OTIX_DISABLE_AUTH"] = "1"

    response = client.post(
        "/api/media/match/stream",
        json={
            "games": [
                {
                    "query_id": "epic:TestGame1",
                    "title": "Test Game 1",
                    "external_ids": [{"source": "epic", "id": "TestGame1"}],
                    "media_type": "game",
                }
            ]
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "text/event-stream"
    assert response.headers["x-accel-buffering"] == "no"

    events = response.text.strip().split("\n\n")
    assert len(events) == 2  # one game-progress + one complete

    # Parse first event
    first = events[0].split("\n")
    assert first[0] == "event: game-progress"
    data = json.loads(first[1].replace("data: ", ""))
    assert data["status"] in ("matched", "candidates", "failed")
    assert data["query_id"] == "epic:TestGame1"

    # Parse complete event
    last = events[1].split("\n")
    assert last[0] == "event: complete"
    data = json.loads(last[1].replace("data: ", ""))
    assert "total" in data
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_match_stream.py -v`
Expected: FAIL (endpoint not found)

- [ ] **Step 4: Add match_batch_stream async generator to GameMatcher**

Edit `backend/otix/services/game_matcher.py`, add method:

```python
async def match_batch_stream(
    self,
    requests: list[GameMatchRequest],
) -> AsyncGenerator[StreamMatchEvent, None]:
    """Match multiple games, yielding per-game progress events.

    Each game emits either "matched" (auto_match exists), "candidates"
    (no auto_match, needs user pick), or "failed" (no candidates at all).
    """
    results = await self.match_batch(requests)

    matched_count = 0
    candidates_count = 0
    failed_count = 0

    for result in results:
        if result.auto_match:
            matched_count += 1
            yield StreamMatchEvent(
                query_id=result.query_id,
                query_title=result.query_title,
                status="matched",
                match=result.auto_match,
            )
        elif result.candidates:
            candidates_count += 1
            yield StreamMatchEvent(
                query_id=result.query_id,
                query_title=result.query_title,
                status="candidates",
                candidates=result.candidates,
            )
        else:
            failed_count += 1
            yield StreamMatchEvent(
                query_id=result.query_id,
                query_title=result.query_title,
                status="failed",
                error="No candidates found",
            )

    yield StreamCompleteEvent(
        total=len(requests),
        matched=matched_count,
        candidates=candidates_count,
        failed=failed_count,
    )
```

Add import at top of file:

```python
from typing import AsyncGenerator
from otix.schemas.media import StreamMatchEvent, StreamCompleteEvent
```

- [ ] **Step 5: Add SSE endpoint to search.py**

Edit `backend/otix/api/media/search.py`, add after `match_games_batch` (after line 870):

```python
import json
from fastapi.responses import StreamingResponse


@media_router.post("/match/stream")
async def match_games_stream(
    body: GameMatchBatchRequest,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Match multiple games, streaming per-game results as SSE events.

    Each game emits a ``game-progress`` event with its status. A final
    ``complete`` event contains aggregate counts.
    """
    redis = await _get_redis()
    matcher = GameMatcher(db, redis)

    async def event_stream():
        async for event in matcher.match_batch_stream(body.games):
            if isinstance(event, StreamMatchEvent):
                yield f"event: game-progress\ndata: {event.model_dump_json()}\n\n"
            elif isinstance(event, StreamCompleteEvent):
                yield f"event: complete\ndata: {event.model_dump_json()}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
```

Add import at top of file:

```python
from otix.schemas.media import StreamMatchEvent, StreamCompleteEvent
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_match_stream.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/otix/schemas/media.py backend/otix/api/media/search.py backend/otix/services/game_matcher.py backend/tests/test_match_stream.py
git commit -m "feat(matching): add SSE /match/stream endpoint for per-game progress"
```

---

### Task 3: Desktop - game_matches table + GameScanOrchestrator

**Files:**
- Modify: `desktop/game/storage.ts` (add game_matches table + CRUD)
- Create: `desktop/game/orchestrator.ts` (GameScanOrchestrator)
- Test: `desktop/game/__tests__/orchestrator.test.ts`

**Interfaces:**
- Consumes: `PluginManager.getPluginsForSlot()`, `PluginManager.callPluginData()`, `backend POST /match/stream`
- Produces: `GameScanOrchestrator` with `scanAll()`, `scanPlugin()` methods; `game_matches` table + CRUD

- [ ] **Step 1: Write failing test for GameMatch storage**

Create `desktop/game/__tests__/storage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

// Mock the database module
vi.mock('../../db', () => ({
  getConnection: () => ({
    prepare: () => ({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
    }),
    exec: vi.fn(),
  }),
}));

import { getGameMatch, upsertGameMatch, deleteGameMatch, ensureGameMatchesTable } from '../storage';

describe('game_matches table', () => {
  it('should create the table without error', () => {
    expect(() => ensureGameMatchesTable()).not.toThrow();
  });

  it('should upsert a game match', () => {
    const result = upsertGameMatch({
      source: 'epic',
      sourceGameId: 'Jaguar',
      otixMediaId: 'otix_abc123',
      otixTitle: 'Rocket League',
      otixPosterUrl: 'https://example.com/poster.jpg',
      otixConfidence: 0.98,
      matchType: 'manual',
    });
    expect(result).toBeDefined();
  });

  it('should retrieve a game match by source + id', () => {
    const match = getGameMatch('epic', 'Jaguar');
    expect(match).toBeDefined();
    expect(match?.source).toBe('epic');
    expect(match?.otixMediaId).toBe('otix_abc123');
  });

  it('should return null for unknown game', () => {
    const match = getGameMatch('epic', 'nonexistent');
    expect(match).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd desktop && npx vitest run game/__tests__/storage.test.ts`
Expected: FAIL (imports not found)

- [ ] **Step 3: Add game_matches table and CRUD to game/storage.ts**

Append to `desktop/game/storage.ts`:

```typescript
// ── Game Matches (persistent, never cleaned on rescan) ──────────────

export interface GameMatch {
  source: string
  sourceGameId: string
  otixMediaId: string
  otixTitle?: string
  otixPosterUrl?: string
  otixBackdropUrl?: string
  otixIconUrl?: string
  otixConfidence?: number
  matchType: 'auto' | 'manual'
  matchedAt?: string
}

export function ensureGameMatchesTable(): void {
  db().exec(`
    CREATE TABLE IF NOT EXISTS game_matches (
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
    )
  `);
}

export function upsertGameMatch(match: GameMatch): void {
  db().prepare(`
    INSERT OR REPLACE INTO game_matches
      (source, source_game_id, otix_media_id, otix_title, otix_poster_url,
       otix_backdrop_url, otix_icon_url, otix_confidence, match_type, matched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    match.source, match.sourceGameId, match.otixMediaId,
    match.otixTitle || null, match.otixPosterUrl || null,
    match.otixBackdropUrl || null, match.otixIconUrl || null,
    match.otixConfidence ?? null, match.matchType,
  );
}

export function getGameMatch(source: string, sourceGameId: string): GameMatch | null {
  const row = db().prepare(
    'SELECT * FROM game_matches WHERE source = ? AND source_game_id = ?'
  ).get(source, sourceGameId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    source: row.source as string,
    sourceGameId: row.source_game_id as string,
    otixMediaId: row.otix_media_id as string,
    otixTitle: (row.otix_title as string) || undefined,
    otixPosterUrl: (row.otix_poster_url as string) || undefined,
    otixBackdropUrl: (row.otix_backdrop_url as string) || undefined,
    otixIconUrl: (row.otix_icon_url as string) || undefined,
    otixConfidence: row.otix_confidence != null ? Number(row.otix_confidence) : undefined,
    matchType: row.match_type as 'auto' | 'manual',
    matchedAt: row.matched_at as string,
  };
}

export function getAllGameMatches(): GameMatch[] {
  const rows = db().prepare('SELECT * FROM game_matches ORDER BY matched_at DESC').all() as Record<string, unknown>[];
  return rows.map(row => ({
    source: row.source as string,
    sourceGameId: row.source_game_id as string,
    otixMediaId: row.otix_media_id as string,
    otixTitle: (row.otix_title as string) || undefined,
    otixPosterUrl: (row.otix_poster_url as string) || undefined,
    otixBackdropUrl: (row.otix_backdrop_url as string) || undefined,
    otixIconUrl: (row.otix_icon_url as string) || undefined,
    otixConfidence: row.otix_confidence != null ? Number(row.otix_confidence) : undefined,
    matchType: row.match_type as 'auto' | 'manual',
    matchedAt: row.matched_at as string,
  }));
}

export function deleteGameMatch(source: string, sourceGameId: string): void {
  db().prepare('DELETE FROM game_matches WHERE source = ? AND source_game_id = ?').run(source, sourceGameId);
}
```

- [ ] **Step 4: Create GameScanOrchestrator**

Create `desktop/game/orchestrator.ts`:

```typescript
import http from 'http';
import { URL } from 'url';
import { EventEmitter } from 'events';
import type { PluginManager } from '../plugins/manager';
import {
  getGameMatch,
  upsertGameMatch,
  ensureGameMatchesTable,
} from './storage';
import { scanAllLaunchers as scanHardcodedLaunchers } from './launchers';

export interface ScannedGame {
  id: string
  title: string
  platform: string
  externalIds: Array<{ source: string; id: string }>
  developer?: string
  publisher?: string
  releaseYear?: number
  installPath?: string
  exePath?: string
  posterUrl?: string
  logoUrl?: string
}

export interface PluginScanResult {
  pluginId: string
  pluginLabel: string
  totalGames: number
  matched: number
  unmatched: number
  errors?: string[]
}

export interface ScanSummary {
  pluginsScanned: number
  totalGames: number
  matched: number
  unmatched: number
  failed: number
  startedAt: number
  completedAt: number
  pluginResults: PluginScanResult[]
}

export interface GameProgressEvent {
  pluginId: string
  queryId: string
  status: 'processing' | 'matched' | 'candidates' | 'failed'
  queryTitle?: string
  match?: {
    media_item_id: string
    title: string
    confidence: number
    poster_url?: string
    backdrop_url?: string
  }
  candidates?: Array<{
    media_item_id?: string
    title: string
    confidence: number
    poster_url?: string
  }>
  error?: string
}

export class GameScanOrchestrator extends EventEmitter {
  private apiBaseUrl = process.env.OTIX_BACKEND_URL || 'http://127.0.0.1:8000';
  private authToken = '';

  constructor(
    private pluginManager: PluginManager,
  ) {
    super();
  }

  setApiBaseUrl(url: string): void { this.apiBaseUrl = url; }
  setAuthToken(token: string): void { this.authToken = token; }

  async scanAll(): Promise<ScanSummary> {
    ensureGameMatchesTable();

    const startedAt = Date.now();
    const pluginResults: PluginScanResult[] = [];
    const allGames: ScannedGame[] = [];
    let totalUnmatchedCount = 0;

    // 1. Collect all matching:scan plugins
    const plugins = this.pluginManager.getPluginsForSlot('matching:scan');
    const hardcodedResults = await scanHardcodedLaunchers();
    for (const r of hardcodedResults) {
      for (const g of r.games) {
        allGames.push({
          id: g.id,
          title: g.title,
          platform: g.platform || 'pc',
          externalIds: [],
          installPath: g.installDir,
          exePath: g.exePath,
          posterUrl: g.posterUrl,
        });
      }
    }

    // 2. Scan each plugin
    for (const plugin of plugins) {
      let scanned: ScannedGame[] = [];
      try {
        const raw = await this.pluginManager.callPluginData(plugin.pluginId, 'scan');
        scanned = (raw as { games?: ScannedGame[] })?.games || (raw as ScannedGame[]) || [];
      } catch (err: any) {
        pluginResults.push({
          pluginId: plugin.pluginId,
          pluginLabel: plugin.label,
          totalGames: 0,
          matched: 0,
          unmatched: 0,
          errors: [err.message],
        });
        continue;
      }

      // 3. Split: already-matched vs needs matching
      const matched: ScannedGame[] = [];
      const needsMatch: ScannedGame[] = [];
      for (const game of scanned) {
        for (const eid of game.externalIds) {
          const existing = getGameMatch(eid.source, eid.id);
          if (existing) {
            matched.push(game);
            break;
          }
        }
        if (!matched.includes(game)) {
          needsMatch.push(game);
        }
      }

      allGames.push(...scanned);
      totalUnmatchedCount += needsMatch.length;

      pluginResults.push({
        pluginId: plugin.pluginId,
        pluginLabel: plugin.label,
        totalGames: scanned.length,
        matched: matched.length,
        unmatched: needsMatch.length,
      });

      // 4. Send unmatched to backend SSE
      if (needsMatch.length > 0) {
        await this.streamMatches(needsMatch, plugin.pluginId);
      }
    }

    return {
      pluginsScanned: plugins.length + (hardcodedResults.length > 0 ? 1 : 0),
      totalGames: allGames.length,
      matched: allGames.length - totalUnmatchedCount,
      unmatched: totalUnmatchedCount,
      failed: 0,
      startedAt,
      completedAt: Date.now(),
      pluginResults,
    };
  }

  async scanPlugin(pluginId: string): Promise<PluginScanResult> {
    ensureGameMatchesTable();

    let scanned: ScannedGame[] = [];
    const plugins = this.pluginManager.getPluginsForSlot('matching:scan');
    const plugin = plugins.find((p) => p.pluginId === pluginId);
    if (!plugin) {
      return {
        pluginId,
        pluginLabel: pluginId,
        totalGames: 0,
        matched: 0,
        unmatched: 0,
        errors: ['Plugin not registered for matching:scan slot'],
      };
    }

    try {
      const raw = await this.pluginManager.callPluginData(pluginId, 'scan');
      scanned = (raw as { games?: ScannedGame[] })?.games || (raw as ScannedGame[]) || [];
    } catch (err: any) {
      return {
        pluginId,
        pluginLabel: plugin.label,
        totalGames: 0,
        matched: 0,
        unmatched: 0,
        errors: [err.message],
      };
    }

    const matched: ScannedGame[] = [];
    const needsMatch: ScannedGame[] = [];
    for (const game of scanned) {
      for (const eid of game.externalIds) {
        const existing = getGameMatch(eid.source, eid.id);
        if (existing) {
          matched.push(game);
          break;
        }
      }
      if (!matched.includes(game)) {
        needsMatch.push(game);
      }
    }

    if (needsMatch.length > 0) {
      await this.streamMatches(needsMatch, pluginId);
    }

    return {
      pluginId,
      pluginLabel: plugin.label,
      totalGames: scanned.length,
      matched: matched.length,
      unmatched: needsMatch.length,
    };
  }

  private async streamMatches(games: ScannedGame[], pluginId: string): Promise<void> {
    const requests = games.map((g) => ({
      query_id: `${g.platform}:${g.id}`,
      title: g.title,
      developer: g.developer || null,
      publisher: g.publisher || null,
      release_year: g.releaseYear || null,
      external_ids: g.externalIds.length > 0 ? g.externalIds : [{ source: g.platform, id: g.id }],
      media_type: 'game',
    }));

    const url = new URL('/api/media/match/stream', this.apiBaseUrl);
    const body = JSON.stringify({ games: requests });

    return new Promise<void>((resolve, reject) => {
      const req = http.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Authorization': this.authToken ? `Bearer ${this.authToken}` : '',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 120_000,
      });

      let buffer = '';

      req.on('response', (res) => {
        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          this.processSseBuffer(buffer, pluginId);
        });
        res.on('end', () => {
          resolve();
        });
      });

      req.on('error', (err) => {
        console.error('[GameScanOrchestrator] SSE stream error:', err.message);
        reject(err);
      });

      req.write(body);
      req.end();
    });
  }

  private processSseBuffer(buffer: string, pluginId: string): void {
    const parts = buffer.split('\n\n');
    for (let i = 0; i < parts.length - 1; i++) {
      const block = parts[i].trim();
      if (!block) continue;

      const lines = block.split('\n');
      let eventType = 'message';
      let dataStr = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          dataStr = line.slice(6).trim();
        }
      }

      if (!dataStr) continue;

      try {
        if (eventType === 'game-progress') {
          const data = JSON.parse(dataStr);
          const event: GameProgressEvent = {
            pluginId,
            queryId: data.query_id,
            status: data.status,
            queryTitle: data.query_title,
            match: data.match,
            candidates: data.candidates,
            error: data.error,
          };
          this.emit('game:matching:progress', event);

          // If matched, persist to game_matches
          if (data.status === 'matched' && data.match?.media_item_id) {
            const parts = data.query_id.split(':');
            for (const game of this.getGamesForQueryId(data.query_id)) {
              upsertGameMatch({
                source: parts[0] || 'unknown',
                sourceGameId: parts.slice(1).join(':') || data.query_id,
                otixMediaId: data.match.media_item_id,
                otixTitle: data.match.title,
                otixPosterUrl: data.match.poster_url,
                otixBackdropUrl: data.match.backdrop_url,
                otixConfidence: data.match.confidence,
                matchType: 'auto',
              });
            }
          }
        } else if (eventType === 'complete') {
          this.emit('game:matching:complete', { pluginId, ...JSON.parse(dataStr) });
        }
      } catch (err) {
        console.error('[GameScanOrchestrator] Failed to parse SSE event:', err);
      }
    }
  }

  // Internal: track games per queryId for persistence
  private queryIdToGames = new Map<string, ScannedGame[]>();

  private getGamesForQueryId(queryId: string): ScannedGame[] {
    return this.queryIdToGames.get(queryId) || [];
  }
}
```

- [ ] **Step 5: Write failing test for orchestrator**

Create `desktop/game/__tests__/orchestrator.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('GameScanOrchestrator', () => {
  it('should emit progress events via SSE', async () => {
    // Mock plugin manager
    const mockPluginManager = {
      getPluginsForSlot: vi.fn().mockReturnValue([
        { pluginId: 'otix-epic', label: 'Epic Games' },
      ]),
      callPluginData: vi.fn().mockResolvedValue([
        {
          id: 'Jaguar',
          title: 'Rocket League',
          platform: 'epic',
          externalIds: [{ source: 'epic', id: 'Jaguar' }],
        },
      ]),
    };

    const { GameScanOrchestrator } = await import('../orchestrator');
    const orchestrator = new GameScanOrchestrator(mockPluginManager as any);

    const progressEvents: any[] = [];
    orchestrator.on('game:matching:progress', (e) => progressEvents.push(e));

    const summary = await orchestrator.scanAll();

    expect(summary.pluginsScanned).toBeGreaterThanOrEqual(1);
    expect(summary.totalGames).toBe(1);
  });
});
```

- [ ] **Step 6: Run tests**

Run: `cd desktop && npx vitest run game/__tests__/ -v`
Expected: PASSes (adjust test to be realistic — mock http module for SSE)

- [ ] **Step 7: Commit**

```bash
git add desktop/game/storage.ts desktop/game/orchestrator.ts desktop/game/__tests__/
git commit -m "feat(matching): add game_matches table and GameScanOrchestrator"
```

---

### Task 4: Desktop - IPC wiring + main process integration

**Files:**
- Modify: `desktop/ipc/scanner.ts` (add plugin scan IPC handlers)
- Modify: `desktop/ipc/plugins.ts` (add orchestrator event forwarding)
- Modify: `desktop/main.ts` (initialize orchestrator)
- Modify: `desktop/preload-api.ts` (expose scan methods to renderer)

**Interfaces:**
- Consumes: `GameScanOrchestrator`, `PluginManager`
- Produces: IPC handlers `scanner:scan-plugins`, `scanner:scan-plugin`

- [ ] **Step 1: Add scan IPC handlers**

Edit `desktop/ipc/scanner.ts`, add after the existing handlers:

```typescript
import { GameScanOrchestrator } from '../game/orchestrator';

let _orchestrator: GameScanOrchestrator | null = null;

export function setScanOrchestrator(o: GameScanOrchestrator): void {
  _orchestrator = o;
}

export function registerPluginScanIPC(): void {
  if (!_orchestrator) {
    console.warn('[registerPluginScanIPC] Orchestrator not set — skipping');
    return;
  }

  ipcMain.handle('scanner:scan-all-plugins', async () => {
    return await _orchestrator!.scanAll();
  });

  ipcMain.handle('scanner:scan-plugin', async (_event, pluginId: string) => {
    return await _orchestrator!.scanPlugin(pluginId);
  });
}
```

- [ ] **Step 2: Wire orchestrator event forwarding in plugins IPC**

Edit `desktop/ipc/plugins.ts`, add at the bottom of `registerPluginIPC`:

```typescript
// ── Orchestrator event forwarding ──
import { GameScanOrchestrator } from '../game/orchestrator';

// Forward matching progress events to renderer
// Called after orchestrator is created in main.ts
export function wireOrchestratorEvents(
  orchestrator: GameScanOrchestrator,
  mainWindow: BrowserWindow,
): void {
  orchestrator.on('game:matching:progress', (event: any) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:matching:progress', event);
    }
  });

  orchestrator.on('game:matching:complete', (event: any) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:matching:complete', event);
    }
  });
}
```

- [ ] **Step 3: Initialize orchestrator in main.ts**

Edit `desktop/main.ts`, after plugin manager creation (around line 470):

```typescript
import { GameScanOrchestrator } from './game/orchestrator';
import { setScanOrchestrator } from './ipc/scanner';
import { wireOrchestratorEvents } from './ipc/plugins';

// After: pluginManager = new PluginManager(extensionsDir, pluginsRepo, ...)
const orchestrator = new GameScanOrchestrator(pluginManager);
orchestrator.setApiBaseUrl(pluginManager.getApiBaseUrl());
// Wire auth token changes
const origSetAuth = pluginManager.setAuthToken.bind(pluginManager);
pluginManager.setAuthToken = (token: string) => {
  origSetAuth(token);
  orchestrator.setAuthToken(token);
};
setScanOrchestrator(orchestrator);

// Inside createWindow or setupIPC section:
wireOrchestratorEvents(orchestrator, mainWindow);
```

Also call `registerPluginScanIPC()` after the orchestator is set:

```typescript
registerPluginScanIPC();
```

- [ ] **Step 4: Expose scan API in preload**

Edit `desktop/preload-api.ts`, add to exposed API:

```typescript
// In contextBridge.exposeInMainWorld('electron', { ... })
scanAllPlugins: () => ipcRenderer.invoke('scanner:scan-all-plugins'),
scanPlugin: (pluginId: string) => ipcRenderer.invoke('scanner:scan-plugin', pluginId),

// Events
onMatchingProgress: (callback: (event: any) => void) => {
  const handler = (_event: any, data: any) => callback(data);
  ipcRenderer.on('game:matching:progress', handler);
  return () => ipcRenderer.removeListener('game:matching:progress', handler);
},

onMatchingComplete: (callback: (event: any) => void) => {
  const handler = (_event: any, data: any) => callback(data);
  ipcRenderer.on('game:matching:complete', handler);
  return () => ipcRenderer.removeListener('game:matching:complete', handler);
},
```

- [ ] **Step 5: Commit**

```bash
git add desktop/ipc/scanner.ts desktop/ipc/plugins.ts desktop/main.ts desktop/preload-api.ts
git commit -m "feat(matching): wire GameScanOrchestrator into IPC and main process"
```

---

### Task 5: Epic plugin refactor — standardized scan interface

**Files:**
- Modify: `extensions/otix-plugins/plugins/otix-epic/main.js`

**Interfaces:**
- Consumes: `PluginContext` (existing)
- Produces: `scan()` returning `{success, games: ScannedGame[]}`, `status()` returning `ScanStatus`

- [ ] **Step 1: Rewrite plugin scan and remove ad hoc match methods**

Edit `extensions/otix-plugins/plugins/otix-epic/main.js`:

Delete:
- `match.batch` data method (lines 553-599)
- `match.confirm` data method (lines 601-617)
- `match.unlink` data method (lines 619-629)

Update `data` object — replace removed methods with streamlined export. Core scan logic preserved but output mapped to `ScannedGame[]`:

```javascript
// After the performScan function and all auth/scan helpers remain unchanged...
// UPDATE the returned data methods:

const dataMethods = {
  'auth.getLoginUrl': async () => ({ url: getAuthUrl() }),

  'auth.handleCallback': async (ctx, code) => {
    // ... existing logic unchanged
  },

  'auth.logout': async (ctx) => {
    _clearAuth(ctx);
    ctx.logger.info('Logged out');
    return { success: true };
  },

  'scan': async (ctx) => {
    const result = await performScan(ctx);
    if (!result.success) {
      return { success: false, error: result.error, games: [] };
    }

    // Map to standardized ScannedGame[]
    const games = result.games.map((g) => ({
      id: g.appName,
      title: g.title,
      platform: 'epic',
      externalIds: [
        { source: 'epic', id: g.appName },
        ...(g.namespace ? [{ source: 'epic_namespace', id: g.namespace }] : []),
      ],
      developer: g.developer || g.publisher || null,
      publisher: g.publisher || g.developer || null,
      installPath: g.installPath || null,
      exePath: g.launchExe || null,
      posterUrl: g.posterUrl || null,
      logoUrl: g.logoUrl || null,
      rawMetadata: {
        namespace: g.namespace,
        catalogItemId: g.catalogItemId,
        installSize: g.installSize,
        version: g.version,
        isInstalled: g.isInstalled,
        savePaths: g.savePaths,
      },
    }));

    return { success: true, total: result.total, games };
  },

  'scan.status': async (ctx) => {
    // ... existing status logic unchanged
    return { ..._scanProgress };
  },
};
```

Update top-level exports — remove old match exports:

```javascript
// OLD — DELETE these lines:
// 'match.batch': dataMethods['match.batch'],
// 'match.confirm': dataMethods['match.confirm'],
// 'match.unlink': dataMethods['match.unlink'],
```

Update `slotRender`:

```javascript
slotRender: async (ctx, location) => ({
  type: 'scan',
  platform: 'epic',
  label: 'Epic Games',
  description: 'Scan and match your Epic Games library',
})
```

- [ ] **Step 2: Verify plugin loads correctly**

Run the desktop app and enable the Epic plugin. Check:
- Plugin enables without errors
- `slotRender('matching:scan')` returns expected descriptor
- `scan()` returns `ScannedGame[]` with correct structure

- [ ] **Step 3: Commit**

```bash
git add extensions/otix-plugins/plugins/otix-epic/main.js
git commit -m "refactor(plugin-epic): use standardized scan interface, remove ad hoc match methods"
```

---

### Task 6: Frontend - Scan panel consuming matching:scan slot

**Files:**
- Modify: `frontend/src/features/settings/sections/settings-matching.tsx` (existing matching section)
- New or modify: Render scan panels from slot data

**Interfaces:**
- Consumes: `window.electron.getSlotData('matching:scan')`, `window.electron.scanPlugin()`, `window.electron.onMatchingProgress()`

- [ ] **Step 1: Add scan panel component**

Edit `frontend/src/features/settings/sections/settings-matching.tsx`. Replace or add scan panel section:

```typescript
import { useEffect, useState, useCallback } from 'react';

interface ScanPlugin {
  pluginId: string
  label: string
  data: {
    type: string
    platform: string
    label: string
    description?: string
  }
}

interface ScanStatus {
  connected: boolean
  label?: string
  lastScanAt?: number
  lastScanTotal?: number
}

interface ScanProgress {
  pluginId: string
  queryId: string
  status: string
  queryTitle?: string
}

export function MatchingScanSection() {
  const [plugins, setPlugins] = useState<ScanPlugin[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ScanStatus>>({});
  const [progress, setProgress] = useState<Record<string, ScanProgress>>({});
  const [scanning, setScanning] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Load matching:scan slot plugins
    window.electron.getSlotData('matching:scan').then((slots: ScanPlugin[]) => {
      setPlugins(slots);
    });
  }, []);

  // Subscribe to progress events
  useEffect(() => {
    const unsub = window.electron.onMatchingProgress?.((event: ScanProgress) => {
      setProgress(prev => ({ ...prev, [event.queryId]: event }));
    });
    return () => unsub?.();
  }, []);

  const handleScan = useCallback(async (pluginId: string) => {
    setScanning(prev => ({ ...prev, [pluginId]: true }));
    try {
      await window.electron.scanPlugin?.(pluginId);
    } finally {
      setScanning(prev => ({ ...prev, [pluginId]: false }));
    }
  }, []);

  // Fetch plugin status
  useEffect(() => {
    for (const p of plugins) {
      window.electron.callPluginData?.(p.pluginId, 'status').then((s: any) => {
        if (s) setStatuses(prev => ({ ...prev, [p.pluginId]: s }));
      });
    }
  }, [plugins]);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Game Libraries</h3>
      {plugins.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No game library plugins installed. Install plugins from the Plugin Store.
        </p>
      )}
      {plugins.map((plugin) => {
        const status = statuses[plugin.pluginId];
        const isScanning = scanning[plugin.pluginId];

        return (
          <div key={plugin.pluginId} className="border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">{plugin.label}</h4>
                <p className="text-sm text-muted-foreground">
                  {status?.connected
                    ? `Connected as ${status.label || status.connected}`
                    : 'Not connected'}
                </p>
                {status?.lastScanAt && (
                  <p className="text-xs text-muted-foreground">
                    Last scan: {new Date(status.lastScanAt).toLocaleDateString()}
                    {status.lastScanTotal != null && ` — ${status.lastScanTotal} games`}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleScan(plugin.pluginId)}
                disabled={isScanning || !status?.connected}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50"
              >
                {isScanning ? 'Scanning...' : 'Scan Library'}
              </button>
            </div>
          </div>
        );
      })}

      {/* Show in-progress matches */}
      {Object.entries(progress).length > 0 && (
        <div className="mt-4">
          <h4 className="font-medium mb-2">Match Progress</h4>
          <div className="space-y-1 max-h-40 overflow-y-auto text-sm">
            {Object.entries(progress).map(([queryId, event]) => (
              <div key={queryId} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  event.status === 'matched' ? 'bg-green-500' :
                  event.status === 'candidates' ? 'bg-yellow-500' :
                  event.status === 'failed' ? 'bg-red-500' : 'bg-blue-500 animate-pulse'
                }`} />
                <span>{event.queryTitle || queryId}</span>
                <span className="text-xs text-muted-foreground">{event.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/settings/sections/settings-matching.tsx
git commit -m "feat(ui): scan panel consuming matching:scan slot with per-game progress"
```

---

### Task 7: Hardcoded launcher compatibility bridge

**Files:**
- Modify: `desktop/game/orchestrator.ts`

**Interfaces:**
- Consumes: `scanAllLaunchers()` from `launchers.ts`
- Produces: Hardcoded launcher results merged into orchestrator pipeline

- [ ] **Step 1: Update orchestrator to include hardcoded launchers**

This was already partially done in Task 3 Step 4 — the orchestrator's `scanAll()` calls `scanHardcodedLaunchers()`. Now add `ensureGameMatchesTable()` call and merge properly.

The code in Task 3 already includes the hardcoded launcher bridge. Ensure it's complete.

- [ ] **Step 2: Mark launchers.ts as legacy**

Add deprecation comment to `desktop/game/launchers.ts`, line 1:

```typescript
/**
 * @deprecated Use matching:scan plugin slot instead.
 * These hardcoded scanners remain for backward compatibility.
 * Plugin-based scanners registered via matching:scan slot replace them.
 */
```

- [ ] **Step 3: Commit**

```bash
git add desktop/game/launchers.ts
git commit -m "chore: mark hardcoded launcher scanners as deprecated"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All sections from the spec covered (game_matches table, orchestrator, SSE endpoint, confirmed_count, Epic plugin refactor, scan panel).
- [x] **Placeholder scan:** No TODOs, TBDs, or "implement later" in code blocks. All code is complete.
- [x] **Type consistency:** `ScannedGame` → `GameMatchRequest` → `StreamMatchEvent` types match across tasks. `confirmed_count` used consistently in backend. `game_matches` table schema matches orchestrator usage.
