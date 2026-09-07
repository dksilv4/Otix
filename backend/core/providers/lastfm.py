"""Last.fm API client (album wiki/tags/playcount enrichment).

Auth: the API key rides a per-request ``api_key`` query param
(``LASTFM_API_KEY``), bundled into each method's params (not the shared client)
so key rotation only needs a settings refresh. Base URL:
``https://ws.audioscrobbler.com/2.0/``. Last.fm answers unknown
artists/albums with HTTP 200 and a JSON ``error`` envelope (no ``album`` key),
which ``album_get_info`` normalizes to ``None`` so ingest enrichment treats it
as a benign no-op. Client throttles ``LASTFM_GLOBAL_RPS_LIMIT`` (default 5/s)
through the increment-32 token bucket.

Port ``otix.providers.lastfm.client`` (the album methods only; the enrichment
transformers live in ``apps.media.services.lastfm_ingest``).
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

import httpx
from django.conf import settings

from core.providers.base import BaseProvider
from core.providers.types import JSONValue

if TYPE_CHECKING:
    from redis.asyncio import Redis

BASE_URL = "https://ws.audioscrobbler.com/2.0/"

# Shared client factory reuses the connection pool across tasks.
_shared_client: httpx.AsyncClient | None = None
_shared_client_loop_id: int | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return a process-shared AsyncClient bound to the Last.fm base URL."""
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
            timeout=settings.LASTFM_REQUEST_TIMEOUT_SECONDS,
        )
        _shared_client_loop_id = current_loop_id
    return _shared_client


class LastFMProvider(BaseProvider):
    """Rate-limited Last.fm client; album lookups return the raw dict or None."""

    def __init__(
        self,
        *,
        redis: Redis | None = None,
        http_client: httpx.AsyncClient | None = None,
    ):
        client = http_client or get_http_client()
        super().__init__(
            name="lastfm",
            redis=redis,
            http_client=client,
            rate=settings.LASTFM_GLOBAL_RPS_LIMIT,
            burst=settings.LASTFM_GLOBAL_RPS_LIMIT,
        )

    def _params(self, method: str, **kwargs: Any) -> dict[str, str]:
        params: dict[str, str] = {
            "method": method,
            "api_key": settings.LASTFM_API_KEY,
            "format": "json",
        }
        params.update({k: str(v) for k, v in kwargs.items() if v is not None})
        return params

    async def album_get_info(
        self, artist: str, album: str, mbid: str | None = None
    ) -> dict[str, JSONValue] | None:
        """Look up an album's Last.fm info; ``None`` for a miss or error."""
        try:
            response = await self._get(
                "", params=self._params("album.getinfo", artist=artist, album=album, mbid=mbid)
            )
        except Exception:  # transport/5xx/rate-limit — best-effort miss, not a failure
            return None
        if response.status_code != 200:
            return None
        try:
            data = response.json()
        except ValueError:
            return None
        if not isinstance(data, dict):
            return None
        album_data = data.get("album")
        return album_data if isinstance(album_data, dict) else None
