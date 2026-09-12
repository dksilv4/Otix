"""LRCLIB lyrics client (per-track plain/synced lyric text).

Free, no-auth REST API — there is no API key to configure, so the album lyric
enrich tail this powers is ungated and only self-limits to albums that actually
have tracks missing lyrics. Base URL: ``https://lrclib.net/api``. A miss is
answered with HTTP 200 and a JSON ``statusCode`` envelope (e.g. ``404``) rather
than an HTTP error, which ``get_lyrics`` normalizes to ``None`` so ingest
enrichment treats it as a benign no-op. Client throttles
``LRCLIB_GLOBAL_RPS_LIMIT`` (default 5/s) through the increment-32 token bucket.

Port ``otix.providers.lrclib.client`` (its ``get_lyrics`` only; the per-track
enrich loop lives in ``apps.media.services.lrclib_ingest``).
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

import httpx
from django.conf import settings

from core.providers.base import BaseProvider

if TYPE_CHECKING:
    from redis.asyncio import Redis

BASE_URL = "https://lrclib.net/api"

# Shared client factory reuses the connection pool across tasks.
_shared_client: httpx.AsyncClient | None = None
_shared_client_loop_id: int | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return a process-shared AsyncClient bound to the LRCLIB base URL."""
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
            timeout=settings.LRCLIB_REQUEST_TIMEOUT_SECONDS,
            headers={"Accept": "application/json"},
        )
        _shared_client_loop_id = current_loop_id
    return _shared_client


class LRCLIBProvider(BaseProvider):
    """Rate-limited LRCLIB client; lyric lookups return the raw dict or None."""

    def __init__(
        self,
        *,
        redis: Redis | None = None,
        http_client: httpx.AsyncClient | None = None,
    ):
        client = http_client or get_http_client()
        super().__init__(
            name="lrclib",
            redis=redis,
            http_client=client,
            rate=settings.LRCLIB_GLOBAL_RPS_LIMIT,
            burst=settings.LRCLIB_GLOBAL_RPS_LIMIT,
        )

    async def get_lyrics(
        self,
        track_name: str,
        artist_name: str,
        album_name: str | None = None,
        duration: int | None = None,
    ) -> dict[str, Any] | None:
        """Look up a track's lyric payload; ``None`` for a miss or error."""
        params: dict[str, str] = {
            "track_name": track_name,
            "artist_name": artist_name,
        }
        if album_name:
            params["album_name"] = album_name
        if duration:
            params["duration"] = str(duration)
        try:
            response = await self._get("get", params=params)
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
        if data.get("statusCode") == 404:
            return None
        if not isinstance(data.get("plainLyrics"), str) and not isinstance(
            data.get("syncedLyrics"), str
        ):
            return None
        return data
