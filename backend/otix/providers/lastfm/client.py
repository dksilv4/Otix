"""Last.fm API client.

API key required (query param). Rate limit 5 rps.
Docs: https://www.last.fm/api
"""

from __future__ import annotations

import asyncio

import httpx
from redis.asyncio import Redis

from otix.infrastructure.config import settings
from otix.lib.types import JSONValue
from otix.providers.base import BaseProvider

BASE_URL = "https://ws.audioscrobbler.com/2.0/"


_shared_client: httpx.AsyncClient | None = None
_shared_client_loop_id: int | None = None


def get_http_client() -> httpx.AsyncClient:
    global _shared_client, _shared_client_loop_id
    try:
        current_loop_id = id(asyncio.get_running_loop())
    except RuntimeError:
        current_loop_id = None

    if _shared_client is not None and _shared_client_loop_id != current_loop_id:
        _shared_client = None

    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(
            base_url=BASE_URL,
            timeout=settings.lastfm_request_timeout_seconds,
        )
        _shared_client_loop_id = current_loop_id
    return _shared_client


class LastFMProvider(BaseProvider):
    def __init__(self, redis: Redis, http_client: httpx.AsyncClient | None = None):
        self._redis = redis
        client = http_client or get_http_client()
        super().__init__(
            name="lastfm",
            redis=redis,
            http_client=client,
            rate=settings.lastfm_global_rps_limit,
            burst=settings.lastfm_global_rps_limit,
        )

    def _params(self, method: str, **kwargs) -> dict:
        p: dict = {
            "method": method,
            "api_key": settings.lastfm_api_key,
            "format": "json",
        }
        p.update({k: v for k, v in kwargs.items() if v is not None})
        return p

    async def _get(self, method: str, **kwargs) -> dict:
        resp = await self.request("GET", "", params=self._params(method, **kwargs))
        return resp.json()

    # ── Album ────────────────────────────────────────────────────────────

    async def album_get_info(self, artist: str, album: str, mbid: str | None = None) -> dict | None:
        data = await self._get("album.getinfo", artist=artist, album=album, mbid=mbid)
        return data.get("album")

    async def album_get_top_tags(self, artist: str, album: str) -> list[dict]:
        data = await self._get("album.gettoptags", artist=artist, album=album)
        return data.get("toptags", {}).get("tag", [])

    # ── Artist ───────────────────────────────────────────────────────────

    async def artist_get_info(self, artist: str, mbid: str | None = None) -> dict | None:
        data = await self._get("artist.getinfo", artist=artist, mbid=mbid)
        return data.get("artist")

    async def artist_get_similar(self, artist: str) -> list[dict]:
        data = await self._get("artist.getsimilar", artist=artist, limit=10)
        return data.get("similarartists", {}).get("artist", [])

    async def artist_get_top_tags(self, artist: str) -> list[dict]:
        data = await self._get("artist.gettoptags", artist=artist)
        return data.get("toptags", {}).get("tag", [])
