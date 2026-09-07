"""OMDb API client (movie/show IMDb/Rotten Tomatoes/Metacritic ratings).

Auth: the API key rides a per-request ``?apikey=`` query param
(``OMDB_API_KEY``), injected on ``_request`` (not the shared client) so key
rotation only needs a settings refresh, never a client rebuild. Base URL:
``https://www.omdbapi.com``. OMDb answers every request with HTTP 200 and a
JSON ``Response`` field (``"True"``/``"False"``); a miss (movie not found,
bad key) is normalized to ``None`` so ingest enrichment can treat it as a
benign no-op. Client throttles ``OMDB_GLOBAL_RPS_LIMIT`` (default 5/s) through
the increment-32 token bucket.

Port ``otix.providers.omdb.client`` (its ``get_by_imdb_id`` only; the rating
transformer lives in ``apps.media.services.omdb_ingest``).
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

import httpx
from django.conf import settings

from core.providers.base import BaseProvider
from core.providers.types import JSONValue

if TYPE_CHECKING:
    from redis.asyncio import Redis

BASE_URL = "https://www.omdbapi.com"

# Shared client factory reuses the connection pool across tasks.
_shared_client: httpx.AsyncClient | None = None
_shared_client_loop_id: int | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return a process-shared AsyncClient bound to the OMDb base URL."""
    global _shared_client, _shared_client_loop_id
    try:
        current_loop_id = id(asyncio.get_running_loop())
    except RuntimeError:
        current_loop_id = None
    if _shared_client is not None and _shared_client_loop_id != current_loop_id:
        # Event loop changed (Celery prefork child) — discard the inherited client.
        try:
            loop = asyncio.new_event_loop()
            loop.run_until_complete(_shared_client.aclose())
        except Exception:
            pass
        _shared_client = None
    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(
            base_url=BASE_URL,
            timeout=settings.OMDB_REQUEST_TIMEOUT_SECONDS,
        )
        _shared_client_loop_id = current_loop_id
    return _shared_client


class OMDbProvider(BaseProvider):
    """Rate-limited OMDb client; ``get_by_imdb_id`` returns the raw dict or None."""

    def __init__(
        self,
        *,
        redis: Redis | None = None,
        http_client: httpx.AsyncClient | None = None,
    ):
        client = http_client or get_http_client()
        super().__init__(
            name="omdb",
            redis=redis,
            http_client=client,
            rate=settings.OMDB_GLOBAL_RPS_LIMIT,
            burst=settings.OMDB_GLOBAL_RPS_LIMIT,
        )

    async def _request(self, method: str, url: str, **kwargs) -> httpx.Response:
        # The key is injected per request (not on the shared client) so key
        # rotation only needs a settings refresh, never a client rebuild.
        params = dict(kwargs.pop("params", {}))
        params["apikey"] = settings.OMDB_API_KEY
        return await super()._request(method, url, params=params, **kwargs)

    async def get_by_imdb_id(self, imdb_id: str) -> dict[str, JSONValue] | None:
        """Look up an IMDb id's OMDb record; ``None`` for a miss or error."""
        try:
            response = await self._get("/", params={"i": imdb_id})
        except Exception:  # transport/5xx/rate-limit — best-effort miss, not a failure
            return None
        if response.status_code != 200:
            return None
        try:
            data = response.json()
        except ValueError:
            return None
        if not isinstance(data, dict) or data.get("Response") != "True":
            return None
        return data
