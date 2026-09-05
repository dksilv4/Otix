"""Server-Sent-Events transport over Redis pub/sub (DRF).

Sync counterpart of the legacy ``otix.lib.sse`` framework: a generator powers a
Django ``StreamingHttpResponse`` with ``text/event-stream``. Two stream kinds:

* **Task** (sync progress) — ``terminal_events`` non-empty; the stream closes
  itself when a pub/sub frame whose JSON ``type`` is terminal arrives. A stored
  result may be replayed first (short-circuit) so late-connecting clients get
  the finished state without subscribing.
* **Persistent** (notifications) — ``terminal_events`` empty; runs until the
  client disconnects or ``timeout`` elapses.

Redis is opened lazily inside the generator (client disconnect closes the
connection via ``finally``), so the views never touch Redis until the response
starts streaming. Tests inject a fake client by patching ``get_client``.
"""

from __future__ import annotations

import json
import time
from collections.abc import Callable, Iterator
from typing import Any

from django.http import StreamingHttpResponse

from core.redis import get_client

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
    """Read a Redis string key as JSON (result/progress replay)."""
    client = get_client()
    raw = client.get(key)
    if not raw:
        return None
    return json.loads(raw)


def sse_event_stream(
    channel: str,
    *,
    terminal_events: tuple[str, ...] = (),
    timeout: int = 300,
    result_replay: Callable[[], dict[str, Any] | None] | None = None,
    progress_replay: Callable[[], dict[str, Any] | None] | None = None,
) -> Iterator[str]:
    """Yield SSE chunks for ``channel`` until terminal / timeout / disconnect.

    Lifecycle: (1) replay a stored result and return if present; (2) subscribe
    to the Redis pub/sub channel; (3) replay the latest intermediate progress;
    (4) poll for messages, emitting ``data:`` frames and ``:keepalive`` idle
    heartbeats, closing on a terminal frame or the timeout; (5) always
    unsubscribe + close the pubsub in ``finally`` (generator close on client
    disconnect included).
    """
    if result_replay is not None:
        stored = result_replay()
        if stored is not None:
            yield format_sse(normalize_stored_result(stored, terminal_events))
            return

    pubsub = get_client().pubsub()
    pubsub.subscribe(channel)
    try:
        if progress_replay is not None:
            latest = progress_replay()
            if latest is not None:
                yield format_sse(latest)

        deadline = time.monotonic() + timeout
        while True:
            message = pubsub.get_message(
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
    finally:
        try:
            pubsub.unsubscribe()
        except Exception:  # noqa: BLE001 - best-effort cleanup on any exit path
            pass
        try:
            pubsub.close()
        except Exception:  # noqa: BLE001
            pass


def sse_response(
    channel: str,
    *,
    terminal_events: tuple[str, ...] = (),
    timeout: int = 300,
    result_replay: Callable[[], dict[str, Any] | None] | None = None,
    progress_replay: Callable[[], dict[str, Any] | None] | None = None,
) -> StreamingHttpResponse:
    """Wrap ``sse_event_stream`` in a ``text/event-stream`` response."""
    stream = sse_event_stream(
        channel=channel,
        terminal_events=terminal_events,
        timeout=timeout,
        result_replay=result_replay,
        progress_replay=progress_replay,
    )
    return StreamingHttpResponse(stream, content_type="text/event-stream", headers=sse_headers())
