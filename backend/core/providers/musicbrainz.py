"""MusicBrainz ws/2 API client (port of ``otix.providers.musicbrainz.client``).

No API key required — auth is a descriptive ``User-Agent``. Etiquette is ~1
req/s (MusicBrainz returns HTTP 503, not 429, when rate limited, so
``MusicBrainzProvider`` overrides ``_rate_limit_statuses`` to ``(429, 503)``;
the increment-33 ``BaseProvider`` checks those statuses before its 5xx failure
branch, so a 503 drains the token bucket + raises ``RateLimitError`` instead of
opening the circuit).

``MusicBrainzProvider`` subclasses ``core.providers.base.BaseProvider``, so every
call runs through the rate limiter, circuit breaker, and (for GETs) the dev/test
response cache from increments 32/33.

Docs: https://musicbrainz.org/doc/MusicBrainz_API
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import httpx
from django.conf import settings

from core.providers.base import BaseProvider, resolve_shared_http_client
from core.providers.types import JSONValue

if TYPE_CHECKING:
    from redis.asyncio import Redis

BASE_URL = "https://musicbrainz.org/ws/2"
USER_AGENT = "Otix/0.1 (admin@diogodasilva.com)"

# Shared client factory — reuse the connection pool across tasks.
_shared_client: httpx.AsyncClient | None = None
_shared_client_loop_id: int | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return a process-shared AsyncClient bound to the MusicBrainz base URL."""
    global _shared_client, _shared_client_loop_id
    _shared_client, _shared_client_loop_id = resolve_shared_http_client(
        _shared_client,
        _shared_client_loop_id,
        base_url=BASE_URL,
        timeout=settings.MUSICBRAINZ_REQUEST_TIMEOUT_SECONDS,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        follow_redirects=True,
    )
    return _shared_client



class MusicBrainzProvider(BaseProvider):
    # MusicBrainz rate-limits with 503, not 429.
    _rate_limit_statuses = (429, 503)

    def __init__(
        self,
        redis: Redis | None = None,
        http_client: httpx.AsyncClient | None = None,
        *,
        circuit_threshold: int = 5,
        circuit_recovery: float = 30.0,
    ):
        client = http_client or get_http_client()
        super().__init__(
            name="musicbrainz",
            redis=redis,
            http_client=client,
            rate=settings.MUSICBRAINZ_GLOBAL_RPS_LIMIT,
            burst=settings.MUSICBRAINZ_GLOBAL_RPS_LIMIT,
            circuit_threshold=circuit_threshold,
            circuit_recovery=circuit_recovery,
        )

    async def _get(self, path: str, params: dict | None = None) -> dict[str, JSONValue]:
        merged: dict = {"fmt": "json"}
        if params:
            merged.update(params)
        response = await self._request("GET", f"/{path.lstrip('/')}", params=merged)
        return response.json()

    # ── Release (Album) ─────────────────────────────────────────────────

    async def get_release(
        self, mbid: str, inc: str = "artists+recordings+labels+genres+release-groups+url-rels"
    ) -> dict[str, JSONValue]:
        return await self._get(f"release/{mbid}", {"inc": inc})

    async def browse_releases_by_artist(
        self, mbid: str, limit: int = 50, offset: int = 0
    ) -> list[dict[str, JSONValue]]:
        resp = await self._get(
            "release", {"artist": mbid, "limit": limit, "offset": offset, "inc": "labels+genres"}
        )
        return resp.get("releases", [])

    async def search_release(
        self, query: str, limit: int = 20, offset: int = 0
    ) -> list[dict[str, JSONValue]]:
        resp = await self._get("release", {"query": query, "limit": limit, "offset": offset})
        return resp.get("releases", [])

    # ── Artist ───────────────────────────────────────────────────────────

    async def get_artist(
        self, mbid: str, inc: str = "tags+genres+url-rels"
    ) -> dict[str, JSONValue]:
        return await self._get(f"artist/{mbid}", {"inc": inc})

    async def search_artist(self, query: str, limit: int = 10) -> list[dict[str, JSONValue]]:
        resp = await self._get("artist", {"query": query, "limit": limit})
        return resp.get("artists", [])

    # ── Recording (Track) ────────────────────────────────────────────────

    async def get_recording(self, mbid: str, inc: str = "artists+tags") -> dict[str, JSONValue]:
        return await self._get(f"recording/{mbid}", {"inc": inc})

    async def browse_recordings_by_release(
        self, mbid: str, limit: int = 100
    ) -> list[dict[str, JSONValue]]:
        resp = await self._get("recording", {"release": mbid, "limit": limit})
        return resp.get("recordings", [])

    # ── Cover Art Archive ─────────────────────────────────────────────────

    async def get_cover_art(self, mbid: str) -> dict[str, JSONValue] | None:
        """Fetch cover art from coverartarchive.org (sister project, no rate limit).

        Releases without art answer 404; treat any non-2xx or transport error
        as "no art" (``None``) rather than surfacing the error body.
        """
        url = f"https://coverartarchive.org/release/{mbid}"
        try:
            resp = await self._request("GET", url)
        except Exception:
            return None
        if resp.status_code >= 400:
            return None
        return resp.json()
