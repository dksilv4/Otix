"""Steam Web API + Store API client.

Steam Web API (requires key): player counts, app news, achievements.
Steam Store API (no key): app details, reviews, pricing.

Docs: https://steamapi.xpaw.me/  (unofficial reference)
      https://wiki.teamfortress.com/wiki/User:RJackson/Store_front_API
"""

from __future__ import annotations

import httpx
from redis.asyncio import Redis

from otix.infrastructure.config import settings
from otix.lib.types import JSONValue
from otix.providers.base import BaseProvider


class SteamError(Exception):
    pass


class SteamProvider(BaseProvider):
    """Async Steam API client with rate limiting."""

    def __init__(self, redis: Redis, http_client: httpx.AsyncClient | None = None):
        client = http_client or httpx.AsyncClient(
            timeout=settings.steam_request_timeout_seconds,
        )
        super().__init__(
            name="steam",
            redis=redis,
            http_client=client,
            rate=settings.steam_global_rps_limit,
            burst=settings.steam_global_rps_limit * 2,
        )

    # ── Player counts ────────────────────────────────────────────────

    async def get_current_players(self, app_id: int) -> dict[str, JSONValue] | None:
        """Get current concurrent player count for an app.

        Returns: {"player_count": 123456, "result": 1}
        Returns None if the app ID doesn't exist on Steam (404).
        """
        response = await self._get(
            "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/",
            params={"appid": app_id},
        )
        if response.status_code == 404:
            return None
        if response.status_code != 200:
            raise SteamError(f"Steam player count failed: {response.status_code}")
        return response.json()

    # ── Store data ───────────────────────────────────────────────────

    async def get_app_details(self, app_id: int) -> dict[str, JSONValue] | None:
        """Get store page data for an app (no API key required).

        Returns the `data` key from the store response, or None if the app
        doesn't exist on the store.
        """
        response = await self._get(
            "https://store.steampowered.com/api/appdetails",
            params={"appids": str(app_id)},
        )
        if response.status_code != 200:
            raise SteamError(f"Steam store query failed: {response.status_code}")
        data = response.json()
        app_data = data.get(str(app_id), {})
        if not app_data.get("success"):
            return None
        return app_data.get("data")

    # ── App reviews ───────────────────────────────────────────────────

    async def get_app_reviews(self, app_id: int) -> dict[str, JSONValue]:
        """Get review summary for an app from the Steam reviews API.

        Returns the full reviews JSON response, which includes a
        ``query_summary`` block with review_score, review_score_desc,
        total_positive, total_negative, and total_reviews.
        """
        response = await self._get(
            "https://store.steampowered.com/appreviews/%d" % app_id,
            params={"json": 1, "filter": "summary", "language": "all", "num_per_page": 0},
        )
        if response.status_code != 200:
            raise SteamError(f"Steam reviews failed: {response.status_code}")
        return response.json()

    # ── Store search ──────────────────────────────────────────────────

    async def search_apps(self, term: str) -> list[dict[str, JSONValue]]:
        """Search the Steam store for apps by name.

        Returns a list of matching app dicts, each containing at minimum
        ``id`` (int) and ``name`` (str).
        """
        response = await self._get(
            "https://store.steampowered.com/api/storesearch",
            params={"term": term, "l": "en"},
        )
        if response.status_code != 200:
            raise SteamError(f"Steam store search failed: {response.status_code}")
        data = response.json()
        items = data.get("items")
        if isinstance(items, list):
            return items
        return []

    async def _get(self, url: str, **kwargs) -> httpx.Response:
        kwargs.setdefault("params", {})
        # Only add key for Web API calls, not store
        if "api.steampowered.com" in url:
            kwargs["params"]["key"] = settings.steam_api_key
        return await super()._get(url, **kwargs)
