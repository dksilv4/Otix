"""IGDB API client (v4).

Auth: Twitch OAuth2 client-credentials grant. Access tokens cached in Redis
for ~60 days. Client-ID header required on every request alongside Bearer token.

API uses a custom query DSL sent in the POST body:
    fields name,rating,genres.name,cover.url; where id = 1234;
    search "Zelda"; fields name,first_release_date; limit 50;

Docs: https://api-docs.igdb.com/
"""

from __future__ import annotations

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


def get_http_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(
            base_url="https://api.igdb.com/v4",
            timeout=settings.igdb_request_timeout_seconds,
        )
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
        """Fetch multiple games by ID."""
        if not ids:
            return []
        id_list = ",".join(str(i) for i in ids)
        body = f"fields {fields or '*'}; where id = ({id_list}); limit {len(ids)};"
        response = await self._post("/games", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB games query failed: {response.status_code}")

    async def get_game(self, igdb_id: int, fields: str | None = None) -> dict[str, JSONValue] | None:
        results = await self.get_games([igdb_id], fields)
        return results[0] if results else None

    async def get_popular_games(self, limit: int = 50, fields: str | None = None) -> list[dict[str, JSONValue]]:
        """Popular games ordered by rating (aggregated_rating)."""
        body = f"fields {fields or '*'}; sort aggregated_rating desc; where aggregated_rating != null & rating_count > 10; limit {limit};"
        response = await self._post("/games", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB popular games query failed: {response.status_code}")

    async def get_recently_released_games(self, limit: int = 100, fields: str | None = None) -> list[dict[str, JSONValue]]:
        """Recently released games in the last 90 days."""
        now = int(time.time())
        ninety_days_ago = now - 90 * 86400
        body = (
            f"fields {fields or '*'}; "
            f"sort first_release_date desc; "
            f"where first_release_date >= {ninety_days_ago} & first_release_date <= {now}; "
            f"limit {limit};"
        )
        response = await self._post("/games", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB recent games query failed: {response.status_code}")

    async def get_upcoming_games(self, limit: int = 100, fields: str | None = None) -> list[dict[str, JSONValue]]:
        """Upcoming/unreleased games."""
        now = int(time.time())
        body = (
            f"fields {fields or '*'}; "
            f"sort first_release_date asc; "
            f"where first_release_date > {now} & hypes > 5; "
            f"limit {limit};"
        )
        response = await self._post("/games", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB upcoming games query failed: {response.status_code}")

    async def get_changed_game_ids(self, start_timestamp: int, limit: int = 100) -> list[dict[str, JSONValue]]:
        """Get game IDs changed since the given Unix timestamp."""
        body = f"fields id,updated_at; sort updated_at asc; where updated_at >= {start_timestamp}; limit {limit};"
        response = await self._post("/games", content=body)
        if response.status_code == 200:
            return response.json()
        raise IGDBError(f"IGDB change query failed: {response.status_code}")

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
