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

# Shared client factory — reuse connection pool across tasks.
_shared_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(
            base_url=TMDBProvider.BASE_URL,
            timeout=settings.tmdb_request_timeout_seconds,
            headers={
                "Authorization": f"Bearer {settings.tmdb_rat}",
                "Accept": "application/json",
            },
        )
    return _shared_client


class TMDBProvider(BaseProvider):
    BASE_URL = "https://api.themoviedb.org/3"

    def __init__(self, redis: Redis, http_client: httpx.AsyncClient | None = None):
        client = http_client or get_http_client()
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
                "append_to_response": "credits,external_ids,images,videos,release_dates,keywords",
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

    async def get_movie_top_rated(self, page: int = 1, language: str = "en-US") -> dict[str, JSONValue]:
        response = await self._get(
            "/movie/top_rated",
            params={"language": language, "page": page},
        )
        return response.json()

    async def get_movie_upcoming(self, page: int = 1, language: str = "en-US") -> dict[str, JSONValue]:
        response = await self._get(
            "/movie/upcoming",
            params={"language": language, "page": page},
        )
        return response.json()

    async def get_movie_now_playing(self, page: int = 1, language: str = "en-US") -> dict[str, JSONValue]:
        response = await self._get(
            "/movie/now_playing",
            params={"language": language, "page": page},
        )
        return response.json()

    # ── Shows ───────────────────────────────────────────────────

    async def get_show(self, tmdb_id: int, language: str = "en-US") -> dict[str, JSONValue]:
        response = await self._get(
            f"/tv/{tmdb_id}",
            params={
                "language": language,
                "append_to_response": "credits,external_ids,images,videos,keywords,seasons",
            },
        )
        return response.json()

    async def get_show_changes(self, start_date: str, end_date: str, page: int = 1) -> dict[str, JSONValue]:
        response = await self._get(
            "/tv/changes",
            params={"start_date": start_date, "end_date": end_date, "page": page},
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

    async def get_show_top_rated(self, page: int = 1, language: str = "en-US") -> dict[str, JSONValue]:
        response = await self._get(
            "/tv/top_rated",
            params={"language": language, "page": page},
        )
        return response.json()

    async def get_show_on_the_air(self, page: int = 1, language: str = "en-US") -> dict[str, JSONValue]:
        response = await self._get(
            "/tv/on_the_air",
            params={"language": language, "page": page},
        )
        return response.json()

    async def get_show_airing_today(self, page: int = 1, language: str = "en-US") -> dict[str, JSONValue]:
        response = await self._get(
            "/tv/airing_today",
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

    async def get_person_changes(self, start_date: str, end_date: str, page: int = 1) -> dict[str, JSONValue]:
        response = await self._get(
            "/person/changes",
            params={"start_date": start_date, "end_date": end_date, "page": page},
        )
        return response.json()

    async def get_person_combined_credits(self, tmdb_id: int, language: str = "en-US") -> dict[str, JSONValue]:
        response = await self._get(
            f"/person/{tmdb_id}/combined_credits",
            params={"language": language},
        )
        return response.json()

    async def get_trending(self, media_type: str, time_window: str, page: int = 1, language: str = "en-US") -> dict[str, JSONValue]:
        response = await self._get(
            f"/trending/{media_type}/{time_window}",
            params={"language": language, "page": page},
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
