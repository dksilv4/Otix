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
_wrapped_loops: weakref.WeakSet[asyncio.AbstractEventLoop] = weakref.WeakSet()


def _force_close_redis_client(client: Any) -> None:
    """Synchronously force-close underlying sockets of a redis client or pool."""
    if client is None:
        return
    pool = getattr(client, "connection_pool", None)
    if pool is not None:
        try:
            conns = list(getattr(pool, "_available_connections", [])) + list(
                getattr(pool, "_in_use_connections", [])
            )
        except Exception:
            conns = []
        for conn in conns:
            try:
                writer = getattr(conn, "_writer", None)
                if writer is not None:
                    transport = getattr(writer, "transport", None)
                    if transport is not None:
                        sock = transport.get_extra_info("socket")
                        if sock is not None and hasattr(sock, "close"):
                            sock.close()
                        if hasattr(transport, "close"):
                            transport.close()
                    if hasattr(writer, "close"):
                        writer.close()
            except Exception:
                pass
            try:
                if hasattr(conn, "_close"):
                    conn._close()
            except Exception:
                pass
        try:
            pool._available_connections.clear()
            pool._in_use_connections.clear()
        except Exception:
            pass
    try:
        if hasattr(client, "close") and not asyncio.iscoroutinefunction(client.close):
            res = client.close()
            if asyncio.iscoroutine(res):
                res.close()
    except Exception:
        pass


def _bind_loop_cleanup(loop: asyncio.AbstractEventLoop) -> None:
    if loop in _wrapped_loops:
        return
    _wrapped_loops.add(loop)
    orig_close = loop.close

    def _cleanup_and_close(*args: Any, **kwargs: Any) -> Any:
        loop_clients = _async_clients.pop(loop, {})
        for c in loop_clients.values():
            _force_close_redis_client(c)
        return orig_close(*args, **kwargs)

    try:
        loop.close = _cleanup_and_close  # type: ignore[assignment]
    except (AttributeError, TypeError):
        pass


def get_client() -> Any:
    """Return a sync ``redis.Redis`` client bound to ``settings.REDIS_URL``."""
    global _sync_client, _sync_client_url
    url = getattr(settings, "REDIS_URL", "") or "redis://127.0.0.1:6379/0"
    if _sync_client is not None and _sync_client_url == url:
        return _sync_client

    if _sync_client is not None:
        _force_close_redis_client(_sync_client)
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

    _bind_loop_cleanup(loop)

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
        _force_close_redis_client(_sync_client)
        _sync_client = None
        _sync_client_url = None
    for _loop, clients in list(_async_clients.items()):
        for c in clients.values():
            _force_close_redis_client(c)
    _async_clients.clear()
    for c in list(_fallback_async_clients.values()):
        _force_close_redis_client(c)
    _fallback_async_clients.clear()
