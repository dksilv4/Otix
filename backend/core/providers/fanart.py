"""Fanart.tv API client (movie/show supplementary artwork).

Auth: the API key rides a per-request ``?api_key=`` query param
(``FANART_API_KEY``), injected on ``_request`` (not the shared client) so key
rotation only needs a settings refresh, never a client rebuild. Base URL:
``https://webservice.fanart.tv/v3``. Movies are keyed by TMDB id
(``/movies/{tmdb_id}``); shows by TVDB id (``/tv/{tvdb_id}``) — so the show
enrich path needs the row's stored ``tvdb`` ``ExternalID``. Fanart answers a
miss with a JSON error body / non-200, which the lookups normalize to ``None``
so ingest enrichment can treat it as a benign no-op. Client throttles
``FANART_GLOBAL_RPS_LIMIT`` (default 1/s) through the increment-32 token bucket.

Port ``otix.providers.fanart.client`` (movie + show lookups only; the music
endpoint and the asset mapping live out of this module — ``apps.media.services
.fanart_ingest`` holds the transformers; the music path is deferred by the
2026-09-07 audio scope cut).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import httpx
from django.conf import settings

from core.providers.base import BaseProvider, resolve_shared_http_client
from core.providers.types import JSONValue

if TYPE_CHECKING:
    from redis.asyncio import Redis

BASE_URL = "https://webservice.fanart.tv/v3"

# Shared client factory reuses the connection pool across tasks.
_shared_client: httpx.AsyncClient | None = None
_shared_client_loop_id: int | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return a process-shared AsyncClient bound to the Fanart base URL."""
    global _shared_client, _shared_client_loop_id
    _shared_client, _shared_client_loop_id = resolve_shared_http_client(
        _shared_client,
        _shared_client_loop_id,
        base_url=BASE_URL,
        timeout=settings.FANART_REQUEST_TIMEOUT_SECONDS,
    )
    return _shared_client



class FanartProvider(BaseProvider):
    """Rate-limited Fanart client; image lookups return the raw dict or None."""

    def __init__(
        self,
        *,
        redis: Redis | None = None,
        http_client: httpx.AsyncClient | None = None,
    ):
        client = http_client or get_http_client()
        super().__init__(
            name="fanart",
            redis=redis,
            http_client=client,
            rate=settings.FANART_GLOBAL_RPS_LIMIT,
            burst=settings.FANART_GLOBAL_RPS_LIMIT,
        )

    async def _request(self, method: str, url: str, **kwargs) -> httpx.Response:
        # The key is injected per request (not on the shared client) so key
        # rotation only needs a settings refresh, never a client rebuild.
        params = dict(kwargs.pop("params", {}))
        params["api_key"] = settings.FANART_API_KEY
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
