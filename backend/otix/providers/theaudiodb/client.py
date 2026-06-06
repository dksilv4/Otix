# TODO: Review this file
"""TheAudioDB API client.

Free community music database with cross-platform IDs and high-quality artwork.
API key required (test key "2" works for development).

Docs: https://www.theaudiodb.com/free_music_api
"""

from __future__ import annotations

import asyncio

import httpx
from redis.asyncio import Redis

from otix.infrastructure.config import settings
from otix.lib.types import JSONValue
from otix.providers.base import BaseProvider

API_BASE = "https://theaudiodb.com/api/v2/json"


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
            base_url=f"{API_BASE}/{settings.theaudiodb_api_key}",
            timeout=settings.theaudiodb_request_timeout_seconds,
            headers={"Accept": "application/json"},
        )
        _shared_client_loop_id = current_loop_id
    return _shared_client


class TheAudioDBProvider(BaseProvider):
    def __init__(self, redis: Redis, http_client: httpx.AsyncClient | None = None):
        self._redis = redis
        client = http_client or get_http_client()
        super().__init__(
            name="theaudiodb",
            redis=redis,
            http_client=client,
            rate=settings.theaudiodb_global_rps_limit,
            burst=settings.theaudiodb_global_rps_limit,
        )

    async def _get(self, path: str, params: dict | None = None) -> dict[str, JSONValue]:
        resp = await self._request("GET", f"/{path.lstrip('/')}", params=params)
        return resp.json()

    # ── Album ────────────────────────────────────────────────────────────

    async def search_album(self, album_name: str) -> dict | None:
        resp = await self._get(f"search/album/{httpx.URL(album_name).path}")
        items = resp.get("album")
        if isinstance(items, list) and items:
            return items[0] if isinstance(items[0], dict) else None
        return None

    async def lookup_album(self, album_id: str | int) -> dict | None:
        resp = await self._get(f"lookup/album/{album_id}")
        items = resp.get("album")
        if isinstance(items, list) and items:
            return items[0] if isinstance(items[0], dict) else None
        return None

    # ── Artist ───────────────────────────────────────────────────────────

    async def search_artist(self, artist_name: str) -> dict | None:
        resp = await self._get(f"search/artist/{httpx.URL(artist_name).path}")
        items = resp.get("artist")
        if isinstance(items, list) and items:
            return items[0] if isinstance(items[0], dict) else None
        return None

    async def discography(self, artist_id: str | int) -> list[dict]:
        resp = await self._get(f"list/discography/{artist_id}")
        items = resp.get("album")
        if isinstance(items, list):
            return items
        return []
