"""Fanart.tv API client.

Auth: API key query parameter (?api_key=...).
Rate limit: 1 req/s default (project keys allow higher, free tier is ~100/day).

API docs: https://fanarttv.docs.apiary.io
"""

from __future__ import annotations

import httpx
from redis.asyncio import Redis

from otix.infrastructure.config import settings
from otix.lib.types import JSONValue
from otix.providers.base import BaseProvider

_shared_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(
            base_url=FanartProvider.BASE_URL,
            timeout=settings.fanart_request_timeout_seconds,
        )
    return _shared_client


class FanartProvider(BaseProvider):
    BASE_URL = "https://webservice.fanart.tv/v3"

    def __init__(self, redis: Redis, http_client: httpx.AsyncClient | None = None):
        client = http_client or get_http_client()
        super().__init__(
            name="fanart",
            redis=redis,
            http_client=client,
            rate=settings.fanart_global_rps_limit,
            burst=settings.fanart_global_rps_limit,
        )

    async def _get(self, url: str, **kwargs) -> httpx.Response:
        params = dict(kwargs.pop("params", {}))
        params["api_key"] = settings.fanart_api_key
        return await super()._get(url, params=params, **kwargs)

    # ── Movies ──────────────────────────────────────────────────────

    async def get_movie_images(self, tmdb_id: int) -> dict[str, JSONValue]:
        response = await self._get(f"/movies/{tmdb_id}")
        return response.json()

    # ── Shows ───────────────────────────────────────────────────────

    async def get_show_images(self, tvdb_id: int) -> dict[str, JSONValue]:
        response = await self._get(f"/tv/{tvdb_id}")
        return response.json()

    # ── Games ───────────────────────────────────────────────────────

    async def get_game_images(self, game_id: str) -> dict[str, JSONValue]:
        """Fetch Fanart game images by Fanart.tv game ID."""
        response = await self._get(f"/games/{game_id}")
        return response.json()

    # ── Music ───────────────────────────────────────────────────────

    async def get_music_images(self, artist_mbid: str) -> dict[str, JSONValue]:
        """Fetch Fanart music images by MusicBrainz artist MBID.

        Response includes artist-level artwork (logos, backgrounds, thumbs,
        banners) plus album covers nested under ``albums`` keyed by release
        group MBID.
        """
        response = await self._get(f"/music/{artist_mbid}")
        return response.json()
