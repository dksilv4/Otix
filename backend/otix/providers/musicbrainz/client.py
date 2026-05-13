"""MusicBrainz API client (ws/2).

No API key required. Rate limit 1 rps.
Docs: https://musicbrainz.org/doc/MusicBrainz_API
"""

from __future__ import annotations

import asyncio
from urllib.parse import quote

import httpx
from redis.asyncio import Redis

from otix.infrastructure.config import settings
from otix.lib.types import JSONValue
from otix.providers.base import BaseProvider

BASE_URL = "https://musicbrainz.org/ws/2"
USER_AGENT = "Otix/0.1 (admin@diogodasilva.com)"


_shared_client: httpx.AsyncClient | None = None
_shared_client_loop_id: int | None = None


def get_http_client() -> httpx.AsyncClient:
    global _shared_client, _shared_client_loop_id
    try:
        current_loop_id = id(asyncio.get_running_loop())
    except RuntimeError:
        current_loop_id = None

    if _shared_client is not None and _shared_client_loop_id != current_loop_id:
        try:
            loop = asyncio.new_event_loop()
            loop.run_until_complete(_shared_client.aclose())
        except Exception:
            pass
        _shared_client = None

    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(
            base_url=BASE_URL,
            timeout=settings.musicbrainz_request_timeout_seconds,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            follow_redirects=True,
        )
        _shared_client_loop_id = current_loop_id
    return _shared_client


class MusicBrainzProvider(BaseProvider):
    _rate_limit_statuses = (429, 503)  # MusicBrainz returns 503 when rate limited

    def __init__(self, redis: Redis, http_client: httpx.AsyncClient | None = None):
        self._redis = redis
        client = http_client or get_http_client()
        super().__init__(
            name="musicbrainz",
            redis=redis,
            http_client=client,
            rate=settings.musicbrainz_global_rps_limit,
            burst=settings.musicbrainz_global_rps_limit,
        )

    async def _get(self, path: str, params: dict | None = None) -> dict[str, JSONValue]:
        merged = {"fmt": "json"}
        if params:
            merged.update(params)
        response = await self._request("GET", f"/{path.lstrip('/')}", params=merged)
        return response.json()

    # ── Release (Album) ─────────────────────────────────────────────────

    async def get_release(self, mbid: str, inc: str = "artists+recordings+labels+genres+release-groups") -> dict:
        return await self._get(f"release/{mbid}", {"inc": inc})

    async def browse_releases_by_artist(self, mbid: str, limit: int = 50, offset: int = 0) -> list[dict]:
        resp = await self._get("release", {"artist": mbid, "limit": limit, "offset": offset, "inc": "labels+genres"})
        return resp.get("releases", [])

    async def search_release(self, query: str, limit: int = 20, offset: int = 0) -> list[dict]:
        resp = await self._get("release", {"query": query, "limit": limit, "offset": offset})
        return resp.get("releases", [])

    # ── Artist ───────────────────────────────────────────────────────────

    async def get_artist(self, mbid: str, inc: str = "tags+genres") -> dict:
        return await self._get(f"artist/{mbid}", {"inc": inc})

    async def search_artist(self, query: str, limit: int = 10) -> list[dict]:
        resp = await self._get("artist", {"query": quote(query), "limit": limit})
        return resp.get("artists", [])

    # ── Recording (Track) ────────────────────────────────────────────────

    async def get_recording(self, mbid: str, inc: str = "artists+tags") -> dict:
        return await self._get(f"recording/{mbid}", {"inc": inc})

    async def browse_recordings_by_release(self, mbid: str, limit: int = 100) -> list[dict]:
        resp = await self._get("recording", {"release": mbid, "limit": limit})
        return resp.get("recordings", [])

    # ── Cover Art Archive ─────────────────────────────────────────────────

    async def get_cover_art(self, mbid: str) -> dict | None:
        """Fetch cover art from coverartarchive.org (sister project, no rate limit)."""
        url = f"https://coverartarchive.org/release/{mbid}"
        try:
            resp = await self._request("GET", url)
            return resp.json()
        except Exception:
            return None
