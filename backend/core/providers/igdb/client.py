"""IGDB API client (v4) subclassing BaseProviderClient."""

from __future__ import annotations

import hashlib
import json
import time
from typing import TYPE_CHECKING, Any

import httpx
from django.conf import settings

from core.providers.framework import (
    BaseProviderClient,
    JSONValue,
    ProviderError,
    resolve_shared_http_client,
)
from core.providers.igdb.auth import (
    get_app_access_token,
    invalidate_access_token,
)
from core.providers.igdb.schemas import (
    CHARACTER_FIELDS,
    COMPANY_FIELDS,
)

if TYPE_CHECKING:
    from redis.asyncio import Redis

SEARCH_CACHE_PREFIX = "igdb:search"

# Shared client singleton — reuse connection pool across tasks.
_shared_client: httpx.AsyncClient | None = None
_shared_client_loop_id: int | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return a process-shared AsyncClient bound to the IGDB base URL."""
    global _shared_client, _shared_client_loop_id
    timeout = getattr(settings, "IGDB_REQUEST_TIMEOUT_SECONDS", 15.0)
    _shared_client, _shared_client_loop_id = resolve_shared_http_client(
        _shared_client,
        _shared_client_loop_id,
        base_url="https://api.igdb.com/v4",
        timeout=timeout,
    )
    return _shared_client


async def close_http_client() -> None:
    """Close and reset the process-shared AsyncClient."""
    global _shared_client, _shared_client_loop_id
    if _shared_client is not None and not _shared_client.is_closed:
        await _shared_client.aclose()
    _shared_client = None
    _shared_client_loop_id = None


class IGDBError(ProviderError):
    """Generic IGDB API communication or query error."""


class IGDBProvider(BaseProviderClient):
    """Async IGDB v4 API provider client with Apicalypse query DSL support."""

    def __init__(
        self,
        redis: Redis | None = None,
        http_client: httpx.AsyncClient | None = None,
        *,
        circuit_threshold: int = 5,
        circuit_recovery: float = 30.0,
    ) -> None:
        client = http_client or get_http_client()
        rate = float(getattr(settings, "IGDB_GLOBAL_RPS_LIMIT", 4.0))
        super().__init__(
            name="igdb",
            redis=redis,
            http_client=client,
            rate=rate,
            burst=int(rate),
            circuit_threshold=circuit_threshold,
            circuit_recovery=circuit_recovery,
        )
        self._redis = redis if redis is not None else self.rate_limiter.redis

    # ── Auth ──────────────────────────────────────────────────────────

    async def _get_token(self) -> str:
        """Obtain a valid access token from Redis or Twitch OAuth."""
        return await get_app_access_token(self.http, self._redis)

    async def _invalidate_token(self) -> None:
        """Evict access token from cache on 401."""
        await invalidate_access_token(self._redis)

    # ── Request helpers ───────────────────────────────────────────────

    async def _request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        token = await self._get_token()
        headers = kwargs.pop("headers", None) or {}
        headers["Client-ID"] = getattr(settings, "IGDB_CLIENT_ID", "")
        headers["Authorization"] = f"Bearer {token}"

        response = await super()._request(method, url, headers=headers, **kwargs)

        if response.status_code == 401:
            await self._invalidate_token()
            token = await self._get_token()
            headers["Authorization"] = f"Bearer {token}"
            response = await super()._request(method, url, headers=headers, **kwargs)

        return response

    async def _post(self, url: str, **kwargs: Any) -> httpx.Response:
        return await self._request("POST", url, **kwargs)

    # ── Game endpoints ────────────────────────────────────────────────

    async def get_games(
        self, ids: list[int], fields: str | None = None
    ) -> list[dict[str, JSONValue]]:
        """Fetch multiple games by ID."""
        if not ids:
            return []
        id_list = ",".join(str(i) for i in ids)
        body = f"fields {fields or '*'}; where id = ({id_list}); limit {len(ids)};"
        response = await self._post("/games", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB game query failed: {response.status_code}")

    async def get_game(
        self, igdb_id: int, fields: str | None = None
    ) -> dict[str, JSONValue] | None:
        """Fetch a single game by its IGDB ID."""
        results = await self.get_games([igdb_id], fields)
        return results[0] if results else None

    async def get_popular_games(
        self, limit: int = 50, fields: str | None = None
    ) -> list[dict[str, JSONValue]]:
        """Fetch popular main games ordered by rating."""
        body = (
            f"fields {fields or '*'}; sort aggregated_rating desc; "
            f"where aggregated_rating != null & rating_count > 10"
            f" & version_parent = null; limit {limit};"
        )
        response = await self._post("/games", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB popular game query failed: {response.status_code}")

    async def get_recently_released_games(
        self, limit: int = 100, fields: str | None = None, days: int = 365
    ) -> list[dict[str, JSONValue]]:
        """Fetch main games released within the last ``days``."""
        now = int(time.time())
        window_ago = now - days * 86400
        body = (
            f"fields {fields or '*'}; "
            f"sort first_release_date desc; "
            f"where first_release_date >= {window_ago} & first_release_date <= {now}"
            f" & version_parent = null; "
            f"limit {limit};"
        )
        response = await self._post("/games", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB recent game query failed: {response.status_code}")

    async def get_upcoming_games(
        self, limit: int = 100, fields: str | None = None
    ) -> list[dict[str, JSONValue]]:
        """Fetch upcoming/unreleased main games."""
        now = int(time.time())
        body = (
            f"fields {fields or '*'}; "
            f"sort first_release_date asc; "
            f"where first_release_date > {now} & hypes > 5 & version_parent = null; "
            f"limit {limit};"
        )
        response = await self._post("/games", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB upcoming game query failed: {response.status_code}")

    # ── Franchise ────────────────────────────────────────────────────

    async def get_franchise(self, franchise_id: int) -> dict[str, JSONValue] | None:
        """Fetch a franchise record by ID."""
        body = f"fields name,slug; where id = {franchise_id}; limit 1;"
        response = await self._post("/franchises", content=body)
        if response.status_code == 200:
            results = response.json()
            return results[0] if results else None
        raise IGDBError(f"IGDB franchise query failed: {response.status_code}")

    async def get_changed_game_ids(
        self, start_timestamp: int, limit: int = 100
    ) -> list[dict[str, JSONValue]]:
        """Get game IDs updated since the given Unix timestamp."""
        body = (
            f"fields id,updated_at; sort updated_at asc; "
            f"where updated_at >= {start_timestamp}; limit {limit};"
        )
        response = await self._post("/games", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB change query failed: {response.status_code}")

    async def get_games_offset(
        self,
        offset: int,
        limit: int = 50,
        fields: str | None = None,
        start_date: int | None = None,
        end_date: int | None = None,
    ) -> list[dict[str, JSONValue]]:
        """Fetch games using offset pagination, optionally bounded by release timestamps."""
        conditions = ["version_parent = null"]
        if start_date is not None:
            conditions.append(f"first_release_date >= {start_date}")
        if end_date is not None:
            conditions.append(f"first_release_date <= {end_date}")
        where = " & ".join(conditions)
        body = (
            f"fields {fields or '*'}; sort first_release_date desc; "
            f"where {where}; limit {limit}; offset {offset};"
        )
        response = await self._post("/games", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB offset query failed: {response.status_code}")

    async def get_games_for_platform(
        self,
        platform_id: int,
        limit: int = 50,
        fields: str | None = None,
    ) -> list[dict[str, JSONValue]]:
        """Fetch top-rated main games for a specific platform ID."""
        body = (
            f"fields {fields or '*'}; sort aggregated_rating desc; "
            f"where platforms = ({platform_id}) & version_parent = null "
            f"& aggregated_rating != null & rating_count > 10; limit {limit};"
        )
        response = await self._post("/games", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB platform game query failed: {response.status_code}")

    # ── Characters ────────────────────────────────────────────────────

    async def get_characters(
        self, character_ids: list[int], fields: str | None = None
    ) -> list[dict[str, JSONValue]]:
        """Fetch multiple game characters by ID."""
        if not character_ids:
            return []
        id_list = ",".join(str(i) for i in character_ids)
        limit = len(character_ids)
        body = f"fields {fields or CHARACTER_FIELDS}; where id = ({id_list}); limit {limit};"
        response = await self._post("/characters", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB character query failed: {response.status_code}")

    async def get_character(
        self, character_id: int, fields: str | None = None
    ) -> dict[str, JSONValue] | None:
        """Fetch a single character by ID."""
        results = await self.get_characters([character_id], fields=fields)
        return results[0] if results else None

    async def get_game_characters(
        self, game_id: int, limit: int = 50, fields: str | None = None
    ) -> list[dict[str, JSONValue]]:
        """Fetch all characters that appear in a specific game ID."""
        body = f"fields {fields or CHARACTER_FIELDS}; where games = ({game_id}); limit {limit};"
        response = await self._post("/characters", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB game characters query failed: {response.status_code}")

    # ── Companies ─────────────────────────────────────────────────────

    async def get_companies(
        self, company_ids: list[int], fields: str | None = None
    ) -> list[dict[str, JSONValue]]:
        """Fetch company details by ID list."""
        if not company_ids:
            return []
        id_list = ",".join(str(i) for i in company_ids)
        body = f"fields {fields or 'name,slug'}; where id = ({id_list}); limit {len(company_ids)};"
        response = await self._post("/companies", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB companies query failed: {response.status_code}")

    async def get_company(
        self, company_id: int, fields: str | None = None
    ) -> dict[str, JSONValue] | None:
        """Fetch a single company by ID."""
        results = await self.get_companies([company_id], fields=fields)
        return results[0] if results else None

    async def search_companies(
        self, query: str, limit: int = 20, fields: str | None = None
    ) -> list[dict[str, JSONValue]]:
        """Search companies by query string (cached in Redis)."""

        async def fetch() -> list[dict[str, JSONValue]] | None:
            escaped = query.replace('"', '\\"')
            body = f'search "{escaped}"; fields {fields or COMPANY_FIELDS}; limit {limit};'
            response = await self._post("/companies", content=body)
            if response.status_code == 200:
                return response.json()
            raise IGDBError(f"IGDB company search failed: {response.status_code}")

        return await self._cached_search("company_search", query, limit, fields, fetch)

    async def get_involved_companies(self, game_id: int) -> list[dict[str, JSONValue]]:
        """Fetch involved companies for a game."""
        body = (
            f"fields company,developer,publisher,porting,supporting; "
            f"where game = {game_id}; limit 50;"
        )
        response = await self._post("/involved_companies", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB involved_companies query failed: {response.status_code}")

    # ── Search ────────────────────────────────────────────────────────

    def _search_cache_key(self, method: str, query: str, limit: int, fields: str | None) -> str:
        fields_digest = hashlib.sha1((fields or "*").encode()).hexdigest()[:8]
        return f"{SEARCH_CACHE_PREFIX}:{method}:{fields_digest}:{limit}:{query}"

    async def _cached_search(
        self, method: str, query: str, limit: int, fields: str | None, fetch: Any
    ) -> list[dict[str, JSONValue]]:
        """Execute search with best-effort Redis caching."""
        cache_key = self._search_cache_key(method, query, limit, fields)
        try:
            cached = await self._redis.get(cache_key)
            if cached:
                if isinstance(cached, bytes):
                    cached = cached.decode("utf-8")
                return json.loads(cached)
        except Exception:
            pass

        results = await fetch()
        if results is not None:
            try:
                ttl = getattr(settings, "IGDB_SEARCH_CACHE_TTL_SECONDS", 7 * 86400)
                await self._redis.setex(cache_key, ttl, json.dumps(results))
            except Exception:
                pass
        return results or []

    async def search_games(
        self, query: str, limit: int = 50, fields: str | None = None
    ) -> list[dict[str, JSONValue]]:
        """Search games by relevance (cached in Redis)."""

        async def fetch() -> list[dict[str, JSONValue]] | None:
            escaped = query.replace('"', '\\"')
            body = f'search "{escaped}"; fields {fields or "*"}; limit {limit};'
            response = await self._post("/games", content=body)
            if response.status_code == 200:
                return response.json()
            raise IGDBError(f"IGDB search query failed: {response.status_code}")

        return await self._cached_search("relevance", query, limit, fields, fetch)

    async def search_games_by_name(
        self, query: str, limit: int = 20, fields: str | None = None
    ) -> list[dict[str, JSONValue]]:
        """Search games by exact/substring title match (cached in Redis)."""

        async def fetch() -> list[dict[str, JSONValue]] | None:
            escaped = query.replace("\\", "\\\\").replace('"', '\\"')
            body = f'fields {fields or "*"}; where name ~ *"{escaped}"*; limit {limit};'
            response = await self._post("/games", content=body)
            if response.status_code == 200:
                return response.json()
            raise IGDBError(f"IGDB name search failed: {response.status_code}")

        return await self._cached_search("name", query, limit, fields, fetch)

    # ── Artwork, Covers, Screenshots ──────────────────────────────────

    async def get_cover(self, cover_id: int) -> dict[str, JSONValue] | None:
        """Fetch cover metadata by cover ID."""
        body = f"fields image_id,url; where id = {cover_id}; limit 1;"
        response = await self._post("/covers", content=body)
        if response.status_code == 200:
            results = response.json()
            return results[0] if results else None
        raise IGDBError(f"IGDB cover query failed: {response.status_code}")

    async def get_covers(self, game_id: int, limit: int = 20) -> list[dict[str, JSONValue]]:
        """Fetch all covers associated with a game ID."""
        body = (
            f"fields image_id,url,width,height,image_type,alpha_channel; "
            f"where game = {game_id}; limit {limit};"
        )
        response = await self._post("/covers", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB covers query failed: {response.status_code}")

    async def get_screenshots(self, game_id: int, limit: int = 10) -> list[dict[str, JSONValue]]:
        """Fetch screenshots for a game ID."""
        body = f"fields image_id,url; where game = {game_id}; limit {limit};"
        response = await self._post("/screenshots", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB screenshots query failed: {response.status_code}")

    async def get_artworks(self, game_id: int, limit: int = 10) -> list[dict[str, JSONValue]]:
        """Fetch artworks for a game ID."""
        body = f"fields image_id,url; where game = {game_id}; limit {limit};"
        response = await self._post("/artworks", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB artworks query failed: {response.status_code}")

    # ── Videos ────────────────────────────────────────────────────────

    async def get_videos(self, game_id: int, limit: int = 10) -> list[dict[str, JSONValue]]:
        """Fetch video metadata for a game ID."""
        body = f"fields name,video_id,url; where game = {game_id}; limit {limit};"
        response = await self._post("/game_videos", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB videos query failed: {response.status_code}")

    # ── Age ratings ───────────────────────────────────────────────────

    async def get_age_ratings(self, rating_ids: list[int]) -> list[dict[str, JSONValue]]:
        """Fetch age ratings by ID list."""
        if not rating_ids:
            return []
        id_list = ",".join(str(i) for i in rating_ids)
        body = f"fields organization,rating_category; where id = ({id_list}); limit 500;"
        response = await self._post("/age_ratings", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB age_ratings query failed: {response.status_code}")

    # ── External game mapping ──────────────────────────────────────────

    async def lookup_external_game_ids(
        self, category: int, external_ids: list[str]
    ) -> dict[str, int]:
        """Map external IDs to IGDB game IDs via the external_games endpoint."""
        if not external_ids:
            return {}

        uid_list = ",".join(f'"{eid}"' for eid in external_ids)
        body = (
            f"fields uid,game; where external_game_source = {category} & "
            f"uid = ({uid_list}); limit {len(external_ids)};"
        )
        response = await self._post("/external_games", content=body)
        if response.status_code == 200:
            result: dict[str, int] = {}
            for row in response.json():
                uid = row.get("uid")
                game = row.get("game")
                if isinstance(uid, str) and isinstance(game, int):
                    result[uid] = game
            return result
        raise IGDBError(f"IGDB external_games query failed: {response.status_code}")

    async def lookup_steam_app_ids(self, app_ids: list[int]) -> dict[int, int]:
        """Map Steam app IDs to IGDB game IDs (external_game_source category 1)."""
        str_ids = [str(aid) for aid in app_ids]
        mapping = await self.lookup_external_game_ids(1, str_ids)
        return {int(k): v for k, v in mapping.items()}

    async def lookup_epic_ids(self, epic_ids: list[str]) -> dict[str, int]:
        """Map Epic Games Store IDs to IGDB game IDs (category 26)."""
        return await self.lookup_external_game_ids(26, epic_ids)

    async def lookup_gog_ids(self, gog_ids: list[int]) -> dict[int, int]:
        """Map GOG IDs to IGDB game IDs (category 5)."""
        str_ids = [str(gid) for gid in gog_ids]
        mapping = await self.lookup_external_game_ids(5, str_ids)
        return {int(k): v for k, v in mapping.items()}
