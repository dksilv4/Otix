"""Immutable configuration dataclass for SSE event streams."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class SseStreamConfig:
    """Configuration for a single SSE event stream.

    Two fundamental stream types:

    **Persistent** (``terminal_events=()``):
        Notifications, friend activity, admin dashboards.
        Never self-terminates; runs until client disconnects or timeout.

    **Task** (``terminal_events=("success", "error")``):
        Sync progress, rehydration.
        Self-terminates when a matching terminal event arrives.

    Parameters
    ----------
    channel:
        Redis pub/sub channel to subscribe to (fully resolved at handler time).
    terminal_events:
        Event type values that cause the stream to close automatically.
        An empty tuple means the stream is persistent.
    timeout:
        Maximum connection lifetime in seconds.  Hard ceiling even when no
        terminal event arrives.
    result_replay:
        Optional async callable that returns a stored result dict.  If a
        completed result exists the generator short-circuits — it never
        subscribes to Redis.
    progress_replay:
        Optional async callable that returns the latest intermediate progress
        event.  Yielded *before* subscribing so late-connecting clients don't
        miss intermediate state.
    """

    channel: str
    terminal_events: tuple[str, ...] = field(default_factory=tuple)
    timeout: int = 300

    result_replay: Callable[[], Awaitable[dict[str, Any] | None]] | None = None
    progress_replay: Callable[[], Awaitable[dict[str, Any] | None]] | None = None
