# TODO: Review this file
"""IGDB API client (v4).

Auth: Twitch OAuth2 client-credentials grant. Access tokens cached in Redis
for ~60 days. Client-ID header required on every request alongside Bearer token.

API uses a custom query DSL sent in the POST body:
    fields name,rating,genres.name,cover.url; where id = 1234;
    search "Zelda"; fields name,first_release_date; limit 50;

Docs: https://api-docs.igdb.com/
"""

from __future__ import annotations

import asyncio
import time

import httpx
from redis.asyncio import Redis

from otix.infrastructure.config import settings
from otix.lib.types import JSONValue
from otix.providers.base import BaseProvider

TOKEN_KEY = "igdb:access_token"
TOKEN_TTL = 50 * 24 * 3600  # 50 days — refresh well before Twitch's expiry
OAUTH_URL = "https://id.twitch.tv/oauth2/token"


class IGDBAuthError(Exception):
    pass


class IGDBError(Exception):
    pass


_shared_client: httpx.AsyncClient | None = None
_shared_client_loop_id: int | None = None


def get_http_client() -> httpx.AsyncClient:
    global _shared_client, _shared_client_loop_id
    try:
        current_loop_id = id(asyncio.get_running_loop())
    except RuntimeError:
        current_loop_id = None

    if _shared_client is not None and _shared_client_loop_id != current_loop_id:
        # Event loop changed (Celery prefork child) — discard inherited client
        _shared_client = None

    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(
            base_url="https://api.igdb.com/v4",
            timeout=settings.igdb_request_timeout_seconds,
        )
        _shared_client_loop_id = current_loop_id
    return _shared_client


class IGDBProvider(BaseProvider):
    def __init__(self, redis: Redis, http_client: httpx.AsyncClient | None = None):
        self._redis = redis
        client = http_client or get_http_client()
        super().__init__(
            name="igdb",
            redis=redis,
            http_client=client,
            rate=settings.igdb_global_rps_limit,
            burst=settings.igdb_global_rps_limit,
        )

    # ── Auth ──────────────────────────────────────────────────────────

    async def _get_token(self) -> str:
        """Get a valid access token from Redis or fetch a new one from Twitch."""
        cached = await self._redis.get(TOKEN_KEY)
        if cached:
            return cached

        response = await self.http.post(
            OAUTH_URL,
            params={
                "client_id": settings.igdb_client_id,
                "client_secret": settings.igdb_client_secret,
                "grant_type": "client_credentials",
            },
        )
        if response.status_code != 200:
            raise IGDBAuthError(f"Twitch OAuth failed: {response.status_code} {response.text}")

        data = response.json()
        token = data.get("access_token")
        if not token:
            raise IGDBAuthError("No access_token in Twitch OAuth response")

        await self._redis.set(TOKEN_KEY, token, ex=TOKEN_TTL)
        return token

    async def _invalidate_token(self) -> None:
        await self._redis.delete(TOKEN_KEY)

    # ── Request helpers ───────────────────────────────────────────────

    async def _request(self, method: str, url: str, **kwargs) -> httpx.Response:
        token = await self._get_token()
        headers = kwargs.pop("headers", {})
        headers["Client-ID"] = settings.igdb_client_id
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

    async def get_games(self, ids: list[int], fields: str | None = None) -> list[dict[str, JSONValue]]:
        """Fetch multiple game by ID."""
        if not ids:
            return []
        id_list = ",".join(str(i) for i in ids)
        body = f"fields {fields or '*'}; where id = ({id_list}); limit {len(ids)};"
        response = await self._post("/game", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB game query failed: {response.status_code}")

    async def get_game(self, igdb_id: int, fields: str | None = None) -> dict[str, JSONValue] | None:
        results = await self.get_games([igdb_id], fields)
        return results[0] if results else None

    async def get_popular_games(self, limit: int = 50, fields: str | None = None) -> list[dict[str, JSONValue]]:
        """Popular game ordered by rating (aggregated_rating)."""
        body = f"fields {fields or '*'}; sort aggregated_rating desc; where aggregated_rating != null & rating_count > 10; limit {limit};"
        response = await self._post("/game", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB popular game query failed: {response.status_code}")

    async def get_recently_released_games(self, limit: int = 100, fields: str | None = None) -> list[dict[str, JSONValue]]:
        """Recently released game in the last 90 days."""
        now = int(time.time())
        ninety_days_ago = now - 90 * 86400
        body = (
            f"fields {fields or '*'}; "
            f"sort first_release_date desc; "
            f"where first_release_date >= {ninety_days_ago} & first_release_date <= {now}; "
            f"limit {limit};"
        )
        response = await self._post("/game", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB recent game query failed: {response.status_code}")

    async def get_upcoming_games(self, limit: int = 100, fields: str | None = None) -> list[dict[str, JSONValue]]:
        """Upcoming/unreleased game."""
        now = int(time.time())
        body = (
            f"fields {fields or '*'}; "
            f"sort first_release_date asc; "
            f"where first_release_date > {now} & hypes > 5; "
            f"limit {limit};"
        )
        response = await self._post("/game", content=body)
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

    async def get_changed_game_ids(self, start_timestamp: int, limit: int = 100) -> list[dict[str, JSONValue]]:
        """Get game IDs changed since the given Unix timestamp."""
        body = f"fields id,updated_at; sort updated_at asc; where updated_at >= {start_timestamp}; limit {limit};"
        response = await self._post("/game", content=body)
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
        """Get game with offset pagination, optionally filtered by release date."""
        conditions = ["version_parent = null"]  # Main game only (no DLC, mods, etc.)
        if start_date is not None:
            conditions.append(f"first_release_date >= {start_date}")
        if end_date is not None:
            conditions.append(f"first_release_date <= {end_date}")
        where = " & ".join(conditions)
        body = (
            f"fields {fields or '*'}; "
            f"sort first_release_date desc; "
            f"where {where}; "
            f"limit {limit}; offset {offset};"
        )
        response = await self._post("/game", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB offset query failed: {response.status_code}")

    async def search_games(self, query: str, limit: int = 50, fields: str | None = None) -> list[dict[str, JSONValue]]:
        """Search game by name."""
        escaped = query.replace('"', '\\"')
        body = f'search "{escaped}"; fields {fields or "*"}; limit {limit};'
        response = await self._post("/game", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB search query failed: {response.status_code}")

    # ── Covers / Artwork (resolved via ID in game fields) ──────────────

    async def get_cover(self, cover_id: int) -> dict[str, JSONValue] | None:
        body = f"fields image_id,url; where id = {cover_id}; limit 1;"
        response = await self._post("/covers", content=body)
        if response.status_code == 200:
            results = response.json()
            return results[0] if results else None
        raise IGDBError(f"IGDB cover query failed: {response.status_code}")

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
        body = f"fields company,developer,publisher,porting,supporting; where game = {game_id}; limit 50;"
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

    async def lookup_steam_app_ids(self, app_ids: list[int]) -> dict[int, int]:
        """Map Steam app IDs to IGDB game IDs via the external_games endpoint.

        category 1 = Steam. Returns ``{steam_app_id: igdb_game_id}``.
        """
        if not app_ids:
            return {}

        uid_list = ",".join(f'"{aid}"' for aid in app_ids)
        body = f"fields uid,game; where external_game_source = 1 & uid = ({uid_list}); limit {len(app_ids)};"
        response = await self._post("/external_games", content=body)
        if response.status_code == 200:
            result: dict[int, int] = {}
            for row in response.json():
                uid = row.get("uid")
                game = row.get("game")
                if isinstance(uid, str) and isinstance(game, int):
                    try:
                        result[int(uid)] = game
                    except ValueError:
                        continue
            return result
        raise IGDBError(f"IGDB external_games query failed: {response.status_code}")
