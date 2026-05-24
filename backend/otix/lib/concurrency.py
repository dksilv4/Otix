"""Concurrency utilities for bridging sync ↔ async."""

from __future__ import annotations

import asyncio
import os
from collections.abc import Coroutine
from typing import Any

_loop: asyncio.AbstractEventLoop | None = None
_loop_pid: int | None = None


def run_async(coro: Coroutine[Any, Any, Any]) -> Any:
    """Run an async coroutine, reusing the same event loop within a process.

    Creating a new loop per task causes "Future attached to a different loop"
    errors because shared resources (DB pool, HTTP client) are bound to the
    first loop that created them. Reusing the loop avoids this.

    On process fork (Celery prefork), the old loop is invalid so we create a
    fresh one.
    """
    global _loop, _loop_pid
    current_pid = os.getpid()

    if _loop is None or _loop.is_closed() or _loop_pid != current_pid:
        _loop = asyncio.new_event_loop()
        _loop_pid = current_pid

    return _loop.run_until_complete(coro)
