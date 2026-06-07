# TODO: Review this file
"""NZBPlanet API client.

API docs: https://nzbplanet.net/api
Auth: API key passed as query parameter.
Base URL: https://api.nzbplanet.net/api
Rate limit: 10 req/min (free tier), enforced via Redis token bucket.

Categories:
  1000 - PC Games
  2000 - Console Games (PS4, PS5, Xbox, Switch, etc.)
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime

import httpx
from redis.asyncio import Redis

from otix.infrastructure.config import settings
from otix.providers.base import BaseProvider, ProviderError

_nzbplanet_client: httpx.AsyncClient | None = None
_nzbplanet_pid: int | None = None


def _get_nzbplanet_client() -> httpx.AsyncClient:
    global _nzbplanet_client, _nzbplanet_pid
    current_pid = os.getpid()

    if _nzbplanet_client is not None and _nzbplanet_pid != current_pid:
        _nzbplanet_client = None
        _nzbplanet_pid = None

    if _nzbplanet_client is None or _nzbplanet_client.is_closed:
        _nzbplanet_client = httpx.AsyncClient(
            base_url="https://api.nzbplanet.net",
            timeout=30.0,
        )
        _nzbplanet_pid = current_pid
    return _nzbplanet_client


@dataclass
class NZBResult:
    guid: str
    title: str
    size: int  # bytes
    pub_date: datetime
    category: str  # "PC", "Console", etc.
    nzb_url: str  # direct NZB download link
    details_url: str  # human-readable page


class NZBPlanetError(Exception):
    pass


class NZBPlanetProvider(BaseProvider):
    """Async NZBPlanet API client with rate limiting."""

    def __init__(
        self,
        api_key: str,
        redis: Redis,
        http_client: httpx.AsyncClient | None = None,
    ):
        self._api_key = api_key
        client = http_client or _get_nzbplanet_client()
        super().__init__(
            name="nzbplanet",
            redis=redis,
            http_client=client,
            rate=settings.get("nzbplanet_rps_limit", 10.0),
            burst=settings.get("nzbplanet_rps_limit", 10.0) * 2,
        )

    # ── Request helpers ───────────────────────────────────────────────

    async def _get(self, path: str, params: dict | None = None) -> httpx.Response:
        params = params or {}
        params["apikey"] = self._api_key
        return await self._request("GET", path, params=params)

    # ── Search ────────────────────────────────────────────────────────

    async def search(
        self,
        query: str,
        category_ids: str = "1000,2000",
        limit: int = 20,
    ) -> list[NZBResult]:
        """Search NZBPlanet for NZBs matching the query.

        Args:
            query: Search string (game name).
            category_ids: Comma-separated category IDs (default: PC + Console games).
            limit: Max results to return.

        Returns:
            List of NZBResult, sorted by size descending (largest first).
        """
        params: dict = {
            "q": query,
            "cat": category_ids,
            "o": "json",
        }
        if limit:
            params["num"] = str(limit)

        try:
            response = await self._get("/api", params=params)
            if response.status_code != 200:
                raise NZBPlanetError(f"NZBPlanet returned {response.status_code}: {response.text[:300]}")
            data = response.json()
            return self._parse_response(data)
        except ProviderError:
            raise
        except Exception as exc:
            msg = f"NZBPlanet search failed: {exc}" if str(exc) else f"NZBPlanet search failed: {type(exc).__name__}"
            raise NZBPlanetError(msg) from exc

    def _parse_response(self, data: dict) -> list[NZBResult]:
        """Parse NZBPlanet JSON response into NZBResult list."""
        channel = data.get("channel", {})
        items = channel.get("item", [])

        results: list[NZBResult] = []
        for item in items:
            try:
                pub_date_str = item.get("pubDate", "")
                pub_date = datetime.utcnow()
                if pub_date_str:
                    from email.utils import parsedate_to_datetime

                    try:
                        pub_date = parsedate_to_datetime(pub_date_str)
                    except Exception:
                        pass

                size_str = item.get("size", "0")
                size_bytes = int(size_str)

                results.append(
                    NZBResult(
                        guid=item.get("guid", ""),
                        title=item.get("title", ""),
                        size=size_bytes,
                        pub_date=pub_date,
                        category=item.get("category", ""),
                        nzb_url=item.get("link", ""),
                        details_url=item.get("link", ""),
                    )
                )
            except (KeyError, ValueError):
                continue

        # Sort by size descending — largest release first (usually most complete)
        results.sort(key=lambda r: r.size, reverse=True)
        return results

    # ── Test connection ───────────────────────────────────────────────

    async def test_connection(self) -> bool:
        """Verify the API key works by making a minimal search request."""
        try:
            await self.search("test", limit=1)
            return True
        except Exception:
            return False
