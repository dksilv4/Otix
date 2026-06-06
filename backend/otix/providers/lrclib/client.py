# TODO: Review this file
"""LRCLIB lyrics client.

Free, no-auth REST API for synced and plain lyrics.
Rate limit: generous (no hard cap documented).

Docs: https://lrclib.net/docs
"""

from __future__ import annotations

import asyncio

import httpx
from redis.asyncio import Redis

from otix.infrastructure.config import settings
from otix.lib.types import JSONValue
from otix.providers.base import BaseProvider

API_BASE = "https://lrclib.net/api"


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
            timeout=settings.lrclib_request_timeout_seconds,
            headers={"Accept": "application/json"},
        )
        _shared_client_loop_id = current_loop_id
    return _shared_client


class LRCLIBProvider(BaseProvider):
    def __init__(self, redis: Redis, http_client: httpx.AsyncClient | None = None):
        self._redis = redis
        client = http_client or get_http_client()
        super().__init__(
            name="lrclib",
            redis=redis,
            http_client=client,
            rate=settings.lrclib_global_rps_limit,
            burst=settings.lrclib_global_rps_limit,
        )

    async def _get(self, path: str, params: dict | None = None) -> dict[str, JSONValue]:
        resp = await self._request("GET", f"/{path.lstrip('/')}", params=params)
        return resp.json()

    async def get_lyrics(
        self,
        track_name: str,
        artist_name: str,
        album_name: str = "",
        duration: int | None = None,
    ) -> dict | None:
        """Fetch lyrics for a track. Returns dict with plainLyrics + syncedLyrics, or None."""
        params: dict[str, str | int] = {
            "track_name": track_name,
            "artist_name": artist_name,
        }
        if album_name:
            params["album_name"] = album_name
        if duration:
            params["duration"] = duration

        resp = await self._get("get", params)

        # LRCLIB returns 404 as {"statusCode":404,"name":"..."} — not an HTTP error
        if not resp or resp.get("statusCode") == 404:
            return None
        if not resp.get("plainLyrics") and not resp.get("syncedLyrics"):
            return None

        return resp
