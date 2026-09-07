"""Async generator that powers all SSE event streams."""

from __future__ import annotations

import json
import time
from asyncio import CancelledError
from collections.abc import AsyncGenerator
from typing import Any

import structlog
from fastapi import Request

from otix.infrastructure.redis import get_redis

logger = structlog.get_logger(__name__)

_SSE_KEEPALIVE = ":keepalive\n\n"
_POLL_TIMEOUT = 1.0


def _format_sse(data: dict[str, Any]) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False, default=str, separators=(',', ':'))}\n\n"


def _normalize_stored_result(
    stored: dict[str, Any],
    terminal_events: tuple[str, ...],
) -> dict[str, Any]:
    """Ensure a stored result carries a ``type`` field.

    Two legacy patterns exist:

    * **Plex sync** — stored result has no ``type`` key;
      the old handler unconditionally added ``stored["type"] = "sync_complete"``.
    * **Media rehydrate** — stored result has no ``type`` key;
      the old handler checked ``stored.get("error")`` to decide between
      ``"rehydrate_complete"`` and ``"error"``.
    """
    if "type" in stored:
        return stored
    if not terminal_events:
        return stored
    # Rehydrate pattern: an "error" key means the task failed.
    if "error" in stored and "error" in terminal_events:
        return {"type": "error", **stored}
    # Default: use the first terminal event (e.g. "sync_complete").
    return {"type": terminal_events[0], **stored}


async def sse_event_generator(
    *,
    channel: str,
    terminal_events: tuple[str, ...] = (),
    timeout: int = 300,
    result_replay=None,
    progress_replay=None,
    request: Request | None = None,
) -> AsyncGenerator[str, None]:
    """Yield ``text/event-stream`` chunks until a terminal event or timeout.

    Lifecycle
    ---------
    1. **Result replay** — if a completed task result exists the generator
       yields it and returns immediately without subscribing to Redis.
    2. **Progress replay** — the latest intermediate progress is yielded
       so a late-connecting client doesn't miss in-flight state.
    3. **Live subscription** — subscribe to the Redis pub/sub channel and
       poll for messages, yielding ``data:`` frames for events and
       ``:keepalive`` frames during idle periods.
    4. **Terminal event** — the stream closes automatically.
    5. **Cleanup** — the ``finally`` block always unsubscribes and closes
       the pubsub connection, regardless of how the generator exits.
    """
    log = logger.bind(channel=channel)

    # ------------------------------------------------------------------
    # Phase 1 — result replay (short-circuit for completed background tasks)
    # ------------------------------------------------------------------
    if result_replay is not None:
        stored = await result_replay()
        if stored is not None:
            normalized = _normalize_stored_result(stored, terminal_events)
            log.debug("sse replaying stored result", type=normalized.get("type"))
            yield _format_sse(normalized)
            return

    redis = await get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(channel)

    # ------------------------------------------------------------------
    # Phase 2 — progress replay (latest in-flight event)
    # ------------------------------------------------------------------
    if progress_replay is not None:
        latest = await progress_replay()
        if latest is not None:
            log.debug("sse replaying latest progress", type=latest.get("type"))
            yield _format_sse(latest)

    try:
        deadline = time.monotonic() + timeout

        while True:
            # --- early exit on client disconnect --------------------------
            if request is not None and await request.is_disconnected():
                log.debug("sse client disconnected")
                break

            message = await pubsub.get_message(
                ignore_subscribe_messages=True,
                timeout=_POLL_TIMEOUT,
            )

            if message is None:
                # No message this tick — check deadline
                if time.monotonic() > deadline:
                    log.info("sse connection timeout reached")
                    break
                # Heartbeat keeps proxies from timing out the connection
                yield _SSE_KEEPALIVE
                continue

            # --- data frame -----------------------------------------------
            raw: str = message.get("data", "")
            if raw:
                yield f"data: {raw}\n\n"

            # Reset deadline on every received event
            deadline = time.monotonic() + timeout

            # --- terminal event check -------------------------------------
            if terminal_events:
                try:
                    ev = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if ev.get("type") in terminal_events:
                    log.debug("sse terminal event received", type=ev.get("type"))
                    break

    except (RuntimeError, CancelledError):
        # Client disconnected mid-yield — clean up silently.
        # The ASGI server raises CancelledError when the transport is gone.
        log.debug("sse generator cancelled (client disconnected)")
    except Exception:
        log.exception("sse generator error")
        yield _format_sse({"type": "error", "message": "Internal stream error"})
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()


def sse_headers() -> dict[str, str]:
    """Return headers required for SSE delivery through proxies."""
    return {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
