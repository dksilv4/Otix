"""SteamGridDB API client (v2).

Auth: API key sent as Bearer token in Authorization header.
Base URL: https://www.steamgriddb.com/api/v2
Rate limit: 100 requests / 5 min (free tier), enforced via Redis token bucket.
"""

from __future__ import annotations

import os

import httpx
from redis.asyncio import Redis

from otix.infrastructure.config import settings
from otix.lib.types import JSONValue
from otix.providers.base import BaseProvider, ProviderError


_steamgrid_client: httpx.AsyncClient | None = None
_steamgrid_pid: int | None = None


def _get_steamgrid_client() -> httpx.AsyncClient:
    global _steamgrid_client, _steamgrid_pid
    current_pid = os.getpid()

    if _steamgrid_client is not None and _steamgrid_pid != current_pid:
        _steamgrid_client = None
        _steamgrid_pid = None

    if _steamgrid_client is None or _steamgrid_client.is_closed:
        _steamgrid_client = httpx.AsyncClient(
            base_url="https://www.steamgriddb.com/api/v2",
            timeout=settings.steamgrid_request_timeout_seconds,
        )
        _steamgrid_pid = current_pid
    return _steamgrid_client


class SteamGridDBError(Exception):
    pass


class SteamGridDBProvider(BaseProvider):
    def __init__(self, redis: Redis, http_client: httpx.AsyncClient | None = None):
        client = http_client or _get_steamgrid_client()
        super().__init__(
            name="steamgrid",
            redis=redis,
            http_client=client,
            rate=settings.steamgrid_global_rps_limit,
            burst=settings.steamgrid_global_rps_limit,
        )

    # ── Request helpers ───────────────────────────────────────────────

    async def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {settings.steamgrid_api_key}"
        return await super()._request(method, path, headers=headers, **kwargs)

    async def _get(self, path: str, params: dict | None = None) -> httpx.Response:
        return await self._request("GET", path, params=params)

    def _resolve_success(self, response: httpx.Response) -> list[dict[str, JSONValue]]:
        """Parse a SteamGridDB response, raising on error."""
        if response.status_code != 200:
            raise SteamGridDBError(
                f"SteamGridDB returned {response.status_code}: {response.text[:500]}"
            )
        body = response.json()
        if not body.get("success", False):
            errors = body.get("errors", [])
            raise SteamGridDBError(f"SteamGridDB error: {errors}")
        return body.get("data", [])

    # ── Game lookup ──────────────────────────────────────────────────

    async def get_game_by_platform_id(
        self, platform: str, platform_id: str | int,
    ) -> dict[str, JSONValue] | None:
        """Look up a SteamGridDB game by external platform ID.

        Supported platforms: steam, egs, origin, bnet, uplay, flashpoint, eshop.
        """
        try:
            response = await self._get(f"/games/{platform}/{platform_id}")
            if response.status_code != 200:
                return None
            body = response.json()
            if not body.get("success", False):
                return None
            data = body.get("data")
            if isinstance(data, dict):
                return data
            if isinstance(data, list) and data:
                return data[0]
            return None
        except SteamGridDBError:
            return None

    async def get_game_by_steam_app_id(self, steam_app_id: int) -> dict[str, JSONValue] | None:
        """Look up a SteamGridDB game by Steam App ID."""
        return await self.get_game_by_platform_id("steam", steam_app_id)

    async def get_game_by_id(self, sgdb_game_id: int) -> dict[str, JSONValue] | None:
        """Look up a SteamGridDB game by its own internal ID."""
        try:
            response = await self._get(f"/games/id/{sgdb_game_id}")
            if response.status_code != 200:
                return None
            body = response.json()
            if not body.get("success", False):
                return None
            data = body.get("data")
            if isinstance(data, dict):
                return data
            return None
        except SteamGridDBError:
            return None

    async def search_games(self, query: str) -> list[dict[str, JSONValue]]:
        """Search for games by name via the autocomplete endpoint.

        Returns a list of matching game objects, each with at least 'id', 'name',
        and 'types' (list of platform strings the game supports).
        """
        try:
            response = await self._get(f"/search/autocomplete/{query}")
            if response.status_code != 200:
                return []
            body = response.json()
            if not body.get("success", False):
                return []
            return body.get("data", [])
        except SteamGridDBError:
            return []

    # ── Asset endpoints ──────────────────────────────────────────────

    async def get_grids(
        self, game_id: int, styles: str | None = None, dimensions: str | None = None
    ) -> list[dict[str, JSONValue]]:
        """Get grids for a game. Style options: alternate, white, blurred, material, no_logo."""
        params: dict = {}
        if styles:
            params["styles"] = styles
        if dimensions:
            params["dimensions"] = dimensions
        try:
            response = await self._get(f"/grids/game/{game_id}", params=params)
            return self._resolve_success(response)
        except (SteamGridDBError, ProviderError):
            return []

    async def get_heroes(
        self, game_id: int, styles: str | None = None
    ) -> list[dict[str, JSONValue]]:
        """Get heroes (banners) for a game. Style options: alternate, blurred, material."""
        params: dict = {}
        if styles:
            params["styles"] = styles
        try:
            response = await self._get(f"/heroes/game/{game_id}", params=params)
            return self._resolve_success(response)
        except (SteamGridDBError, ProviderError):
            return []

    async def get_logos(self, game_id: int, styles: str | None = None) -> list[dict[str, JSONValue]]:
        """Get logos for a game. Style options: official, white, black, custom."""
        params: dict = {}
        if styles:
            params["styles"] = styles
        try:
            response = await self._get(f"/logos/game/{game_id}", params=params)
            return self._resolve_success(response)
        except (SteamGridDBError, ProviderError):
            return []

    async def get_icons(self, game_id: int) -> list[dict[str, JSONValue]]:
        """Get icons for a game."""
        try:
            response = await self._get(f"/icons/game/{game_id}")
            return self._resolve_success(response)
        except SteamGridDBError:
            return []
