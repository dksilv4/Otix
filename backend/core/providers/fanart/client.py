"""Fanart.tv API client (movie/show supplementary artwork).

Subclasses ``BaseProviderClient`` from ``core.providers.framework``.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import httpx
from django.conf import settings

from core.providers.framework import (
    BaseProviderClient,
    JSONValue,
    ProviderError,
    resolve_shared_http_client,
)

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

BASE_URL = "https://webservice.fanart.tv/v3"

# Shared client factory reuses the connection pool across tasks.
_shared_client: httpx.AsyncClient | None = None
_shared_client_loop_id: int | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return a process-shared AsyncClient bound to the Fanart base URL."""
    global _shared_client, _shared_client_loop_id
    timeout = getattr(settings, "FANART_REQUEST_TIMEOUT_SECONDS", 10.0)
    _shared_client, _shared_client_loop_id = resolve_shared_http_client(
        _shared_client,
        _shared_client_loop_id,
        base_url=BASE_URL,
        timeout=timeout,
    )
    return _shared_client


async def close_http_client() -> None:
    """Close the process-shared HTTP client if open and reset pool references."""
    global _shared_client, _shared_client_loop_id
    if _shared_client is not None and not _shared_client.is_closed:
        await _shared_client.aclose()
    _shared_client = None
    _shared_client_loop_id = None


class FanartError(ProviderError):
    """Raised when Fanart.tv returns an API error."""


class FanartProvider(BaseProviderClient):
    """Rate-limited Fanart client; image lookups return the raw dict or None."""

    def __init__(
        self,
        *,
        redis: Redis | None = None,
        http_client: httpx.AsyncClient | None = None,
        circuit_threshold: int = 5,
        circuit_recovery: float = 30.0,
    ) -> None:
        client = http_client or get_http_client()
        rate = getattr(settings, "FANART_GLOBAL_RPS_LIMIT", 1.0)
        super().__init__(
            name="fanart",
            redis=redis,
            http_client=client,
            rate=float(rate),
            burst=int(rate),
            circuit_threshold=circuit_threshold,
            circuit_recovery=circuit_recovery,
        )

    async def _request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        # The key is injected per request (not on the shared client) so key
        # rotation only needs a settings refresh, never a client rebuild.
        params = dict(kwargs.pop("params", {}) or {})
        params["api_key"] = getattr(settings, "FANART_API_KEY", "")
        return await super()._request(method, url, params=params, **kwargs)

    async def get_movie_images(self, tmdb_id: int) -> dict[str, JSONValue] | None:
        """Fetch a movie's Fanart artwork by its TMDB id; ``None`` for a miss."""
        return await self._lookup(f"/movies/{int(tmdb_id)}")

    async def get_show_images(self, tvdb_id: int) -> dict[str, JSONValue] | None:
        """Fetch a show's Fanart artwork by its TVDB id; ``None`` for a miss."""
        return await self._lookup(f"/tv/{int(tvdb_id)}")

    async def _lookup(self, path: str) -> dict[str, JSONValue] | None:
        """One GET normalized to the payload dict or ``None`` for a miss/error."""
        try:
            response = await self._get(path)
        except Exception:  # transport/5xx/rate-limit — best-effort miss, not a failure
            return None
        if response.status_code != 200:
            return None
        try:
            data = response.json()
        except ValueError:
            return None
        return data if isinstance(data, dict) else None
