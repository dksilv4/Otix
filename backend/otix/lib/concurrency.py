# TODO: Review this file
"""Concurrency utilities for bridging sync ↔ async."""

from __future__ import annotations

import asyncio
import os
import threading
from collections.abc import Coroutine
from typing import Any

_loop: asyncio.AbstractEventLoop | None = None
_loop_pid: int | None = None
_loop_thread: threading.Thread | None = None


def _start_background_loop() -> asyncio.AbstractEventLoop:
    global _loop, _loop_thread
    loop = asyncio.new_event_loop()

    def run_loop() -> None:
        asyncio.set_event_loop(loop)
        loop.run_forever()

    thread = threading.Thread(target=run_loop, daemon=True)
    thread.start()

    _loop = loop
    _loop_thread = thread
    return loop


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
        _loop = _start_background_loop()
        _loop_pid = current_pid

    future = asyncio.run_coroutine_threadsafe(coro, _loop)
    return future.result(timeout=1800)  # 30 min timeout to prevent worker thread hangs

