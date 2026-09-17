"""IGDB API client (v4) — game metadata (port of ``otix.providers.igdb.client``).

Auth: Twitch OAuth2 client-credentials grant. Access tokens are cached in Redis
(``IGDB_TOKEN_TTL_SECONDS``, default 50 days); every request carries a
``Client-ID`` header alongside the ``Bearer`` token. A single 401 triggers a
token invalidation + one refetch before the response is returned.

The API uses a custom query DSL sent in the POST body (Apicalypse), so — unlike
the TMDB/MusicBrainz GET clients — all reads here are POSTs and the increment-33
GET response cache never applies. Search results are instead cached in Redis
(``igdb:search:*``, ``IGDB_SEARCH_CACHE_TTL_SECONDS`` default 7 days) because
raw IGDB metadata changes slowly and repeat library re-matches shouldn't burn
the IGDB quota.

Docs: https://api-docs.igdb.com/
"""

from __future__ import annotations

import hashlib
import json
import time
from typing import TYPE_CHECKING

import httpx
from django.conf import settings

from core.providers.base import BaseProvider, resolve_shared_http_client
from core.providers.types import JSONValue

if TYPE_CHECKING:
    from redis.asyncio import Redis

TOKEN_KEY = "igdb:access_token"
OAUTH_URL = "https://id.twitch.tv/oauth2/token"

# Search results are raw IGDB metadata that changes slowly; caching them means
# repeat library re-matches hit Redis instead of burning the IGDB quota.
SEARCH_CACHE_PREFIX = "igdb:search"

# Full field set for fetching a complete game record (hydration + seeding).
GAME_FIELDS = (
    "id,name,summary,storyline,first_release_date,"
    "rating,aggregated_rating,rating_count,aggregated_rating_count,"
    "hypes,url,slug,status,"
    "game_type,parent_game.name,"
    "cover.image_id,"
    "screenshots.image_id,screenshots.width,screenshots.height,"
    "artworks.image_id,artworks.width,artworks.height,artworks.image_type,artworks.alpha_channel,artworks.artwork_type,"
    "genres.name,themes.name,"
    "platforms.name,platforms.platform_logo.image_id,"
    "game_modes.name,"
    "websites.url,websites.type,"
    "external_games.external_game_source,external_games.uid,"
    "videos.video_id,videos.name,"
    "involved_companies.company.name,involved_companies.company.slug,"
    "involved_companies.company.logo.image_id,"
    "involved_companies.developer,involved_companies.publisher,"
    "involved_companies.porting,involved_companies.supporting,"
    "age_ratings,"
    "franchise.name,franchise.id"
)

# Shared client factory — reuse the connection pool across tasks.
_shared_client: httpx.AsyncClient | None = None
_shared_client_loop_id: int | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return a process-shared AsyncClient bound to the IGDB base URL."""
    global _shared_client, _shared_client_loop_id
    _shared_client, _shared_client_loop_id = resolve_shared_http_client(
        _shared_client,
        _shared_client_loop_id,
        base_url="https://api.igdb.com/v4",
        timeout=settings.IGDB_REQUEST_TIMEOUT_SECONDS,
    )
    return _shared_client



class IGDBAuthError(Exception):
    pass


class IGDBError(Exception):
    pass


class IGDBProvider(BaseProvider):
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
            name="igdb",
            redis=redis,
            http_client=client,
            rate=settings.IGDB_GLOBAL_RPS_LIMIT,
            burst=settings.IGDB_GLOBAL_RPS_LIMIT,
            circuit_threshold=circuit_threshold,
            circuit_recovery=circuit_recovery,
        )
        # Token/search caches live on the same client the token bucket uses
        # (an explicit redis, else the core.redis seam BaseProvider resolved).
        self._redis = redis if redis is not None else self.rate_limiter.redis

    # ── Auth ──────────────────────────────────────────────────────────

    async def _get_token(self) -> str:
        """Get a valid access token from Redis or fetch a new one from Twitch."""
        cached = await self._redis.get(TOKEN_KEY)
        if cached:
            return cached

        response = await self.http.post(
            OAUTH_URL,
            params={
                "client_id": settings.IGDB_CLIENT_ID,
                "client_secret": settings.IGDB_CLIENT_SECRET,
                "grant_type": "client_credentials",
            },
        )
        if response.status_code != 200:
            raise IGDBAuthError(f"Twitch OAuth failed: {response.status_code} {response.text}")

        data = response.json()
        token = data.get("access_token")
        if not token:
            raise IGDBAuthError("No access_token in Twitch OAuth response")

        await self._redis.set(TOKEN_KEY, token, ex=settings.IGDB_TOKEN_TTL_SECONDS)
        return token

    async def _invalidate_token(self) -> None:
        await self._redis.delete(TOKEN_KEY)

    # ── Request helpers ───────────────────────────────────────────────

    async def _request(self, method: str, url: str, **kwargs) -> httpx.Response:
        token = await self._get_token()
        headers = kwargs.pop("headers", {})
        headers["Client-ID"] = settings.IGDB_CLIENT_ID
        headers["Authorization"] = f"Bearer {token}"

        response = await super()._request(method, url, headers=headers, **kwargs)

        if response.status_code == 401:
            await self._invalidate_token()
            token = await self._get_token()
            headers["Authorization"] = f"Bearer {token}"
            response = await super()._request(method, url, headers=headers, **kwargs)

        return response

    async def _post(self, url: str, **kwargs) -> httpx.Response:
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
        results = await self.get_games([igdb_id], fields)
        return results[0] if results else None

    async def get_popular_games(
        self, limit: int = 50, fields: str | None = None
    ) -> list[dict[str, JSONValue]]:
        """Popular main games ordered by rating (aggregated_rating).

        ``version_parent = null`` keeps DLC/expansions (which hang off a parent
        game) out of the all-time greats list. IGDB no longer supports filtering
        by ``category``/``game_type`` in the where clause, so this is the closest
        server-side "main game" gate; remasters/ports still qualify.
        """
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
        """Main games released in the last ``days`` (default: a year).

        The discover rails decide their own display window; the seed pulls a
        year so shelves that need reviewed recent titles (now playing, best on
        platform) have real candidates rather than day-zero releases with no
        critic scores yet.
        """
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
        """Upcoming/unreleased main games (no DLC/expansions)."""
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
        body = f"fields name,slug; where id = {franchise_id}; limit 1;"
        response = await self._post("/franchises", content=body)
        if response.status_code == 200:
            results = response.json()
            return results[0] if results else None
        raise IGDBError(f"IGDB franchise query failed: {response.status_code}")

    async def get_changed_game_ids(
        self, start_timestamp: int, limit: int = 100
    ) -> list[dict[str, JSONValue]]:
        """Get game IDs changed since the given Unix timestamp."""
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
        """Get games with offset pagination, optionally filtered by release date."""
        conditions = ["version_parent = null"]  # Main games only (no DLC, mods, etc.)
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
        """Top-rated main games on one platform (best-of-<platform> list)."""
        body = (
            f"fields {fields or '*'}; sort aggregated_rating desc; "
            f"where platforms = ({platform_id}) & version_parent = null "
            f"& aggregated_rating != null & rating_count > 10; limit {limit};"
        )
        response = await self._post("/games", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB platform game query failed: {response.status_code}")

    # ── Search ────────────────────────────────────────────────────────

    def _search_cache_key(self, method: str, query: str, limit: int, fields: str | None) -> str:
        fields_digest = hashlib.sha1((fields or "*").encode()).hexdigest()[:8]
        return f"{SEARCH_CACHE_PREFIX}:{method}:{fields_digest}:{limit}:{query}"

    async def _cached_search(
        self, method: str, query: str, limit: int, fields: str | None, fetch
    ) -> list[dict[str, JSONValue]]:
        """Run *fetch* (an async IGDB POST) unless a cached response exists.

        Best-effort: cache read/write failures are swallowed, never raised.
        """
        cache_key = self._search_cache_key(method, query, limit, fields)
        try:
            cached = await self._redis.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            cached = None

        results = await fetch()

        if results is not None:
            try:
                await self._redis.setex(
                    cache_key, settings.IGDB_SEARCH_CACHE_TTL_SECONDS, json.dumps(results)
                )
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
        """Search IGDB by case-insensitive name substring (cached in Redis).

        The relevance ``search`` endpoint down-weights common words ("for",
        "the", "of"), so the exact-title game can be missing entirely from its
        results (e.g. "For The King"). A ``where name ~ *"..."*`` filter
        matches the literal substring and reliably surfaces the exact-title
        entry alongside any similarly-named games.
        """

        async def fetch() -> list[dict[str, JSONValue]] | None:
            escaped = query.replace("\\", "\\\\").replace('"', '\\"')
            body = f'fields {fields or "*"}; where name ~ *"{escaped}"*; limit {limit};'
            response = await self._post("/games", content=body)
            if response.status_code == 200:
                return response.json()
            raise IGDBError(f"IGDB name search failed: {response.status_code}")

        return await self._cached_search("name", query, limit, fields, fetch)

    # ── Covers / Artwork (resolved via ID in game fields) ──────────────

    async def get_cover(self, cover_id: int) -> dict[str, JSONValue] | None:
        body = f"fields image_id,url; where id = {cover_id}; limit 1;"
        response = await self._post("/covers", content=body)
        if response.status_code == 200:
            results = response.json()
            return results[0] if results else None
        raise IGDBError(f"IGDB cover query failed: {response.status_code}")

    async def get_covers(self, game_id: int, limit: int = 20) -> list[dict[str, JSONValue]]:
        body = (
            f"fields image_id,url,width,height,image_type,alpha_channel; "
            f"where game = {game_id}; limit {limit};"
        )
        response = await self._post("/covers", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB covers query failed: {response.status_code}")

    async def get_screenshots(self, game_id: int, limit: int = 10) -> list[dict[str, JSONValue]]:
        body = f"fields image_id,url; where game = {game_id}; limit {limit};"
        response = await self._post("/screenshots", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB screenshots query failed: {response.status_code}")

    async def get_artworks(self, game_id: int, limit: int = 10) -> list[dict[str, JSONValue]]:
        body = f"fields image_id,url; where game = {game_id}; limit {limit};"
        response = await self._post("/artworks", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB artworks query failed: {response.status_code}")

    # ── Videos ────────────────────────────────────────────────────────

    async def get_videos(self, game_id: int, limit: int = 10) -> list[dict[str, JSONValue]]:
        body = f"fields name,video_id,url; where game = {game_id}; limit {limit};"
        response = await self._post("/game_videos", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB videos query failed: {response.status_code}")

    # ── Companies ─────────────────────────────────────────────────────

    async def get_companies(self, company_ids: list[int]) -> list[dict[str, JSONValue]]:
        if not company_ids:
            return []
        id_list = ",".join(str(i) for i in company_ids)
        body = f"fields name,slug; where id = ({id_list}); limit {len(company_ids)};"
        response = await self._post("/companies", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB companies query failed: {response.status_code}")

    async def get_involved_companies(self, game_id: int) -> list[dict[str, JSONValue]]:
        body = (
            f"fields company,developer,publisher,porting,supporting; "
            f"where game = {game_id}; limit 50;"
        )
        response = await self._post("/involved_companies", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB involved_companies query failed: {response.status_code}")

    # ── Age ratings ───────────────────────────────────────────────────

    async def get_age_ratings(self, rating_ids: list[int]) -> list[dict[str, JSONValue]]:
        """Fetch age ratings by ID. Returns organization, rating_category, etc."""
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
        """Map external IDs to IGDB game IDs via the external_games endpoint.

        IGDB external_game_source categories:
            1 = Steam, 5 = GOG, 26 = Epic Games Store, etc.

        Returns ``{external_id: igdb_game_id}``.
        """
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
