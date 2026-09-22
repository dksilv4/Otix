"""SteamGridDB API client (v2) — game artwork (grids, heroes, logos, icons).

Subclasses ``BaseProviderClient`` from ``core.providers.framework``.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import httpx
from django.conf import settings

from core.providers.framework import (
    BaseProviderClient,
    JSONValue,
    ProviderError,
    resolve_shared_http_client,
)

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

BASE_URL = "https://www.steamgriddb.com/api/v2"

# Shared client factory — reuse the connection pool across tasks.
_shared_client: httpx.AsyncClient | None = None
_shared_client_loop_id: int | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return a process-shared AsyncClient bound to the SteamGridDB base URL."""
    global _shared_client, _shared_client_loop_id
    timeout = getattr(settings, "STEAMGRID_REQUEST_TIMEOUT_SECONDS", 10.0)
    _shared_client, _shared_client_loop_id = resolve_shared_http_client(
        _shared_client,
        _shared_client_loop_id,
        base_url=BASE_URL,
        timeout=timeout,
    )
    return _shared_client


async def close_http_client() -> None:
    """Close the process-shared HTTP client if open and reset pool references."""
    global _shared_client, _shared_client_loop_id
    if _shared_client is not None and not _shared_client.is_closed:
        await _shared_client.aclose()
    _shared_client = None
    _shared_client_loop_id = None


class SteamGridDBError(ProviderError):
    """Raised when SteamGridDB returns an API-level error or unexpected payload."""


class SteamGridDBProvider(BaseProviderClient):
    """Rate-limited, circuit-broken SteamGridDB API client."""

    def __init__(
        self,
        redis: Redis | None = None,
        http_client: httpx.AsyncClient | None = None,
        *,
        circuit_threshold: int = 5,
        circuit_recovery: float = 30.0,
    ) -> None:
        client = http_client or get_http_client()
        rate = getattr(settings, "STEAMGRID_GLOBAL_RPS_LIMIT", 2.0)
        super().__init__(
            name="steamgrid",
            redis=redis,
            http_client=client,
            rate=float(rate),
            burst=int(rate),
            circuit_threshold=circuit_threshold,
            circuit_recovery=circuit_recovery,
        )

    # ── Request helpers ───────────────────────────────────────────────

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        # The key is injected per request (not on the shared client) so a key
        # rotation only needs a settings refresh, never a client rebuild.
        headers = dict(kwargs.pop("headers", {}))
        api_key = getattr(settings, "STEAMGRID_API_KEY", "")
        headers["Authorization"] = f"Bearer {api_key}"
        return await super()._request(method, path, headers=headers, **kwargs)

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> httpx.Response:
        return await self._request("GET", path, params=params)

    def _resolve_success(self, response: httpx.Response) -> list[dict[str, JSONValue]]:
        """Parse a SteamGridDB response, raising ``SteamGridDBError`` on error."""
        if response.status_code != 200:
            raise SteamGridDBError(
                f"SteamGridDB returned {response.status_code}: {response.text[:500]}"
            )
        try:
            body = response.json()
        except Exception as exc:
            raise SteamGridDBError(f"Invalid JSON from SteamGridDB: {exc}") from exc

        if not isinstance(body, dict) or not body.get("success", False):
            errors = body.get("errors", []) if isinstance(body, dict) else []
            raise SteamGridDBError(f"SteamGridDB error: {errors}")
        data = body.get("data", [])
        return data if isinstance(data, list) else []

    # ── Game lookup ──────────────────────────────────────────────────

    async def get_game_by_platform_id(
        self,
        platform: str,
        platform_id: str | int,
    ) -> dict[str, JSONValue] | None:
        """Look up a SteamGridDB game by external platform ID.

        Supported platforms: steam, egs, origin, bnet, uplay, flashpoint, eshop.
        """
        try:
            response = await self._get(f"/games/{platform}/{platform_id}")
            if response.status_code != 200:
                return None
            body = response.json()
            if not isinstance(body, dict) or not body.get("success", False):
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
            if not isinstance(body, dict) or not body.get("success", False):
                return None
            data = body.get("data")
            if isinstance(data, dict):
                return data
            return None
        except SteamGridDBError:
            return None

    async def search_games(self, query: str) -> list[dict[str, JSONValue]]:
        """Search for a game by name via the autocomplete endpoint.

        Returns a list of matching game objects, each with at least ``id``,
        ``name``, and ``types`` (list of platform strings the game supports).
        """
        try:
            response = await self._get(f"/search/autocomplete/{query}")
            if response.status_code != 200:
                return []
            body = response.json()
            if not isinstance(body, dict) or not body.get("success", False):
                return []
            data = body.get("data", [])
            return data if isinstance(data, list) else []
        except SteamGridDBError:
            return []

    # ── Asset endpoints ──────────────────────────────────────────────

    async def get_grids(
        self, game_id: int, styles: str | None = None, dimensions: str | None = None
    ) -> list[dict[str, JSONValue]]:
        """Get grids for a game. Styles: alternate, white, blurred, material, no_logo."""
        params: dict[str, Any] = {}
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
        """Get heroes (banners) for a game. Styles: alternate, blurred, material."""
        params: dict[str, Any] = {}
        if styles:
            params["styles"] = styles
        try:
            response = await self._get(f"/heroes/game/{game_id}", params=params)
            return self._resolve_success(response)
        except (SteamGridDBError, ProviderError):
            return []

    async def get_logos(
        self, game_id: int, styles: str | None = None
    ) -> list[dict[str, JSONValue]]:
        """Get logos for a game. Styles: official, white, black, custom."""
        params: dict[str, Any] = {}
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
