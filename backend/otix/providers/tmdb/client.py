"""TMDB API client.

Auth: Bearer token (TMDB v4 read-access token).
Rate limit: 40 req/s default, configurable.

API docs: https://developer.themoviedb.org/reference
"""

from __future__ import annotations

import httpx
from redis.asyncio import Redis

from otix.infrastructure.config import settings
from otix.lib.types import JSONValue
from otix.providers.base import BaseProvider

# TODO: Replace JSONValue with typed TMDB response schemas (e.g. MovieResponse, ShowResponse).


class TMDBProvider(BaseProvider):
    BASE_URL = "https://api.themoviedb.org/3"

    def __init__(self, redis: Redis, http_client: httpx.AsyncClient | None = None):
        client = http_client or httpx.AsyncClient(
            base_url=self.BASE_URL,
            timeout=settings.tmdb_request_timeout_seconds,
            headers={
                "Authorization": f"Bearer {settings.tmdb_rat}",
                "Accept": "application/json",
            },
        )
        super().__init__(
            name="tmdb",
            redis=redis,
            http_client=client,
            rate=settings.tmdb_global_rps_limit,
            burst=settings.tmdb_global_rps_limit,
        )

    # ── Movies ──────────────────────────────────────────────────

    async def get_movie(self, tmdb_id: int, language: str = "en-US") -> dict[str, JSONValue]:
        response = await self._get(
            f"/movie/{tmdb_id}",
            params={
                "language": language,
                "append_to_response": "credits,external_ids,images,videos,release_dates",
            },
        )
        return response.json()

    async def get_movie_changes(self, start_date: str, end_date: str, page: int = 1) -> dict[str, JSONValue]:
        response = await self._get(
            "/movie/changes",
            params={"start_date": start_date, "end_date": end_date, "page": page},
        )
        return response.json()

    async def get_movie_popular(self, page: int = 1, language: str = "en-US") -> dict[str, JSONValue]:
        response = await self._get(
            "/movie/popular",
            params={"language": language, "page": page},
        )
        return response.json()

    # ── Shows ───────────────────────────────────────────────────

    async def get_show(self, tmdb_id: int, language: str = "en-US") -> dict[str, JSONValue]:
        response = await self._get(
            f"/tv/{tmdb_id}",
            params={
                "language": language,
                "append_to_response": "credits,external_ids,images,videos",
            },
        )
        return response.json()

    async def get_season(self, show_tmdb_id: int, season_number: int, language: str = "en-US") -> dict[str, JSONValue]:
        response = await self._get(
            f"/tv/{show_tmdb_id}/season/{season_number}",
            params={"language": language},
        )
        return response.json()

    async def get_show_popular(self, page: int = 1, language: str = "en-US") -> dict[str, JSONValue]:
        response = await self._get(
            "/tv/popular",
            params={"language": language, "page": page},
        )
        return response.json()

    # ── People ──────────────────────────────────────────────────

    async def get_person(self, tmdb_id: int, language: str = "en-US") -> dict[str, JSONValue]:
        response = await self._get(
            f"/person/{tmdb_id}",
            params={"language": language, "append_to_response": "external_ids,images"},
        )
        return response.json()

    # ── Collections ─────────────────────────────────────────────

    async def get_collection(self, tmdb_id: int, language: str = "en-US") -> dict[str, JSONValue]:
        response = await self._get(
            f"/collection/{tmdb_id}",
            params={"language": language},
        )
        return response.json()

    # ── Search ──────────────────────────────────────────────────

    async def search_multi(self, query: str, page: int = 1, language: str = "en-US") -> dict[str, JSONValue]:
        response = await self._get(
            "/search/multi",
            params={"query": query, "page": page, "language": language},
        )
        return response.json()

    # ── Configuration ───────────────────────────────────────────

    async def get_configuration(self) -> dict[str, JSONValue]:
        response = await self._get("/configuration")
        return response.json()

    async def get_genres(self, media_type: str = "movie", language: str = "en-US") -> dict[str, JSONValue]:
        endpoint = f"/genre/{media_type}/list"
        response = await self._get(endpoint, params={"language": language})
        return response.json()
