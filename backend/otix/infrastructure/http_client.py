# TODO: Review this file
from __future__ import annotations

import os

import httpx

_shared_client: httpx.AsyncClient | None = None
_client_pid: int | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return a module-level shared httpx.AsyncClient with connection pooling.

    Connections are reused across requests, avoiding TCP/TLS handshake overhead.
    The client is created lazily on first use and lives for the process lifetime.
    Detects process fork (Celery prefork) and recreates the client accordingly.
    """
    global _shared_client, _client_pid
    current_pid = os.getpid()

    if _shared_client is not None and _client_pid != current_pid:
        # Process changed — discard inherited client (bound to parent's event loop)
        _shared_client = None
        _client_pid = None

    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=10.0),
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=100),
        )
        _client_pid = current_pid
    return _shared_client


async def close_http_client() -> None:
    global _shared_client, _client_pid
    if _shared_client is not None and not _shared_client.is_closed:
        await _shared_client.aclose()
        _shared_client = None
        _client_pid = None
