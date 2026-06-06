# SSE Framework Plan

## Context

The Otix backend has **6 nearly identical SSE (Server-Sent Events) endpoint implementations**, each containing a 22-line duplicated Redis pub/sub loop with keepalive logic. Every one has a TODO comment asking to be replaced with a reusable framework. Additionally, there are **4 duplicate progress publisher modules** (`plex_progress.py`, `spotify_progress.py`, `youtube_progress.py`, `media_rehydrate_progress.py`) with identical interfaces.

The frontend consumes SSE in two patterns: `EventSource` for persistent notifications, and `fetch` + `ReadableStream` for short-lived task streams — also with duplicated parsing code.

This plan creates a unified, reusable SSE framework for the entire backend that eliminates all duplication while maintaining backward compatibility with existing frontend consumers.

## Current SSE Endpoints (all 22-line duplicates)

| Endpoint | Channel | Terminal Events | Result Replay | Progress Replay |
|---|---|---|---|---|
| `GET /notifications/stream` | `user:{user_id}:notifications` | none | no | no |
| `GET /integrations/plex/sync/{task_id}/stream` | `plex:sync:{task_id}:events` | `sync_complete`, `error` | yes | no |
| `GET /integrations/spotify/sync/{task_id}/stream` | `spotify:sync:{task_id}:events` | `sync_complete`, `error` | yes | yes |
| `GET /integrations/spotify/recently_played/sync/{task_id}/stream` | `spotify:sync:{task_id}:events` | `sync_complete`, `error` | yes | yes |
| `GET /integrations/youtube/sync/{task_id}/stream` | `youtube:sync:{task_id}:events` | `sync_complete`, `error` | yes | yes |
| `GET /media/{media_id}/rehydrate/{task_id}/stream` | `media:rehydrate:{task_id}:events` | `rehydrate_complete`, `error` | yes | yes |

## Design

### Module Structure

```
backend/otix/lib/sse/
    __init__.py          # Public API: SseStreamConfig, create_sse_response, sse_headers
    _config.py           # SseStreamConfig frozen dataclass
    _core.py             # Async generator + Redis lifecycle + keepalive
    _response.py         # StreamingResponse factory with replay short-circuit

backend/otix/lib/redis_progress.py   # Single module replacing 4 progress files
```

### Public API (3 exports)

```python
from otix.lib.sse import SseStreamConfig, create_sse_response, sse_headers
```

- **`SseStreamConfig`** — frozen dataclass declaring: `channel`, `terminal_events`, `timeout`, `result_replay`, `progress_replay`
- **`create_sse_response(config, request)`** — returns `StreamingResponse` with correct SSE headers; handles replay short-circuit internally
- **`sse_headers()`** — dict of standard headers (`Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`)

Two stream types emerge naturally from config:
- **Persistent** (`terminal_events=()`) — notifications, future friend activity. Never self-terminates.
- **Task** (`terminal_events=("sync_complete", "error")`) — sync progress, rehydration. Self-terminates on terminal event.

### Core Generator (`_core.py`)

The async generator lifecycle:
1. Check `result_replay` — if completed task result exists, yield and **short-circuit** (never subscribes to Redis)
2. Check `progress_replay` — if latest intermediate progress exists, yield it
3. Subscribe to Redis pub/sub channel
4. Loop: poll with 1s timeout → yield keepalive or data frame → check terminal events → check `request.is_disconnected()`
5. `finally`: unsubscribe + close pubsub
6. Handle `CancelledError`/`RuntimeError` (client disconnect) and generic exceptions (yields error event)

Key improvements over current code:
- **Client disconnect detection** via `request.is_disconnected()` — current code has none, meaning abandoned connections hold Redis subscriptions for up to 5 minutes
- **Proper generator cancellation** handling — current code can lose the `finally` block on `CancelledError`
- **Consolidated error handling** — yields structured error event to client instead of silently dropping

### Consolidated Progress Publisher (`redis_progress.py`)

Single `RedisProgress` class with methods: `publish()`, `store_progress()`, `get_latest_progress()`, `store_result()`, `get_stored_result()`. Pre-built instances for backward compat:

```python
plex_progress = RedisProgress("plex:sync")
spotify_progress = RedisProgress("spotify:sync")
youtube_progress = RedisProgress("youtube:sync")
media_rehydrate_progress = RedisProgress("media:rehydrate")
```

### Migration: Before/After Example

**Before** (36 lines of notification stream):
```python
@router.get("/stream")
async def notification_stream(request: Request, current_user: User = Depends(get_current_user)):
    channel = f"user:{current_user.id}:notifications"
    async def event_generator():
        redis = await get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        try:
            deadline = time.monotonic() + 300.0
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message is None:
                    if time.monotonic() > deadline: break
                    yield ":keepalive\n\n"
                    continue
                data = message["data"]
                yield f"data: {data}\n\n"
                deadline = time.monotonic() + 300.0
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()
    return StreamingResponse(event_generator(), media_type="text/event-stream", headers={...})
```

**After** (5 lines):
```python
@router.get("/stream")
async def notification_stream(request: Request, current_user: User = Depends(get_current_user)):
    return await create_sse_response(
        SseStreamConfig(channel=f"user:{current_user.id}:notifications"),
        request,
    )
```

## Plex Result Normalization Edge Case

The Plex `store_result` callers do NOT include a `"type"` key in the stored dict. The SSE handler manually adds `stored["type"] = "sync_complete"` before yielding. The framework must handle this:

**Fix**: The `create_sse_response` replay path will normalize: if a stored result has no `"type"` key AND `terminal_events` is non-empty, it wraps it as `{"type": terminal_events[0], **stored}`. This preserves backward compat without requiring changes to Plex task code.

## Frontend: Reusable SSE Hook (optional but recommended)

A single `parseSseFrames<T>()` async generator replaces 4 duplicated `parse*SseEvents` functions. The existing `useNotificationToasts` hook is already clean and doesn't need migration — but a generic `useEventSourceSse` hook can be created for future SSE consumers (friend activity, etc.).

## Implementation Phases

### Phase 1: Create framework (no behavioral changes to existing endpoints)
1. Create `backend/otix/lib/sse/__init__.py`
2. Create `backend/otix/lib/sse/_config.py` — `SseStreamConfig` frozen dataclass
3. Create `backend/otix/lib/sse/_core.py` — async generator with Redis lifecycle
4. Create `backend/otix/lib/sse/_response.py` — `create_sse_response` factory
5. Create `backend/otix/lib/redis_progress.py` — consolidated progress publisher
6. Write backend unit tests (using `fakeredis`)

### Phase 2: Migrate simplest endpoint (proof of concept)
1. Migrate `GET /notifications/stream` — persistent stream, no replays, simplest case
2. Verify frontend notification toasts still work

### Phase 3: Migrate task stream endpoints one by one
1. `GET /integrations/plex/sync/{task_id}/stream` — has result replay, no progress replay
2. `GET /integrations/spotify/sync/{task_id}/stream` — has both replay types
3. `GET /integrations/spotify/recently_played/sync/{task_id}/stream` — same pattern
4. `GET /integrations/youtube/sync/{task_id}/stream` — same pattern
5. `GET /media/{media_id}/rehydrate/{task_id}/stream` — different terminal event name (`rehydrate_complete`)

### Phase 4: Progress library consolidation
1. Migrate all importers of `plex_progress`, `spotify_progress`, `youtube_progress`, `media_rehydrate_progress` to use `redis_progress`
2. Delete old progress modules

### Phase 5: Frontend consolidation (optional)
1. Create `frontend/src/lib/sse-parser.ts` with `parseSseFrames<T>()`
2. Replace 3 duplicated SSE parsers in `integrations.tsx`
3. Replace inline SSE parser in `library-queries.ts`

## Files to Modify

**New files (create):**
- `backend/otix/lib/sse/__init__.py`
- `backend/otix/lib/sse/_config.py`
- `backend/otix/lib/sse/_core.py`
- `backend/otix/lib/sse/_response.py`
- `backend/otix/lib/redis_progress.py`
- `backend/tests/test_lib/test_sse.py`

**Existing files (migrate — replace inline SSE code with framework calls):**
- `backend/otix/api/user/notification/__init__.py` — notification stream
- `backend/otix/api/integrations/plex/sync/__init__.py` — plex sync stream
- `backend/otix/api/integrations/spotify/sync/__init__.py` — spotify sync stream
- `backend/otix/api/integrations/spotify/recently_played/sync/__init__.py` — spotify recently played stream
- `backend/otix/api/integrations/youtube/sync/__init__.py` — youtube sync stream
- `backend/otix/api/media/search.py` — media rehydrate stream (lines ~628-693)

**Existing files (update imports — point to redis_progress):**
- All Celery task files that import from `plex_progress`, `spotify_progress`, `youtube_progress`, `media_rehydrate_progress`

**Optional frontend files:**
- `frontend/src/lib/sse-parser.ts` — new
- `frontend/src/features/settings/organisms/settings-sections/integrations.tsx` — replace 3 parsers
- `frontend/src/features/library/library-queries.ts` — replace inline parser

## Verification

1. **Backend unit tests**: Run `pytest backend/tests/test_lib/test_sse.py -v` — covers generator lifecycle, replay paths, timeout, disconnect, malformed JSON, and header correctness
2. **Integration test**: Start dev environment (`docker compose up api redis`), run `GET /notifications/stream` with auth token, trigger a notification, verify SSE frame arrives
3. **Frontend smoke test**: Connect frontend, trigger a Plex sync, verify progress events appear in real-time
4. **Comparison test**: Run the old and new notification stream side-by-side with the same Redis channel, diff the SSE output — must be byte-identical
