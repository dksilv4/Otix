# TODO: Review this file
"""Deezer API client.

Public API, no authentication required.
Rate limit: ~50 requests per 5 seconds (~10 rps).

Docs: https://developers.deezer.com/api
"""

from __future__ import annotations

import asyncio

import httpx
from redis.asyncio import Redis

from otix.infrastructure.config import settings
from otix.lib.types import JSONValue
from otix.providers.base import BaseProvider

API_BASE = "https://api.deezer.com"


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
            base_url=API_BASE,
            timeout=settings.deezer_request_timeout_seconds,
            headers={"Accept": "application/json"},
        )
        _shared_client_loop_id = current_loop_id
    return _shared_client


class DeezerProvider(BaseProvider):
    def __init__(self, redis: Redis, http_client: httpx.AsyncClient | None = None):
        self._redis = redis
        client = http_client or get_http_client()
        super().__init__(
            name="deezer",
            redis=redis,
            http_client=client,
            rate=settings.deezer_global_rps_limit,
            burst=settings.deezer_global_rps_limit,
        )

    async def _get(self, path: str, params: dict | None = None) -> dict[str, JSONValue]:
        resp = await self._request("GET", f"/{path.lstrip('/')}", params=params)
        return resp.json()

    # ── Album ────────────────────────────────────────────────────────────

    async def get_album(self, deezer_id: int | str) -> dict:
        return await self._get(f"album/{deezer_id}")

    async def search_album(self, query: str, limit: int = 10) -> list[dict]:
        resp = await self._get("search/album", {"q": query, "limit": limit})
        return resp.get("data", []) or []

    # ── Artist ───────────────────────────────────────────────────────────

    async def get_artist(self, deezer_id: int | str) -> dict:
        return await self._get(f"artist/{deezer_id}")

    async def get_artist_albums(self, deezer_id: int | str, limit: int = 100, offset: int = 0) -> list[dict]:
        """Paginated artist discography. Returns list of album dicts."""
        resp = await self._get(f"artist/{deezer_id}/albums", {"limit": limit, "index": offset})
        return resp.get("data", []) or []

    async def search_artist(self, query: str, limit: int = 5) -> list[dict]:
        resp = await self._get("search/artist", {"q": query, "limit": limit})
        return resp.get("data", []) or []

    # ── Album tracks ─────────────────────────────────────────────────────

    async def get_album_tracks(self, deezer_id: int | str, limit: int = 500) -> list[dict]:
        """Fetch tracks for an album. Includes ISRC per track (unlike the /album endpoint)."""
        resp = await self._get(f"album/{deezer_id}/tracks", {"limit": limit})
        return resp.get("data", []) or []

    # ── Track ────────────────────────────────────────────────────────────

    async def get_track(self, deezer_id: int | str) -> dict:
        return await self._get(f"track/{deezer_id}")

    # ── Discovery ────────────────────────────────────────────────────────

    async def get_chart_albums(self, limit: int = 100) -> list[dict]:
        """Top albums from Deezer chart. Returns list of album dicts with IDs."""
        resp = await self._get("chart/0/albums", {"limit": limit})
        return resp.get("data", []) or []
