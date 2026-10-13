"""Server-Sent-Events transport over Redis pub/sub (Django, ASGI-ready).

A Django ``StreamingHttpResponse`` whose content is an *async generator* that
polls a Redis pub/sub channel. Under ASGI (uvicorn/daphne) Django consumes the
async iterator natively on the event loop, so an idle SSE connection never pins
a worker thread, and a client disconnect cancels the generator — the ``finally``
block unsubscribes + closes the pubsub. (A sync/WSGI client that iterates the
response buffers the whole stream, so production SSE serving runs behind ASGI.)

Mirrors the legacy ``otix.lib.sse`` semantics:

* **Task** (sync progress) — ``terminal_events`` non-empty; the stream closes
  itself when a pub/sub frame whose JSON ``type`` is terminal arrives. A stored
  result may be replayed first (short-circuit) so late-connecting clients get
  the finished state without subscribing.
* **Persistent** (notifications) — ``terminal_events`` empty; runs until the
  client disconnects or ``timeout`` elapses.

Replay callables may be sync (a single Redis key read) or async; both are
resolved before the generator subscribes. Redis opens lazily inside the
generator, so the views never touch Redis until the response starts streaming.
Tests inject fakes by patching ``get_client`` (sync key reads) and
``get_async_client`` (async pub/sub).
"""

from __future__ import annotations

import asyncio
import inspect
import json
import time
from collections.abc import AsyncGenerator, Callable
from typing import Any

from django.http import StreamingHttpResponse

from core.redis import get_async_client, get_client

_KEEPALIVE = ":keepalive\n\n"
_POLL_TIMEOUT = 1.0


def sse_headers() -> dict[str, str]:
    """Headers that keep SSE flowing through proxies."""
    return {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }


def format_sse(data: dict[str, Any]) -> str:
    """Compact single-line ``data:`` frame, mirroring the legacy formatter."""
    body = json.dumps(data, ensure_ascii=False, default=str, separators=(",", ":"))
    return f"data: {body}\n\n"


def normalize_stored_result(
    stored: dict[str, Any], terminal_events: tuple[str, ...]
) -> dict[str, Any]:
    """Ensure a replayed stored result carries a ``type`` field.

    Mirrors legacy: stored results without a ``type`` key adopt the first
    terminal event (e.g. ``sync_complete``), unless an ``error`` key is present
    and ``error`` is a terminal event (failed-task pattern).
    """
    if "type" in stored:
        return stored
    if "error" in stored and "error" in terminal_events:
        return {"type": "error", **stored}
    if terminal_events:
        return {"type": terminal_events[0], **stored}
    return stored


def read_json_key(key: str) -> dict[str, Any] | None:
    """Read a Redis string key as JSON (result/progress replay).

    A single fast key read; replay lambdas pass the result into
    ``sse_event_generator``, which resolves it before subscribing.
    """
    raw = get_client().get(key)
    if not raw:
        return None
    return json.loads(raw)


async def _resolve(replay: Callable[[], Any] | None) -> Any:
    """Run a replay callable, awaiting it when it returns a coroutine."""
    if replay is None:
        return None
    value = replay()
    if inspect.isawaitable(value):
        return await value
    return value


async def sse_event_generator(
    channel: str,
    *,
    terminal_events: tuple[str, ...] = (),
    timeout: int = 300,
    result_replay: Callable[[], Any] | None = None,
    progress_replay: Callable[[], Any] | None = None,
) -> AsyncGenerator[str, None]:
    """Yield SSE chunks for ``channel`` until terminal / timeout / disconnect.

    Lifecycle: (1) replay a stored result and return if present; (2) subscribe
    to the Redis pub/sub channel; (3) replay the latest intermediate progress;
    (4) poll for messages, emitting ``data:`` frames and ``:keepalive`` idle
    heartbeats, closing on a terminal frame or the timeout; (5) always
    unsubscribe + close the pubsub in ``finally`` — including when ASGI cancels
    the generator because the client disconnected mid-stream.
    """
    if result_replay is not None:
        stored = await _resolve(result_replay)
        if stored is not None:
            yield format_sse(normalize_stored_result(stored, terminal_events))
            return

    pubsub = get_async_client().pubsub()
    await pubsub.subscribe(channel)
    try:
        if progress_replay is not None:
            latest = await _resolve(progress_replay)
            if latest is not None:
                yield format_sse(latest)

        deadline = time.monotonic() + timeout
        while True:
            message = await pubsub.get_message(
                ignore_subscribe_messages=True, timeout=_POLL_TIMEOUT
            )
            if message is None:
                if time.monotonic() > deadline:
                    break
                yield _KEEPALIVE
                continue

            raw = message.get("data") or ""
            if not raw:
                continue
            if isinstance(raw, bytes):  # redis-py returns payloads as bytes
                raw = raw.decode("utf-8")
            yield f"data: {raw}\n\n"
            deadline = time.monotonic() + timeout
            if terminal_events:
                try:
                    event_type = json.loads(raw).get("type")
                except (ValueError, TypeError):
                    continue
                if event_type in terminal_events:
                    break
    except (asyncio.CancelledError, RuntimeError):
        # Client disconnected mid-yield: ASGI cancels the stream task and the
        # transport is gone, so exit silently (cleanup runs in ``finally``).
        return
    except Exception:  # noqa: BLE001 - surface a terminal error frame
        yield format_sse({"type": "error", "message": "Internal stream error"})
    finally:
        try:
            await pubsub.unsubscribe()
        except Exception:  # noqa: BLE001 - best-effort cleanup on any exit path
            pass
        try:
            await pubsub.aclose()
        except Exception:  # noqa: BLE001
            pass


def sse_response(
    channel: str,
    *,
    terminal_events: tuple[str, ...] = (),
    timeout: int = 300,
    result_replay: Callable[[], Any] | None = None,
    progress_replay: Callable[[], Any] | None = None,
) -> StreamingHttpResponse:
    """Wrap ``sse_event_generator`` in a ``text/event-stream`` response.

    The content is an async generator: ASGI servers stream it without pinning a
    worker thread, so idle/long-lived streams (notifications) stay cheap.
    """
    from django.db import close_old_connections

    close_old_connections()
    stream = sse_event_generator(
        channel=channel,
        terminal_events=terminal_events,
        timeout=timeout,
        result_replay=result_replay,
        progress_replay=progress_replay,
    )
    return StreamingHttpResponse(stream, content_type="text/event-stream", headers=sse_headers())
