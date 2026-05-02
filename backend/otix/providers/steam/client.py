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
        client = http_client or httpx.AsyncClient(timeout=15.0)
        super().__init__(
            name="steam",
            redis=redis,
            http_client=client,
            rate=10.0,  # Steam API is generous
            burst=20,
        )

    # ── Player counts ────────────────────────────────────────────────

    async def get_current_players(self, app_id: int) -> dict[str, JSONValue]:
        """Get current concurrent player count for an app.

        Returns: {"player_count": 123456, "result": 1}
        """
        response = await self._get(
            "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/",
            params={"appid": app_id},
        )
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

    async def _get(self, url: str, **kwargs) -> httpx.Response:
        kwargs.setdefault("params", {})
        # Only add key for Web API calls, not store
        if "api.steampowered.com" in url:
            kwargs["params"]["key"] = settings.steam_api_key
        return await super()._get(url, **kwargs)
