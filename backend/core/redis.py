"""Shared Redis client factory.

SSE streams (``core.sse``) and any future realtime publisher build their client
from ``settings.REDIS_URL`` on first call. The ``redis`` dependency is only
imported when a connection is actually opened, so apps that never touch
realtime don't pay for it; tests patch ``core.sse.get_client`` (or here) with a
fake.
"""

from __future__ import annotations

import asyncio
import weakref
from typing import Any

from django.conf import settings

_sync_client: Any | None = None
_sync_client_url: str | None = None
_async_clients: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, dict[str, Any]] = (
    weakref.WeakKeyDictionary()
)
_fallback_async_clients: dict[str, Any] = {}


def get_client() -> Any:
    """Return a sync ``redis.Redis`` client bound to ``settings.REDIS_URL``."""
    global _sync_client, _sync_client_url
    url = getattr(settings, "REDIS_URL", "") or "redis://127.0.0.1:6379/0"
    if _sync_client is not None and _sync_client_url == url:
        return _sync_client

    if _sync_client is not None:
        try:
            _sync_client.close()
        except Exception:
            pass
        _sync_client = None

    from redis import Redis  # local import: only pay the dep when realtime is used

    _sync_client = Redis.from_url(url)
    _sync_client_url = url
    return _sync_client


def get_async_client() -> Any:
    """Return an async ``redis.asyncio.Redis`` bound to ``settings.REDIS_URL``.

    The SSE read half (``core.sse``) opens this so an idle event stream awaits
    Redis on the event loop instead of occupying a worker thread while it polls.
    """
    from redis.asyncio import Redis

    url = getattr(settings, "REDIS_URL", "") or "redis://127.0.0.1:6379/0"
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        if url in _fallback_async_clients:
            return _fallback_async_clients[url]
        client = Redis.from_url(url)
        _fallback_async_clients[url] = client
        return client

    loop_clients = _async_clients.get(loop)
    if loop_clients is not None and url in loop_clients:
        return loop_clients[url]

    client = Redis.from_url(url)
    if loop_clients is None:
        _async_clients[loop] = {url: client}
    else:
        loop_clients[url] = client
    return client


def close_redis_clients() -> None:
    """Close and reset cached sync and async clients."""
    global _sync_client, _sync_client_url
    if _sync_client is not None:
        try:
            _sync_client.close()
        except Exception:
            pass
        _sync_client = None
        _sync_client_url = None
    _async_clients.clear()
    _fallback_async_clients.clear()

